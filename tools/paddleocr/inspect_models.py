#!/usr/bin/env python3
"""
查看 PP-OCRv5 ONNX 模型的输入输出规格。

这是移植到 Kotlin 前必须确认的事实 —— 张量形状、类型、动态维度的名字，
任何一个搞错，Kotlin 侧就是「跑得通但结果全空」这种最难查的 bug。

用法：
    PYTHONPATH=<pylibs> python3 inspect_models.py
"""

import sys
from pathlib import Path

import onnxruntime as ort

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


def describe(path: Path) -> None:
    print(f"\n{'=' * 72}")
    print(f"模型: {path.name}  ({path.stat().st_size / 1048576:.2f} MB)")
    print("=" * 72)

    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    sess = ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])

    print("\n-- 输入 --")
    for i in sess.get_inputs():
        print(f"  名称: {i.name}")
        print(f"    形状: {i.shape}   (None/str = 动态维度)")
        print(f"    类型: {i.type}")

    print("\n-- 输出 --")
    for o in sess.get_outputs():
        print(f"  名称: {o.name}")
        print(f"    形状: {o.shape}")
        print(f"    类型: {o.type}")


def describe_dict() -> None:
    path = MODELS_DIR / "ppocrv5_dict.txt"
    print(f"\n{'=' * 72}")
    print(f"字符字典: {path.name}  ({path.stat().st_size / 1024:.0f} KB)")
    print("=" * 72)

    lines = path.read_text(encoding="utf-8").split("\n")
    # 末尾换行会产生一个空串，去掉
    if lines and lines[-1] == "":
        lines.pop()

    print(f"  字符数: {len(lines)}")
    print(f"  索引 0   : {lines[0]!r}   (PaddleOCR 字典第一项是空格)")
    print(f"  索引 1   : {lines[1]!r}")
    print(f"  索引 2   : {lines[2]!r}")
    print(f"  最后一项 : {lines[-1]!r}")
    print()
    print("  ⚠️  CTC 解码要点：模型输出类别数 = 字典长度 + 1")
    print(f"     即 {len(lines)} + 1 = {len(lines) + 1}，第 0 类是 CTC blank。")
    print("     所以 `char = dict[argmax_index - 1]`，索引 0 必须跳过。")


if __name__ == "__main__":
    if not MODELS_DIR.is_dir():
        sys.exit(f"找不到模型目录: {MODELS_DIR}")

    for name in ("ch_PP-OCRv5_det_mobile.onnx", "ch_PP-OCRv5_rec_mobile.onnx"):
        p = MODELS_DIR / name
        if p.is_file():
            describe(p)
        else:
            print(f"跳过（不存在）: {name}")

    describe_dict()
    print()
