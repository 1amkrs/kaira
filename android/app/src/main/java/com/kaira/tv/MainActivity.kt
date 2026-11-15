package com.kaira.tv

import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)

        val isTV = isRunningOnAndroidTV()
        applyImmersiveMode(isTV)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        webView.addJavascriptInterface(AndroidBridge(isTV), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val platformTag = if (isTV) "android-tv" else "android-mobile"
                view?.evaluateJavascript(
                    "window.__TVOS_PLATFORM__ = '$platformTag';",
                    null
                )
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
        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html$modeQuery")
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            onBackPressedDispatcher.onBackPressed()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun isRunningOnAndroidTV(): Boolean {
        val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
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

    inner class AndroidBridge(private val isTV: Boolean) {
        @JavascriptInterface
        fun isAndroidTV(): Boolean = isTV

        @JavascriptInterface
        fun getDeviceInfo(): String {
            return JSONObject().apply {
                put("os", "Android ${Build.VERSION.RELEASE}" + if (isTV) " (Android TV)" else " (Mobile)")
                put("kernel", "Android SDK ${Build.VERSION.SDK_INT} / ${Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"}")
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                put("hardware", Build.HARDWARE)
                put("sdkInt", Build.VERSION.SDK_INT)
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
