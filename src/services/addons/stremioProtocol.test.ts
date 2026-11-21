import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAddonManifestUrl,
  manifestSupportsResource,
  getManifestResourceLabels,
  extractProxyHeaders,
  isLikelyHlsUrl,
  isProgressiveVideoUrl,
  isTorrentioAddon,
  torrentioManifestHasDebrid,
  isTorrentioErrorStream,
  getBrowserPlayabilityScore,
  formatPlayerErrorMessage,
  classifyStremioStream,
  buildStreamProxyUrl,
  sortStreamsForDisplay,
  getStreamPlayerBadge,
} from './stremioProtocol';
import { AddonManifest, AddonStream } from '../../types/addons';

test('normalizeAddonManifestUrl handles stremio://, missing manifest.json, and configured paths', () => {
  assert.equal(
    normalizeAddonManifestUrl('stremio://mediafusion.elfhosted.com/manifest.json'),
    'https://mediafusion.elfhosted.com/manifest.json'
  );
  assert.equal(
    normalizeAddonManifestUrl('https://comet.elfhosted.com/'),
    'https://comet.elfhosted.com/manifest.json'
  );
  assert.equal(
    normalizeAddonManifestUrl('https://example.org/%7B%22multi%22%3A%22on%22%7D/manifest.json'),
    'https://example.org/%7B%22multi%22%3A%22on%22%7D/manifest.json'
  );
  assert.throws(() => normalizeAddonManifestUrl('   '));
});

test('manifestSupportsResource matches both string and Stremio v3 object-form resources', () => {
  const stringManifest: AddonManifest = {
    id: 'test.string',
    name: 'String Resource Addon',
    version: '1.0.0',
    resources: ['stream'],
    types: ['movie', 'series'],
  };
  assert.equal(manifestSupportsResource(stringManifest, 'stream', 'movie', 'tt0816692'), true);
  assert.equal(manifestSupportsResource(stringManifest, 'subtitles', 'movie', 'tt0816692'), false);

  const objectManifest: AddonManifest = {
    id: 'test.object',
    name: 'Object Resource Addon',
    version: '1.0.0',
    resources: [
      'catalog',
      { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt', 'tmdb:'] },
    ],
    types: ['movie', 'series'],
  };
  assert.equal(manifestSupportsResource(objectManifest, 'stream', 'movie', 'tt0816692'), true);
  assert.equal(manifestSupportsResource(objectManifest, 'stream', 'movie', 'kitsu:123'), false);
  assert.equal(manifestSupportsResource(objectManifest, 'stream', 'anime', 'tt0816692'), false);
  assert.deepEqual(getManifestResourceLabels(objectManifest), ['Catalogs', 'Direct Streams']);
});

test('classifyStremioStream classifies extensionless Stremio URLs as direct Kaira Player streams', () => {
  const extensionless = classifyStremioStream({
    name: 'MediaFlow Direct',
    title: 'Interstellar 1080p',
    url: 'https://cdn.example.com/proxy/stream/abc123token',
    behaviorHints: {
      proxyHeaders: {
        request: {
          Referer: 'https://source.example.com/',
        },
      },
    },
  });

  assert.ok(extensionless);
  assert.equal(extensionless.streamType, 'direct');
  assert.equal(extensionless.isHls, false);
  assert.deepEqual(extensionless.proxyHeaders, { Referer: 'https://source.example.com/' });

  const hlsProxy = classifyStremioStream({
    name: 'WebStreamr',
    url: 'https://cdn.example.com/hls/master?token=xyz',
  });
  assert.ok(hlsProxy);
  assert.equal(hlsProxy.streamType, 'direct');
  assert.equal(hlsProxy.isHls, true);

  const embed = classifyStremioStream({
    name: 'VidSrc',
    url: 'https://vidsrc.pm/embed/movie/tt0816692',
  });
  assert.ok(embed);
  assert.equal(embed.streamType, 'embed');

  const externalOnly = classifyStremioStream({
    name: 'Notice',
    title: 'Configure addon first',
    externalUrl: 'https://example.com/configure',
  });
  assert.equal(externalOnly, null);
});

test('extractProxyHeaders handles nested request headers and flat headers', () => {
  assert.deepEqual(
    extractProxyHeaders({ behaviorHints: { proxyHeaders: { request: { Origin: 'https://a.test' } } } }),
    { Origin: 'https://a.test' }
  );
  assert.deepEqual(
    extractProxyHeaders({ behaviorHints: { proxyHeaders: { 'User-Agent': 'CustomUA' } } }),
    { 'User-Agent': 'CustomUA' }
  );
  assert.equal(extractProxyHeaders({}), undefined);
});

test('isLikelyHlsUrl and buildStreamProxyUrl behave safely', () => {
  assert.equal(isLikelyHlsUrl('https://cdn.example.com/video/index.m3u8?sig=1'), true);
  assert.equal(isLikelyHlsUrl('https://cdn.example.com/play/movie.mp4'), false);

  const proxied = buildStreamProxyUrl('https://cdn.example.com/hls/master.m3u8', {
    Referer: 'https://ref.test',
  });
  assert.ok(proxied.startsWith('/api/stream-proxy?'));
  assert.ok(proxied.includes(encodeURIComponent('https://cdn.example.com/hls/master.m3u8')));
  assert.equal(buildStreamProxyUrl(proxied), proxied);
  assert.equal(buildStreamProxyUrl('http://localhost:8081/stream/abc'), 'http://localhost:8081/stream/abc');
});

test('sortStreamsForDisplay puts direct Kaira Player streams above embeds and trailers', () => {
  const streams: AddonStream[] = [
    { name: 'Trailer', title: 'Trailer', url: 'https://youtube.com/embed/1', streamType: 'youtube', quality: '1080p' },
    { name: 'VidLink', title: 'VidLink', url: 'https://vidlink.pro/movie/tt1', streamType: 'embed', quality: '1080p' },
    { name: 'Direct 1080p', title: 'Direct', url: 'https://cdn.example.com/play/1', streamType: 'direct', quality: '1080p' },
    { name: 'Direct 4K', title: 'Direct 4K', url: 'https://cdn.example.com/play/2', streamType: 'direct', quality: '4K' },
  ];

  const sorted = sortStreamsForDisplay(streams);
  assert.deepEqual(
    sorted.map((s) => s.name),
    ['Direct 4K', 'Direct 1080p', 'VidLink', 'Trailer']
  );

  assert.equal(getStreamPlayerBadge('direct').label, 'Kaira Player');
  assert.equal(getStreamPlayerBadge('embed').label, 'Web Embed');
  assert.equal(getStreamPlayerBadge('youtube').label, 'Trailer');
});

test('Torrentio helpers recognize official/legacy IDs, Debrid config URLs, and error pseudo-streams', () => {
  assert.equal(isTorrentioAddon({ id: 'torrentio' }), true);
  assert.equal(isTorrentioAddon({ manifest: { id: 'com.stremio.torrentio.addon' } }), true);
  assert.equal(isTorrentioAddon({ manifestUrl: 'https://torrentio.strem.fun/realdebrid=ABC/manifest.json' }), true);
  assert.equal(isTorrentioAddon({ id: 'com.other.addon', manifestUrl: 'https://comet.elfhosted.com/manifest.json' }), false);

  assert.equal(torrentioManifestHasDebrid('https://torrentio.strem.fun/manifest.json'), false);
  assert.equal(torrentioManifestHasDebrid('https://torrentio.strem.fun/realdebrid=MYKEY/manifest.json'), true);
  assert.equal(torrentioManifestHasDebrid('https://torrentio.strem.fun/providers=yts|torbox=TB123/manifest.json'), true);

  assert.equal(
    isTorrentioErrorStream({
      name: 'Torrentio\nRD error',
      title: 'Invalid RealDebrid ApiKey/Token!',
      url: 'https://torrentio.strem.fun/videos/failed_access_v3.mp4',
    }),
    true
  );
  assert.equal(
    isTorrentioErrorStream({
      name: 'Torrentio\n1080p',
      title: 'The.Matrix.1999.1080p.WEB-DL.x264.AAC.mp4',
      url: 'https://torrentio.strem.fun/resolve/realdebrid/KEY/HASH/0/movie.mp4',
    }),
    false
  );
});

test('isProgressiveVideoUrl and getBrowserPlayabilityScore prefer browser-playable containers over Remux MKVs', () => {
  assert.equal(isProgressiveVideoUrl('https://torrentio.strem.fun/resolve/realdebrid/K/H/0/Movie.mkv'), true);
  assert.equal(isProgressiveVideoUrl('https://cdn.example.com/movie.mp4?token=1'), true);
  assert.equal(isProgressiveVideoUrl('https://cdn.example.com/hls/master.m3u8'), false);

  const mp4Score = getBrowserPlayabilityScore({
    url: 'https://torrentio.strem.fun/resolve/realdebrid/K/H/0/Movie.1080p.WEB-DL.x264.AAC.mp4',
    name: 'Torrentio 1080p',
    title: 'Movie.1999.1080p.WEB-DL.x264.AAC.mp4',
  });
  const remuxScore = getBrowserPlayabilityScore({
    url: 'https://torrentio.strem.fun/resolve/realdebrid/K/H/0/Movie.2160p.REMUX.TrueHD.DTS.mkv',
    name: 'Torrentio 4K',
    title: 'Movie.1999.2160p.BluRay.REMUX.TrueHD.7.1.mkv',
  });
  assert.ok(mp4Score > remuxScore, `Expected MP4 (${mp4Score}) to score above Remux MKV (${remuxScore})`);
});

test('formatPlayerErrorMessage translates raw FFmpegDemuxer errors into actionable copy', () => {
  const demuxMsg = formatPlayerErrorMessage(
    'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed',
    'https://torrentio.strem.fun/resolve/realdebrid/K/H/0/movie.mkv'
  );
  assert.ok(!demuxMsg.includes('FFmpegDemuxer'));
  assert.ok(demuxMsg.toLowerCase().includes('mp4'));

  const selfDebridMsg = formatPlayerErrorMessage(
    'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed',
    'http://localhost:8081/stream/abc123?audio=aac&transcode=1'
  );
  assert.ok(selfDebridMsg.includes('Self-Debrid'));
});

