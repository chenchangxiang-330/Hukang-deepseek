package com.hukang.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * PaddleOCR PP-OCRv5 端侧文字识别引擎（ONNX Runtime，纯离线）。
 *
 * ## 为什么换掉 ML Kit
 *
 * 实测同一瓶真实商品（东鹏「焙好茶」茉莉乌龙）：
 *   - ML Kit      ：5 行 / 17 字，且读出的多是包装上的小徽标
 *   - PP-OCRv5    ：10 行 / ~30 字，正确读出「茉莉」「乌龙」「原味茶饮料」「净含量500m」
 * 加上竖排修复后还能读出商品主名「焙好茶」。
 *
 * ## 分层原则没有变（§32）
 *
 * 这个类只输出**原始文字 + 坐标框**，不做任何语义解析。
 * 品牌/品名/营养成分的提取仍然全部由 TypeScript 侧完成。
 *
 * ## 移植依据
 *
 * 全部算法与参数先在 Python 侧用 onnxruntime 验证通过再移植到这里：
 *   - 字符集映射 + CTC 解码：合成图 8/8 全对，置信度 0.95~0.999
 *   - 检测后处理：真实商品照片上框位准确
 *   - 竖排修复：竖排「焙好茶」置信度 0.18 → 0.99
 *   验证脚本见 tools/paddleocr/。
 */
internal class PaddleOcrEngine private constructor(private val context: Context) {

  /** 单行识别结果。坐标已映射回**原图**坐标系。 */
  data class Line(
    val text: String,
    val confidence: Float,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
  )

  private val environment: OrtEnvironment = OrtEnvironment.getEnvironment()

  private val detSession: OrtSession by lazy {
    createSession(MODEL_DET, threadCount = 2)
  }

  private val recSession: OrtSession by lazy {
    createSession(MODEL_REC, threadCount = 2)
  }

  private val charset: PaddleCharset by lazy {
    PaddleCharset.load(context)
  }

  // ==================================================================
  // 对外入口
  // ==================================================================

  /**
   * 识别整张图片。
   *
   * 调用方必须保证在后台线程执行 —— 这里会阻塞直到推理结束。
   * 首次调用会从 assets 释放模型并创建会话，大约需要一到两秒。
   */
  @Synchronized
  fun recognize(bitmap: Bitmap): List<Line> {
    if (bitmap.width < MIN_IMAGE_SIDE || bitmap.height < MIN_IMAGE_SIDE) {
      return emptyList()
    }

    val boxes = detect(bitmap)
    if (boxes.isEmpty()) return emptyList()

    val results = ArrayList<Line>(boxes.size)
    for (box in boxes) {
      val line = recognizeBox(bitmap, box) ?: continue
      if (line.text.isNotEmpty()) results.add(line)
    }
    return results
  }

  fun close() {
    runCatching { detSession.close() }
    runCatching { recSession.close() }
  }

  // ==================================================================
  // 检测
  // ==================================================================

  private fun detect(bitmap: Bitmap): List<PaddleDetPostProcess.TextBox> {
    // 1) 缩放到最长边 <= 960，且双维对齐到 32 的倍数
    val scale = if (max(bitmap.width, bitmap.height) > DET_LIMIT_SIDE) {
      DET_LIMIT_SIDE.toFloat() / max(bitmap.width, bitmap.height)
    } else {
      1f
    }

    val targetHeight = max(MIN_RESIZE_STEP, (bitmap.height * scale / ALIGN_STEP).roundToInt() * ALIGN_STEP)
    val targetWidth = max(MIN_RESIZE_STEP, (bitmap.width * scale / ALIGN_STEP).roundToInt() * ALIGN_STEP)

    val resized = if (targetWidth != bitmap.width || targetHeight != bitmap.height) {
      Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
    } else {
      bitmap
    }

    // 2) 组装 NCHW 输入张量（ImageNet 归一化）
    val pixels = IntArray(targetWidth * targetHeight)
    resized.getPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight)
    if (resized !== bitmap) resized.recycle()

    val planeSize = targetWidth * targetHeight
    val buffer = allocateDirectFloatBuffer(3 * planeSize)
    for (i in 0 until planeSize) {
      val color = pixels[i]
      val r = ((color shr 16) and 0xFF) / 255f
      val g = ((color shr 8) and 0xFF) / 255f
      val b = (color and 0xFF) / 255f
      buffer.put(i, (r - DET_MEAN_R) / DET_STD_R)
      buffer.put(planeSize + i, (g - DET_MEAN_G) / DET_STD_G)
      buffer.put(2 * planeSize + i, (b - DET_MEAN_B) / DET_STD_B)
    }

    // 3) 推理
    val prob = OnnxTensor.createTensor(
      environment,
      buffer,
      longArrayOf(1, 3, targetHeight.toLong(), targetWidth.toLong())
    ).use { tensor ->
      detSession.run(mapOf(MODEL_INPUT_NAME to tensor)).use { output ->
        @Suppress("UNCHECKED_CAST")
        val data = output[0].value as Array<Array<Array<FloatArray>>>
        flattenProbMap(data[0][0], targetWidth, targetHeight)
      }
    }

    // 4) 概率图 → 文本框
    val boxes = PaddleDetPostProcess.extract(prob, targetWidth, targetHeight)
    if (boxes.isEmpty()) return emptyList()

    // 5) 映射回原图坐标
    val scaleX = bitmap.width.toFloat() / targetWidth
    val scaleY = bitmap.height.toFloat() / targetHeight
    val mapped = boxes.map { box ->
      PaddleDetPostProcess.TextBox(
        left = (box.left * scaleX).toInt().coerceIn(0, bitmap.width - 1),
        top = (box.top * scaleY).toInt().coerceIn(0, bitmap.height - 1),
        right = (box.right * scaleX).roundToInt().coerceIn(1, bitmap.width),
        bottom = (box.bottom * scaleY).roundToInt().coerceIn(1, bitmap.height),
        score = box.score
      )
    }.filter { it.width >= DET_MIN_SIZE && it.height >= DET_MIN_SIZE }

    return PaddleDetPostProcess.sortReadingOrder(mapped)
  }

  /**
   * 把 ONNX 输出 (1,1,H,W) 的嵌套数组压平成行优先的一维数组。
   *
   * 直接操作嵌套数组会让后续连通域代码处处带两层下标，
   * 展平一次换来后面所有逻辑都干净。
   */
  private fun flattenProbMap(rows: Array<FloatArray>, width: Int, height: Int): FloatArray {
    val flat = FloatArray(width * height)
    var offset = 0
    for (y in 0 until height) {
      val row = rows[y]
      System.arraycopy(row, 0, flat, offset, min(width, row.size))
      offset += width
    }
    return flat
  }

  // ==================================================================
  // 识别
  // ==================================================================

  /**
   * 识别单个文本框。
   *
   * 竖长框（高 > 宽 × 1.5）会额外尝试旋转 90° 的两个方向，取置信度最高的结果。
   * 这是必需的：包装上常见竖排商品名（例如「焙好茶」），
   * 识别模型只吃横排文字，不旋转就只能读出一个噪声字符。
   */
  private fun recognizeBox(
    bitmap: Bitmap,
    box: PaddleDetPostProcess.TextBox
  ): Line? {
    val left = box.left.coerceIn(0, bitmap.width - 1)
    val top = box.top.coerceIn(0, bitmap.height - 1)
    val right = box.right.coerceIn(left + 1, bitmap.width)
    val bottom = box.bottom.coerceIn(top + 1, bitmap.height)
    val cropWidth = right - left
    val cropHeight = bottom - top
    if (cropWidth < DET_MIN_SIZE || cropHeight < DET_MIN_SIZE) return null

    val crop = try {
      Bitmap.createBitmap(bitmap, left, top, cropWidth, cropHeight)
    } catch (e: IllegalArgumentException) {
      return null
    }

    val isTall = cropHeight > cropWidth * TALL_BOX_RATIO

    var best = runRecognition(crop)
    if (isTall) {
      for (degrees in intArrayOf(-90, 90)) {
        val rotated = rotate(crop, degrees.toFloat()) ?: continue
        val candidate = try {
          runRecognition(rotated)
        } finally {
          rotated.recycle()
        }
        if (candidate.confidence > best.confidence) best = candidate
      }
    }
    crop.recycle()

    if (best.text.isEmpty()) return null
    return Line(
      text = best.text,
      confidence = best.confidence,
      left = left,
      top = top,
      right = right,
      bottom = bottom
    )
  }

  private fun rotate(source: Bitmap, degrees: Float): Bitmap? = try {
    val matrix = Matrix().apply { postRotate(degrees) }
    Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
  } catch (e: Exception) {
    null
  }

  private fun runRecognition(crop: Bitmap): PaddleCharset.Decoded {
    val cropWidth = crop.width
    val cropHeight = crop.height
    if (cropWidth <= 0 || cropHeight <= 0) return PaddleCharset.Decoded("", 0f)

    // 保持宽高比缩放到高 48，宽度上限 320
    val ratio = REC_HEIGHT.toFloat() / cropHeight
    val resizedWidth = max(1, min((cropWidth * ratio).roundToInt(), REC_MAX_WIDTH))
    val resized = Bitmap.createScaledBitmap(crop, resizedWidth, REC_HEIGHT, true)

    val pixels = IntArray(resizedWidth * REC_HEIGHT)
    resized.getPixels(pixels, 0, resizedWidth, 0, 0, resizedWidth, REC_HEIGHT)
    // ⚠️ 尺寸恰好相同时 createScaledBitmap 会**原样返回入参**。
    // 无条件 recycle 会把调用方还要继续用的 crop（例如竖排还要拿它去旋转）
    // 提前销毁，之后再旋转就会抛 "recycled bitmap"。
    if (resized !== crop) resized.recycle()

    // 右侧补 0（归一化后的 0 即中灰），这是 PaddleOCR 的做法
    val planeSize = REC_HEIGHT * REC_MAX_WIDTH
    val buffer = allocateDirectFloatBuffer(3 * planeSize)
    for (y in 0 until REC_HEIGHT) {
      for (x in 0 until resizedWidth) {
        val color = pixels[y * resizedWidth + x]
        val index = y * REC_MAX_WIDTH + x
        buffer.put(index, normalizeRec(((color shr 16) and 0xFF) / 255f))
        buffer.put(planeSize + index, normalizeRec(((color shr 8) and 0xFF) / 255f))
        buffer.put(2 * planeSize + index, normalizeRec((color and 0xFF) / 255f))
      }
    }
    // 补零区域：normalizeRec(0/255) = -1，即最暗，和 PaddleOCR 的 padding 一致
    val padValue = normalizeRec(0f)
    for (y in 0 until REC_HEIGHT) {
      for (x in resizedWidth until REC_MAX_WIDTH) {
        val index = y * REC_MAX_WIDTH + x
        buffer.put(index, padValue)
        buffer.put(planeSize + index, padValue)
        buffer.put(2 * planeSize + index, padValue)
      }
    }

    return OnnxTensor.createTensor(
      environment,
      buffer,
      longArrayOf(1, 3, REC_HEIGHT.toLong(), REC_MAX_WIDTH.toLong())
    ).use { tensor ->
      recSession.run(mapOf(MODEL_INPUT_NAME to tensor)).use { output ->
        @Suppress("UNCHECKED_CAST")
        val sequence = output[0].value as Array<Array<FloatArray>>
        val steps = sequence[0]
        charset.decode(steps, steps.size)
      }
    }
  }

  // ==================================================================
  // 模型与会话
  // ==================================================================

  /** 需要时释放模型并创建推理会话。会话创建代价高，由 [lazy] 保证只做一次。 */
  private fun createSession(assetName: String, threadCount: Int): OrtSession {
    val modelFile = releaseAsset(assetName)
    val options = OrtSession.SessionOptions().apply {
      setIntraOpNumThreads(threadCount)
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
    }
    return environment.createSession(modelFile.absolutePath, options)
  }

  /**
   * 从 assets 释放模型到私有目录。
   *
   * 不直接用 assets 路径是因为 ONNX Runtime 需要真实文件路径来 mmap，
   * 而 assets 在 APK 里是压缩存储的、拿不到可用的文件描述符。
   *
   * 用「先写临时文件再改名」的方式：改名在同一文件系统上是原子的，
   * 所以只要目标文件存在就一定是完整的。否则拷贝中途被杀进程会留下
   * 半个文件，下次启动又误以为已经就绪。
   *
   * 注意不要用 `assets.openFd().length` 判断是否已释放 ——
   * 资源被压缩时 openFd 会直接抛异常，那样会退化成每次启动都重拷 20MB。
   */
  private fun releaseAsset(assetName: String): File {
    val target = File(context.filesDir, assetName)
    if (target.exists() && target.length() > 0L) return target

    target.parentFile?.mkdirs()
    val temp = File(target.parentFile, "${target.name}.part")
    if (temp.exists()) temp.delete()

    context.assets.open(assetName).use { input ->
      temp.outputStream().use { output -> input.copyTo(output, COPY_BUFFER_SIZE) }
    }

    if (target.exists()) target.delete()
    if (!temp.renameTo(target)) {
      temp.delete()
      error("模型释放失败：$assetName")
    }
    return target
  }

  companion object {
    private const val MODEL_DET = "models/ch_PP-OCRv5_det_mobile.onnx"
    private const val MODEL_REC = "models/ch_PP-OCRv5_rec_mobile.onnx"
    private const val MODEL_INPUT_NAME = "x"

    /** 释放模型时的拷贝缓冲，比默认 8KB 大一些以减少系统调用 */
    private const val COPY_BUFFER_SIZE = 256 * 1024

    /** 检测输入最长边上限 */
    private const val DET_LIMIT_SIDE = 960

    /** 缩放后双维对齐到该值的倍数（模型下采样倍数的要求） */
    private const val ALIGN_STEP = 32
    private const val MIN_RESIZE_STEP = 32

    /** 图片比这还小就没有识别价值 */
    private const val MIN_IMAGE_SIDE = 32

    private const val DET_MIN_SIZE = 3

    // 检测归一化：ImageNet 均值方差
    private const val DET_MEAN_R = 0.485f
    private const val DET_MEAN_G = 0.456f
    private const val DET_MEAN_B = 0.406f
    private const val DET_STD_R = 0.229f
    private const val DET_STD_G = 0.224f
    private const val DET_STD_B = 0.225f

    private const val REC_HEIGHT = 48
    private const val REC_MAX_WIDTH = 320

    /** 高宽比超过这个值就认为是竖排，需要尝试旋转 */
    private const val TALL_BOX_RATIO = 1.5f

    private fun normalizeRec(value: Float): Float = (value - 0.5f) / 0.5f

    private fun allocateDirectFloatBuffer(capacity: Int): FloatBuffer =
      ByteBuffer.allocateDirect(capacity * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()

    /**
     * 取得引擎实例。会话创建代价高，按 Context 缓存。
     *
     * 用 applicationContext 避免持有 Activity 导致泄漏。
     */
    @Volatile
    private var instance: PaddleOcrEngine? = null

    fun get(context: Context): PaddleOcrEngine =
      instance ?: synchronized(this) {
        instance ?: PaddleOcrEngine(context.applicationContext).also { instance = it }
      }

    /** 释放缓存实例（模块销毁时调用） */
    fun release() {
      synchronized(this) {
        instance?.close()
        instance = null
      }
    }
  }
}
