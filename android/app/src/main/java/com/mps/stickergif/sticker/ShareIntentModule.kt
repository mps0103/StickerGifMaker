package com.mps.stickergif.sticker

import android.content.Intent
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The share sheet is the cheapest install driver this app has: long-press any photo
 * in any app, share it here, and the cut-out is already running. That only works if
 * we actually read the launching intent, so this module exposes it to JS.
 */
class ShareIntentModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx), ActivityEventListener {

    init {
        ctx.addActivityEventListener(this)
    }

    override fun getName() = "ShareIntentModule"

    /**
     * NativeEventEmitter refuses to subscribe unless the module exposes these two,
     * and warns instead of throwing, so the warm-start share event was being
     * dropped in silence. They are bookkeeping only; the emit side is unchanged.
     */
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    /** Called on mount, for the case where the app was cold-started by a share. */
    @ReactMethod
    fun getInitialShare(promise: Promise) {
        promise.resolve(readIntent(ctx.currentActivity?.intent))
    }

    @ReactMethod
    fun clearInitialShare(promise: Promise) {
        ctx.currentActivity?.intent?.replaceExtras(android.os.Bundle())
        ctx.currentActivity?.intent?.action = Intent.ACTION_MAIN
        promise.resolve(true)
    }

    // Required by ActivityEventListener but unused: no child activities return data here.
    override fun onActivityResult(activity: android.app.Activity, requestCode: Int, resultCode: Int, data: Intent?) = Unit

    /** Warm start: the app was already running when the user shared something. */
    override fun onNewIntent(intent: Intent) {
        val payload = readIntent(intent) ?: return
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("mps.share", payload)
    }

    private fun readIntent(intent: Intent?): WritableMap? {
        if (intent == null) return null
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return null

        val uris = ArrayList<Uri>()
        if (intent.action == Intent.ACTION_SEND) {
            extraStream(intent)?.let { uris.add(it) }
        } else {
            extraStreamList(intent)?.let { uris.addAll(it) }
        }
        if (uris.isEmpty()) return null

        val type = intent.type ?: ""
        return Arguments.createMap().apply {
            putString("kind", if (type.startsWith("video")) "video" else "image")
            putArray("uris", Arguments.createArray().apply { uris.forEach { pushString(it.toString()) } })
        }
    }

    @Suppress("DEPRECATION")
    private fun extraStream(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }

    @Suppress("DEPRECATION")
    private fun extraStreamList(intent: Intent): List<Uri>? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }
}
