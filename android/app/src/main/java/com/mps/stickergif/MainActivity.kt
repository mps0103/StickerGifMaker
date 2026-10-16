package com.mps.stickergif

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "DieCut"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        // installSplashScreen must run before super.onCreate, and it also swaps
        // AppTheme.Starting out for AppTheme.
        val splash = installSplashScreen()

        // Hold the system splash until React is up, so it hands straight over to the
        // animated one in JS instead of vanishing at the first frame and leaving a
        // blank dark screen. The cap keeps a slow or failing start from hanging here.
        val startedAt = SystemClock.uptimeMillis()
        var jsReady = false
        val host = (application as ReactApplication).reactHost
        if (host == null || host.currentReactContext != null) {
            // Nothing to wait for.
            jsReady = true
        } else {
            host.addReactInstanceEventListener(object : ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                    jsReady = true
                }
            })
        }
        splash.setKeepOnScreenCondition {
            !jsReady && SystemClock.uptimeMillis() - startedAt < MAX_SPLASH_HOLD_MS
        }

        // Android 16 enforces edge-to-edge for apps targeting API 36.
        enableEdgeToEdge()
        super.onCreate(null)
    }

    private companion object {
        const val MAX_SPLASH_HOLD_MS = 2000L
    }
}
