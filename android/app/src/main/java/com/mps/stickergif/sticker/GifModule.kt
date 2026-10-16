package com.mps.stickergif.sticker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.*
import com.squareup.gifencoder.FloydSteinbergDitherer
import com.squareup.gifencoder.GifEncoder
import com.squareup.gifencoder.ImageOptions
import pl.droidsonroids.gif.GifDrawable
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Video and GIF work runs on MediaMetadataRetriever + a pure-Java GIF encoder.
 * No FFmpeg: ffmpeg-kit was retired, and its GPL builds would follow us into the APK.
 */
class GifModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "GifModule"

    private val gifDir: File get() = File(ctx.filesDir, "gifs").apply { mkdirs() }

    /** Pulls evenly spaced frames out of a video segment. */
    @ReactMethod
    fun videoToGif(options: ReadableMap, promise: Promise) {
        Thread {
            val retriever = MediaMetadataRetriever()
            try {
                val uri = Uri.parse(options.getString("uri"))
                val startMs = options.getDouble("startMs").toLong()
                val endMs = options.getDouble("endMs").toLong()
                val fps = if (options.hasKey("fps")) options.getInt("fps") else 10
                val width = if (options.hasKey("width")) options.getInt("width") else 320
                val loop = if (options.hasKey("loopCount")) options.getInt("loopCount") else 0
                val speed = if (options.hasKey("speed")) options.getDouble("speed") else 1.0
                val boomerang = options.hasKey("boomerang") && options.getBoolean("boomerang")
                val reverse = options.hasKey("reverse") && options.getBoolean("reverse")

                retriever.setDataSource(ctx, uri)

                val durationMs = (endMs - startMs).coerceAtLeast(100)
                val frameCount = ((durationMs / 1000.0) * fps).toInt().coerceIn(2, 300)
                val stepUs = (durationMs * 1000L) / frameCount
                val delayMs = (1000.0 / fps / speed).toLong().coerceAtLeast(20)

                // Frames are decoded to RGB up front so boomerang and reverse are
                // just list operations rather than a second pass over the video.
                val matrices = ArrayList<Array<IntArray>>(frameCount)
                var frameW = 0
                var frameH = 0
                for (i in 0 until frameCount) {
                    val timeUs = startMs * 1000L + i * stepUs
                    val frame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
                        ?: continue
                    val scaled = scaleToWidth(frame, width)
                    frameW = scaled.width
                    frameH = scaled.height
                    matrices.add(toRgbMatrix(scaled))
                    if (scaled !== frame) scaled.recycle()
                    frame.recycle()
                }
                if (matrices.size < 2) {
                    promise.reject("E_NO_FRAMES", "No frames could be read from that video.")
                    return@Thread
                }
                if (reverse) matrices.reverse()
                if (boomerang && matrices.size > 2) {
                    // Drop the two end frames on the way back so the turn does not stutter.
                    for (i in matrices.size - 2 downTo 1) matrices.add(matrices[i])
                }

                val out = File(gifDir, "gif_${System.currentTimeMillis()}.gif")
                FileOutputStream(out).use { stream ->
                    val encoder = GifEncoder(stream, frameW, frameH, loop)
                    matrices.forEach { m ->
                        encoder.addImage(
                            m,
                            ImageOptions()
                                .setDelay(delayMs, TimeUnit.MILLISECONDS)
                                .setDitherer(FloydSteinbergDitherer.INSTANCE)
                        )
                    }
                    encoder.finishEncoding()
                }
                promise.resolve(result(out))
            } catch (e: Exception) {
                promise.reject("E_GIF", e.message ?: "GIF export failed.", e)
            } finally {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) retriever.close() else retriever.release()
            }
        }.start()
    }

    /** Builds a GIF out of still images, one delay per frame. */
    @ReactMethod
    fun imagesToGif(uris: ReadableArray, delayMs: Int, width: Int, loopCount: Int, promise: Promise) {
        Thread {
            try {
                val out = File(gifDir, "gif_${System.currentTimeMillis()}.gif")
                FileOutputStream(out).use { stream ->
                    var encoder: GifEncoder? = null
                    for (i in 0 until uris.size()) {
                        val bmp = readBitmap(Uri.parse(uris.getString(i))) ?: continue
                        val scaled = scaleToWidth(bmp, width)
                        if (encoder == null) {
                            encoder = GifEncoder(stream, scaled.width, scaled.height, loopCount)
                        }
                        encoder.addImage(
                            toRgbMatrix(scaled),
                            ImageOptions()
                                .setDelay(delayMs.toLong(), TimeUnit.MILLISECONDS)
                                .setDitherer(FloydSteinbergDitherer.INSTANCE)
                        )
                        if (scaled !== bmp) scaled.recycle()
                        bmp.recycle()
                    }
                    if (encoder == null) {
                        promise.reject("E_NO_FRAMES", "Pick at least two images.")
                        return@Thread
                    }
                    encoder.finishEncoding()
                }
                promise.resolve(result(out))
            } catch (e: Exception) {
                promise.reject("E_GIF", e.message, e)
            }
        }.start()
    }

    /** Splits an existing GIF so the editor can show a frame strip. */
    @ReactMethod
    fun extractGifFrames(uriString: String, promise: Promise) {
        Thread {
            try {
                val input = ctx.contentResolver.openInputStream(Uri.parse(uriString))
                    ?: return@Thread promise.reject("E_OPEN", "That GIF could not be opened.")
                val temp = File(ctx.cacheDir, "src_${System.currentTimeMillis()}.gif")
                input.use { i -> temp.outputStream().use { o -> i.copyTo(o) } }

                val drawable = GifDrawable(temp)
                val frames = Arguments.createArray()
                for (i in 0 until drawable.numberOfFrames) {
                    val bmp = drawable.seekToFrameAndGet(i)
                    val f = File(ctx.cacheDir, "frame_${System.currentTimeMillis()}_$i.png")
                    f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    frames.pushMap(Arguments.createMap().apply {
                        putString("uri", "file://${f.absolutePath}")
                        putInt("index", i)
                        putInt("durationMs", drawable.getFrameDuration(i))
                    })
                    bmp.recycle()
                }
                drawable.recycle()
                promise.resolve(frames)
            } catch (e: Exception) {
                promise.reject("E_GIF_READ", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun getVideoInfo(uriString: String, promise: Promise) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(ctx, Uri.parse(uriString))
            fun meta(key: Int) = retriever.extractMetadata(key)?.toIntOrNull() ?: 0
            promise.resolve(Arguments.createMap().apply {
                putInt("durationMs", meta(MediaMetadataRetriever.METADATA_KEY_DURATION))
                putInt("width", meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH))
                putInt("height", meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT))
                putInt("rotation", meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION))
            })
        } catch (e: Exception) {
            promise.reject("E_VIDEO", e.message, e)
        } finally {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) retriever.close() else retriever.release()
        }
    }

    /** GIFs live in app storage until the user asks for them in the gallery. */
    @ReactMethod
    fun saveGifToGallery(path: String, promise: Promise) {
        try {
            val source = File(path.removePrefix("file://"))
            if (!source.exists()) return promise.reject("E_MISSING", "That GIF is no longer on disk.")
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "gif_${System.currentTimeMillis()}.gif")
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/gif")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/DieCut")
                }
            }
            val uri = ctx.contentResolver.insert(
                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
            ) ?: return promise.reject("E_MEDIASTORE", "Could not create the gallery file.")
            ctx.contentResolver.openOutputStream(uri)?.use { o -> source.inputStream().use { i -> i.copyTo(o) } }
            promise.resolve(uri.toString())
        } catch (e: Exception) {
            promise.reject("E_EXPORT", e.message, e)
        }
    }

    // ---------- helpers ----------

    private fun result(file: File): WritableMap = Arguments.createMap().apply {
        putString("uri", "file://${file.absolutePath}")
        putString("path", file.absolutePath)
        putDouble("bytes", file.length().toDouble())
    }

    private fun scaleToWidth(src: Bitmap, width: Int): Bitmap {
        if (src.width <= width) return src
        val height = (src.height * (width.toFloat() / src.width)).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, width, height, true)
    }

    private fun toRgbMatrix(bmp: Bitmap): Array<IntArray> {
        val pixels = IntArray(bmp.width * bmp.height)
        bmp.getPixels(pixels, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        return Array(bmp.height) { row ->
            IntArray(bmp.width) { col -> pixels[row * bmp.width + col] and 0xFFFFFF }
        }
    }

    private fun readBitmap(uri: Uri): Bitmap? =
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
}
