package com.mps.stickergif.sticker

import android.graphics.Bitmap
import java.io.File

/**
 * Animated stickers are the reason this app needs any native code at all.
 * WhatsApp's budget is brutal: 512x512, at most 10 seconds, under 500 KB. One pass
 * rarely lands under it, so encode() steps quality down and retries.
 */
class AnimatedWebPEncoder private constructor(private var handle: Long) {

    companion object {
        init {
            System.loadLibrary("mpswebp")
        }

        const val MAX_DURATION_MS = 10_000
        const val MAX_BYTES = 500 * 1024

        /**
         * @param frames square 512x512 ARGB_8888 bitmaps, already padded and trimmed
         * @param frameDelayMs how long each frame stays up
         */
        fun encode(frames: List<Bitmap>, frameDelayMs: Int, target: File, loopCount: Int = 0): Long {
            require(frames.isNotEmpty()) { "No frames to encode." }

            val totalMs = frames.size * frameDelayMs
            require(totalMs <= MAX_DURATION_MS) {
                "Animated stickers can be at most 10 seconds. This one is ${totalMs / 1000.0}s."
            }

            target.parentFile?.mkdirs()
            var quality = 75f
            var lastSize = -1L

            while (quality >= 20f) {
                val encoder = AnimatedWebPEncoder(0L)
                encoder.handle =
                    encoder.nativeInit(frames[0].width, frames[0].height, loopCount, quality, false)
                if (encoder.handle == 0L) return -1

                var timestamp = 0
                var ok = true
                for (frame in frames) {
                    if (!encoder.addFrame(frame, timestamp)) {
                        ok = false
                        break
                    }
                    timestamp += frameDelayMs
                }

                if (!ok) {
                    encoder.release()
                    return -1
                }

                lastSize = encoder.finish(timestamp, target)
                if (lastSize in 1..MAX_BYTES) return lastSize
                quality -= 12f
            }
            // Caller decides what to do: usually drop the frame rate and retry.
            return lastSize
        }
    }

    external fun nativeInit(
        width: Int, height: Int, loopCount: Int, quality: Float, lossless: Boolean
    ): Long

    private external fun nativeAddFrame(handle: Long, bitmap: Bitmap, timestampMs: Int): Boolean
    private external fun nativeFinish(handle: Long, totalDurationMs: Int, outPath: String): Long
    private external fun nativeRelease(handle: Long)

    private fun addFrame(bitmap: Bitmap, timestampMs: Int): Boolean {
        val safe = if (bitmap.config == Bitmap.Config.ARGB_8888) bitmap
        else bitmap.copy(Bitmap.Config.ARGB_8888, false)
        val ok = nativeAddFrame(handle, safe, timestampMs)
        if (safe !== bitmap) safe.recycle()
        return ok
    }

    private fun finish(totalDurationMs: Int, target: File): Long {
        val written = nativeFinish(handle, totalDurationMs, target.absolutePath)
        handle = 0L
        return written
    }

    private fun release() {
        if (handle != 0L) {
            nativeRelease(handle)
            handle = 0L
        }
    }
}
