import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  isAllowedImageUrl,
  resolveSafePublicPath,
  extractTitleMetadataFromHtml,
  isValidDetailPageHtml,
  isValidAppPageHtml,
  prepareServedHtml,
  isProxiedStreamPath,
  rewriteHlsPlaylistUrls,
} from './kairaMiddlewareUtils';

test('isAllowedImageUrl permits allowlisted https media hosts and rejects SSRF targets', () => {
  assert.equal(isAllowedImageUrl('https://s.fli.cx/a/poster/medium/tt33764258/img'), true);
  assert.equal(isAllowedImageUrl('https://image.tmdb.org/t/p/w500/abc.jpg'), true);
  assert.equal(isAllowedImageUrl('http://s.fli.cx/a/poster/medium/tt33764258/img'), false);
  assert.equal(isAllowedImageUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isAllowedImageUrl('https://127.0.0.1/secret'), false);
  assert.equal(isAllowedImageUrl('https://localhost:3000/api/sources'), false);
  assert.equal(isAllowedImageUrl('https://evil.example.com/img.png'), false);
  assert.equal(isAllowedImageUrl('javascript:alert(1)'), false);
});

test('resolveSafePublicPath confines routes inside public directory and blocks traversal', () => {
  const base = '/app/applet/public';
  assert.equal(
    resolveSafePublicPath(base, 'movie/the-odyssey-2026'),
    path.resolve(base, 'movie/the-odyssey-2026')
  );
  assert.equal(resolveSafePublicPath(base, '../package.json'), null);
  assert.equal(resolveSafePublicPath(base, 'movie/../../etc/passwd'), null);
  assert.equal(resolveSafePublicPath(base, 'movie/foo?bar=1'), null);
  assert.equal(resolveSafePublicPath(base, ''), null);
});

test('extractTitleMetadataFromHtml parses IMDb ID, clean title, year, kind, and YouTube trailer IDs', () => {
  const sampleHtml = `
    <article>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Movie","name":"The Odyssey","image":"https://s.fli.cx/a/poster/large/tt33764258/img","datePublished":"2026-07-17T00:00:00.000Z"}
      </script>
      <p id="rate-tt33764258">Your rating</p>
      <img src="https://s.fli.cx/y/vi/AyIZ9tiiN8I/hq720.jpg" />
      <img src="https://s.fli.cx/y/vi/dQw4w9WgXcQ/hq720.jpg" />
    </article>
  `;
  const meta = extractTitleMetadataFromHtml(sampleHtml, 'the-odyssey-2026', 'movie');
  assert.equal(meta.id, 'tt33764258');
  assert.equal(meta.imdbId, 'tt33764258');
  assert.equal(meta.title, 'The Odyssey');
  assert.equal(meta.year, '2026');
  assert.equal(meta.kind, 'movie');
  assert.equal(meta.trailerId, 'AyIZ9tiiN8I');
  assert.deepEqual(meta.trailers, ['AyIZ9tiiN8I', 'dQw4w9WgXcQ']);
});

test('extractTitleMetadataFromHtml avoids duplicating year in fallback title from slug', () => {
  const meta = extractTitleMetadataFromHtml('<div></div>', 'the-odyssey-2026', 'movie');
  assert.equal(meta.title, 'The Odyssey');
  assert.equal(meta.year, '2026');
  assert.equal(meta.id, null);
});

test('isValidDetailPageHtml accepts real movie/TV detail pages and rejects error or homepage shells', () => {
  assert.equal(
    isValidDetailPageHtml('<html><body><main><div class="page"><article><section class="hero"></section></article></div></main></body></html>'),
    true
  );
  assert.equal(
    isValidDetailPageHtml('<!DOCTYPE html><html id="__next_error__"><head><title>Kaira: a home for films</title></head></html>'),
    false
  );
  assert.equal(
    isValidDetailPageHtml('<html><body><main><section class="hero"><div class="hero-switch"></div></section></main></body></html>'),
    false
  );
  assert.equal(isValidDetailPageHtml(''), false);
});

test('isValidAppPageHtml blocks __next_error__ and homepage clones on non-browse routes while allowing real pages', () => {
  const errHtml = '<!DOCTYPE html><html id="__next_error__"><head><title>Kaira</title></head></html>';
  const homeHtml = '<html><body><main><section class="hero"><div class="hero-switch"></div></section></main></body></html>';
  const genreHtml = '<html><body><main><div class="page"><h1>Biography</h1><ul class="film-grid"></ul></div></main></body></html>';
  const watchHtml = '<html><body><div class="watch-root"></div></body></html>';

  assert.equal(isValidAppPageHtml(errHtml, 'genres/biography'), false);
  assert.equal(isValidAppPageHtml(errHtml, 'anime/20'), false);
  assert.equal(isValidAppPageHtml(homeHtml, 'genres/biography'), false);
  assert.equal(isValidAppPageHtml(homeHtml, 'collection/james-bond-collection'), false);
  assert.equal(isValidAppPageHtml(homeHtml, 'studio/marvel-studios'), false);
  assert.equal(isValidAppPageHtml(homeHtml, 'movies'), true);
  assert.equal(isValidAppPageHtml(homeHtml, 'tv'), true);
  assert.equal(isValidAppPageHtml(genreHtml, 'genres/biography'), true);
  assert.equal(isValidAppPageHtml(watchHtml, 'watch/titanic-1997'), true);
});

test('prepareServedHtml strips unused preload chunk, updates branding and OG image, and injects interactive script once', () => {
  const raw = '<html><head><link rel="preload" as="script" href="/_next/static/chunks/3bep5nso12chb.js"/><link rel="alternate" type="application/rss+xml" href="https://fli.cx/feed.xml" title="Kaira"/><meta property="og:image" content="https://fli.cx/opengraph-image?0dea4e8bd62085e2"/><meta name="twitter:image" content="https://fli.cx/opengraph-image?0dea4e8bd62085e2"/></head><body><p>Popular on Flicx</p><p>On Flicx since 2024</p></body></html>';
  const cleaned = prepareServedHtml(raw);
  assert.equal(cleaned.includes('3bep5nso12chb.js'), false);
  assert.equal(cleaned.includes('fli.cx/opengraph-image'), false);
  assert.equal(cleaned.includes('fli.cx/feed.xml'), false);
  assert.equal(cleaned.match(/\/brand\/og-image\.png/g)?.length, 2);
  assert.equal(cleaned.includes('Popular on Kaira'), true);
  assert.equal(cleaned.includes('On Kaira since 2024'), true);
  assert.equal(cleaned.includes('<script src="/flicx-interactive.js"></script>'), true);
  // Idempotent on second call
  assert.equal(prepareServedHtml(cleaned).match(/flicx-interactive\.js/g)?.length, 1);
});

test('isProxiedStreamPath matches /s/, /f/, /k/ stream paths and rejects non-stream or traversal paths', () => {
  assert.equal(isProxiedStreamPath('/s/abc123/master.m3u8?token=1'), true);
  assert.equal(isProxiedStreamPath('/f/s0e-abc/segment001.m4s'), true);
  assert.equal(isProxiedStreamPath('/k/key-01'), true);
  assert.equal(isProxiedStreamPath('/s/'), false);
  assert.equal(isProxiedStreamPath('/f/../etc/passwd'), false);
  assert.equal(isProxiedStreamPath('/api/sources/tt0120338'), false);
  assert.equal(isProxiedStreamPath('/movie/titanic-1997'), false);
  assert.equal(isProxiedStreamPath(''), false);
});

test('rewriteHlsPlaylistUrls rewrites s.fli.cx manifest, map, key, and segment URLs cleanly', () => {
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-MAP:URI="https://s.fli.cx/f/s0e-123/init.mp4"',
    '#EXT-X-KEY:METHOD=AES-128,URI="https://s.fli.cx/k/abc/key.bin"',
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160',
    'https://s.fli.cx/s/variant-4k/index.m3u8?sig=xyz',
    '#EXTINF:4.000,',
    '/f/s0e-123/seg1.m4s',
    'https://cdn.other.example/keep-me.m3u8',
  ].join('\n');

  const sameOrigin = rewriteHlsPlaylistUrls(playlist);
  assert.equal(sameOrigin.includes('#EXT-X-MAP:URI="/f/s0e-123/init.mp4"'), true);
  assert.equal(sameOrigin.includes('#EXT-X-KEY:METHOD=AES-128,URI="/k/abc/key.bin"'), true);
  assert.equal(sameOrigin.includes('\n/s/variant-4k/index.m3u8?sig=xyz\n'), true);
  assert.equal(sameOrigin.includes('\n/f/s0e-123/seg1.m4s\n'), true);
  assert.equal(sameOrigin.includes('https://cdn.other.example/keep-me.m3u8'), true);
  assert.equal(sameOrigin.includes('s.fli.cx'), false);

  const workerProxied = rewriteHlsPlaylistUrls(playlist, 'https://proxy.kaira.workers.dev/');
  assert.equal(
    workerProxied.includes('#EXT-X-MAP:URI="https://proxy.kaira.workers.dev/f/s0e-123/init.mp4"'),
    true
  );
  assert.equal(
    workerProxied.includes('\nhttps://proxy.kaira.workers.dev/s/variant-4k/index.m3u8?sig=xyz\n'),
    true
  );
});

