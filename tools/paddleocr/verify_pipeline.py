#!/usr/bin/env python3
"""
PP-OCRv5 完整流水线验证：检测 → 裁剪 → 识别 → 解码。

**这个脚本的意义**：Kotlin 侧没法快速试错（本机没有 Android SDK，
每次改动要推 GitHub 等 20-30 分钟）。所以这里用 Python 把算法跑通、
把参数调对、把边界情况摸清，再照抄到 Kotlin。

因此这里的实现刻意**贴近 Kotlin 会怎么写**：
  - 检测框用**轴对齐矩形**（连通域的外接框 + unclip 扩张），
    而不是 OpenCV 的 minAreaRect —— 因为 Kotlin 侧不引入 OpenCV
  - 所有阈值都是常量，和将要写进 Kotlin 的一致

用法：
    PYTHONPATH=<pylibs> python3 verify_pipeline.py <图片路径> [输出路径]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

MODELS_DIR = (
    Path(__file__).resolve().parents[2]
    / "modules"
    / "hukang-vision"
    / "android"
    / "src"
    / "main"
    / "assets"
    / "models"
)

# ---- 检测参数（PaddleOCR PP-OCRv5 det 默认值）----
DET_LIMIT_SIDE = 960
DET_THRESH = 0.3
DET_BOX_THRESH = 0.6
DET_UNCLIP_RATIO = 1.5
DET_MIN_SIZE = 3
DET_MAX_CANDIDATES = 1000

# 检测归一化：ImageNet 均值方差
DET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
DET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# ---- 识别参数 ----
REC_HEIGHT = 48
REC_MAX_WIDTH = 320


# ====================================================================
# 检测
# ====================================================================

def det_preprocess(img: Image.Image) -> tuple[np.ndarray, float, tuple[int, int]]:
    """
    缩放到最长边 <= 960、且双维都是 32 的倍数，然后 ImageNet 归一化。

    Kotlin 侧要完全照做：`ratio` 用于把检测框映射回原图坐标。
    """
    w, h = img.size
    ratio = 1.0
    if max(h, w) > DET_LIMIT_SIDE:
        ratio = DET_LIMIT_SIDE / max(h, w)

    # PaddleOCR 的做法：四舍五入到 32 的倍数
    rh = max(int(round(h * ratio / 32) * 32), 32)
    rw = max(int(round(w * ratio / 32) * 32), 32)

    resized = img.resize((rw, rh), Image.BICUBIC)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    arr = (arr - DET_MEAN) / DET_STD
    tensor = arr.transpose(2, 0, 1)[None, ...].astype(np.float32)

    return tensor, ratio, (w, h)


def connected_boxes(prob: np.ndarray) -> list[tuple[int, int, int, int, float]]:
    """
    概率图 → 文本框列表（轴对齐）。

    步骤与将要写进 Kotlin 的一致：
      1. 阈值二值化
      2. 8 邻域连通域标记
      3. 每个连通域取外接框、算平均置信度、算面积
      4. 过滤：置信度、最小边长
      5. unclip 扩张（面积 * 比例 / 周长）
    """
    import scipy.ndimage as ndi

    mask = (prob > DET_THRESH).astype(np.uint8)
    if mask.sum() == 0:
        return []

    # 8 邻域
    structure = np.ones((3, 3), dtype=np.uint8)
    labels, count = ndi.label(mask, structure=structure)
    if count == 0:
        return []

    objects = ndi.find_objects(labels)
    boxes: list[tuple[int, int, int, int, float]] = []
    h, w = prob.shape

    for label_id, sl in enumerate(objects, start=1):
        if sl is None:
            continue
        ys, xs = sl
        box_h = ys.stop - ys.start
        box_w = xs.stop - xs.start
        if min(box_h, box_w) < DET_MIN_SIZE:
            continue

        component = labels[sl] == label_id
        score = float(prob[sl][component].mean())
        if score < DET_BOX_THRESH:
            continue

        area = float(component.sum())
        perimeter = 2.0 * (box_h + box_w)
        if perimeter <= 0:
            continue
        distance = area * DET_UNCLIP_RATIO / perimeter

        x0 = xs.start - distance
        y0 = ys.start - distance
        x1 = xs.stop + distance
        y1 = ys.stop + distance

        # 裁剪到图像范围
        x0 = max(0.0, min(x0, w - 1.0))
        y0 = max(0.0, min(y0, h - 1.0))
        x1 = max(0.0, min(x1, w - 1.0))
        y1 = max(0.0, min(y1, h - 1.0))
        if x1 - x0 < DET_MIN_SIZE or y1 - y0 < DET_MIN_SIZE:
            continue

        boxes.append((int(x0), int(y0), int(x1), int(y1), score))

        if len(boxes) >= DET_MAX_CANDIDATES:
            break

    return boxes


def sort_reading_order(boxes: list[tuple[int, int, int, int, float]]) -> list:
    """
    按阅读顺序排序：先上下（用纵向重叠分组成行），行内再左右。

    简单的「先 y 后 x」在稍微倾斜的商品标签上会把同一行拆散，
    所以这里用纵向重叠率分组。
    """
    if not boxes:
        return []

    remaining = sorted(boxes, key=lambda b: b[1])
    rows: list[list[tuple[int, int, int, int, float]]] = []

    for box in remaining:
        y0, y1 = box[1], box[3]
        placed = False
        for row in rows:
            ry0 = min(b[1] for b in row)
            ry1 = max(b[3] for b in row)
            overlap = min(y1, ry1) - max(y0, ry0)
            if overlap > 0 and overlap / max(1, min(y1 - y0, ry1 - ry0)) > 0.5:
                row.append(box)
                placed = True
                break
        if not placed:
            rows.append([box])

    rows.sort(key=lambda r: min(b[1] for b in r))
    out = []
    for row in rows:
        out.extend(sorted(row, key=lambda b: b[0]))
    return out


# ====================================================================
# 识别
# ====================================================================

def rec_preprocess(crop: Image.Image) -> np.ndarray:
    """高 48，宽度按比例、上限 320，右侧补零，归一化 (x/255-0.5)/0.5。"""
    w, h = crop.size
    if h <= 0 or w <= 0:
        return None  # type: ignore

    ratio = REC_HEIGHT / h
    new_w = max(1, min(int(round(w * ratio)), REC_MAX_WIDTH))

    resized = crop.resize((new_w, REC_HEIGHT), Image.BICUBIC)
    arr = np.asarray(resized, dtype=np.float32)

    padded = np.zeros((REC_HEIGHT, REC_MAX_WIDTH, 3), dtype=np.float32)
    padded[:, :new_w, :] = arr

    norm = (padded / 255.0 - 0.5) / 0.5
    return norm.transpose(2, 0, 1)[None, ...].astype(np.float32)


def ctc_decode(logits: np.ndarray, index: list[str]) -> tuple[str, float]:
    seq = logits[0]
    idxs = seq.argmax(axis=1)
    maxes = seq.max(axis=1)

    chars: list[str] = []
    scores: list[float] = []
    prev = -1
    for t, idx in enumerate(idxs):
        idx = int(idx)
        if idx != prev and idx != 0:
            ch = index[idx] if idx < len(index) else None
            if ch is not None:
                chars.append(ch)
                scores.append(float(maxes[t]))
        prev = idx
    return "".join(chars), (float(np.mean(scores)) if scores else 0.0)


# ====================================================================

def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    img_path = Path(sys.argv[1])
    if not img_path.is_file():
        print(f"图片不存在: {img_path}")
        return 1

    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else img_path.with_name(
        img_path.stem + "-ppocrv5.jpg"
    )

    # 载入模型
    so = ort.SessionOptions()
    so.log_severity_level = 3
    det = ort.InferenceSession(
        str(MODELS_DIR / "ch_PP-OCRv5_det_mobile.onnx"), so, providers=["CPUExecutionProvider"]
    )
    rec = ort.InferenceSession(
        str(MODELS_DIR / "ch_PP-OCRv5_rec_mobile.onnx"), so, providers=["CPUExecutionProvider"]
    )

    charset = rec.get_modelmeta().custom_metadata_map["character"].split("\n")
    if charset and charset[-1] == "":
        charset.pop()
    index = [None] + charset + [" "]

    det_out = det.get_outputs()[0].name
    rec_out = rec.get_outputs()[0].name

    img = Image.open(img_path).convert("RGB")
    orig_w, orig_h = img.size
    print(f"图片: {img_path.name}  {orig_w}x{orig_h}")

    # --- 检测 ---
    tensor, ratio, _ = det_preprocess(img)
    print(f"检测输入张量: {tensor.shape}  (缩放比 {ratio:.4f})")

    prob = det.run([det_out], {"x": tensor})[0][0, 0]
    print(f"概率图: {prob.shape}  范围 [{prob.min():.3f}, {prob.max():.3f}]")

    boxes = connected_boxes(prob)
    print(f"原始检测框: {len(boxes)} 个")

    # 映射回原图坐标
    scale_x = orig_w / prob.shape[1]
    scale_y = orig_h / prob.shape[0]
    mapped = [
        (
            int(b[0] * scale_x),
            int(b[1] * scale_y),
            int(b[2] * scale_x),
            int(b[3] * scale_y),
            b[4],
        )
        for b in boxes
    ]
    mapped = sort_reading_order(mapped)
    print(f"映射+排序后: {len(mapped)} 个\n")

    # --- 逐框识别 ---
    print("=" * 74)
    print("识别结果（按阅读顺序）")
    print("=" * 74)

    draw = ImageDraw.Draw(img)
    results = []
    for i, (x0, y0, x1, y1, score) in enumerate(mapped):
        x0c, y0c = max(0, x0), max(0, y0)
        x1c, y1c = min(orig_w, x1), min(orig_h, y1)
        if x1c - x0c < 2 or y1c - y0c < 2:
            continue

        crop = img.crop((x0c, y0c, x1c, y1c))
        x = rec_preprocess(crop)
        if x is None:
            continue

        text, conf = ctc_decode(rec.run([rec_out], {"x": x})[0], index)
        if not text:
            continue

        results.append((text, conf, (x0c, y0c, x1c, y1c), score))
        print(f"  [{i:02d}] {text}   (识别 {conf:.2f} / 检测 {score:.2f})  {x1c-x0c}x{y1c-y0c}")

        draw.rectangle([x0c, y0c, x1c, y1c], outline=(255, 0, 0), width=3)

    all_text = "\n".join(r[0] for r in results)
    print()
    print("=" * 74)
    print("拼接后的原始文本（这就是要交给 TypeScript 解析层的东西）")
    print("=" * 74)
    print(all_text)
    print()
    print(f"  行数: {len(results)}")
    print(f"  字符数: {len(all_text.replace(chr(10), ''))}")
    print(f"  字符集大小: {len(charset)}  类别数: {len(index)}")

    img.save(out_path, quality=92)
    print(f"\n  标注图已保存: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
