package com.mps.stickergif.sticker

import android.graphics.*

/**
 * The die-cut white border is what makes a cut-out read as a sticker rather than a
 * photo with a hole in it. Most free apps stop at the cut, so this is where the
 * output visibly differs.
 *
 * The outline is built from the alpha channel: blur it, harden it into a solid
 * silhouette, tint it, then draw the subject back on top.
 */
object StickerFx {

    fun applyOutline(src: Bitmap, thicknessPx: Float, color: Int): Bitmap {
        if (thicknessPx <= 0f) return src
        val pad = (thicknessPx * 2).toInt() + 8
        val out = Bitmap.createBitmap(src.width + pad * 2, src.height + pad * 2, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)

        val alpha = src.extractAlpha()
        val silhouette = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            maskFilter = BlurMaskFilter(thicknessPx, BlurMaskFilter.Blur.OUTER)
        }

        // Several passes turn the soft blur into a solid, even edge.
        val hard = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
        val steps = 24
        for (i in 0 until steps) {
            val angle = (2.0 * Math.PI * i / steps)
            canvas.drawBitmap(
                alpha,
                pad + (Math.cos(angle) * thicknessPx).toFloat(),
                pad + (Math.sin(angle) * thicknessPx).toFloat(),
                hard
            )
        }
        canvas.drawBitmap(alpha, pad.toFloat(), pad.toFloat(), silhouette)
        canvas.drawBitmap(src, pad.toFloat(), pad.toFloat(), null)
        alpha.recycle()
        return out
    }

    fun applyShadow(src: Bitmap, radiusPx: Float, dy: Float, color: Int): Bitmap {
        if (radiusPx <= 0f) return src
        val pad = (radiusPx + Math.abs(dy)).toInt() + 8
        val out = Bitmap.createBitmap(src.width + pad * 2, src.height + pad * 2, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val alpha = src.extractAlpha()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            maskFilter = BlurMaskFilter(radiusPx, BlurMaskFilter.Blur.NORMAL)
        }
        canvas.drawBitmap(alpha, pad.toFloat(), pad + dy, paint)
        canvas.drawBitmap(src, pad.toFloat(), pad.toFloat(), null)
        alpha.recycle()
        return out
    }

    /** Trims fully transparent margins so the subject fills the 512px canvas. */
    fun trimTransparent(src: Bitmap): Bitmap {
        val w = src.width
        val h = src.height
        val row = IntArray(w)
        var top = 0; var bottom = h - 1; var left = w - 1; var right = 0
        var foundTop = false

        for (y in 0 until h) {
            src.getPixels(row, 0, w, 0, y, w, 1)
            var rowHasPixel = false
            for (x in 0 until w) {
                if (row[x] ushr 24 > 8) {
                    rowHasPixel = true
                    if (x < left) left = x
                    if (x > right) right = x
                }
            }
            if (rowHasPixel) {
                if (!foundTop) { top = y; foundTop = true }
                bottom = y
            }
        }
        if (!foundTop || right <= left) return src
        return Bitmap.createBitmap(src, left, top, right - left + 1, bottom - top + 1)
    }
}
