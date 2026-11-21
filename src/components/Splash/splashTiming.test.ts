import test from 'node:test';
import assert from 'node:assert/strict';
import { getSplashTimingConfig } from './splashTiming';

test('getSplashTimingConfig skips immediately when ?autostart=1 is present', () => {
  const cfg = getSplashTimingConfig({
    search: '?autostart=1',
    isAndroid: false,
    prefersReducedMotion: false,
  });
  assert.equal(cfg.shouldSkipImmediately, true);
  assert.equal(cfg.holdMs, 0);
  assert.equal(cfg.fadeOutMs, 0);
});

test('getSplashTimingConfig uses concise accessible timings when prefers-reduced-motion is active', () => {
  const cfg = getSplashTimingConfig({
    search: '',
    isAndroid: false,
    prefersReducedMotion: true,
  });
  assert.equal(cfg.shouldSkipImmediately, false);
  assert.ok(cfg.holdMs <= 1000);
  assert.ok(cfg.fadeOutMs <= 250);
});

test('getSplashTimingConfig uses faster boot pacing on Android than desktop/TV', () => {
  const desktop = getSplashTimingConfig({
    search: '',
    isAndroid: false,
    prefersReducedMotion: false,
  });
  const android = getSplashTimingConfig({
    search: '',
    isAndroid: true,
    prefersReducedMotion: false,
  });
  assert.equal(desktop.shouldSkipImmediately, false);
  assert.equal(android.shouldSkipImmediately, false);
  assert.ok(android.holdMs < desktop.holdMs);
  assert.ok(desktop.skipFadeOutMs < desktop.fadeOutMs);
});
