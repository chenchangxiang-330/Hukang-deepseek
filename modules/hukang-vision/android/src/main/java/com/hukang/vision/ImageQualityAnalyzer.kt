package com.hukang.vision

import android.graphics.Bitmap
import kotlin.math.sqrt

/**
 * 图片质量度量（产品需求 §41）
 *
 * 这里只计算**客观指标**，不判断好坏：
 *   brightness  平均亮度 0..255
 *   blurScore   拉普拉斯方差，越大越清晰
 *   glareRatio  接近纯白的像素占比（包装反光）
 *   darkRatio   过暗像素占比
 *
 * 阈值放在 TypeScript 侧，好处是调参不用重新编译原生代码，
 * 而且可以用单元测试覆盖（见 src/services/vision/imageQuality.ts）。
 */
internal object ImageQualityAnalyzer {

  /** 质量分析用的小图尺寸：够用且很快，不需要原图分辨率 */
  private const val ANALYSIS_DIMENSION = 512

  const val GLARE_LEVEL = 250
  const val DARK_LEVEL = 45

  data class Metrics(
    val width: Int,
    val height: Int,
    val brightness: Double,
    val blurScore: Double,
    val glareRatio: Double,
    val darkRatio: Double
  )

  fun analyze(uriString: String): Metrics? {
    val bitmap = BitmapLoader.load(uriString, ANALYSIS_DIMENSION) ?: return null
    return try {
      analyzeBitmap(bitmap)
    } finally {
      bitmap.recycle()
    }
  }

  fun analyzeBitmap(bitmap: Bitmap): Metrics {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    // 转灰度
    val gray = IntArray(width * height)
    var sum = 0L
    var glare = 0
    var dark = 0

    for (i in pixels.indices) {
      val p = pixels[i]
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      // 人眼感知权重
      val lum = ((r * 299 + g * 587 + b * 114) / 1000)
      gray[i] = lum
      sum += lum
      if (lum >= GLARE_LEVEL) glare++
      if (lum <= DARK_LEVEL) dark++
    }

    val total = (width * height).toDouble()
    val brightness = sum / total

    return Metrics(
      width = width,
      height = height,
      brightness = brightness,
      blurScore = laplacianVariance(gray, width, height),
      glareRatio = glare / total,
      darkRatio = dark / total
    )
  }

  /**
   * 拉普拉斯方差：经典的清晰度指标。
   * 对灰度图做 4 邻域拉普拉斯卷积，再取方差。
   * 图像越模糊，边缘越弱，方差越小。
   */
  private fun laplacianVariance(gray: IntArray, width: Int, height: Int): Double {
    if (width < 3 || height < 3) return 0.0

    var sum = 0.0
    var sumSq = 0.0
    var count = 0

    for (y in 1 until height - 1) {
      val row = y * width
      for (x in 1 until width - 1) {
        val i = row + x
        val value = (
          gray[i - width] +
            gray[i - 1] +
            gray[i + 1] +
            gray[i + width] -
            4 * gray[i]
          ).toDouble()
        sum += value
        sumSq += value * value
        count++
      }
    }

    if (count == 0) return 0.0
    val mean = sum / count
    val variance = (sumSq / count) - (mean * mean)
    return if (variance < 0) 0.0 else sqrt(variance)
  }
}
