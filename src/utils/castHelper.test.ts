import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPublicHttpStreamUrl,
  inferCastContentType,
  pickCastableStreamSource,
  buildExternalPlayerLinks,
  parsePersonRouteToSearchQuery
} from './castHelper.ts';

test('isPublicHttpStreamUrl allows public HTTPS streams and rejects blob/localhost/relative proxy URLs', () => {
  assert.equal(isPublicHttpStreamUrl('https://s.fli.cx/s/abc.m3u8'), true);
  assert.equal(isPublicHttpStreamUrl('https://cdn.example.com/movie.mp4'), true);
  assert.equal(isPublicHttpStreamUrl('/api/s/abc.m3u8'), false);
  assert.equal(isPublicHttpStreamUrl('http://localhost:3000/api/s/abc.m3u8'), false);
  assert.equal(isPublicHttpStreamUrl('http://127.0.0.1:3000/video.mp4'), false);
  assert.equal(isPublicHttpStreamUrl('blob:https://example.com/1234-5678'), false);
  assert.equal(isPublicHttpStreamUrl(''), false);
});

test('inferCastContentType detects HLS, DASH, WebM, and MP4 MIME types', () => {
  assert.equal(inferCastContentType('https://s.fli.cx/s/test.m3u8?token=1'), 'application/x-mpegurl');
  assert.equal(inferCastContentType('https://cdn.example.com/stream.mpd'), 'application/dash+xml');
  assert.equal(inferCastContentType('https://cdn.example.com/clip.webm'), 'video/webm');
  assert.equal(inferCastContentType('https://cdn.example.com/video.mp4'), 'video/mp4');
});

test('pickCastableStreamSource prefers public HTTPS HLS over local proxy URLs for Chromecast/TV', () => {
  const localProxy = { name: 'Kaira', kind: 'hls', src: '/api/s/local.m3u8', quality: '4K' };
  const public1080 = { name: 'Rigel', kind: 'hls', src: 'https://s.fli.cx/s/rigel.m3u8', quality: '1080p' };
  const public4k = { name: 'Vega', kind: 'hls', src: 'https://s.fli.cx/s/vega.m3u8', quality: '4K' };
  const embedSrv = { name: 'VidSrc', kind: 'embed', src: 'https://vidsrc.me/embed/movie?imdb=tt33764258', quality: 'HD' };

  const picked = pickCastableStreamSource([localProxy, public1080, public4k, embedSrv], localProxy);
  assert.equal(picked.kind, 'direct');
  assert.equal(picked.server?.name, 'Vega');
  assert.equal(picked.url, 'https://s.fli.cx/s/vega.m3u8');
  assert.equal(picked.contentType, 'application/x-mpegurl');

  const alreadyPublic = pickCastableStreamSource([localProxy, public1080, public4k], public1080);
  assert.equal(alreadyPublic.server?.name, 'Rigel');

  const embedOnly = pickCastableStreamSource([embedSrv], embedSrv);
  assert.equal(embedOnly.kind, 'embed-only');
  assert.equal(embedOnly.url, null);
});

test('buildExternalPlayerLinks generates VLC and Infuse deep links for public streams only', () => {
  const links = buildExternalPlayerLinks('https://s.fli.cx/s/vega.m3u8');
  assert.equal(links.vlcUrl, 'vlc://https://s.fli.cx/s/vega.m3u8');
  assert.equal(
    links.infuseUrl,
    'infuse://x-callback-url/play?url=https%3A%2F%2Fs.fli.cx%2Fs%2Fvega.m3u8'
  );

  assert.deepEqual(buildExternalPlayerLinks('/api/s/local.m3u8'), { vlcUrl: null, infuseUrl: null });
});

test('parsePersonRouteToSearchQuery extracts clean actor/director names from /person/ routes', () => {
  assert.equal(parsePersonRouteToSearchQuery('/person/525-christopher-nolan'), 'Christopher Nolan');
  assert.equal(parsePersonRouteToSearchQuery('/kaira/person/928158-ludwig-goransson/'), 'Ludwig Goransson');
  assert.equal(parsePersonRouteToSearchQuery('/movie/the-odyssey-2026'), null);
});
