package com.hukang.vision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File

/**
 * 图片加载与方向纠正。
 *
 * 相机拍摄时我们已让原生层按 EXIF 纠正方向（skipProcessing=false），
 * 但相册导入的图片仍可能带旋转标记 —— 方向错了 OCR 会整片读不出来，
 * 所以这里统一再兜一次（§40：图片方向正确）。
 */
internal object BitmapLoader {

  /** ML Kit 对超大图会明显变慢；超过这个边长先降采样，仍远高于文字所需分辨率 */
  private const val MAX_OCR_DIMENSION = 2400

  fun load(uriString: String, maxDimension: Int = MAX_OCR_DIMENSION): Bitmap? {
    val file = toFile(uriString) ?: return null
    if (!file.exists() || file.length() <= 0L) return null

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    val options = BitmapFactory.Options().apply {
      inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxDimension)
    }
    val decoded = BitmapFactory.decodeFile(file.absolutePath, options) ?: return null
    return applyExifRotation(file, decoded)
  }

  private fun toFile(uriString: String): File? {
    return try {
      val uri = Uri.parse(uriString)
      when (uri.scheme) {
        null, "" -> File(uriString)
        "file" -> uri.path?.let { File(it) }
        // content:// 需要 ContentResolver，本模块只处理 App 私有目录里的图片
        else -> null
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun sampleSizeFor(width: Int, height: Int, maxDimension: Int): Int {
    var sample = 1
    var longest = maxOf(width, height)
    while (longest / 2 >= maxDimension) {
      sample *= 2
      longest /= 2
    }
    return sample
  }

  private fun applyExifRotation(file: File, bitmap: Bitmap): Bitmap {
    val orientation = try {
      ExifInterface(file.absolutePath).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL
      )
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      else -> return bitmap
    }

    return try {
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated != bitmap) bitmap.recycle()
      rotated
    } catch (e: Exception) {
      bitmap
    }
  }
}
