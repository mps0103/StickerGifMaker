package com.mps.stickergif.sticker

import android.graphics.*

/**
 * Manual cleanup after the automatic cut. Segmentation always misses hair, glass and
 * anything held in front of the subject, and that miss is what people judge the app on.
 *
 * Strokes arrive from JS in normalised 0..1 coordinates, so the same stroke applies
 * whatever size the on-screen canvas was.
 */
object StickerBrush {

    data class Stroke(val points: List<PointF>, val radius: Float, val erase: Boolean)

    fun apply(current: Bitmap, original: Bitmap, strokes: List<Stroke>): Bitmap {
        val out = current.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(out)

        val erase = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
        }

        // Restore paints the original photo back in through a stroke-shaped mask.
        val restoreLayer = Bitmap.createBitmap(out.width, out.height, Bitmap.Config.ARGB_8888)
        val restoreCanvas = Canvas(restoreLayer)
        val restoreMask = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            color = Color.BLACK
        }
        var hasRestore = false

        for (stroke in strokes) {
            val path = toPath(stroke, out.width, out.height)
            val radiusPx = stroke.radius * out.width
            if (stroke.erase) {
                erase.strokeWidth = radiusPx * 2f
                canvas.drawPath(path, erase)
            } else {
                restoreMask.strokeWidth = radiusPx * 2f
                restoreCanvas.drawPath(path, restoreMask)
                hasRestore = true
            }
        }

        if (hasRestore) {
            val srcIn = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            }
            val scaled =
                if (original.width == out.width && original.height == out.height) original
                else Bitmap.createScaledBitmap(original, out.width, out.height, true)
            restoreCanvas.drawBitmap(scaled, 0f, 0f, srcIn)
            canvas.drawBitmap(restoreLayer, 0f, 0f, null)
            if (scaled !== original) scaled.recycle()
        }
        restoreLayer.recycle()
        return out
    }

    private fun toPath(stroke: Stroke, width: Int, height: Int): Path {
        val path = Path()
        stroke.points.forEachIndexed { i, p ->
            val x = p.x * width
            val y = p.y * height
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        // A single tap has no line to draw, so nudge it into a dot.
        if (stroke.points.size == 1) {
            path.lineTo(stroke.points[0].x * width + 0.1f, stroke.points[0].y * height)
        }
        return path
    }

    /** Text drawn onto the sticker itself, so it survives the WebP export. */
    fun drawText(
        src: Bitmap,
        text: String,
        centerX: Float,
        centerY: Float,
        sizeRatio: Float,
        color: Int,
        outlineColor: Int,
        bold: Boolean,
    ): Bitmap {
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(out)
        val size = sizeRatio * out.width

        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        val stroke = Paint(fill).apply {
            style = Paint.Style.STROKE
            strokeWidth = size * 0.14f
            strokeJoin = Paint.Join.ROUND
            this.color = outlineColor
        }

        // Wrap by hand: sticker canvases are small and Layout classes need a fixed width.
        val maxWidth = out.width * 0.92f
        val lines = wrap(text, fill, maxWidth)
        val lineHeight = size * 1.1f
        var y = centerY * out.height - (lines.size - 1) * lineHeight / 2f

        for (line in lines) {
            canvas.drawText(line, centerX * out.width, y, stroke)
            canvas.drawText(line, centerX * out.width, y, fill)
            y += lineHeight
        }
        return out
    }

    private fun wrap(text: String, paint: Paint, maxWidth: Float): List<String> {
        val words = text.split(" ")
        val lines = ArrayList<String>()
        var line = StringBuilder()
        for (word in words) {
            val candidate = if (line.isEmpty()) word else "$line $word"
            if (paint.measureText(candidate) <= maxWidth || line.isEmpty()) {
                line = StringBuilder(candidate)
            } else {
                lines.add(line.toString())
                line = StringBuilder(word)
            }
        }
        if (line.isNotEmpty()) lines.add(line.toString())
        return lines
    }
}
