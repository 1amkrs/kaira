package com.kaira.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KairaStreamUtilsTest {

    @Test
    fun isProxiedStreamPath_matchesValidStreamPathsAndRejectsTraversal() {
        assertTrue(KairaStreamUtils.isProxiedStreamPath("/s/master-4k/index.m3u8?sig=1"))
        assertTrue(KairaStreamUtils.isProxiedStreamPath("/f/s0e-abc/seg01.m4s"))
        assertTrue(KairaStreamUtils.isProxiedStreamPath("/k/key-01"))
        assertFalse(KairaStreamUtils.isProxiedStreamPath("/s/"))
        assertFalse(KairaStreamUtils.isProxiedStreamPath("/f/../etc/passwd"))
        assertFalse(KairaStreamUtils.isProxiedStreamPath("/api/sources/tt0120338"))
        assertFalse(KairaStreamUtils.isProxiedStreamPath("/movie/titanic-1997"))
    }

    @Test
    fun rewriteHlsPlaylistUrls_rewritesManifestMapAndKeyUrls() {
        val playlist = listOf(
            "#EXTM3U",
            "#EXT-X-MAP:URI=\"https://s.fli.cx/f/s0e-1/init.mp4\"",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"https://s.fli.cx/k/abc/key.bin\"",
            "https://s.fli.cx/s/4k/index.m3u8?token=abc",
            "https://cdn.other.example/keep.m3u8"
        ).joinToString("\n")

        val rewritten = KairaStreamUtils.rewriteHlsPlaylistUrls(playlist, "http://127.0.0.1:41234")
        assertTrue(rewritten.contains("#EXT-X-MAP:URI=\"http://127.0.0.1:41234/f/s0e-1/init.mp4\""))
        assertTrue(rewritten.contains("#EXT-X-KEY:METHOD=AES-128,URI=\"http://127.0.0.1:41234/k/abc/key.bin\""))
        assertTrue(rewritten.contains("http://127.0.0.1:41234/s/4k/index.m3u8?token=abc"))
        assertTrue(rewritten.contains("https://cdn.other.example/keep.m3u8"))
        assertFalse(rewritten.contains("s.fli.cx"))
    }

    @Test
    fun isAllowedImageUrl_enforcesHttpsAndAllowlist() {
        assertTrue(KairaStreamUtils.isAllowedImageUrl("https://s.fli.cx/a/poster/medium/tt0120338/img"))
        assertTrue(KairaStreamUtils.isAllowedImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg"))
        assertFalse(KairaStreamUtils.isAllowedImageUrl("http://s.fli.cx/a/poster/medium/tt0120338/img"))
        assertFalse(KairaStreamUtils.isAllowedImageUrl("https://127.0.0.1/secret"))
        assertFalse(KairaStreamUtils.isAllowedImageUrl("https://evil.example.com/a.png"))
    }

    @Test
    fun prepareServedHtml_injectsInteractiveRuntimeAndCleansBranding() {
        val raw = "<html><head></head><body><p>Popular on Flicx</p></body></html>"
        val out = KairaStreamUtils.prepareServedHtml(raw)
        assertTrue(out.contains("Popular on Kaira"))
        assertTrue(out.contains("/flicx-interactive.js"))
        assertEquals("font/woff2", KairaStreamUtils.guessMimeType("/_next/static/media/abc.woff2"))
    }
}
