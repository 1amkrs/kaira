package com.kaira.tv

import android.content.res.AssetManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Lightweight embedded loopback HTTP/1.1 server bound strictly to 127.0.0.1.
 *
 * Serves bundled Kaira web assets from `assets/public/`, resolves clean URLs
 * (`/movies`, `/tv`, `/movie/<slug>`, `/watch/<slug>`), and proxies `/api/*`,
 * `/_next/*`, `/s/`, `/f/`, and `/k/` to upstream with the required `Referer`
 * header, `Range`/`206` byte-range forwarding, binary streaming, and `.m3u8`
 * playlist URL rewriting so both WebView and native Media3 ExoPlayer stream 4K HLS cleanly.
 */
class KairaLocalServer(private val assets: AssetManager) {

    companion object {
        private const val PUBLIC_ROOT = "public"
        private const val BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        private const val FLI_ORIGIN = "https://fli.cx"
        private const val STREAM_ORIGIN = "https://s.fli.cx"
        private const val STREAM_BUFFER_SIZE = 32 * 1024
    }

    private var serverSocket: ServerSocket? = null
    private var acceptThread: Thread? = null
    private val running = AtomicBoolean(false)
    private val workerPool: ExecutorService = Executors.newCachedThreadPool()
    private val titleMetaCache = ConcurrentHashMap<String, String>()
    private val detailHtmlCache = ConcurrentHashMap<String, ByteArray>()

    @Volatile
    var port: Int = 0
        private set

    val baseUrl: String
        get() = "http://127.0.0.1:$port"

    fun start(): Int {
        if (running.get() && port > 0) return port
        val socket = ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
        serverSocket = socket
        port = socket.localPort
        running.set(true)

        acceptThread = Thread({
            while (running.get()) {
                try {
                    val client = socket.accept()
                    workerPool.execute { handleClient(client) }
                } catch (_: Exception) {
                    if (!running.get()) break
                }
            }
        }, "KairaLocalServer-Accept").apply {
            isDaemon = true
            start()
        }
        return port
    }

    fun stop() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
        workerPool.shutdownNow()
    }

    private fun handleClient(socket: Socket) {
        socket.use { sock ->
            try {
                sock.soTimeout = 20_000
                val input = BufferedInputStream(sock.getInputStream())
                val output = BufferedOutputStream(sock.getOutputStream())
                val reader = BufferedReader(InputStreamReader(input, StandardCharsets.US_ASCII))

                val requestLine = reader.readLine() ?: return
                val parts = requestLine.split(' ')
                if (parts.size < 2) return
                val method = parts[0].uppercase(Locale.US)
                val rawTarget = parts[1]

                val headers = HashMap<String, String>()
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) break
                    val colon = line.indexOf(':')
                    if (colon > 0) {
                        val key = line.substring(0, colon).trim().lowercase(Locale.US)
                        val value = line.substring(colon + 1).trim()
                        headers[key] = value
                    }
                }

                if (method == "OPTIONS") {
                    writeSimpleResponse(output, 204, "No Content", "text/plain", ByteArray(0), headOnly = true)
                    return
                }
                if (method != "GET" && method != "HEAD") {
                    writeSimpleResponse(output, 405, "Method Not Allowed", "text/plain", "Method Not Allowed".toByteArray(), method == "HEAD")
                    return
                }

                val headOnly = method == "HEAD"
                routeRequest(rawTarget, headers, output, headOnly)
                output.flush()
            } catch (_: Exception) {
                // Client disconnected mid-stream (normal during video seeking)
            }
        }
    }

    private fun routeRequest(
        reqUrl: String,
        reqHeaders: Map<String, String>,
        output: OutputStream,
        headOnly: Boolean
    ) {
        val pathOnly = reqUrl.substringBefore('?')
        val queryString = reqUrl.substringAfter('?', "")

        // 1. Allowlisted image proxy (/_next/image)
        if (pathOnly == "/_next/image") {
            val target = parseQueryParam(queryString, "url")
            if (target == null || !KairaStreamUtils.isAllowedImageUrl(target)) {
                writeSimpleResponse(
                    output,
                    403,
                    "Forbidden",
                    "application/json",
                    """{"error":"Image host not allowed"}""".toByteArray(),
                    headOnly
                )
                return
            }
            proxyUpstream(target, "$FLI_ORIGIN/", reqHeaders, output, headOnly, rewriteM3u8 = false)
            return
        }

        // 2. Local static media / font proxy fallback
        if (pathOnly.startsWith("/_next/static/media/") || (pathOnly.startsWith("/_next/static/chunks/") && pathOnly.endsWith(".css"))) {
            val rel = pathOnly.trimStart('/')
            if (KairaStreamUtils.isSafeAssetRelativePath(rel) && serveBundledAsset(rel, output, headOnly, isHtml = false)) {
                return
            }
            proxyUpstream("$FLI_ORIGIN$reqUrl", "$FLI_ORIGIN/", reqHeaders, output, headOnly, rewriteM3u8 = false)
            return
        }

        // 3. IntroDB proxy (/api/introdb)
        if (pathOnly == "/api/introdb") {
            val imdb = parseQueryParam(queryString, "imdb_id") ?: ""
            val season = parseQueryParam(queryString, "season") ?: "1"
            val episode = parseQueryParam(queryString, "episode") ?: "1"
            if (!Regex("^tt\\d+$", RegexOption.IGNORE_CASE).matches(imdb)) {
                writeSimpleResponse(output, 400, "Bad Request", "application/json", """{"error":"Invalid imdb_id"}""".toByteArray(), headOnly)
                return
            }
            val url = "https://api.introdb.app/segments?imdb_id=${enc(imdb)}&season=${enc(season)}&episode=${enc(episode)}"
            proxyUpstream(url, "https://introdb.app/", reqHeaders, output, headOnly, rewriteM3u8 = false)
            return
        }

        // 4. Native /api/title resolver
        if (pathOnly == "/api/title") {
            handleTitleResolver(queryString, output, headOnly)
            return
        }

        // 5. Upstream /api/* proxy (with /api/s/ playlist URL rewriting)
        if (pathOnly.startsWith("/api/")) {
            val rewrite = pathOnly.startsWith("/api/s/")
            proxyUpstream("$FLI_ORIGIN$reqUrl", "$FLI_ORIGIN/", reqHeaders, output, headOnly, rewriteM3u8 = rewrite)
            return
        }

        // 6. Streaming HLS proxy for /s/ (playlists), /f/ (binary fMP4 segments), /k/ (keys)
        if (KairaStreamUtils.isProxiedStreamPath(reqUrl)) {
            val shouldRewrite = pathOnly.startsWith("/s/") || pathOnly.endsWith(".m3u8", ignoreCase = true)
            proxyUpstream("$STREAM_ORIGIN$reqUrl", "$FLI_ORIGIN/", reqHeaders, output, headOnly, rewriteM3u8 = shouldRewrite)
            return
        }

        // 7. Redirect helpers
        if (pathOnly == "/top-rated" || pathOnly == "/top-rated/") {
            writeRedirect(output, "/discover?sort=rating")
            return
        }
        if (pathOnly == "/new" || pathOnly == "/new/") {
            writeRedirect(output, "/just-added")
            return
        }

        // 8. Root index.html
        if (pathOnly == "/" || pathOnly == "/index.html") {
            if (serveBundledAsset("index.html", output, headOnly, isHtml = true)) return
        }

        // 9. Direct bundled static asset (JS, CSS, JSON, images, icons, fonts)
        val cleanRel = pathOnly.trimStart('/').trimEnd('/')
        if (cleanRel.isNotEmpty() && cleanRel.contains('.') && KairaStreamUtils.isSafeAssetRelativePath(cleanRel)) {
            if (serveBundledAsset(cleanRel, output, headOnly, isHtml = cleanRel.endsWith(".html", ignoreCase = true))) {
                return
            }
        }

        // 10. Clean URL HTML resolution (/movies, /tv, /movie/<slug>, /tv/<slug>, /watch/<slug>)
        if (cleanRel.isNotEmpty() && !cleanRel.contains('.') && KairaStreamUtils.isSafeAssetRelativePath(cleanRel)) {
            if (serveBundledAsset("$cleanRel/index.html", output, headOnly, isHtml = true)) return
            if (serveBundledAsset("$cleanRel.html", output, headOnly, isHtml = true)) return

            if (pathOnly.startsWith("/watch/")) {
                if (serveBundledAsset("watch/heart-of-the-beast-2026/index.html", output, headOnly, isHtml = true)) return
            }

            // On-demand detail page fetch from upstream fli.cx for uncached titles
            if (serveUpstreamDetailPage(cleanRel, output, headOnly)) return
        }

        // 11. Fallback to root index.html for SPA routes
        if (serveBundledAsset("index.html", output, headOnly, isHtml = true)) return

        writeSimpleResponse(output, 404, "Not Found", "text/plain", "Not Found".toByteArray(), headOnly)
    }

    private fun handleTitleResolver(queryString: String, output: OutputStream, headOnly: Boolean) {
        val rawSlug = (parseQueryParam(queryString, "slug") ?: "").trim().lowercase(Locale.US)
        val kindHint = if (parseQueryParam(queryString, "kind") == "show") "show" else "movie"
        if (rawSlug.isEmpty() || !Regex("^[a-z0-9-]+$").matches(rawSlug)) {
            writeSimpleResponse(output, 400, "Bad Request", "application/json", """{"error":"Invalid slug"}""".toByteArray(), headOnly)
            return
        }

        titleMetaCache[rawSlug]?.let { cached ->
            writeSimpleResponse(output, 200, "OK", "application/json; charset=utf-8", cached.toByteArray(StandardCharsets.UTF_8), headOnly)
            return
        }

        try {
            val queryWords = rawSlug.replace(Regex("-\\d{4}$"), "").replace('-', ' ')
            val searchJson = fetchText("$FLI_ORIGIN/api/search?q=${enc(queryWords)}", "$FLI_ORIGIN/")
            if (searchJson != null) {
                val root = JSONObject(searchJson)
                val results = root.optJSONArray("results") ?: JSONArray()
                val basePrefix = rawSlug.replace(Regex("-\\d{4}$"), "")
                var matched: JSONObject? = null
                for (i in 0 until results.length()) {
                    val item = results.optJSONObject(i) ?: continue
                    val slug = item.optString("slug", "")
                    if (slug == rawSlug) {
                        matched = item
                        break
                    }
                    if (matched == null && slug.startsWith(basePrefix)) {
                        matched = item
                    }
                }
                if (matched != null && matched.optString("id", "").isNotBlank()) {
                    val id = matched.optString("id")
                    val payload = JSONObject().apply {
                        put("slug", matched.optString("slug", rawSlug))
                        put("id", id)
                        put("imdbId", id)
                        put("title", matched.optString("title", queryWords))
                        put("year", matched.optString("year", ""))
                        put("kind", if (matched.optString("kind") == "show") "show" else "movie")
                        put("poster", "$STREAM_ORIGIN/a/poster/medium/$id/img")
                        put("rating", matched.optString("rating", ""))
                        put("genres", matched.optJSONArray("genres") ?: JSONArray())
                    }.toString()
                    titleMetaCache[rawSlug] = payload
                    writeSimpleResponse(output, 200, "OK", "application/json; charset=utf-8", payload.toByteArray(StandardCharsets.UTF_8), headOnly)
                    return
                }
            }
        } catch (_: Exception) {
        }

        // Raw IMDb ID Cinemeta fallback
        if (Regex("^tt\\d+$", RegexOption.IGNORE_CASE).matches(rawSlug)) {
            val types = if (kindHint == "show") listOf("series", "movie") else listOf("movie", "series")
            for (cType in types) {
                try {
                    val cmText = fetchText("https://v3-cinemeta.strem.io/meta/$cType/${enc(rawSlug)}.json", "$FLI_ORIGIN/") ?: continue
                    val meta = JSONObject(cmText).optJSONObject("meta") ?: continue
                    val id = meta.optString("imdb_id", "")
                    if (id.isNotBlank()) {
                        val payload = JSONObject().apply {
                            put("slug", rawSlug)
                            put("id", id)
                            put("imdbId", id)
                            put("title", meta.optString("name", rawSlug))
                            put("year", meta.optString("releaseInfo", meta.optString("year", "")).take(4))
                            put("kind", if (cType == "series") "show" else "movie")
                            put("poster", "$STREAM_ORIGIN/a/poster/medium/$id/img")
                            put("description", meta.optString("description", ""))
                        }.toString()
                        titleMetaCache[rawSlug] = payload
                        writeSimpleResponse(output, 200, "OK", "application/json; charset=utf-8", payload.toByteArray(StandardCharsets.UTF_8), headOnly)
                        return
                    }
                } catch (_: Exception) {
                }
            }
        }

        writeSimpleResponse(output, 404, "Not Found", "application/json", """{"error":"Title not found"}""".toByteArray(), headOnly)
    }

    private fun serveUpstreamDetailPage(cleanPath: String, output: OutputStream, headOnly: Boolean): Boolean {
        detailHtmlCache[cleanPath]?.let { cached ->
            writeSimpleResponse(output, 200, "OK", "text/html; charset=utf-8", cached, headOnly)
            return true
        }

        val candidates = if (cleanPath.startsWith("movie/")) {
            listOf(cleanPath, "tv/" + cleanPath.removePrefix("movie/"))
        } else if (cleanPath.startsWith("tv/")) {
            listOf(cleanPath, "movie/" + cleanPath.removePrefix("tv/"))
        } else {
            listOf(cleanPath)
        }

        for (candidate in candidates) {
            try {
                val html = fetchText("$FLI_ORIGIN/$candidate", "$FLI_ORIGIN/") ?: continue
                if (html.contains("__next_error__")) continue
                val isDetail = cleanPath.startsWith("movie/") || cleanPath.startsWith("tv/")
                if (isDetail && !html.contains("<article", ignoreCase = true)) continue
                val preparedBytes = KairaStreamUtils.prepareServedHtml(html).toByteArray(StandardCharsets.UTF_8)
                if (detailHtmlCache.size > 40) detailHtmlCache.clear()
                detailHtmlCache[cleanPath] = preparedBytes
                writeSimpleResponse(output, 200, "OK", "text/html; charset=utf-8", preparedBytes, headOnly)
                return true
            } catch (_: Exception) {
            }
        }
        return false
    }

    private fun serveBundledAsset(
        relativePath: String,
        output: OutputStream,
        headOnly: Boolean,
        isHtml: Boolean
    ): Boolean {
        return try {
            val fullAssetPath = "$PUBLIC_ROOT/$relativePath"
            assets.open(fullAssetPath).use { stream ->
                val rawBytes = readAllBytes(stream)
                val body = if (isHtml) {
                    val prepared = KairaStreamUtils.prepareServedHtml(String(rawBytes, StandardCharsets.UTF_8))
                    prepared.toByteArray(StandardCharsets.UTF_8)
                } else {
                    rawBytes
                }
                val mime = KairaStreamUtils.guessMimeType(relativePath)
                writeSimpleResponse(output, 200, "OK", mime, body, headOnly)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun proxyUpstream(
        targetUrl: String,
        referer: String,
        reqHeaders: Map<String, String>,
        output: OutputStream,
        headOnly: Boolean,
        rewriteM3u8: Boolean
    ) {
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = if (headOnly) "HEAD" else "GET"
                connectTimeout = 10_000
                readTimeout = 25_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", BROWSER_UA)
                setRequestProperty("Referer", referer)
                reqHeaders["range"]?.let { setRequestProperty("Range", it) }
            }

            val status = conn.responseCode
            val statusMessage = conn.responseMessage ?: "OK"
            val contentType = conn.contentType ?: "application/octet-stream"
            val ctLower = contentType.lowercase(Locale.US)
            val stream: InputStream? = if (status >= 400) conn.errorStream else conn.inputStream

            val isPlaylist = status in 200..299 && !headOnly && (
                rewriteM3u8 ||
                    ctLower.contains("mpegurl") ||
                    ctLower.contains("m3u8")
                ) && !ctLower.startsWith("video/") && !ctLower.startsWith("audio/") && !ctLower.contains("octet-stream")

            if (isPlaylist && stream != null) {
                val rawText = stream.use { String(readAllBytes(it), StandardCharsets.UTF_8) }
                val finalText = if (rawText.contains("#EXTM3U")) {
                    KairaStreamUtils.rewriteHlsPlaylistUrls(rawText, baseUrl)
                } else {
                    rawText
                }
                val body = finalText.toByteArray(StandardCharsets.UTF_8)
                writeSimpleResponse(output, status, statusMessage, contentType, body, headOnly = false)
                return
            }

            // Stream binary payloads (e.g. 14MB fMP4 video segments) directly without buffering in RAM
            val sb = StringBuilder()
            sb.append("HTTP/1.1 ").append(status).append(' ').append(statusMessage).append("\r\n")
            sb.append("Content-Type: ").append(contentType).append("\r\n")
            sb.append("Access-Control-Allow-Origin: *\r\n")
            conn.getHeaderField("Content-Length")?.let { sb.append("Content-Length: ").append(it).append("\r\n") }
            conn.getHeaderField("Content-Range")?.let { sb.append("Content-Range: ").append(it).append("\r\n") }
            conn.getHeaderField("Accept-Ranges")?.let { sb.append("Accept-Ranges: ").append(it).append("\r\n") }
            conn.getHeaderField("Cache-Control")?.let { sb.append("Cache-Control: ").append(it).append("\r\n") }
            sb.append("Connection: close\r\n\r\n")

            output.write(sb.toString().toByteArray(StandardCharsets.US_ASCII))
            if (!headOnly && stream != null) {
                stream.use { input ->
                    val buffer = ByteArray(STREAM_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                    }
                }
            }
        } catch (e: Exception) {
            val errBody = (e.message ?: "Upstream proxy error").toByteArray(StandardCharsets.UTF_8)
            writeSimpleResponse(output, 502, "Bad Gateway", "text/plain; charset=utf-8", errBody, headOnly)
        } finally {
            conn?.disconnect()
        }
    }

    private fun fetchText(targetUrl: String, referer: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 6_000
                readTimeout = 8_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", BROWSER_UA)
                setRequestProperty("Referer", referer)
            }
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.use { String(readAllBytes(it), StandardCharsets.UTF_8) }
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun writeSimpleResponse(
        output: OutputStream,
        status: Int,
        reason: String,
        contentType: String,
        body: ByteArray,
        headOnly: Boolean
    ) {
        val header = StringBuilder()
            .append("HTTP/1.1 ").append(status).append(' ').append(reason).append("\r\n")
            .append("Content-Type: ").append(contentType).append("\r\n")
            .append("Content-Length: ").append(body.size).append("\r\n")
            .append("Access-Control-Allow-Origin: *\r\n")
            .append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
            .append("Access-Control-Allow-Headers: Content-Type, Range\r\n")
            .append("Cache-Control: no-cache\r\n")
            .append("Connection: close\r\n\r\n")
            .toString()
        output.write(header.toByteArray(StandardCharsets.US_ASCII))
        if (!headOnly && body.isNotEmpty()) {
            output.write(body)
        }
    }

    private fun writeRedirect(output: OutputStream, location: String) {
        val header = "HTTP/1.1 302 Found\r\nLocation: $location\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        output.write(header.toByteArray(StandardCharsets.US_ASCII))
    }

    private fun readAllBytes(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(16 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n == -1) break
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }

    private fun parseQueryParam(query: String, name: String): String? {
        if (query.isEmpty()) return null
        for (pair in query.split('&')) {
            val idx = pair.indexOf('=')
            val key = if (idx >= 0) pair.substring(0, idx) else pair
            if (key == name) {
                val raw = if (idx >= 0) pair.substring(idx + 1) else ""
                return try {
                    URLDecoder.decode(raw, "UTF-8")
                } catch (_: Exception) {
                    raw
                }
            }
        }
        return null
    }

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}
