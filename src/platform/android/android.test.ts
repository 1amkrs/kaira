import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAndroidEnvironment } from './androidDetection';
import { resolveAndroidAppTarget } from './androidApps';
import { buildMediaSessionPayload } from '../../services/playback/mediaSessionBridge';
import {
  ONBOARDING_STEPS,
  shouldShowAndroidOnboarding,
  isRemoteFeatureEnabled,
  nextOnboardingStep,
  prevOnboardingStep,
  isAndroidOnboardingCompleted,
  markAndroidOnboardingCompleted,
  resetAndroidOnboarding,
} from '../../components/Onboarding/onboardingState';

test('detectAndroidEnvironment classifies Android Mobile UA properly (not Linux)', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const info = detectAndroidEnvironment(ua, '', undefined, false, 412, 915, 5);
  assert.equal(info.isAndroid, true);
  assert.equal(info.isAndroidTV, false);
  assert.equal(info.androidVersion, '14');
  assert.equal(info.deviceModel, 'Pixel 8 Pro');
});

test('detectAndroidEnvironment classifies Android TV / Leanback UA as android-tv', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH21) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const info = detectAndroidEnvironment(ua, '', undefined, false, 1920, 1080, 0);
  assert.equal(info.isAndroid, true);
  assert.equal(info.isAndroidTV, true);
  assert.equal(info.androidVersion, '12');
});

test('detectAndroidEnvironment respects explicit query parameter overrides', () => {
  const desktopUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
  const mobileOverride = detectAndroidEnvironment(desktopUa, '?android=mobile', undefined, false, 390, 844, 5);
  assert.equal(mobileOverride.isAndroid, true);
  assert.equal(mobileOverride.isAndroidTV, false);

  const tvOverride = detectAndroidEnvironment(desktopUa, '?android=tv', undefined, false, 1920, 1080, 0);
  assert.equal(tvOverride.isAndroid, true);
  assert.equal(tvOverride.isAndroidTV, true);
});

test('detectAndroidEnvironment leaves desktop Linux and Windows unaffected', () => {
  const linuxUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
  const winUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
  assert.equal(detectAndroidEnvironment(linuxUa, '', undefined, false, 1440, 900, 0).isAndroid, false);
  assert.equal(detectAndroidEnvironment(winUa, '', undefined, false, 1440, 900, 0).isAndroid, false);
});

test('resolveAndroidAppTarget maps apps to Android package names and TV variants', () => {
  const ytMobile = resolveAndroidAppTarget('youtube', false);
  assert.equal(ytMobile?.packageName, 'com.google.android.youtube');

  const ytTv = resolveAndroidAppTarget('youtube', true);
  assert.equal(ytTv?.packageName, 'com.google.android.youtube.tv');

  const netflix = resolveAndroidAppTarget('netflix', false);
  assert.equal(netflix?.packageName, 'com.netflix.mediaclient');
  assert.ok(netflix?.intentUri.startsWith('intent://'));
});

test('buildMediaSessionPayload populates title, artist, album, and artwork sizes', () => {
  const payload = buildMediaSessionPayload({
    id: 'src-1',
    type: 'audio',
    mediaType: 'track',
    mediaId: 'track-1',
    title: 'Midnight City',
    subtitle: 'M83 — Hurry Up, Were Dreaming',
    artist: 'M83',
    album: 'Hurry Up, Were Dreaming',
    artwork: 'https://example.com/cover.jpg',
    streamUrl: 'https://example.com/audio.mp3',
  });
  assert.equal(payload.title, 'Midnight City');
  assert.equal(payload.artist, 'M83');
  assert.equal(payload.artwork.length, 2);
  assert.equal(payload.artwork[0].src, 'https://example.com/cover.jpg');
});

test('shouldShowAndroidOnboarding triggers on fresh Android start and respects desktop, completed, autostart, and onboarding=1', () => {
  // Fresh Android start -> shown
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: true, search: '', completed: false }), true);
  // Completed Android start -> hidden
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: true, search: '', completed: true }), false);
  // Desktop / Linux / Windows -> always hidden even with ?onboarding=1
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: false, search: '?onboarding=1', completed: false }), false);
  // Android with ?autostart=1 skips onboarding unless ?onboarding=1 forces it
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: true, search: '?android=mobile&autostart=1', completed: false }), false);
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: true, search: '?android=mobile&autostart=1&onboarding=1', completed: true }), true);
  assert.equal(shouldShowAndroidOnboarding({ isAndroid: true, search: '?android=tv&onboarding=0', completed: false }), false);
});

test('onboarding step progression and storage persistence work reliably', () => {
  assert.equal(ONBOARDING_STEPS.length, 4);
  assert.equal(prevOnboardingStep(0), 0);
  assert.equal(nextOnboardingStep(0), 1);
  assert.equal(nextOnboardingStep(3), 3);
  assert.equal(prevOnboardingStep(3), 2);

  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  assert.equal(isAndroidOnboardingCompleted(mockStorage), false);
  markAndroidOnboardingCompleted(mockStorage);
  assert.equal(isAndroidOnboardingCompleted(mockStorage), true);
  resetAndroidOnboarding(mockStorage);
  assert.equal(isAndroidOnboardingCompleted(mockStorage), false);
});

test('isRemoteFeatureEnabled disables Companion Remote on Android while keeping Desktop/TV enabled', () => {
  assert.equal(isRemoteFeatureEnabled(true), false);
  assert.equal(isRemoteFeatureEnabled(false), true);
});

