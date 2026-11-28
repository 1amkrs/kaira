package com.kaira.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import java.util.Locale

/**
 * Hardware-accelerated native Android TV Media3 ExoPlayer activity.
 *
 * Streams proxied 4K/HD HLS feeds from [KairaLocalServer], supports full TV remote
 * D-pad scrubbing, server switching, auto-failover, and returns exact playback position
 * to [MainActivity] so Kaira's Continue Watching stays in sync.
 */
class TvPlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PAYLOAD_JSON = "extra_payload_json"
        const val RESULT_SLUG = "result_slug"
        const val RESULT_IMDB_ID = "result_imdb_id"
        const val RESULT_IS_SHOW = "result_is_show"
        const val RESULT_SEASON = "result_season"
        const val RESULT_EPISODE = "result_episode"
        const val RESULT_POSITION_SEC = "result_position_sec"
        const val RESULT_DURATION_SEC = "result_duration_sec"
        const val RESULT_SERVER_INDEX = "result_server_index"

        private const val SEEK_INCREMENT_MS = 10_000L
        private const val HUD_AUTO_HIDE_MS = 5_000L
        private const val BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    private data class ServerOption(
        val name: String,
        val src: String,
        val quality: String
    )

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var hudOverlay: FrameLayout
    private lateinit var bufferingSpinner: ProgressBar
    private lateinit var titleText: TextView
    private lateinit var subtitleText: TextView
    private lateinit var serverBadgeButton: Button
    private lateinit var playPauseButton: Button
    private lateinit var rewindButton: Button
    private lateinit var forwardButton: Button
    private lateinit var seekBar: SeekBar
    private lateinit var timeElapsedText: TextView
    private lateinit var timeRemainingText: TextView
    private lateinit var statusToastText: TextView

    private val servers = mutableListOf<ServerOption>()
    private var activeServerIndex = 0
    private var slug = ""
    private var imdbId = ""
    private var isShow = false
    private var season = 1
    private var episode = 1
    private var resumeSeconds = 0L
    private var hasAppliedInitialResume = false
    private var hudVisible = true
    private var failoverAttempts = 0

    private val handler = Handler(Looper.getMainLooper())
    private val hideHudRunnable = Runnable { setHudVisible(false) }
    private val progressTicker = object : Runnable {
        override fun run() {
            updateProgressUi()
            handler.postDelayed(this, 500L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val rawPayload = intent.getStringExtra(EXTRA_PAYLOAD_JSON)
        if (rawPayload.isNullOrBlank() || !parsePayload(rawPayload)) {
            finish()
            return
        }

        buildPlayerLayout()
        initializePlayer()
        loadServer(activeServerIndex, resumePositionMs = resumeSeconds * 1000L)
        setHudVisible(true)
        handler.post(progressTicker)
    }

    private fun parsePayload(rawJson: String): Boolean {
        return try {
            val obj = JSONObject(rawJson)
            slug = obj.optString("slug", "")
            imdbId = obj.optString("imdbId", "")
            isShow = obj.optBoolean("isShow", false)
            season = obj.optInt("season", 1).coerceAtLeast(1)
            episode = obj.optInt("episode", 1).coerceAtLeast(1)
            resumeSeconds = obj.optLong("resumeSeconds", 0L).coerceAtLeast(0L)
            activeServerIndex = obj.optInt("activeServerIndex", 0).coerceAtLeast(0)

            val arr = obj.optJSONArray("servers") ?: return false
            servers.clear()
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val src = item.optString("src", "").trim()
                if (src.isEmpty()) continue
                servers.add(
                    ServerOption(
                        name = item.optString("name", "Kaira"),
                        src = src,
                        quality = item.optString("quality", "HD")
                    )
                )
            }
            if (servers.isEmpty()) return false
            if (activeServerIndex >= servers.size) activeServerIndex = 0
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun buildPlayerLayout() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        playerView = PlayerView(this).apply {
            useController = false
            keepScreenOn = true
            setBackgroundColor(Color.BLACK)
        }
        root.addView(
            playerView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )

        bufferingSpinner = ProgressBar(this).apply {
            isIndeterminate = true
            visibility = View.VISIBLE
        }
        root.addView(
            bufferingSpinner,
            FrameLayout.LayoutParams(dp(52), dp(52), Gravity.CENTER)
        )

        statusToastText = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(18), dp(10), dp(18), dp(10))
            background = pillDrawable(Color.parseColor("#CC14161D"), Color.parseColor("#55FFFFFF"))
            visibility = View.GONE
        }
        root.addView(
            statusToastText,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.CENTER_HORIZONTAL
            ).apply { topMargin = dp(28) }
        )

        // Apple TV / Google TV style D-pad HUD overlay
        hudOverlay = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#55000000"))
        }

        val payloadObj = JSONObject(intent.getStringExtra(EXTRA_PAYLOAD_JSON) ?: "{}")
        val displayTitle = payloadObj.optString("title", "Kaira")
        val displaySub = payloadObj.optString("subtitle", "")

        // Top Bar (Title + Server Switcher pill)
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(44), dp(32), dp(44), dp(16))
        }

        val titleCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleText = TextView(this).apply {
            text = displayTitle
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
            typeface = Typeface.DEFAULT_BOLD
        }
        subtitleText = TextView(this).apply {
            text = displaySub
            setTextColor(Color.parseColor("#CCFFFFFF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            visibility = if (displaySub.isNotBlank()) View.VISIBLE else View.GONE
        }
        titleCol.addView(titleText)
        titleCol.addView(subtitleText)

        serverBadgeButton = createTvButton("").apply {
            setOnClickListener {
                scheduleHudAutoHide()
                showServerPickerDialog()
            }
        }
        topBar.addView(titleCol)
        topBar.addView(serverBadgeButton)

        hudOverlay.addView(
            topBar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            )
        )

        // Bottom Bar (Seekbar + Timecodes + D-pad Controls)
        val bottomContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(44), dp(20), dp(44), dp(34))
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.TRANSPARENT, Color.parseColor("#E6000000"))
            )
        }

        seekBar = SeekBar(this).apply {
            max = 1000
            isFocusable = false
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (fromUser) {
                        val dur = player?.duration ?: 0L
                        if (dur > 0) {
                            player?.seekTo((dur * progress) / 1000L)
                        }
                    }
                }

                override fun onStartTrackingTouch(sb: SeekBar?) {}
                override fun onStopTrackingTouch(sb: SeekBar?) {
                    scheduleHudAutoHide()
                }
            })
        }
        bottomContainer.addView(
            seekBar,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )

        val timeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(4), dp(4), dp(4), dp(14))
        }
        timeElapsedText = TextView(this).apply {
            text = "0:00"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        timeRemainingText = TextView(this).apply {
            text = "-0:00"
            setTextColor(Color.parseColor("#B3FFFFFF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        }
        timeRow.addView(timeElapsedText)
        timeRow.addView(timeRemainingText)
        bottomContainer.addView(timeRow)

        val controlsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        rewindButton = createTvButton("-10s").apply {
            setOnClickListener {
                seekBy(-SEEK_INCREMENT_MS)
                scheduleHudAutoHide()
            }
        }
        playPauseButton = createTvButton("Pause").apply {
            setOnClickListener {
                togglePlayPause()
                scheduleHudAutoHide()
            }
        }
        forwardButton = createTvButton("+10s").apply {
            setOnClickListener {
                seekBy(SEEK_INCREMENT_MS)
                scheduleHudAutoHide()
            }
        }
        val serversButton = createTvButton("Servers").apply {
            setOnClickListener {
                scheduleHudAutoHide()
                showServerPickerDialog()
            }
        }
        val backButton = createTvButton("Back").apply {
            setOnClickListener { finishWithProgress() }
        }

        val btnMargin = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { rightMargin = dp(14) }

        controlsRow.addView(rewindButton, btnMargin)
        controlsRow.addView(playPauseButton, btnMargin)
        controlsRow.addView(forwardButton, btnMargin)
        controlsRow.addView(serversButton, btnMargin)
        controlsRow.addView(backButton)

        bottomContainer.addView(controlsRow)

        hudOverlay.addView(
            bottomContainer,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
            )
        )

        root.addView(
            hudOverlay,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )

        root.setOnClickListener {
            setHudVisible(!hudVisible)
        }

        setContentView(root)
    }

    private fun createTvButton(label: String): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(20), dp(10), dp(20), dp(10))
            isFocusable = true
            isFocusableInTouchMode = true
            background = pillDrawable(Color.parseColor("#B31A1D26"), Color.parseColor("#44FFFFFF"))
            setOnFocusChangeListener { v, hasFocus ->
                if (hasFocus) {
                    v.background = pillDrawable(Color.parseColor("#FFF25C05"), Color.WHITE, strokeWidth = dp(2))
                    v.animate().scaleX(1.06f).scaleY(1.06f).setDuration(120).start()
                    scheduleHudAutoHide()
                } else {
                    v.background = pillDrawable(Color.parseColor("#B31A1D26"), Color.parseColor("#44FFFFFF"))
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(120).start()
                }
            }
        }
    }

    private fun pillDrawable(fillColor: Int, strokeColor: Int, strokeWidth: Int = dp(1)): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(24).toFloat()
            setColor(fillColor)
            setStroke(strokeWidth, strokeColor)
        }
    }

    private fun initializePlayer() {
        val exo = ExoPlayer.Builder(this).build()
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> bufferingSpinner.visibility = View.VISIBLE
                    Player.STATE_READY -> {
                        bufferingSpinner.visibility = View.GONE
                        failoverAttempts = 0
                        updatePlayPauseLabel()
                    }
                    Player.STATE_ENDED -> {
                        bufferingSpinner.visibility = View.GONE
                        finishWithProgress()
                    }
                    else -> Unit
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updatePlayPauseLabel()
            }

            override fun onPlayerError(error: PlaybackException) {
                if (servers.size > 1 && failoverAttempts < servers.size - 1) {
                    failoverAttempts++
                    val nextIndex = (activeServerIndex + 1) % servers.size
                    val resumeMs = (player?.currentPosition ?: 0L).coerceAtLeast(0L)
                    showStatusToast("Switching to ${servers[nextIndex].name}…")
                    loadServer(nextIndex, resumePositionMs = resumeMs)
                } else {
                    bufferingSpinner.visibility = View.GONE
                    showStatusToast("Stream error — press Servers to try another source")
                    setHudVisible(true)
                }
            }
        })
        player = exo
        playerView.player = exo
    }

    private fun loadServer(index: Int, resumePositionMs: Long) {
        val exo = player ?: return
        if (index !in servers.indices) return
        activeServerIndex = index
        val server = servers[index]
        serverBadgeButton.text = "${server.name} · ${server.quality}"
        bufferingSpinner.visibility = View.VISIBLE

        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(BROWSER_UA)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(mapOf("Referer" to "https://fli.cx/"))

        val mediaItem = MediaItem.fromUri(Uri.parse(server.src))
        val hlsSource = HlsMediaSource.Factory(dataSourceFactory)
            .setAllowChunklessPreparation(true)
            .createMediaSource(mediaItem)

        exo.setMediaSource(hlsSource)
        exo.prepare()
        val seekTarget = if (!hasAppliedInitialResume && resumePositionMs > 0L) {
            hasAppliedInitialResume = true
            resumePositionMs
        } else {
            resumePositionMs
        }
        if (seekTarget > 0L) {
            exo.seekTo(seekTarget)
        }
        exo.playWhenReady = true
    }

    private fun showServerPickerDialog() {
        val labels = servers.mapIndexed { idx, s ->
            val mark = if (idx == activeServerIndex) "✓  " else "    "
            "$mark${s.name}  (${s.quality})"
        }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Select Server")
            .setItems(labels) { _, which ->
                if (which != activeServerIndex) {
                    val posMs = (player?.currentPosition ?: 0L).coerceAtLeast(0L)
                    failoverAttempts = 0
                    showStatusToast("Loading ${servers[which].name}…")
                    loadServer(which, resumePositionMs = posMs)
                }
                scheduleHudAutoHide()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun togglePlayPause() {
        val exo = player ?: return
        if (exo.isPlaying) {
            exo.pause()
            setHudVisible(true)
        } else {
            exo.play()
            scheduleHudAutoHide()
        }
        updatePlayPauseLabel()
    }

    private fun seekBy(deltaMs: Long) {
        val exo = player ?: return
        val duration = exo.duration.takeIf { it > 0 } ?: Long.MAX_VALUE
        val target = (exo.currentPosition + deltaMs).coerceIn(0L, duration)
        exo.seekTo(target)
        val sign = if (deltaMs >= 0) "+" else "-"
        showStatusToast("$sign${kotlin.math.abs(deltaMs / 1000)}s  (${formatTime(target)})")
        updateProgressUi()
    }

    private fun updatePlayPauseLabel() {
        val playing = player?.isPlaying == true
        playPauseButton.text = if (playing) "Pause" else "Play"
    }

    private fun updateProgressUi() {
        val exo = player ?: return
        val duration = exo.duration
        val position = exo.currentPosition.coerceAtLeast(0L)
        timeElapsedText.text = formatTime(position)
        if (duration > 0L) {
            val remaining = (duration - position).coerceAtLeast(0L)
            timeRemainingText.text = "-${formatTime(remaining)}"
            seekBar.progress = ((position * 1000L) / duration).toInt().coerceIn(0, 1000)
        }
    }

    private fun setHudVisible(visible: Boolean) {
        hudVisible = visible
        handler.removeCallbacks(hideHudRunnable)
        hudOverlay.animate().cancel()
        if (visible) {
            if (hudOverlay.visibility != View.VISIBLE) {
                hudOverlay.alpha = 0f
                hudOverlay.visibility = View.VISIBLE
            }
            hudOverlay.animate()
                .alpha(1f)
                .setDuration(220L)
                .withEndAction(null)
                .start()
            playPauseButton.requestFocus()
            scheduleHudAutoHide()
        } else if (hudOverlay.visibility == View.VISIBLE) {
            hudOverlay.animate()
                .alpha(0f)
                .setDuration(220L)
                .withEndAction {
                    if (!hudVisible) hudOverlay.visibility = View.GONE
                }
                .start()
        }
    }

    private fun scheduleHudAutoHide() {
        handler.removeCallbacks(hideHudRunnable)
        if (player?.isPlaying == true) {
            handler.postDelayed(hideHudRunnable, HUD_AUTO_HIDE_MS)
        }
    }

    private fun showStatusToast(message: String) {
        statusToastText.text = message
        statusToastText.animate().cancel()
        if (statusToastText.visibility != View.VISIBLE) {
            statusToastText.alpha = 0f
            statusToastText.translationY = -dp(8).toFloat()
            statusToastText.visibility = View.VISIBLE
        }
        statusToastText.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(180L)
            .start()
        statusToastText.removeCallbacks(hideToastRunnable)
        statusToastText.postDelayed(hideToastRunnable, 2200L)
    }

    private val hideToastRunnable = Runnable {
        statusToastText.animate()
            .alpha(0f)
            .translationY(-dp(6).toFloat())
            .setDuration(180L)
            .withEndAction { statusToastText.visibility = View.GONE }
            .start()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    if (hudVisible) {
                        setHudVisible(false)
                        return true
                    }
                    finishWithProgress()
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                    togglePlayPause()
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    player?.play()
                    scheduleHudAutoHide()
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                    player?.pause()
                    setHudVisible(true)
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    seekBy(-SEEK_INCREMENT_MS)
                    setHudVisible(true)
                    return true
                }
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    seekBy(SEEK_INCREMENT_MS)
                    setHudVisible(true)
                    return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (!hudVisible) {
                        togglePlayPause()
                        return true
                    }
                    scheduleHudAutoHide()
                }
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (!hudVisible) {
                        seekBy(-SEEK_INCREMENT_MS)
                        setHudVisible(true)
                        return true
                    }
                    scheduleHudAutoHide()
                }
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (!hudVisible) {
                        seekBy(SEEK_INCREMENT_MS)
                        setHudVisible(true)
                        return true
                    }
                    scheduleHudAutoHide()
                }
                KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (!hudVisible) {
                        setHudVisible(true)
                        return true
                    }
                    scheduleHudAutoHide()
                }
                KeyEvent.KEYCODE_MENU -> {
                    setHudVisible(true)
                    showServerPickerDialog()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    @Suppress("DEPRECATION")
    private fun finishWithProgress() {
        val posSec = ((player?.currentPosition ?: 0L) / 1000L).coerceAtLeast(0L)
        val durSec = ((player?.duration ?: 0L) / 1000L).coerceAtLeast(0L)
        val resultIntent = Intent().apply {
            putExtra(RESULT_SLUG, slug)
            putExtra(RESULT_IMDB_ID, imdbId)
            putExtra(RESULT_IS_SHOW, isShow)
            putExtra(RESULT_SEASON, season)
            putExtra(RESULT_EPISODE, episode)
            putExtra(RESULT_POSITION_SEC, posSec)
            putExtra(RESULT_DURATION_SEC, durSec)
            putExtra(RESULT_SERVER_INDEX, activeServerIndex)
        }
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
        overridePendingTransition(R.anim.kaira_enter, R.anim.kaira_exit)
    }

    private fun hideSystemBars() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun formatTime(ms: Long): String {
        val totalSec = (ms / 1000L).coerceAtLeast(0L)
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return if (h > 0) {
            String.format(Locale.US, "%d:%02d:%02d", h, m, s)
        } else {
            String.format(Locale.US, "%d:%02d", m, s)
        }
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        player?.release()
        player = null
        super.onDestroy()
    }
}
