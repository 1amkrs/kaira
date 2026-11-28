package com.kaira.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityOptionsCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var localServer: KairaLocalServer
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var isTV: Boolean = false

    private val nativePlayerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val data = result.data!!
            val detail = JSONObject().apply {
                put("slug", data.getStringExtra(TvPlayerActivity.RESULT_SLUG) ?: "")
                put("imdbId", data.getStringExtra(TvPlayerActivity.RESULT_IMDB_ID) ?: "")
                put("isShow", data.getBooleanExtra(TvPlayerActivity.RESULT_IS_SHOW, false))
                put("season", data.getIntExtra(TvPlayerActivity.RESULT_SEASON, 1))
                put("episode", data.getIntExtra(TvPlayerActivity.RESULT_EPISODE, 1))
                put("currentTime", data.getLongExtra(TvPlayerActivity.RESULT_POSITION_SEC, 0L))
                put("duration", data.getLongExtra(TvPlayerActivity.RESULT_DURATION_SEC, 0L))
                put("serverIndex", data.getIntExtra(TvPlayerActivity.RESULT_SERVER_INDEX, 0))
            }.toString()
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('kaira:native-player-progress', { detail: $detail }));",
                null
            )
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        isTV = isRunningOnAndroidTV()
        applyImmersiveMode(isTV)

        // Boot embedded 127.0.0.1 Kaira local server for clean URLs, API, and 4K HLS proxying
        localServer = KairaLocalServer(assets)
        localServer.start()

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0a0b10"))
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            alpha = 0f
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.addJavascriptInterface(AndroidBridge(isTV), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                val host = uri.host ?: return false
                // Keep all loopback Kaira routes inside the WebView
                if (host == "127.0.0.1" || host == "localhost") {
                    return false
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val platformTag = if (isTV) "android-tv" else "android-mobile"
                val serverUrlEscaped = JSONObject.quote(localServer.baseUrl)
                view?.evaluateJavascript(
                    "window.__TVOS_PLATFORM__ = '$platformTag'; window.__KAIRA_LOCAL_SERVER__ = $serverUrlEscaped; window.dispatchEvent(new CustomEvent('kaira:android-ready', { detail: { isTV: $isTV, localServerUrl: $serverUrlEscaped } }));",
                    null
                )
                if (webView.alpha < 1f) {
                    webView.animate()
                        .alpha(1f)
                        .setDuration(220L)
                        .start()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                setContentView(view)
                applyImmersiveMode(true)
            }

            override fun onHideCustomView() {
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                setContentView(webView)
                applyImmersiveMode(isTV)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                    return
                }
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('kaira:android-back'));",
                    null
                )
            }
        })

        val modeQuery = if (isTV) "?android=tv" else "?android=mobile"
        webView.loadUrl("${localServer.baseUrl}/$modeQuery")
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    onBackPressedDispatcher.onBackPressed()
                    return true
                }
                KeyEvent.KEYCODE_DPAD_UP -> {
                    dispatchWebKey("ArrowUp")
                    return true
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    dispatchWebKey("ArrowDown")
                    return true
                }
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    dispatchWebKey("ArrowLeft")
                    return true
                }
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    dispatchWebKey("ArrowRight")
                    return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    dispatchWebKey("Enter")
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                    dispatchWebKey("MediaPlayPause")
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    dispatchWebKey("MediaRewind")
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    dispatchWebKey("MediaFastForward")
                    return true
                }
                KeyEvent.KEYCODE_SEARCH -> {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('kaira:android-search'));",
                        null
                    )
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun dispatchWebKey(keyName: String) {
        val quoted = JSONObject.quote(keyName)
        webView.evaluateJavascript(
            "window.dispatchEvent(new KeyboardEvent('keydown', { key: $quoted, bubbles: true, cancelable: true }));",
            null
        )
    }

    private fun isRunningOnAndroidTV(): Boolean {
        val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
            return true
        }
        return packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    private fun applyImmersiveMode(enabled: Boolean) {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        if (enabled) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onDestroy() {
        try {
            localServer.stop()
        } catch (_: Exception) {
        }
        webView.destroy()
        super.onDestroy()
    }

    inner class AndroidBridge(private val tvMode: Boolean) {
        @JavascriptInterface
        fun isAndroidTV(): Boolean = tvMode

        @JavascriptInterface
        fun getLocalServerUrl(): String = localServer.baseUrl

        @JavascriptInterface
        fun playNativeHls(payloadJson: String): Boolean {
            if (payloadJson.isBlank()) return false
            runOnUiThread {
                val intent = Intent(this@MainActivity, TvPlayerActivity::class.java).apply {
                    putExtra(TvPlayerActivity.EXTRA_PAYLOAD_JSON, payloadJson)
                }
                val options = ActivityOptionsCompat.makeCustomAnimation(
                    this@MainActivity,
                    R.anim.kaira_enter,
                    R.anim.kaira_exit
                )
                nativePlayerLauncher.launch(intent, options)
            }
            return true
        }

        @JavascriptInterface
        fun getDeviceInfo(): String {
            return JSONObject().apply {
                put("os", "Android ${Build.VERSION.RELEASE}" + if (tvMode) " (Android TV)" else " (Mobile)")
                put("kernel", "Android SDK ${Build.VERSION.SDK_INT} / ${Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"}")
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                put("hardware", Build.HARDWARE)
                put("sdkInt", Build.VERSION.SDK_INT)
                put("localServer", localServer.baseUrl)
            }.toString()
        }

        @JavascriptInterface
        fun launchApp(packageName: String, fallbackUrl: String): Boolean {
            if (packageName.isNotBlank()) {
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launchIntent)
                    return true
                }
            }
            if (fallbackUrl.isNotBlank()) {
                openExternal(fallbackUrl)
                return true
            }
            return false
        }

        @JavascriptInterface
        fun openExternal(url: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                } catch (_: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun setImmersiveMode(enabled: Boolean) {
            runOnUiThread {
                applyImmersiveMode(enabled)
            }
        }

        @JavascriptInterface
        fun sleep() {
            runOnUiThread {
                moveTaskToBack(true)
            }
        }

        @JavascriptInterface
        fun exitApp() {
            runOnUiThread {
                finish()
            }
        }
    }
}
