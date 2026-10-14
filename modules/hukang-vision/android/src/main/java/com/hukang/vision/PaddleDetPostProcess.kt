package com.hukang.vision

import kotlin.math.max
import kotlin.math.min

/**
 * PP-OCRv5 检测结果后处理：概率图 → 文本框。
 *
 * ## 为什么不用 OpenCV
 *
 * PaddleOCR 官方后处理走 `cv2.minAreaRect` + `pyclipper`，但把 OpenCV 打进
 * APK 要增加几十 MB，而我们只用到其中很小一部分。这里用纯 Kotlin 实现
 * **轴对齐**版本：连通域的外接矩形 + unclip 扩张。
 *
 * 代价是不支持倾斜文字的旋转框。对商品包装正面和营养成分表这类
 * 基本横平竖直的场景足够；真遇到斜排文字再考虑引入旋转框。
 *
 * ## 参数来源
 *
 * 下面这些常量是 PaddleOCR PP-OCRv5 检测模型自带的默认值，
 * 已用真实商品照片（东鹏「焙好茶」茉莉乌龙）验证过检测质量。
 */
internal object PaddleDetPostProcess {

  /** 概率图二值化阈值 */
  private const val THRESH = 0.3f

  /** 连通域平均置信度下限，低于此值认为是噪声 */
  private const val BOX_THRESH = 0.6f

  /** unclip 扩张比例：文字区域通常比模型输出的紧致区域略大 */
  private const val UNCLIP_RATIO = 1.5

  /** 最小边长，滤掉细碎噪点 */
  private const val MIN_SIZE = 3

  /** 单张图最多保留的文本框数，防止异常图片炸内存 */
  private const val MAX_CANDIDATES = 1000

  /**
   * 检测框。坐标是**检测分辨率**下的，调用方负责映射回原图。
   */
  data class TextBox(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val score: Float
  ) {
    val width: Int get() = right - left
    val height: Int get() = bottom - top
  }

  /**
   * 从概率图提取文本框。
   *
   * @param prob 长度为 width*height 的概率值，行优先
   */
  fun extract(prob: FloatArray, width: Int, height: Int): List<TextBox> {
    val total = width * height
    require(prob.size >= total) { "概率图尺寸不符：期望至少 $total，实际 ${prob.size}" }

    val visited = BooleanArray(total)
    // 每个像素最多入栈一次，所以 total 是真实上界
    val stack = IntArray(total)
    val boxes = ArrayList<TextBox>()

    for (start in 0 until total) {
      if (visited[start] || prob[start] <= THRESH) continue

      // ---- 迭代式洪水填充（不用递归，避免大区域爆栈）----
      var stackPointer = 0
      stack[stackPointer++] = start
      visited[start] = true

      var minX = width
      var maxX = -1
      var minY = height
      var maxY = -1
      var scoreSum = 0.0
      var pixelCount = 0

      while (stackPointer > 0) {
        val index = stack[--stackPointer]
        val y = index / width
        val x = index - y * width

        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        scoreSum += prob[index]
        pixelCount++

        val yStart = max(0, y - 1)
        val yEnd = min(height - 1, y + 1)
        val xStart = max(0, x - 1)
        val xEnd = min(width - 1, x + 1)

        for (ny in yStart..yEnd) {
          val rowOffset = ny * width
          for (nx in xStart..xEnd) {
            val neighbor = rowOffset + nx
            if (!visited[neighbor] && prob[neighbor] > THRESH) {
              visited[neighbor] = true
              stack[stackPointer++] = neighbor
            }
          }
        }
      }

      // ---- 过滤 ----
      val boxWidth = maxX - minX + 1
      val boxHeight = maxY - minY + 1
      if (boxWidth < MIN_SIZE || boxHeight < MIN_SIZE) continue

      val score = (scoreSum / pixelCount).toFloat()
      if (score < BOX_THRESH) continue

      // ---- unclip 扩张 ----
      // PaddleOCR 的做法：偏移距离 = 面积 × 比例 / 周长。
      // 对轴对齐矩形，面积≈像素数，周长=2*(w+h)。
      val perimeter = 2.0 * (boxWidth + boxHeight)
      if (perimeter <= 0.0) continue
      val distance = pixelCount * UNCLIP_RATIO / perimeter

      val left = clamp(minX - distance, width)
      val top = clamp(minY - distance, height)
      val right = clamp(maxX + 1 + distance, width)
      val bottom = clamp(maxY + 1 + distance, height)

      if (right - left < MIN_SIZE || bottom - top < MIN_SIZE) continue

      boxes.add(TextBox(left, top, right, bottom, score))

      if (boxes.size >= MAX_CANDIDATES) break
    }

    return sortReadingOrder(boxes)
  }

  private fun clamp(value: Double, limit: Int): Int =
    max(0, min(value.toInt(), limit))

  /**
   * 按阅读顺序排序：先上下成行，行内再左右。
   *
   * 单纯「先比 top 再比 left」在略微倾斜的包装上会把同一行拆开，
   * 所以这里用**纵向重叠率**判断两框是否属于同一行。
   */
  fun sortReadingOrder(boxes: List<TextBox>): List<TextBox> {
    if (boxes.size <= 1) return boxes

    val rows = ArrayList<MutableList<TextBox>>()

    for (box in boxes.sortedBy { it.top }) {
      var placed = false
      for (row in rows) {
        var rowTop = Int.MAX_VALUE
        var rowBottom = Int.MIN_VALUE
        for (b in row) {
          if (b.top < rowTop) rowTop = b.top
          if (b.bottom > rowBottom) rowBottom = b.bottom
        }
        val overlap = min(box.bottom, rowBottom) - max(box.top, rowTop)
        val shorter = min(box.height, rowBottom - rowTop)
        if (overlap > 0 && shorter > 0 && overlap.toDouble() / shorter > 0.5) {
          row.add(box)
          placed = true
          break
        }
      }
      if (!placed) rows.add(mutableListOf(box))
    }

    rows.sortBy { row -> row.minOf { it.top } }

    val ordered = ArrayList<TextBox>(boxes.size)
    for (row in rows) {
      ordered.addAll(row.sortedBy { it.left })
    }
    return ordered
  }
}
