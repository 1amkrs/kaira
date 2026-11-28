package com.kaira.tv

import java.net.URI

/**
 * Pure Kotlin stream-proxy, allowlist, and HTML normalization utilities used by
 * [KairaLocalServer] on Android & Android TV.
 */
object KairaStreamUtils {

    private val ALLOWED_IMAGE_HOSTS = setOf(
        "s.fli.cx",
        "fli.cx",
        "image.tmdb.org",
        "i.ytimg.com",
        "img.youtube.com",
        "m.media-amazon.com"
    )

    private val STREAM_PATH_REGEX = Regex("^/[sfk]/.+")
    private val CDN_URL_REGEX = Regex("""https?://s\.fli\.cx/([sfk])/([^\s"'<>]+)""", RegexOption.IGNORE_CASE)
    private val UNUSED_PRELOAD_REGEX = Regex(
        """<link[^>]*rel=["']preload["'][^>]*href=["']/_next/static/chunks/3bep5nso12chb\.js["'][^>]*\/?>""",
        RegexOption.IGNORE_CASE
    )
    private val NEXT_SCRIPT_REGEX = Regex("""<script[^>]*src="/_next/static/chunks/[^"]+"[^>]*></script>""")
    private val CF_BEACON_REGEX = Regex("""<script[^>]*src="https://static\.cloudflareinsights\.com/[^"]+"[^>]*></script>""")
    private val FEED_LINK_REGEX = Regex("""<link[^>]*rel=["']alternate["'][^>]*href=["']https://fli\.cx/feed\.xml["'][^>]*\/?>""", RegexOption.IGNORE_CASE)
    private val OG_IMAGE_REGEX = Regex("""https://fli\.cx/opengraph-image(?:\?[^"'\s<>\\]*)?""", RegexOption.IGNORE_CASE)

    fun isProxiedStreamPath(reqPath: String?): Boolean {
        if (reqPath.isNullOrBlank()) return false
        val clean = reqPath.substringBefore('?')
        if (clean.contains("..") || clean.contains("\\") || clean.contains('\u0000')) {
            return false
        }
        return STREAM_PATH_REGEX.matches(clean)
    }

    fun rewriteHlsPlaylistUrls(playlistText: String, baseOrigin: String = ""): String {
        if (playlistText.isEmpty()) return playlistText
        val prefix = baseOrigin.trimEnd('/')
        return CDN_URL_REGEX.replace(playlistText) { match ->
            val segType = match.groupValues[1].lowercase()
            val rest = match.groupValues[2]
            "$prefix/$segType/$rest"
        }
    }

    fun isAllowedImageUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        return try {
            val uri = URI(rawUrl)
            if (!uri.scheme.equals("https", ignoreCase = true)) return false
            val host = (uri.host ?: return false).lowercase()
            ALLOWED_IMAGE_HOSTS.contains(host)
        } catch (_: Exception) {
            false
        }
    }

    fun isSafeAssetRelativePath(rawPath: String?): Boolean {
        if (rawPath.isNullOrBlank()) return false
        val clean = rawPath.substringBefore('?').trimStart('/')
        if (clean.isEmpty() || clean.contains("..") || clean.contains("\\") || clean.contains('\u0000')) {
            return false
        }
        return true
    }

    fun prepareServedHtml(html: String): String {
        var out = html
        out = UNUSED_PRELOAD_REGEX.replace(out, "")
        out = NEXT_SCRIPT_REGEX.replace(out, "")
        out = CF_BEACON_REGEX.replace(out, "")
        out = FEED_LINK_REGEX.replace(out, "")
        out = OG_IMAGE_REGEX.replace(out, "/brand/og-image.png")
        out = out
            .replace("Popular on Flicx", "Popular on Kaira")
            .replace("On Flicx since", "On Kaira since")
            .replace("Watch on Flicx", "Watch on Kaira")
        if (!out.contains("flicx-interactive.js")) {
            out = out.replace("</body>", """<script src="/flicx-interactive.js"></script></body>""")
        }
        return out
    }

    fun guessMimeType(path: String): String {
        val clean = path.substringBefore('?').lowercase()
        return when {
            clean.endsWith(".html") || clean.endsWith(".htm") -> "text/html; charset=utf-8"
            clean.endsWith(".js") || clean.endsWith(".mjs") -> "application/javascript; charset=utf-8"
            clean.endsWith(".css") -> "text/css; charset=utf-8"
            clean.endsWith(".json") || clean.endsWith(".webmanifest") -> "application/json; charset=utf-8"
            clean.endsWith(".svg") -> "image/svg+xml"
            clean.endsWith(".png") -> "image/png"
            clean.endsWith(".jpg") || clean.endsWith(".jpeg") -> "image/jpeg"
            clean.endsWith(".webp") -> "image/webp"
            clean.endsWith(".ico") -> "image/x-icon"
            clean.endsWith(".woff2") -> "font/woff2"
            clean.endsWith(".woff") -> "font/woff"
            clean.endsWith(".m3u8") -> "application/vnd.apple.mpegurl"
            clean.endsWith(".mp4") || clean.endsWith(".m4s") -> "video/mp4"
            clean.endsWith(".ts") -> "video/mp2t"
            clean.endsWith(".vtt") -> "text/vtt; charset=utf-8"
            else -> "application/octet-stream"
        }
    }
}
