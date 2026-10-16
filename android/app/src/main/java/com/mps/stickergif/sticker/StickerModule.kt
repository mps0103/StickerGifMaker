package com.mps.stickergif.sticker

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PointF
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.io.File

class StickerModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "StickerModule"

    private val stickerDir: File get() = File(ctx.filesDir, "stickers")

    // ---------- background removal (fully on-device) ----------

    @ReactMethod
    fun removeBackground(uriString: String, promise: Promise) {
        try {
            val bitmap = readBitmap(Uri.parse(uriString))
                ?: return promise.reject("E_DECODE", "That image could not be opened.")

            val options = SubjectSegmenterOptions.Builder()
                .enableForegroundBitmap()
                .build()
            val segmenter = SubjectSegmentation.getClient(options)

            segmenter.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { result ->
                    val cut = result.foregroundBitmap
                    if (cut == null) {
                        promise.reject("E_NO_SUBJECT", "No subject found. Use the original photo instead.")
                    } else {
                        // Deliberately NOT trimmed. The cut-out keeps the photo's own framing
                        // so the Clean up screen's Restore brush can paint the original back
                        // pixel for pixel; cropping to the subject happens in applyEffects.
                        promise.resolve(writeCache(cut, "cut"))
                    }
                    segmenter.close()
                }
                .addOnFailureListener { e ->
                    segmenter.close()
                    promise.reject("E_SEGMENT", e.message ?: "Background removal failed.")
                }
        } catch (e: Exception) {
            promise.reject("E_SEGMENT", e.message, e)
        }
    }

    /**
     * Outline and shadow preview. Returns a cache file the JS canvas can show
     * immediately; nothing is committed to a pack until saveSticker runs.
     */
    @ReactMethod
    fun applyEffects(uriString: String, opts: ReadableMap, promise: Promise) {
        Thread {
            try {
                val src = readBitmap(Uri.parse(uriString))
                    ?: return@Thread promise.reject("E_DECODE", "That image could not be opened.")

                // The crop moved here from removeBackground, so every preview and every
                // saved sticker still hugs its subject.
                var work = StickerFx.trimTransparent(src)
                val shadow = if (opts.hasKey("shadowRadius")) opts.getDouble("shadowRadius") else 0.0
                if (shadow > 0) {
                    work = StickerFx.applyShadow(work, shadow.toFloat(), shadow.toFloat() * 0.5f, Color.argb(140, 0, 0, 0))
                }
                val outline = if (opts.hasKey("outlineWidth")) opts.getDouble("outlineWidth") else 0.0
                if (outline > 0) {
                    val color = if (opts.hasKey("outlineColor")) Color.parseColor(opts.getString("outlineColor")) else Color.WHITE
                    work = StickerFx.applyOutline(work, outline.toFloat(), color)
                }
                promise.resolve(writeCache(work, "fx"))
            } catch (e: Exception) {
                promise.reject("E_FX", e.message, e)
            }
        }.start()
    }

    // ---------- saving stickers into a pack ----------

    @ReactMethod
    fun saveSticker(packId: String, stickerId: String, uriString: String, promise: Promise) {
        try {
            val bitmap = readBitmap(Uri.parse(uriString))
                ?: return promise.reject("E_DECODE", "That image could not be opened.")
            // WhatsApp addresses stickers by file name inside the pack folder, so the
            // name is what gets stored in the index - never the absolute path.
            val fileName = "$stickerId.webp"
            val file = File(stickerDir, "$packId/$fileName")
            if (!WebPEncoder.writeSticker(bitmap, file)) {
                return promise.reject("E_TOO_BIG", "This sticker will not compress under 100 KB. Simplify it and try again.")
            }
            promise.resolve(Arguments.createMap().apply {
                putString("fileName", fileName)
                putString("path", file.absolutePath)
                putInt("bytes", file.length().toInt())
            })
        } catch (e: Exception) {
            promise.reject("E_SAVE", e.message, e)
        }
    }

    @ReactMethod
    fun saveTrayIcon(packId: String, uriString: String, promise: Promise) {
        try {
            val bitmap = readBitmap(Uri.parse(uriString))
                ?: return promise.reject("E_DECODE", "That image could not be opened.")
            val file = File(stickerDir, "$packId/tray.webp")
            if (!WebPEncoder.writeTray(bitmap, file)) {
                return promise.reject("E_TOO_BIG", "Tray icon will not compress under 50 KB.")
            }
            promise.resolve("tray.webp")
        } catch (e: Exception) {
            promise.reject("E_SAVE", e.message, e)
        }
    }

    /** Copies a sticker out to the gallery so it works in Telegram, Signal, Insta. */
    @ReactMethod
    fun exportStickerToGallery(packId: String, fileName: String, promise: Promise) {
        try {
            val source = File(stickerDir, "$packId/$fileName")
            if (!source.exists()) return promise.reject("E_MISSING", "That sticker is no longer on disk.")
            val bitmap = BitmapFactory.decodeFile(source.absolutePath)
                ?: return promise.reject("E_DECODE", "Sticker could not be read.")

            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "sticker_${System.currentTimeMillis()}.png")
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/DieCut")
                }
            }
            val uri = ctx.contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: return promise.reject("E_MEDIASTORE", "Could not create the gallery file.")
            ctx.contentResolver.openOutputStream(uri)?.use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            promise.resolve(uri.toString())
        } catch (e: Exception) {
            promise.reject("E_EXPORT", e.message, e)
        }
    }

    @ReactMethod
    fun deleteSticker(packId: String, fileName: String, promise: Promise) {
        File(stickerDir, "$packId/$fileName").delete()
        promise.resolve(true)
    }

    /**
     * Opens the system share sheet with the sticker's own .webp. WhatsApp and
     * Telegram treat a shared image/webp as a sticker, which a PNG export from the
     * gallery would not be; the PNG route stays on exportStickerToGallery.
     */
    @ReactMethod
    fun shareSticker(packId: String, fileName: String, promise: Promise) {
        try {
            val file = File(stickerDir, "$packId/$fileName")
            if (!file.exists()) return promise.reject("E_MISSING", "That sticker is no longer on disk.")

            val uri = androidx.core.content.FileProvider.getUriForFile(
                ctx, "${ctx.packageName}.fileprovider", file
            )
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/webp"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = android.content.ClipData.newRawUri("sticker", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, "Share sticker").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SHARE", e.message, e)
        }
    }

    /** Rotation is additive degrees; flipH mirrors left to right before rotating. */
    @ReactMethod
    fun transformSticker(uriString: String, opts: ReadableMap, promise: Promise) {
        Thread {
            try {
                val src = readBitmap(Uri.parse(uriString))
                    ?: return@Thread promise.reject("E_DECODE", "That image could not be opened.")
                val degrees = if (opts.hasKey("rotate")) opts.getDouble("rotate").toFloat() else 0f
                val flip = opts.hasKey("flipH") && opts.getBoolean("flipH")

                val matrix = android.graphics.Matrix()
                if (flip) matrix.postScale(-1f, 1f, src.width / 2f, src.height / 2f)
                if (degrees != 0f) matrix.postRotate(degrees)

                val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrix, true)
                promise.resolve(writeCache(out, "xf"))
            } catch (e: Exception) {
                promise.reject("E_TRANSFORM", e.message, e)
            }
        }.start()
    }

    // ---------- cache hygiene ----------

    /**
     * Every preview and intermediate is written to the cache as a PNG. They are
     * only needed while a sticker is being edited, so anything older than the
     * given age is safe to drop. Only this app's own prefixes are touched: the
     * cache directory is shared with the image picker and the ad SDK.
     */
    @ReactMethod
    fun purgeCache(olderThanMs: Double, promise: Promise) {
        Thread {
            try {
                val cutoff = System.currentTimeMillis() - olderThanMs.toLong()
                var freed = 0L
                ownCacheFiles().forEach { f ->
                    if (f.lastModified() <= cutoff) {
                        freed += f.length()
                        f.delete()
                    }
                }
                promise.resolve(freed.toDouble())
            } catch (e: Exception) {
                promise.reject("E_CACHE", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun cacheSize(promise: Promise) {
        Thread {
            try {
                promise.resolve(ownCacheFiles().sumOf { it.length() }.toDouble())
            } catch (e: Exception) {
                promise.reject("E_CACHE", e.message, e)
            }
        }.start()
    }

    private fun ownCacheFiles(): List<File> =
        ctx.cacheDir.listFiles()?.filter { it.isFile && OWN_CACHE.matches(it.name) } ?: emptyList()

    @ReactMethod
    fun deletePack(packId: String, promise: Promise) {
        File(stickerDir, packId).deleteRecursively()
        promise.resolve(true)
    }

    /** Hands the JS-side pack index to the provider WhatsApp reads from. */
    @ReactMethod
    fun publishPackIndex(json: String, promise: Promise) {
        try {
            stickerDir.mkdirs()
            File(stickerDir, "packs.json").writeText(json)
            ctx.contentResolver.notifyChange(StickerContentProvider.authorityUri(ctx), null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_INDEX", e.message, e)
        }
    }

    // ---------- WhatsApp handoff ----------

    @ReactMethod
    fun isWhatsAppInstalled(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putBoolean("consumer", isInstalled("com.whatsapp"))
            putBoolean("business", isInstalled("com.whatsapp.w4b"))
        })
    }

    @ReactMethod
    fun addPackToWhatsApp(packId: String, packName: String, promise: Promise) {
        val activity = ctx.currentActivity
            ?: return promise.reject("E_NO_ACTIVITY", "App is not in the foreground.")
        try {
            val intent = Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK").apply {
                putExtra("sticker_pack_id", packId)
                putExtra("sticker_pack_authority", "${ctx.packageName}.stickercontentprovider")
                putExtra("sticker_pack_name", packName)
            }
            activity.startActivityForResult(intent, 200)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_WHATSAPP", "WhatsApp could not open. Is it installed?", e)
        }
    }


    // ---------- manual cleanup and text ----------

    /**
     * @param strokes [{points:[{x,y}], radius, erase}] in normalised 0..1 coordinates
     * @param originalUri the untouched photo, so "restore" has something to paint back
     */
    @ReactMethod
    fun applyStrokes(currentUri: String, originalUri: String, strokes: ReadableArray, promise: Promise) {
        Thread {
            try {
                val current = readBitmap(Uri.parse(currentUri))
                    ?: return@Thread promise.reject("E_DECODE", "That image could not be opened.")
                val original = readBitmap(Uri.parse(originalUri)) ?: current

                val parsed = ArrayList<StickerBrush.Stroke>(strokes.size())
                for (i in 0 until strokes.size()) {
                    val s = strokes.getMap(i) ?: continue
                    val pts = s.getArray("points") ?: continue
                    val points = ArrayList<PointF>(pts.size())
                    for (j in 0 until pts.size()) {
                        val p = pts.getMap(j) ?: continue
                        points.add(PointF(p.getDouble("x").toFloat(), p.getDouble("y").toFloat()))
                    }
                    if (points.isEmpty()) continue
                    parsed.add(
                        StickerBrush.Stroke(
                            points = points,
                            radius = s.getDouble("radius").toFloat(),
                            erase = s.getBoolean("erase"),
                        )
                    )
                }

                val result = StickerBrush.apply(current, original, parsed)
                promise.resolve(writeCache(result, "brush"))
            } catch (e: Exception) {
                promise.reject("E_BRUSH", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun addText(uriString: String, opts: ReadableMap, promise: Promise) {
        Thread {
            try {
                val src = readBitmap(Uri.parse(uriString))
                    ?: return@Thread promise.reject("E_DECODE", "That image could not be opened.")
                val result = StickerBrush.drawText(
                    src = src,
                    text = opts.getString("text") ?: "",
                    centerX = if (opts.hasKey("x")) opts.getDouble("x").toFloat() else 0.5f,
                    centerY = if (opts.hasKey("y")) opts.getDouble("y").toFloat() else 0.85f,
                    sizeRatio = if (opts.hasKey("size")) opts.getDouble("size").toFloat() else 0.16f,
                    color = Color.parseColor(opts.getString("color") ?: "#FFFFFF"),
                    outlineColor = Color.parseColor(opts.getString("outlineColor") ?: "#141119"),
                    bold = !opts.hasKey("bold") || opts.getBoolean("bold"),
                )
                promise.resolve(writeCache(result, "text"))
            } catch (e: Exception) {
                promise.reject("E_TEXT", e.message, e)
            }
        }.start()
    }

    // ---------- animated stickers ----------

    /**
     * Video segment -> animated WebP sticker. WhatsApp caps these at 10s and 500 KB,
     * so the frame rate is dropped and the encode retried rather than failing outright.
     */
    @ReactMethod
    fun saveAnimatedSticker(packId: String, stickerId: String, opts: ReadableMap, promise: Promise) {
        Thread {
            val retriever = MediaMetadataRetriever()
            try {
                val uri = Uri.parse(opts.getString("uri"))
                val startMs = opts.getDouble("startMs").toLong()
                val endMs = opts.getDouble("endMs").toLong()
                val removeBg = opts.hasKey("removeBackground") && opts.getBoolean("removeBackground")

                val durationMs = (endMs - startMs).coerceIn(300, AnimatedWebPEncoder.MAX_DURATION_MS.toLong())
                retriever.setDataSource(ctx, uri)

                val fileName = "$stickerId.webp"
                val file = File(stickerDir, "$packId/$fileName")

                // Each retry halves the frame count; fewer frames is far kinder to the
                // file size than crushing quality on all of them.
                for (fps in intArrayOf(12, 9, 6)) {
                    val frameCount = ((durationMs / 1000.0) * fps).toInt().coerceIn(2, 120)
                    val stepUs = (durationMs * 1000L) / frameCount
                    val delayMs = (1000 / fps)

                    val frames = ArrayList<Bitmap>(frameCount)
                    for (i in 0 until frameCount) {
                        val frame = retriever.getFrameAtTime(
                            startMs * 1000L + i * stepUs, MediaMetadataRetriever.OPTION_CLOSEST
                        ) ?: continue
                        frames.add(WebPEncoder.fitToCanvas(frame, WebPEncoder.STICKER_SIZE))
                        frame.recycle()
                    }
                    if (frames.size < 2) {
                        promise.reject("E_NO_FRAMES", "No frames could be read from that clip.")
                        return@Thread
                    }

                    val written = AnimatedWebPEncoder.encode(frames, delayMs, file)
                    frames.forEach { it.recycle() }

                    if (written in 1..AnimatedWebPEncoder.MAX_BYTES.toLong()) {
                        promise.resolve(Arguments.createMap().apply {
                            putString("fileName", fileName)
                            putString("path", file.absolutePath)
                            putInt("bytes", written.toInt())
                            putInt("fps", fps)
                            putBoolean("animated", true)
                        })
                        return@Thread
                    }
                }
                file.delete()
                promise.reject(
                    "E_TOO_BIG",
                    "This clip will not fit WhatsApp's 500 KB limit. Try a shorter or simpler section."
                )
            } catch (e: Exception) {
                promise.reject("E_ANIMATED", e.message, e)
            } finally {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) retriever.close() else retriever.release()
            }
        }.start()
    }

    // ---------- helpers ----------

    private fun isInstalled(pkg: String) = try {
        ctx.packageManager.getPackageInfo(pkg, 0); true
    } catch (e: Exception) { false }

    private fun writeCache(bitmap: Bitmap, prefix: String): String {
        val out = File(ctx.cacheDir, "${prefix}_${System.currentTimeMillis()}.png")
        out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return "file://${out.absolutePath}"
    }

    /**
     * Camera photos arrive rotated; segmentation on a sideways subject is worse.
     *
     * The bitmap is also downsampled on the way in. A 12MP photo decodes to roughly
     * 48MB at ARGB_8888 and ML Kit allocates its own buffers on top of that, so full
     * resolution decodes were making background removal fail on real camera shots.
     * Stickers are encoded at 512px anyway, so nothing visible is lost.
     */
    private fun readBitmap(uri: Uri, maxDim: Int = MAX_DECODE_DIM): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }

        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxDim || bounds.outHeight / (sample * 2) >= maxDim) {
            sample *= 2
        }

        val bitmap = ctx.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inSampleSize = sample
            })
        } ?: return null

        val orientation = try {
            ctx.contentResolver.openInputStream(uri)?.use { stream ->
                ExifInterface(stream).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }

        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (degrees == 0f) return bitmap

        val matrix = android.graphics.Matrix().apply { postRotate(degrees) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated != bitmap) bitmap.recycle()
        return rotated
    }

    private companion object {
        /** Long edge the segmenter sees. Well above the 512px sticker output. */
        const val MAX_DECODE_DIM = 2048

        /** File names writeCache produces: cut_123.png, fx_123.png and so on. */
        val OWN_CACHE = Regex("^(cut|fx|brush|text|xf)_[0-9]+[.]png$")
    }
}
