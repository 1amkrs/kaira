import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidStreamUrl,
  extractImdbId,
  buildEmergencyFallbackStreams,
  deduplicateStreams,
  createFailedStreamTracker,
  pickNextFallbackStream,
} from './streamFallback';
import type { AddonStream } from '../../types/addons';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

test('isValidStreamUrl accepts http, https, and /api/stream-proxy? URLs and rejects malformed values', () => {
  assert.equal(isValidStreamUrl('https://cdn.example.com/movie.mp4'), true);
  assert.equal(isValidStreamUrl('http://localhost:8081/stream/abc'), true);
  assert.equal(isValidStreamUrl('/api/stream-proxy?url=https%3A%2F%2Fcdn.example.com%2Fv.mp4'), true);
  assert.equal(isValidStreamUrl(''), false);
  assert.equal(isValidStreamUrl('   '), false);
  assert.equal(isValidStreamUrl('magnet:?xt=urn:btih:123456'), false);
  assert.equal(isValidStreamUrl('javascript:alert(1)'), false);
  assert.equal(isValidStreamUrl(undefined), false);
});

test('extractImdbId prefers valid tt... IDs and strips mov-/show- prefixes', () => {
  assert.equal(extractImdbId('mov-tt0816692'), 'tt0816692');
  assert.equal(extractImdbId(undefined, 'show-tt0903747', 'fallback-id'), 'tt0903747');
  assert.equal(extractImdbId('internal-123', 'tt1375666'), 'tt1375666');
  assert.equal(extractImdbId('mov-custom123'), 'custom123');
});

test('buildEmergencyFallbackStreams builds VidLink, VidSrc, and optional YouTube trailer', () => {
  const movieFallbacks = buildEmergencyFallbackStreams({
    type: 'movie',
    imdbId: 'mov-tt0816692',
    titleHint: 'Interstellar',
    ytTrailerId: 'zSWdZVtXT7E',
  });
  assert.equal(movieFallbacks.length, 3);
  assert.ok(movieFallbacks[0].url.includes('vidlink.pro/movie/tt0816692'));
  assert.ok(movieFallbacks[1].url.includes('vidsrc.pm/embed/movie/tt0816692'));
  assert.equal(movieFallbacks[2].streamType, 'youtube');

  const epFallbacks = buildEmergencyFallbackStreams({
    type: 'series',
    imdbId: 'show-tt0903747',
    seasonNumber: 2,
    episodeNumber: 5,
    titleHint: 'Breaking Bad',
  });
  assert.equal(epFallbacks.length, 2);
  assert.ok(epFallbacks[0].url.includes('vidsrc.pm/embed/tv/tt0903747/2/5'));
  assert.ok(epFallbacks[1].url.includes('vidlink.pro/tv/tt0903747/2/5'));
});

test('deduplicateStreams drops invalid and duplicate URLs while preserving first entry', () => {
  const streams: AddonStream[] = [
    { name: 'Invalid', title: 'Bad', url: 'not-a-url', streamType: 'direct' },
    { name: 'Primary', title: 'First', url: 'https://cdn.example.com/a.mp4', streamType: 'direct' },
    { name: 'Duplicate', title: 'Second', url: 'https://cdn.example.com/a.mp4 ', streamType: 'direct' },
    { name: 'Backup', title: 'Third', url: 'https://vidlink.pro/movie/tt0816692', streamType: 'embed' },
  ];
  const deduped = deduplicateStreams(streams);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].name, 'Primary');
  assert.equal(deduped[1].name, 'Backup');
});

test('createFailedStreamTracker marks, expires via TTL, and clears failed stream URLs', () => {
  const tracker = createFailedStreamTracker(5_000);
  tracker.markFailed('https://cdn.example.com/broken.mp4', 'HTTP 502', 1_000);
  assert.equal(tracker.isFailed('https://cdn.example.com/broken.mp4', 2_000), true);
  assert.equal(tracker.getFailureReason('https://cdn.example.com/broken.mp4', 2_000), 'HTTP 502');
  assert.equal(tracker.isFailed('https://cdn.example.com/broken.mp4', 6_500), false);

  tracker.markFailed('https://cdn.example.com/a.mp4', 'Demuxer error', 10_000);
  tracker.clearFailed('https://cdn.example.com/a.mp4');
  assert.equal(tracker.isFailed('https://cdn.example.com/a.mp4', 10_100), false);
});

test('pickNextFallbackStream steps through direct streams by playability, then VidLink, VidSrc, and trailer', () => {
  const candidates: AddonStream[] = [
    { name: 'MKV Remux', title: 'Movie 4K Remux.mkv TrueHD', url: 'https://cdn.example.com/remux.mkv', streamType: 'direct', quality: '4K' },
    { name: 'MP4 Fast', title: 'Movie 1080p x264 AAC.mp4', url: 'https://cdn.example.com/fast.mp4', streamType: 'direct', quality: '1080p' },
    { name: 'HLS Stream', title: 'Movie 1080p HLS', url: 'https://cdn.example.com/master.m3u8', streamType: 'direct', quality: '1080p' },
    { name: 'VidSrc', title: 'VidSrc', url: 'https://vidsrc.pm/embed/movie/tt0816692', streamType: 'embed', quality: '1080p' },
    { name: 'VidLink', title: 'VidLink', url: 'https://vidlink.pro/movie/tt0816692', streamType: 'embed', quality: '1080p' },
    { name: 'Trailer', title: 'Trailer', url: 'https://www.youtube.com/embed/zSWdZVtXT7E', streamType: 'youtube', quality: '1080p' },
  ];

  const failed = new Set<string>();
  // MP4 + x264 + AAC has the highest browser playability score, followed by HLS, then MKV Remux
  const first = pickNextFallbackStream(candidates, failed);
  assert.equal(first?.name, 'MP4 Fast');
  failed.add(first!.url);

  const second = pickNextFallbackStream(candidates, failed);
  assert.equal(second?.name, 'HLS Stream');
  failed.add(second!.url);

  // Simulate hitting maxDirectAttemptsReached -> skip remaining MKV direct and jump straight to VidLink
  const third = pickNextFallbackStream(candidates, failed, { maxDirectAttemptsReached: true });
  assert.equal(third?.name, 'VidLink');
  failed.add(third!.url);

  const fourth = pickNextFallbackStream(candidates, failed, { maxDirectAttemptsReached: true });
  assert.equal(fourth?.name, 'VidSrc');
  failed.add(fourth!.url);

  const fifth = pickNextFallbackStream(candidates, failed, { maxDirectAttemptsReached: true });
  assert.equal(fifth?.name, 'Trailer');
  failed.add(fifth!.url);

  const sixth = pickNextFallbackStream(candidates, failed, { maxDirectAttemptsReached: true });
  assert.equal(sixth, null);
});

test('AddonService retries transient Torrentio 503 once and recovers direct stream', async () => {
  installMockLocalStorage();
  const { addonService } = await import('./AddonService');
  addonService.reloadState();
  addonService.clearFailedStreams();
  addonService.setDebridConfig({ provider: 'realdebrid', apiKey: 'test-token', enabled: true });

  const origFetch = globalThis.fetch;
  let torrentioAttempts = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('torrentio.strem.fun')) {
      torrentioAttempts += 1;
      if (torrentioAttempts === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(
        JSON.stringify({
          streams: [
            {
              name: '[RD+] Torrentio 1080p',
              title: 'Interstellar.2014.1080p.WEB-DL.H264.AAC.mp4',
              url: 'https://debrid.example.com/interstellar-1080p.mp4',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ streams: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const plan = await addonService.resolveStreamPlan({
      type: 'movie',
      id: 'mov-tt0816692',
      titleHint: 'Interstellar',
    });

    assert.equal(torrentioAttempts, 2, 'Torrentio should retry once after HTTP 503');
    assert.equal(plan.primary?.url, 'https://debrid.example.com/interstellar-1080p.mp4');
    assert.equal(plan.primary?.streamType, 'direct');
    assert.ok(plan.candidates.some((s) => s.url.includes('vidlink.pro/movie/tt0816692')));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('AddonService falls back cleanly to VidLink/VidSrc when Torrentio completely fails or returns invalid JSON', async () => {
  installMockLocalStorage();
  const { addonService } = await import('./AddonService');
  addonService.reloadState();
  addonService.clearFailedStreams();
  addonService.setDebridConfig({ provider: 'realdebrid', apiKey: 'test-token', enabled: true });

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response('<html>Cloudflare 502 Bad Gateway</html>', { status: 502 });
  }) as typeof fetch;

  try {
    const plan = await addonService.resolveStreamPlan({
      type: 'series',
      id: 'show-tt0903747',
      seasonNumber: 1,
      episodeNumber: 3,
      titleHint: 'Breaking Bad',
    });

    assert.ok(plan.primary, 'Should still produce a playable fallback primary stream');
    assert.equal(plan.primary?.streamType, 'embed');
    assert.ok(plan.primary?.url.includes('vidsrc.pm/embed/tv/tt0903747/1/3'));
    assert.ok(plan.warnings.length > 0, 'Should surface a diagnostic warning when Torrentio fails');
    assert.equal(plan.usedFallback, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('AddonService skips session-failed Torrentio URLs and invalid custom stream URLs', async () => {
  installMockLocalStorage();
  const { addonService } = await import('./AddonService');
  addonService.reloadState();
  addonService.clearFailedStreams();

  const brokenTorrentio: AddonStream = {
    name: '[RD+] Torrentio Broken',
    title: 'Movie 1080p AAC.mp4',
    url: 'https://debrid.example.com/dead.mp4',
    streamType: 'direct',
    quality: '1080p',
    isDebrid: true,
  };
  const healthyTorrentio: AddonStream = {
    name: '[RD+] Torrentio Healthy',
    title: 'Movie 1080p WEB-DL AAC.mp4',
    url: 'https://debrid.example.com/alive.mp4',
    streamType: 'direct',
    quality: '1080p',
    isDebrid: true,
  };

  addonService.markStreamFailed(brokenTorrentio.url, 'FFmpegDemuxer: open context failed');

  // 1. Even if caller requests the previously failed stream, resolveStreamPlan fails over to the healthy alternate
  const planAfterFail = await addonService.resolveStreamPlan({
    type: 'movie',
    id: 'tt0816692',
    titleHint: 'Interstellar',
    preferredStreamUrl: brokenTorrentio.url,
    preferredStreamType: 'direct',
    preloadedStreams: [brokenTorrentio, healthyTorrentio],
  });
  assert.equal(planAfterFail.primary?.url, healthyTorrentio.url);
  assert.equal(planAfterFail.usedFallback, true);

  // 2. If caller passes a malformed custom URL, resolveStreamPlan falls back to healthy direct stream
  const planInvalidCustom = await addonService.resolveStreamPlan({
    type: 'movie',
    id: 'tt0816692',
    titleHint: 'Interstellar',
    preferredStreamUrl: 'not-a-valid-url',
    preloadedStreams: [brokenTorrentio, healthyTorrentio],
  });
  assert.equal(planInvalidCustom.primary?.url, healthyTorrentio.url);
  assert.equal(planInvalidCustom.usedFallback, true);
});

test('AddonService skips dead localhost:8081 Self-Debrid URLs when local server is unreachable', async () => {
  installMockLocalStorage();
  const { addonService } = await import('./AddonService');
  addonService.reloadState();
  addonService.clearFailedStreams();
  addonService.setDebridConfig({
    provider: 'selfdebrid',
    apiKey: '',
    endpointUrl: 'http://localhost:8081',
    enabled: true,
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('http://localhost:8081')) {
      throw new Error('ECONNREFUSED');
    }
    if (url.includes('torrentio.strem.fun')) {
      return new Response(
        JSON.stringify({
          streams: [
            {
              name: 'Torrentio 1080p',
              title: 'Interstellar 1080p',
              infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ streams: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const plan = await addonService.resolveStreamPlan({
      type: 'movie',
      id: 'tt0816692',
      titleHint: 'Interstellar',
    });

    assert.equal(
      plan.candidates.some((s) => s.url.includes(':8081')),
      false,
      'Unreachable Self-Debrid must not emit dead :8081 URLs'
    );
    assert.ok(plan.primary?.url.includes('vidlink.pro/movie/tt0816692'));
  } finally {
    globalThis.fetch = origFetch;
  }
});
