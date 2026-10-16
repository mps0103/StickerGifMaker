package com.mps.stickergif.sticker

import android.graphics.Bitmap
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * WhatsApp rejects a pack if any file breaks its budget, so encoding is a search,
 * not a single compress() call: drop quality until the bytes fit.
 *
 *   static sticker  512x512  <= 100 KB
 *   tray icon        96x96   <=  50 KB
 */
object WebPEncoder {

    const val STICKER_SIZE = 512
    const val TRAY_SIZE = 96
    const val STICKER_MAX_BYTES = 100 * 1024
    const val TRAY_MAX_BYTES = 50 * 1024

    fun fitToCanvas(src: Bitmap, size: Int): Bitmap {
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(out)
        val scale = minOf(size.toFloat() / src.width, size.toFloat() / src.height)
        val w = src.width * scale
        val h = src.height * scale
        val dst = android.graphics.RectF((size - w) / 2f, (size - h) / 2f, (size + w) / 2f, (size + h) / 2f)
        canvas.drawBitmap(src, null, dst, android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
        return out
    }

    /** Returns the encoded bytes, or null when even the lowest quality overshoots. */
    fun encodeUnder(bitmap: Bitmap, maxBytes: Int): ByteArray? {
        var quality = 100
        while (quality >= 20) {
            val out = ByteArrayOutputStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, quality, out)
            } else {
                @Suppress("DEPRECATION")
                bitmap.compress(Bitmap.CompressFormat.WEBP, quality, out)
            }
            val bytes = out.toByteArray()
            if (bytes.size <= maxBytes) return bytes
            quality -= 5
        }
        return null
    }

    fun writeSticker(bitmap: Bitmap, target: File): Boolean {
        val bytes = encodeUnder(fitToCanvas(bitmap, STICKER_SIZE), STICKER_MAX_BYTES) ?: return false
        target.parentFile?.mkdirs()
        target.writeBytes(bytes)
        return true
    }

    fun writeTray(bitmap: Bitmap, target: File): Boolean {
        val bytes = encodeUnder(fitToCanvas(bitmap, TRAY_SIZE), TRAY_MAX_BYTES) ?: return false
        target.parentFile?.mkdirs()
        target.writeBytes(bytes)
        return true
    }
}
