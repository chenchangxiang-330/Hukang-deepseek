#!/usr/bin/env python3
"""
PP-OCRv5 识别模型 + CTC 解码的正确性验证。

思路：用 PIL 画一张**已知内容**的文字图片，喂给识别模型，
     看解码结果是否等于原文。相等 → 字符集映射和 CTC 解码都对。

这比拿真实照片试可靠得多：真实照片错了你分不清是
「字符集错位」还是「模型本来就认不出」；合成图没有这个歧义。

用法：
    PYTHONPATH=<pylibs> python3 verify_rec.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

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

REC_HEIGHT = 48
REC_MAX_WIDTH = 320

# macOS 中文字体候选
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_charset() -> list[str]:
    """从模型元数据取字符集（比外部字典文件更权威）。"""
    sess = ort.InferenceSession(
        str(MODELS_DIR / "ch_PP-OCRv5_rec_mobile.onnx"),
        providers=["CPUExecutionProvider"],
    )
    meta = sess.get_modelmeta().custom_metadata_map
    entries = meta["character"].split("\n")
    if entries and entries[-1] == "":
        entries.pop()
    return entries


def build_index(charset: list[str]) -> list[str]:
    """
    构建「模型输出索引 → 字符」的映射表。

    PaddleOCR 的类别布局是：
        ["blank"] + charset + [" "]
    即 索引 0 是 CTC blank，索引 1..len(charset) 是字典字符，
    最后一个索引（len(charset)+1）是 use_space_char 追加的 ASCII 空格。

    返回一个长度为 num_classes 的列表，blank 位置放 None。
    """
    return [None] + list(charset) + [" "]


def render_text_image(text: str, font_path: str) -> Image.Image:
    """把文字画成白底黑字、高度对齐到 48 的图片。"""
    font = ImageFont.truetype(font_path, 40)
    bbox = font.getbbox(text)
    w = max(bbox[2] - bbox[0] + 20, 40)
    h = bbox[3] - bbox[1] + 20

    img = Image.new("L", (w, h), 255)
    ImageDraw.Draw(img).text((10 - bbox[0], 10 - bbox[1]), text, font=font, fill=0)
    return img.convert("RGB")


def preprocess(img: Image.Image) -> np.ndarray:
    """
    识别模型预处理：保持宽高比缩放到高 48，宽度上限 320，右侧补零。

    归一化 (x/255 - 0.5) / 0.5  —— 这里是 PP-OCRv5 识别模型的标准参数，
    用的不是 ImageNet 的 mean/std。
    """
    w, h = img.size
    ratio = REC_HEIGHT / h
    new_w = min(int(round(w * ratio)), REC_MAX_WIDTH)
    new_w = max(new_w, 1)

    resized = img.resize((new_w, REC_HEIGHT), Image.BICUBIC)
    arr = np.asarray(resized, dtype=np.float32)  # (48, new_w, 3)

    # 右侧补 0（补的是归一化后的 0，即灰色，这是 PaddleOCR 的做法）
    padded = np.zeros((REC_HEIGHT, REC_MAX_WIDTH, 3), dtype=np.float32)
    padded[:, :new_w, :] = arr

    norm = (padded / 255.0 - 0.5) / 0.5
    return norm.transpose(2, 0, 1)[None, ...].astype(np.float32)  # (1,3,48,W)


def ctc_greedy_decode(logits: np.ndarray, index: list[str]) -> tuple[str, float]:
    """
    CTC 贪心解码。

    logits 形状 (1, T, C)。步骤：
      1. 每个时间步取 argmax
      2. 合并连续重复
      3. 去掉 blank（索引 0）
    """
    seq = logits[0]  # (T, C)
    idxs = seq.argmax(axis=1)
    maxes = seq.max(axis=1)

    out_chars: list[str] = []
    out_scores: list[float] = []
    prev = -1
    for t, idx in enumerate(idxs):
        idx = int(idx)
        if idx != prev and idx != 0:
            ch = index[idx] if idx < len(index) else None
            if ch is not None:
                out_chars.append(ch)
                out_scores.append(float(maxes[t]))
        prev = idx

    conf = float(np.mean(out_scores)) if out_scores else 0.0
    return "".join(out_chars), conf


def main() -> int:
    if not MODELS_DIR.is_dir():
        print(f"找不到模型目录: {MODELS_DIR}")
        return 1

    font_path = next((f for f in FONT_CANDIDATES if Path(f).is_file()), None)
    if font_path is None:
        print("找不到可用的中文字体，无法合成测试图")
        return 1
    print(f"字体: {font_path}\n")

    charset = load_charset()
    index = build_index(charset)
    print(f"字符集: {len(charset)} 项")
    print(f"类别表: {len(index)} 项（含 blank 与尾部空格）")
    print(f"  index[0]      = {index[0]!r}  (CTC blank)")
    print(f"  index[1]      = {index[1]!r}")
    print(f"  index[18384]  = {index[18384]!r}  (use_space_char 追加)")
    print()

    sess = ort.InferenceSession(
        str(MODELS_DIR / "ch_PP-OCRv5_rec_mobile.onnx"),
        providers=["CPUExecutionProvider"],
    )
    out_name = sess.get_outputs()[0].name

    cases = [
        "农夫山泉",
        "配料表",
        "净含量550ml",
        "营养成分表",
        "能量 180kJ",
        "白砂糖",
        "保质期12个月",
        "ABC123",
    ]

    print("=" * 68)
    print("合成图 → 识别 → 解码，逐条对比")
    print("=" * 68)

    ok = 0
    for truth in cases:
        img = render_text_image(truth, font_path)
        x = preprocess(img)
        logits = sess.run([out_name], {"x": x})[0]
        text, conf = ctc_greedy_decode(logits, index)

        # 去掉空格后比较（模型对空格的处理本来就有随机性）
        match = text.replace(" ", "") == truth.replace(" ", "")
        ok += 1 if match else 0
        flag = "✅" if match else "❌"
        print(f"  {flag} 期望 {truth!r:22} 得到 {text!r:22} 置信度 {conf:.3f}")

    print()
    print(f"  对上的: {ok}/{len(cases)}")
    print()
    if ok == len(cases):
        print("  ✅ 字符集映射与 CTC 解码**完全正确**，可以照此移植到 Kotlin")
    elif ok >= len(cases) // 2:
        print("  ⚠️ 大部分正确 —— 字符集大概率对，个别是模型本身认错")
    else:
        print("  ❌ 大面积错误 —— 字符集映射有问题，不要移植")
    return 0


if __name__ == "__main__":
    sys.exit(main())
