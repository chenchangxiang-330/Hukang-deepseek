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
 * 使用 ML Kit 中文识别（bundled 模型）：装好即可离线识别中文食品标签。
 */
class HukangVisionModule : Module() {

  private val recognizer by lazy {
    TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
  }

  override fun definition() = ModuleDefinition {
    Name("HukangVision")

    /**
     * 识别图片中的文字。
     * 返回 { text, width, height, blocks[] }，其中每个文本块带 boundingBox，
     * 供营养成分表这类**二维表格**解析使用（只靠纯文本无法还原行列关系）。
     */
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      var bitmap: Bitmap? = null
      try {
        bitmap = BitmapLoader.load(uri)
        if (bitmap == null) {
          promise.reject("OCR_IMAGE_UNREADABLE", "无法读取图片文件：$uri", null)
          return@AsyncFunction
        }

        val image = InputImage.fromBitmap(bitmap, 0)
        // AsyncFunction 默认运行在后台队列，这里阻塞等待是安全的
        val result = Tasks.await(recognizer.process(image))

        promise.resolve(
          mapOf(
            "text" to result.text,
            "width" to bitmap.width,
            "height" to bitmap.height,
            "blocks" to result.textBlocks.map { it.toMap() }
          )
        )
      } catch (e: Exception) {
        promise.reject("OCR_FAILED", e.localizedMessage ?: "文字识别失败", e)
      } finally {
        bitmap?.recycle()
      }
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
    }
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
