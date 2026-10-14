package com.hukang.vision

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 护康本地视觉能力（产品需求 §32）
 *
 * 分层原则（§32 明确要求）：
 *   Image → OCR → Raw Text → Parser → Structured Data
 * 本模块只负责到 **Raw Text**（外加每个文本块的位置信息）。
 * 解析成语义化字段是 TypeScript 侧 Parser 的职责，
 * 这样解析规则可以用单元测试覆盖、也能随时调整而不用重新编译原生代码。
 *
 * ## 两套识别引擎
 *
 * | 引擎 | 说明 |
 * |---|---|
 * | `mlkit`  | Google ML Kit 中文识别。速度快、包小，但在商品包装上召回很低 |
 * | `paddle` | PaddleOCR PP-OCRv5（ONNX Runtime）。实测召回明显更高，**默认** |
 *
 * 两个引擎输出**完全相同的结构**，所以上层的 TypeScript 解析代码不需要知道用的哪一个。
 * 保留 mlkit 只是为了同机对比，确认 PP-OCRv5 全面更好之后可以删掉。
 */
class HukangVisionModule : Module() {

  private val recognizer by lazy {
    TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
  }

  override fun definition() = ModuleDefinition {
    Name("HukangVision")

    /**
     * 识别图片中的文字。
     *
     * @param uri 图片路径
     * @param options `{ engine: "paddle" | "mlkit" }`，缺省用 paddle
     *
     * 返回 `{ text, width, height, blocks[], engine }`，其中每个文本块带 boundingBox，
     * 供营养成分表这类**二维表格**解析使用（只靠纯文本无法还原行列关系）。
     */
    AsyncFunction("recognizeText") { uri: String, options: Map<String, Any?>, promise: Promise ->
      val engine = (options["engine"] as? String)?.lowercase() ?: ENGINE_PADDLE

      var bitmap: Bitmap? = null
      try {
        bitmap = BitmapLoader.load(uri)
        if (bitmap == null) {
          promise.reject("OCR_IMAGE_UNREADABLE", "无法读取图片文件：$uri", null)
          return@AsyncFunction
        }

        val payload = when (engine) {
          ENGINE_MLKIT -> runMlKit(bitmap)
          else -> runPaddle(bitmap)
        }

        promise.resolve(
          mapOf(
            "text" to payload.text,
            "width" to bitmap.width,
            "height" to bitmap.height,
            "blocks" to payload.blocks,
            "engine" to payload.engine
          )
        )
      } catch (e: Exception) {
        promise.reject("OCR_FAILED", e.localizedMessage ?: "文字识别失败", e)
      } finally {
        bitmap?.recycle()
      }
    }

    /**
     * 当前可用的识别引擎，供开发者页面展示。
     */
    Function("getOcrEngines") {
      mapOf(
        "default" to ENGINE_PADDLE,
        "available" to listOf(ENGINE_PADDLE, ENGINE_MLKIT)
      )
    }

    /**
     * 图片质量度量。只返回客观指标，好坏判定放在 TypeScript 侧（便于调参与测试）。
     */
    AsyncFunction("analyzeQuality") { uri: String, promise: Promise ->
      try {
        val metrics = ImageQualityAnalyzer.analyze(uri)
        if (metrics == null) {
          promise.reject("PHOTO_FILE_INVALID", "无法读取图片文件：$uri", null)
          return@AsyncFunction
        }
        promise.resolve(
          mapOf(
            "width" to metrics.width,
            "height" to metrics.height,
            "brightness" to metrics.brightness,
            "blurScore" to metrics.blurScore,
            "glareRatio" to metrics.glareRatio,
            "darkRatio" to metrics.darkRatio
          )
        )
      } catch (e: Exception) {
        promise.reject("QUALITY_ANALYSIS_FAILED", e.localizedMessage ?: "图片质量分析失败", e)
      }
    }

    OnDestroy {
      runCatching { recognizer.close() }
      runCatching { PaddleOcrEngine.release() }
    }
  }

  // ==================================================================
  // 引擎实现
  // ==================================================================

  private data class OcrPayload(
    val text: String,
    val blocks: List<Map<String, Any?>>,
    val engine: String
  )

  /**
   * PP-OCRv5：每个检测框作为一行。
   *
   * 这里不做「把相邻行合并成段落」的处理 —— ML Kit 有 block 概念，
   * PP-OCRv5 没有。但上层的 `flattenOcrLines` 本来就只关心
   * 「按顺序排列的文本行 + 每行的位置」，营养解析更是只用文本，
   * 所以一行一块完全够用，不需要人为模拟分块。
   */
  private fun runPaddle(bitmap: Bitmap): OcrPayload {
    val engine = PaddleOcrEngine.get(appContext.reactContext ?: throw IllegalStateException("ReactContext 不可用"))
    val lines = engine.recognize(bitmap)

    val blocks = lines.map { line ->
      val box = mapOf(
        "left" to line.left,
        "top" to line.top,
        "right" to line.right,
        "bottom" to line.bottom
      )
      mapOf(
        "text" to line.text,
        "boundingBox" to box,
        "lines" to listOf(
          mapOf(
            "text" to line.text,
            "boundingBox" to box,
            // PP-OCRv5 不提供逐字坐标，整行作为一个元素
            "elements" to listOf(
              mapOf("text" to line.text, "boundingBox" to box)
            )
          )
        )
      )
    }

    return OcrPayload(
      text = lines.joinToString("\n") { it.text },
      blocks = blocks,
      engine = ENGINE_PADDLE
    )
  }

  private fun runMlKit(bitmap: Bitmap): OcrPayload {
    val image = InputImage.fromBitmap(bitmap, 0)
    // AsyncFunction 默认运行在后台队列，这里阻塞等待是安全的
    val result = Tasks.await(recognizer.process(image))

    return OcrPayload(
      text = result.text,
      blocks = result.textBlocks.map { it.toMap() },
      engine = ENGINE_MLKIT
    )
  }

  companion object {
    const val ENGINE_PADDLE = "paddle"
    const val ENGINE_MLKIT = "mlkit"
  }
}

private fun Rect.toMap(): Map<String, Int> =
  mapOf("left" to left, "top" to top, "right" to right, "bottom" to bottom)

private fun Text.TextBlock.toMap(): Map<String, Any?> =
  mapOf(
    "text" to text,
    "boundingBox" to boundingBox?.toMap(),
    "lines" to lines.map { it.toMap() }
  )

private fun Text.Line.toMap(): Map<String, Any?> =
  mapOf(
    "text" to text,
    "boundingBox" to boundingBox?.toMap(),
    "elements" to elements.map { element ->
      mapOf(
        "text" to element.text,
        "boundingBox" to element.boundingBox?.toMap()
      )
    }
  )
