package com.hukang.vision

import android.content.Context
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * PP-OCRv5 的字符集与 CTC 解码。
 *
 * ## 类别布局（已在 Python 侧用合成图验证：8/8 全对，置信度 0.95~0.999）
 *
 * PaddleOCR 的识别模型输出类别数是 **字典长度 + 2**，不是 +1：
 *
 * ```
 * ["blank"] + 18383 个字典字符 + [" "]  =  18385
 *    索引 0      索引 1 .. 18383     索引 18384
 * ```
 *
 * 最后那个 ASCII 空格是 PaddleOCR 的 `use_space_char` 追加的。
 * **少算这一个会导致每个字都错位** —— 这是整套移植里最容易踩的坑。
 *
 * 因此 [index] 的下标就是模型输出的类别下标，取到的就是对应字符；
 * blank 位置放 null，解码时跳过。
 */
internal class PaddleCharset private constructor(
  /** 原始字典（不含 blank、不含追加空格） */
  val dictionary: List<String>
) {

  /**
   * 模型类别下标 → 字符。长度为 `dictionary.size + 2`。
   * 下标 0 为 null（CTC blank）。
   */
  private val index: Array<String?> = buildIndex(dictionary)

  /** 模型输出的类别数，用于校验和调试 */
  val classCount: Int get() = index.size

  fun charAt(classIndex: Int): String? =
    if (classIndex in index.indices) index[classIndex] else null

  /**
   * CTC 贪心解码。
   *
   * 步骤：逐时间步取 argmax → 合并连续重复 → 去掉 blank。
   * 置信度取所有**保留下来的字符**的峰值概率平均值
   * （不是整个序列的平均，否则补零区域会把分数拉低得没有参考价值）。
   *
   * @param logits 形状 (T, C) 的二维数组，已按 [t][c] 展平
   * @param timeSteps 时间步数 T
   * @return 识别文本与平均置信度
   */
  fun decode(logits: Array<FloatArray>, timeSteps: Int): Decoded {
    val sb = StringBuilder()
    var scoreSum = 0.0
    var scoreCount = 0
    var previous = -1

    for (t in 0 until timeSteps) {
      val row = logits[t]
      var bestIndex = 0
      var bestValue = -Float.MAX_VALUE
      for (c in row.indices) {
        val v = row[c]
        if (v > bestValue) {
          bestValue = v
          bestIndex = c
        }
      }

      if (bestIndex != previous && bestIndex != BLANK_INDEX) {
        val ch = charAt(bestIndex)
        if (ch != null) {
          sb.append(ch)
          scoreSum += bestValue
          scoreCount++
        }
      }
      previous = bestIndex
    }

    val confidence = if (scoreCount > 0) (scoreSum / scoreCount).toFloat() else 0f
    return Decoded(sb.toString(), confidence)
  }

  data class Decoded(val text: String, val confidence: Float)

  companion object {
    /** CTC blank 固定在下标 0 */
    const val BLANK_INDEX = 0

    /** use_space_char 追加的 ASCII 空格 */
    private const val TRAILING_SPACE = " "

    /** 资源目录里的字典文件名 */
    const val ASSET_NAME = "models/ppocrv5_dict.txt"

    private fun buildIndex(dictionary: List<String>): Array<String?> {
      val index = arrayOfNulls<String>(dictionary.size + 2)
      index[0] = null // CTC blank
      for (i in dictionary.indices) {
        index[i + 1] = dictionary[i]
      }
      index[dictionary.size + 1] = TRAILING_SPACE
      return index
    }

    /**
     * 从 assets 读取字典。
     *
     * 说明：模型自身的 ONNX 元数据里也内嵌了一份 `character` 字段，
     * 我们已核对过两者**逐项完全相同**（都是 18383 项）。
     * 这里用文本文件是因为解析 ONNX 元数据在 Java API 下更绕，
     * 而两者既然一致，用文件更简单、也便于人工检查。
     */
    fun load(context: Context): PaddleCharset {
      val lines = ArrayList<String>(18400)
      context.assets.open(ASSET_NAME).use { stream ->
        BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
          while (true) {
            val line = reader.readLine() ?: break
            lines.add(line)
          }
        }
      }

      // 文件以换行结尾时 readLine 不会产生多余空行，但保险起见去掉尾部空项
      while (lines.isNotEmpty() && lines.last().isEmpty()) {
        lines.removeAt(lines.size - 1)
      }

      require(lines.isNotEmpty()) { "PP-OCRv5 字典为空：$ASSET_NAME" }
      return PaddleCharset(lines)
    }
  }
}
