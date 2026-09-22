# tools/mac-ocr —— 开发期验证工具

这个目录**不属于 App**，也不会被打进 APK。它只解决一个问题：

> 没有 Android 真机 / 模拟器时，怎么验证「营养成分表 Parser」真的能处理
> 真实食品包装照片，而不是只会处理我手写的示例文本？

## 做法

```
Open Food Facts 找带营养成分表照片的真实商品
        ↓  下载照片
macOS Vision 框架 OCR（ocr.swift）
        ↓  真实 OCR 文本
生成 fixture（含数据库里的“标准答案”）
        ↓
营养解析器跑这些 fixture，和标准答案对照
```

## 诚实边界（重要）

**macOS Vision ≠ Android ML Kit。**

- 这个工具验证的是 **Parser 对真实 OCR 文本的处理能力**
- 它**不能**替代 Android 端 ML Kit 的真机/模拟器验证
- 真实食品包装照片在 Android 上的识别效果，仍然必须标记为
  `NOT TESTED ON PHYSICAL DEVICE`

fixture 里每一份样本都写明了这一点（`note` 字段）。

## 使用

```bash
# 1) 采集真实样本（会访问 Open Food Facts，需要网络；公共服有限流，脚本自带退避）
node tools/mac-ocr/fetch-fixtures.mjs .dsh-cache/fixtures

# 2) 只对已有图片跑 OCR（调试用）
swift tools/mac-ocr/ocr.swift 图片1.jpg 图片2.jpg
```

第 1 步会生成 `src/services/vision/__tests__/fixtures/realLabels.json`。
仓库只保存这份**文本 fixture**（体积小、可复现），不保存图片本身。

## 为什么用 Swift

macOS 自带 Vision 框架，`swift` 命令随 Command Line Tools 提供，
不需要安装任何新依赖。这也是不在项目里引入 OCR 依赖的原因。
