import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTvModeEnvironment,
  findNextSpatialCandidate,
  buildNativePlaybackPayload,
  type SpatialCandidate,
} from './tvRemoteNav';

function rect(left: number, top: number, width = 200, height = 300) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

test('isTvModeEnvironment detects Android TV bridge, query flags, platform tag, and TV User-Agents', () => {
  assert.equal(isTvModeEnvironment({ androidBridgeIsTv: true }), true);
  assert.equal(isTvModeEnvironment({ platformFlag: 'android-tv' }), true);
  assert.equal(isTvModeEnvironment({ search: '?android=tv' }), true);
  assert.equal(isTvModeEnvironment({ search: '?foo=1&tv=1' }), true);
  assert.equal(
    isTvModeEnvironment({
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36',
    }),
    true
  );
  assert.equal(
    isTvModeEnvironment({
      userAgent: 'Mozilla/5.0 (Linux; Android 11; AFTMM Build/NS6281) AppleWebKit/537.36',
    }),
    true
  );
  assert.equal(
    isTvModeEnvironment({
      search: '?android=mobile',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
      platformFlag: 'android-mobile',
      androidBridgeIsTv: false,
    }),
    false
  );
});

test('findNextSpatialCandidate moves cleanly within rails horizontally and between rows vertically', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'nav-home', rect: rect(40, 20, 100, 40), group: 'nav' },
    { id: 'nav-movies', rect: rect(160, 20, 100, 40), group: 'nav' },
    { id: 'r1-c1', rect: rect(40, 120, 200, 300), group: 'rail-1' },
    { id: 'r1-c2', rect: rect(260, 120, 200, 300), group: 'rail-1' },
    { id: 'r1-c3', rect: rect(480, 120, 200, 300), group: 'rail-1' },
    { id: 'r2-c1', rect: rect(40, 460, 200, 300), group: 'rail-2' },
    { id: 'r2-c2', rect: rect(260, 460, 200, 300), group: 'rail-2' },
  ];

  // Right within rail-1
  assert.equal(
    findNextSpatialCandidate('r1-c1', candidates[2].rect, candidates, 'right', 'rail-1'),
    'r1-c2'
  );
  // Left within rail-1
  assert.equal(
    findNextSpatialCandidate('r1-c2', candidates[3].rect, candidates, 'left', 'rail-1'),
    'r1-c1'
  );
  // Down from rail-1 col 2 -> rail-2 col 2
  assert.equal(
    findNextSpatialCandidate('r1-c2', candidates[3].rect, candidates, 'down', 'rail-1'),
    'r2-c2'
  );
  // Up from rail-1 col 1 -> nav-home
  assert.equal(
    findNextSpatialCandidate('r1-c1', candidates[2].rect, candidates, 'up', 'rail-1'),
    'nav-home'
  );
  // Up from nav-home -> null (top boundary)
  assert.equal(
    findNextSpatialCandidate('nav-home', candidates[0].rect, candidates, 'up', 'nav'),
    null
  );
});

test('buildNativePlaybackPayload resolves relative local proxy URLs, drops embeds, and normalizes Flicx to Kaira', () => {
  const payload = buildNativePlaybackPayload({
    origin: 'http://127.0.0.1:41234/',
    title: 'Titanic',
    subtitle: '1997',
    slug: 'titanic-1997',
    imdbId: 'tt0120338',
    isShow: false,
    resumeSeconds: 145.8,
    activeServerIndex: 0,
    servers: [
      { name: 'Flicx', src: '/api/s/abc123/master.m3u8', quality: '4K', group: 'dedicated' },
      { name: 'Vega', src: '/s/vega-4k/index.m3u8', quality: '4K', group: 'external' },
      { name: 'VidLink', kind: 'embed', src: 'https://vidlink.pro/movie/tt0120338', quality: 'HD' },
    ],
  });

  assert.ok(payload);
  assert.equal(payload.servers.length, 2);
  assert.equal(payload.servers[0].name, 'Kaira');
  assert.equal(payload.servers[0].src, 'http://127.0.0.1:41234/api/s/abc123/master.m3u8');
  assert.equal(payload.servers[1].src, 'http://127.0.0.1:41234/s/vega-4k/index.m3u8');
  assert.equal(payload.resumeSeconds, 145);

  // Embed-only list returns null so web iframe fallback is used instead of ExoPlayer
  const embedOnly = buildNativePlaybackPayload({
    origin: 'http://127.0.0.1:41234',
    title: 'Test',
    slug: 'test',
    imdbId: 'tt0000001',
    isShow: false,
    servers: [{ name: 'VidLink', kind: 'embed', src: 'https://vidlink.pro/movie/tt0000001' }],
  });
  assert.equal(embedOnly, null);
});
