# PP-OCRv5 离线验证脚本

这套脚本的存在理由见 [DECISIONS.md 的 D023](../../DECISIONS.md)：
本机没有 Android SDK，改 Kotlin 要推 GitHub 等 20-30 分钟才能验证一次，
所以**所有算法先在这里用真实数据跑通，再照抄到 Kotlin**。

这些脚本**不参与 App 构建**，也不进 `npm test`。

---

## 装依赖

三个包（`onnxruntime` / `scipy` / `onnx`）都没装在项目里，
要单独装到一个临时目录：

```bash
PY="<python 解释器>"
TGT="<某个临时目录>/pylibs"

"$PY" -m pip install --target "$TGT" onnxruntime scipy onnx

# 之后每次运行都要带上
export PYTHONPATH="$TGT"
```

macOS 上如果 DSH 环境提供 `load_workspace_dependencies`，
用其中的 Python 即可（3.12 + numpy + Pillow 已就绪）。

---

## 三个脚本

### 1. `inspect_models.py` —— 看模型的输入输出规格

```bash
python3 inspect_models.py
```

移植前必看。要确认的是张量形状、类型、动态维度名，以及
**字典项数与模型输出类别数是否一致**。

---

### 2. `verify_rec.py` —— 验证字符集映射与 CTC 解码

```bash
python3 verify_rec.py
```

**做法**：用 PIL 画一张**已知内容**的文字图，喂给识别模型，看解码结果是否等于原文。

**为什么用合成图而不是真实照片**：真实照片错了你分不清是
「字符集错位」还是「模型本来就认不出」；合成图没有这个歧义。

**预期结果**：8/8 全对。

**这个脚本查出的关键事实**：PaddleOCR 的类别布局是

```
["blank"] + 18383 个字典字符 + [" "]  =  18385
   索引 0       索引 1 .. 18383      索引 18384
```

不是 `18383 + 1 = 18384`。最后那个 ASCII 空格来自 `use_space_char`。
**少算这一个，每个字都会错位。**

---

### 3. `verify_pipeline.py` —— 完整流水线（检测 → 裁剪 → 识别）

```bash
python3 verify_pipeline.py <图片路径> [输出标注图路径]
```

会打印每一行的识别结果与置信度，并输出一张画了红框的标注图，
用来肉眼确认检测框位置对不对。

**实现刻意贴近 Kotlin 会怎么写**：检测框用**轴对齐矩形**（连通域外接框 +
unclip 扩张），而不是 OpenCV 的 `minAreaRect` —— 因为 Kotlin 侧不引入 OpenCV。
所有阈值都是常量，与 `PaddleDetPostProcess.kt` 中的一致。

---

## 竖排文字修复

没有单独脚本，但 `verify_rec.py` 里的思路可以复用。要点：

包装上常见**竖排商品名**（例如「焙好茶」），而识别模型只吃横排文字。
对**高 > 宽 × 1.5** 的框，额外尝试旋转 ±90° 再识别，取置信度最高的结果。

置信度区分度极大，所以「取最高」是可靠判据：

| 区域 | 原样 | 逆时针 90° | 结论 |
| --- | --- | --- | --- |
| 竖排「焙好茶」 | `c` (0.18) | **`焙好茶` (0.99)** | 取旋转后 |
| 横排「茉莉」 | **`茉莉` (0.93)** | `Y` (0.22) | 取原样 |
| 横排「乌龙」 | **`乌龙` (0.99)** | `4` (0.05) | 取原样 |

**注意不要一律旋转** —— 那会把本来正确的横排文字转成乱码。

---

## 换模型时怎么用

1. 把新的 `.onnx` 和字典放进
   `modules/hukang-vision/android/src/main/assets/models/`
2. 跑 `inspect_models.py` 确认形状与类别数
3. 跑 `verify_rec.py` 确认字符集映射（**这一步不能跳**）
4. 跑 `verify_pipeline.py` 用真实商品照片看效果
5. 全部通过后再改 Kotlin 里的常量，并更新 DECISIONS.md

模型可从这里获取（RapidAI 已转换好的 ONNX / MNN / Paddle / Torch 版本）：

- 文档：<https://rapidai.github.io/RapidOCRDocs/v3.8.3/model_list/>
- 托管：<https://www.modelscope.cn/models/RapidAI/RapidOCR/files>

当前使用的三个文件的下载地址：

```
https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx
https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile.onnx
https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/paddle/PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile/ppocrv5_dict.txt
```
