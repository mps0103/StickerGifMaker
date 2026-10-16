package com.mps.stickergif.sticker

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.UriMatcher
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * WhatsApp queries this provider directly; it never sees our UI or storage layout.
 * Pack metadata is written by StickerModule.publishPackIndex into files/stickers/packs.json.
 */
class StickerContentProvider : ContentProvider() {

    companion object {
        private const val METADATA = "metadata"
        private const val STICKERS = "stickers"
        private const val STICKERS_ASSET = "stickers_asset"

        fun authority(ctx: Context) = "${ctx.packageName}.stickercontentprovider"
        fun authorityUri(ctx: Context): Uri = Uri.parse("content://${authority(ctx)}/$METADATA")
    }

    private lateinit var matcher: UriMatcher

    override fun onCreate(): Boolean {
        val auth = authority(context!!)
        matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(auth, METADATA, 1)
            addURI(auth, "$METADATA/*", 2)
            addURI(auth, "$STICKERS/*", 3)
            addURI(auth, "$STICKERS_ASSET/*/*", 4)
        }
        return true
    }

    private fun packs(): JSONArray {
        val file = File(context!!.filesDir, "stickers/packs.json")
        if (!file.exists()) return JSONArray()
        return JSONObject(file.readText()).optJSONArray("sticker_packs") ?: JSONArray()
    }

    override fun query(
        uri: Uri, projection: Array<out String>?, selection: String?,
        selectionArgs: Array<out String>?, sortOrder: String?
    ): Cursor? = when (matcher.match(uri)) {
        1 -> packCursor(uri, packs())
        2 -> packCursor(uri, filterById(uri.lastPathSegment))
        3 -> stickerCursor(uri)
        else -> null
    }

    private fun filterById(id: String?): JSONArray {
        val out = JSONArray()
        val all = packs()
        for (i in 0 until all.length()) {
            val p = all.getJSONObject(i)
            if (p.getString("identifier") == id) out.put(p)
        }
        return out
    }

    private fun packCursor(uri: Uri, list: JSONArray): Cursor {
        val cursor = MatrixCursor(
            arrayOf(
                "sticker_pack_identifier", "sticker_pack_name", "sticker_pack_publisher",
                "sticker_pack_icon", "android_play_store_link", "ios_app_download_link",
                "sticker_pack_publisher_email", "sticker_pack_publisher_website",
                "sticker_pack_privacy_policy_website", "sticker_pack_license_agreement_website",
                "image_data_version", "whitelisted", "animated_sticker_pack"
            )
        )
        for (i in 0 until list.length()) {
            val p = list.getJSONObject(i)
            cursor.addRow(
                arrayOf(
                    p.getString("identifier"),
                    p.getString("name"),
                    p.optString("publisher", "MPS"),
                    p.optString("tray_image_file", "tray.webp"),
                    p.optString("android_play_store_link", ""),
                    "",
                    p.optString("publisher_email", "info@dealtrix.com"),
                    p.optString("publisher_website", ""),
                    p.optString("privacy_policy_website", ""),
                    p.optString("license_agreement_website", ""),
                    p.optString("image_data_version", "1"),
                    if (p.optBoolean("avoid_cache", false)) 0 else 1,
                    if (p.optBoolean("animated_sticker_pack", false)) 1 else 0
                )
            )
        }
        cursor.setNotificationUri(context!!.contentResolver, uri)
        return cursor
    }

    private fun stickerCursor(uri: Uri): Cursor {
        val cursor = MatrixCursor(arrayOf("sticker_file_name", "sticker_emoji", "sticker_accessibility_text"))
        val list = filterById(uri.lastPathSegment)
        if (list.length() == 0) return cursor
        val stickers = list.getJSONObject(0).optJSONArray("stickers") ?: return cursor
        for (i in 0 until stickers.length()) {
            val s = stickers.getJSONObject(i)
            val emojis = s.optJSONArray("emojis") ?: JSONArray()
            val joined = (0 until emojis.length()).joinToString(",") { emojis.getString(it) }
            cursor.addRow(arrayOf(s.getString("image_file"), joined, s.optString("accessibility_text", "")))
        }
        return cursor
    }

    override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor? {
        if (matcher.match(uri) != 4) return null
        val segments = uri.pathSegments
        val packId = segments[segments.size - 2]
        val fileName = segments[segments.size - 1]
        val file = File(context!!.filesDir, "stickers/$packId/$fileName")
        if (!file.exists()) return null
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    override fun getType(uri: Uri): String = when (matcher.match(uri)) {
        1 -> "vnd.android.cursor.dir/vnd.${authority(context!!)}.$METADATA"
        2 -> "vnd.android.cursor.item/vnd.${authority(context!!)}.$METADATA"
        3 -> "vnd.android.cursor.dir/vnd.${authority(context!!)}.$STICKERS"
        4 -> "image/webp"
        else -> "application/octet-stream"
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, s: String?, a: Array<out String>?): Int = 0
}
