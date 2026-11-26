import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSubtitleTimestamp,
  parseSubtitleText,
  getActiveSubtitleText,
  buildEmbedFallbackServers,
  filterStaticHostSources,
  withBasePath
} from './subtitleParser.ts';

test('parseSubtitleTimestamp parses WebVTT and SRT timestamps accurately', () => {
  assert.equal(parseSubtitleTimestamp('00:41.500'), 41.5);
  assert.equal(parseSubtitleTimestamp('00:00:41,500'), 41.5);
  assert.equal(parseSubtitleTimestamp('01:02:03.250'), 3723.25);
  assert.equal(parseSubtitleTimestamp('02:10:05,050'), 7805.05);
  assert.ok(Number.isNaN(parseSubtitleTimestamp('not-a-timestamp')));
});

test('parseSubtitleText parses WebVTT cues with headers, settings, and HTML tags', () => {
  const vtt = `WEBVTT

NOTE comment block to ignore

1
00:00:40.200 --> 00:00:44.000 align:center line:85%
<i>A face</i> &amp; a voyage
<b>home</b>.

00:01:05.000 --> 00:01:08.500
<c.yellow>Hold steady!</c>
`;
  const cues = parseSubtitleText(vtt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 40.2);
  assert.equal(cues[0].end, 44.0);
  assert.equal(cues[0].text, 'A face & a voyage\nhome.');
  assert.equal(cues[1].start, 65);
  assert.equal(cues[1].text, 'Hold steady!');
});

test('parseSubtitleText parses SRT with BOM, CRLF, and ASS tags', () => {
  const srt = '\uFEFF1\r\n00:00:10,000 --> 00:00:12,500\r\n{\\an8}First line\r\nSecond line\r\n\r\n2\r\n00:00:15,250 --> 00:00:18,000\r\n&quot;Hello&quot;\r\n';
  const cues = parseSubtitleText(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 10);
  assert.equal(cues[0].end, 12.5);
  assert.equal(cues[0].text, 'First line\nSecond line');
  assert.equal(cues[1].text, '"Hello"');
});

test('getActiveSubtitleText returns matching cue(s) or empty string outside ranges', () => {
  const cues = parseSubtitleText(`WEBVTT

00:00:10.000 --> 00:00:14.000
Line one

00:00:12.000 --> 00:00:16.000
Line two
`);
  assert.equal(getActiveSubtitleText(cues, 5), '');
  assert.equal(getActiveSubtitleText(cues, 10.5), 'Line one');
  assert.equal(getActiveSubtitleText(cues, 13.0), 'Line one\nLine two');
  assert.equal(getActiveSubtitleText(cues, 15.0), 'Line two');
  assert.equal(getActiveSubtitleText(cues, 17.0), '');
});

test('buildEmbedFallbackServers builds IMDb-native movie and TV embed URLs cleanly', () => {
  const movieServers = buildEmbedFallbackServers('tt33764258', false);
  assert.equal(movieServers.length, 5);
  assert.equal(movieServers[0].name, 'VidSrc');
  assert.equal(movieServers[0].kind, 'embed');
  assert.match(movieServers[0].src, /^https:\/\/vidsrc\.me\/embed\/movie\?imdb=tt33764258$/);
  assert.match(movieServers[1].src, /^https:\/\/vidsrc\.to\/embed\/movie\/tt33764258$/);

  const tvServers = buildEmbedFallbackServers('tt7631058', true, 2, 4);
  assert.equal(tvServers.length, 5);
  assert.match(tvServers[0].src, /^https:\/\/vidsrc\.me\/embed\/tv\?imdb=tt7631058&season=2&episode=4$/);
  assert.match(tvServers[1].src, /^https:\/\/vidsrc\.to\/embed\/tv\/tt7631058\/2\/4$/);
  assert.match(tvServers[4].src, /^https:\/\/www\.2embed\.cc\/embedtv\/tt7631058\?s=2&e=4$/);

  assert.deepEqual(buildEmbedFallbackServers('invalid', false), []);
});

test('filterStaticHostSources removes relative /api/ streams on static hosts while preserving direct HTTPS HLS', () => {
  const raw = [
    { name: 'Kaira', kind: 'hls', src: '/api/s/abc.m3u8', quality: '4K' },
    { name: 'Vega', kind: 'hls', src: 'https://s.fli.cx/s/xyz.m3u8', quality: '4K' },
    { name: 'VidSrc', kind: 'embed', src: 'https://vidsrc.me/embed/movie?imdb=tt33764258', quality: 'HD' }
  ];
  assert.equal(filterStaticHostSources(raw, false).length, 3);
  const staticOnly = filterStaticHostSources(raw, true);
  assert.equal(staticOnly.length, 2);
  assert.equal(staticOnly[0].name, 'Vega');
  assert.equal(staticOnly[1].name, 'VidSrc');
});

test('withBasePath prefixes repo subpaths safely without double-prefixing', () => {
  assert.equal(withBasePath('/watch/the-odyssey-2026', '/'), '/watch/the-odyssey-2026');
  assert.equal(withBasePath('/watch/the-odyssey-2026', '/kaira/'), '/kaira/watch/the-odyssey-2026');
  assert.equal(withBasePath('/kaira/watch/the-odyssey-2026', '/kaira/'), '/kaira/watch/the-odyssey-2026');
  assert.equal(withBasePath('https://vidlink.pro/movie/tt123', '/kaira/'), 'https://vidlink.pro/movie/tt123');
});
