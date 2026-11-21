import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  formatRemainingTime,
  formatEndsAt,
  computeIntroRangePercent,
  parseSubtitleStyle,
  DEFAULT_SUBTITLE_STYLE,
} from './playerHudUtils';

describe('playerHudUtils', () => {
  it('formats elapsed time cleanly for seconds, minutes, and hours', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(-12), '0:00');
    assert.equal(formatTime(Number.NaN), '0:00');
    assert.equal(formatTime(65), '1:05');
    assert.equal(formatTime(3661), '1:01:01');
  });

  it('formats remaining time with leading minus and clamps at zero', () => {
    assert.equal(formatRemainingTime(600, 3600), '-50:00');
    assert.equal(formatRemainingTime(10, 7200), '-1:59:50');
    assert.equal(formatRemainingTime(4000, 3600), '-0:00');
    assert.equal(formatRemainingTime(0, 0), '-0:00');
  });

  it('formats projected finish time with playback speed scaling', () => {
    const base = new Date(2026, 4, 10, 20, 30, 0); // 8:30 PM local
    assert.equal(formatEndsAt(0, 3600, 1, base), 'Ends 9:30 PM');
    assert.equal(formatEndsAt(0, 3600, 2, base), 'Ends 9:00 PM');
    assert.equal(formatEndsAt(3600, 3600, 1, base), '');
    const late = new Date(2026, 4, 10, 23, 45, 0); // 11:45 PM local
    assert.equal(formatEndsAt(0, 1800, 1, late), 'Ends 12:15 AM');
  });

  it('computes intro segment percentages clamped to valid timeline bounds', () => {
    assert.equal(computeIntroRangePercent(null, 2700), null);
    assert.equal(computeIntroRangePercent({ start: 100, end: 50 }, 2700), null);
    assert.equal(computeIntroRangePercent({ start: 30, end: 120 }, 0), null);

    const range = computeIntroRangePercent({ start: 60, end: 150 }, 3000);
    assert.deepEqual(range, { leftPct: 2, widthPct: 3 });

    const clamped = computeIntroRangePercent({ start: -10, end: 5000 }, 1000);
    assert.deepEqual(clamped, { leftPct: 0, widthPct: 100 });
  });

  it('parses subtitle style preferences safely with fallback defaults', () => {
    assert.deepEqual(parseSubtitleStyle(null), DEFAULT_SUBTITLE_STYLE);
    assert.deepEqual(parseSubtitleStyle('not-json'), DEFAULT_SUBTITLE_STYLE);
    assert.deepEqual(
      parseSubtitleStyle(JSON.stringify({ size: 'lg', backdrop: 'box' })),
      { size: 'lg', backdrop: 'box' }
    );
    assert.deepEqual(
      parseSubtitleStyle(JSON.stringify({ size: 'invalid', backdrop: 'dim' })),
      { size: 'md', backdrop: 'dim' }
    );
  });
});
