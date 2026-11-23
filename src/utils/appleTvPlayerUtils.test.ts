import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAppleTvTime,
  formatAppleTvRemaining,
  computeFloatingTimePercent,
  deduplicateSubtitleTracks,
  buildAppleTvChapters,
} from './appleTvPlayerUtils';

test('formatAppleTvTime and formatAppleTvRemaining format elapsed and remaining times', () => {
  assert.equal(formatAppleTvTime(0), '0:00');
  assert.equal(formatAppleTvTime(1928), '32:08');
  assert.equal(formatAppleTvTime(3955), '1:05:55');
  assert.equal(formatAppleTvRemaining(1928, 5883), '-1:05:55');
  assert.equal(formatAppleTvRemaining(5900, 5883), '-0:00');
  assert.equal(formatAppleTvRemaining(10, 0), '-0:00');
});

test('computeFloatingTimePercent clamps playhead label safely inside bounds', () => {
  assert.equal(computeFloatingTimePercent(0, 1000), 2);
  assert.equal(computeFloatingTimePercent(500, 1000), 50);
  assert.equal(computeFloatingTimePercent(995, 1000), 86);
  assert.equal(computeFloatingTimePercent(10, 0), 0);
});

test('deduplicateSubtitleTracks groups languages cleanly with Off, Auto, and Apple TV names', () => {
  const tracks = deduplicateSubtitleTracks([
    { language: 'ar', src: '/api/subtitles/file/1', format: 'vtt' },
    { language: 'ar', src: '/api/subtitles/file/2', format: 'vtt' },
    { language: 'en', src: '/api/subtitles/file/3', format: 'vtt', sdh: false },
    { language: 'en', src: '/api/subtitles/file/4', format: 'vtt', sdh: true },
    { language: 'zh', src: '/api/subtitles/file/5', format: 'vtt' },
    { language: 'zh-Hant', src: '/api/subtitles/file/6', format: 'vtt' },
    { language: 'bg', src: '/api/subtitles/file/7', format: 'vtt' },
  ]);

  assert.equal(tracks[0].id, 'off');
  assert.equal(tracks[0].label, 'Off');
  assert.equal(tracks[1].id, 'auto');
  assert.equal(tracks[1].label, 'Auto');
  assert.equal(tracks[1].src, '/api/subtitles/file/4');
  assert.equal(tracks[2].label, 'English (US) CC');
  assert.equal(tracks[3].label, 'English (US)');
  assert.deepEqual(
    tracks.slice(4).map((t) => t.label),
    ['Arabic', 'Bulgarian', 'Chinese, Simplified', 'Chinese, Traditional']
  );
});

test('buildAppleTvChapters generates evenly spaced chapters when duration is valid', () => {
  assert.deepEqual(buildAppleTvChapters(0), []);
  const movieChapters = buildAppleTvChapters(7000, false);
  assert.equal(movieChapters.length, 7);
  assert.equal(movieChapters[0].startSeconds, 0);
  assert.equal(movieChapters[0].title, 'Opening');
  assert.equal(movieChapters[1].startSeconds, 1000);
  assert.equal(movieChapters[1].timeLabel, '16:40');

  const shortShow = buildAppleTvChapters(1200, true);
  assert.equal(shortShow.length, 4);
  assert.equal(shortShow[0].title, 'Cold Open');
});
