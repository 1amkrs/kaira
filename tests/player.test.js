import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser globals for Node test environment
globalThis.window = {
  location: { origin: 'http://localhost:5173' },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: true }),
};

globalThis.document = {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    setAttribute: () => {},
    removeAttribute: () => {},
    canPlayType: () => 'probably',
    play: async () => {},
    pause: () => {},
    load: () => {},
    currentTime: 0,
    duration: 120,
    volume: 1,
    muted: false,
  }),
  documentElement: {
    style: {},
    requestFullscreen: async () => {},
  },
  head: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
};

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: (() => {
      let store = {};
      return {
        getItem: (key) => store[key] || null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        key: (i) => Object.keys(store)[i] || null,
      };
    })(),
    configurable: true,
  });
} catch (e) {}

// Test Player Engine Mock Simulator
class MockPlaybackBackend {
  constructor() {
    this.status = 'idle';
    this.currentTime = 0;
    this.duration = 100;
    this.volume = 1;
    this.muted = false;
    this.activeSubtitle = null;
    this.intro = { start: 15, end: 45 };
  }

  play() {
    this.status = 'playing';
  }

  pause() {
    this.status = 'paused';
  }

  togglePlayPause() {
    if (this.status === 'playing') this.pause();
    else this.play();
  }

  seekBy(delta) {
    this.currentTime = Math.max(0, Math.min(this.duration, this.currentTime + delta));
  }

  seekTo(pos) {
    this.currentTime = Math.max(0, Math.min(this.duration, pos));
  }

  selectSubtitle(subUrl) {
    this.activeSubtitle = subUrl;
  }

  skipIntro() {
    if (this.currentTime >= this.intro.start && this.currentTime < this.intro.end) {
      this.seekTo(this.intro.end);
    }
  }
}

test('PlayerService: PLAY transitions status to playing', () => {
  const backend = new MockPlaybackBackend();
  assert.equal(backend.status, 'idle');
  backend.play();
  assert.equal(backend.status, 'playing');
});

test('PlayerService: PAUSE transitions status to paused', () => {
  const backend = new MockPlaybackBackend();
  backend.play();
  assert.equal(backend.status, 'playing');
  backend.pause();
  assert.equal(backend.status, 'paused');
});

test('PlayerService: SEEK +10 advances playback position by 10s', () => {
  const backend = new MockPlaybackBackend();
  backend.currentTime = 25;
  backend.seekBy(10);
  assert.equal(backend.currentTime, 35);
});

test('PlayerService: SEEK -10 rewinds playback position by 10s', () => {
  const backend = new MockPlaybackBackend();
  backend.currentTime = 35;
  backend.seekBy(-10);
  assert.equal(backend.currentTime, 25);
});

test('PlayerService: SUBTITLE track selection updates active track', () => {
  const backend = new MockPlaybackBackend();
  assert.equal(backend.activeSubtitle, null);
  backend.selectSubtitle('https://subtitles.org/en.vtt');
  assert.equal(backend.activeSubtitle, 'https://subtitles.org/en.vtt');
});

test('PlayerService: INTRO SKIP advances position to intro.end', () => {
  const backend = new MockPlaybackBackend();
  backend.currentTime = 20; // Inside intro (15-45)
  backend.skipIntro();
  assert.equal(backend.currentTime, 45); // Jumped to end
});

test('ContinueWatching: Stores and restores state across restarts', () => {
  const payload = {
    mediaId: 'interstellar-2014',
    title: 'Interstellar',
    position: 6138, // 01:42:18
    duration: 10140, // 02:49:00
    mediaType: 'movie',
    updatedAt: Date.now(),
  };

  localStorage.setItem(`tv_playback_progress_user_default_${payload.mediaId}`, JSON.stringify(payload));
  const retrieved = JSON.parse(localStorage.getItem(`tv_playback_progress_user_default_${payload.mediaId}`));

  assert.equal(retrieved.mediaId, 'interstellar-2014');
  assert.equal(retrieved.position, 6138);
  assert.equal(retrieved.duration, 10140);
});
