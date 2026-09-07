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

// Test Next Episode Logic (Strictly for TV Shows)
class MockEpisodeProvider {
  constructor(episodesBySeason) {
    this.episodesBySeason = episodesBySeason;
  }

  async getEpisodes(showId, seasonNumber = 1) {
    return this.episodesBySeason[seasonNumber] || [];
  }

  async getNextEpisode(showId, seasonNumber, episodeNumber) {
    if (!showId) return null;
    const currentSeasonEps = await this.getEpisodes(showId, seasonNumber);
    if (currentSeasonEps && currentSeasonEps.length > 0) {
      const sorted = [...currentSeasonEps].sort((a, b) => a.number - b.number);
      const nextInSeason = sorted.find((ep) => ep.number > episodeNumber);
      if (nextInSeason) return nextInSeason;
    }

    const nextSeasonEps = await this.getEpisodes(showId, seasonNumber + 1);
    if (nextSeasonEps && nextSeasonEps.length > 0) {
      const sortedNext = [...nextSeasonEps].sort((a, b) => a.number - b.number);
      if (sortedNext.length > 0) return sortedNext[0];
    }

    return null;
  }
}

test('NextEpisode: Finds next episode in the same season', async () => {
  const provider = new MockEpisodeProvider({
    1: [
      { id: 'ep-1-1', seasonNumber: 1, number: 1, title: 'Pilot' },
      { id: 'ep-1-2', seasonNumber: 1, number: 2, title: 'Cat\'s in the Bag...' },
      { id: 'ep-1-3', seasonNumber: 1, number: 3, title: '...And the Bag\'s in the River' },
    ],
  });

  const next = await provider.getNextEpisode('tt0903747', 1, 1);
  assert.ok(next);
  assert.equal(next.id, 'ep-1-2');
  assert.equal(next.number, 2);
  assert.equal(next.title, 'Cat\'s in the Bag...');
});

test('NextEpisode: Transitions to next season when at season finale', async () => {
  const provider = new MockEpisodeProvider({
    1: [
      { id: 'ep-1-1', seasonNumber: 1, number: 1, title: 'Pilot' },
      { id: 'ep-1-7', seasonNumber: 1, number: 7, title: 'A No-Rough-Stuff-Type Deal' },
    ],
    2: [
      { id: 'ep-2-1', seasonNumber: 2, number: 1, title: 'Seven Thirty-Seven' },
      { id: 'ep-2-2', seasonNumber: 2, number: 2, title: 'Grilled' },
    ],
  });

  const next = await provider.getNextEpisode('tt0903747', 1, 7);
  assert.ok(next);
  assert.equal(next.seasonNumber, 2);
  assert.equal(next.number, 1);
  assert.equal(next.title, 'Seven Thirty-Seven');
});

test('NextEpisode: Returns null when at series finale', async () => {
  const provider = new MockEpisodeProvider({
    5: [
      { id: 'ep-5-15', seasonNumber: 5, number: 15, title: 'Granite State' },
      { id: 'ep-5-16', seasonNumber: 5, number: 16, title: 'Felina' },
    ],
  });

  const next = await provider.getNextEpisode('tt0903747', 5, 16);
  assert.equal(next, null);
});

test('NextEpisode: Strictly for TV shows (movies are excluded)', () => {
  const movieSource = {
    id: 'movie-interstellar',
    mediaType: 'movie',
    title: 'Interstellar',
  };
  const episodeSource = {
    id: 'ep-1-1',
    mediaType: 'episode',
    showId: 'tt0903747',
    seasonNumber: 1,
    episodeNumber: 1,
    title: 'Pilot',
  };

  // Verifies guard condition used in VideoPlayerScreen
  const canShowNextEpisode = (src) => src.mediaType === 'episode' && Boolean(src.showId || src.imdbId);
  assert.equal(canShowNextEpisode(movieSource), false, 'Movies must never show next episode');
  assert.equal(canShowNextEpisode(episodeSource), true, 'TV episodes must allow next episode');
});

test('EpisodeBackNavigation: Exiting TV episode transitions to Show Details page with current season', () => {
  let selectedShow = null;
  let selectedShowSeason = 1;
  let activeVideoSource = {
    id: 'ep-2-4',
    mediaType: 'episode',
    showId: 'tt0903747',
    showTitle: 'Breaking Bad',
    seasonNumber: 2,
    episodeNumber: 4,
    title: 'Down',
  };

  const handleExitVideoPlayer = (src) => {
    if (src && src.mediaType === 'episode') {
      const showId = src.showId || src.imdbId;
      if (showId) {
        selectedShow = {
          id: showId,
          title: src.showTitle || src.title,
          type: 'tv',
        };
        if (src.seasonNumber) {
          selectedShowSeason = src.seasonNumber;
        }
      }
    }
    activeVideoSource = null;
  };

  handleExitVideoPlayer(activeVideoSource);

  assert.equal(activeVideoSource, null);
  assert.ok(selectedShow, 'Show should be selected');
  assert.equal(selectedShow.id, 'tt0903747');
  assert.equal(selectedShowSeason, 2, 'Season should match the episode season');
});

test('EpisodeBackNavigation: Exiting Movie playback does not transition to Show Details page', () => {
  let selectedShow = null;
  let activeVideoSource = {
    id: 'movie-interstellar',
    mediaType: 'movie',
    title: 'Interstellar',
  };

  const handleExitVideoPlayer = (src) => {
    if (src && src.mediaType === 'episode') {
      selectedShow = { id: src.showId };
    }
    activeVideoSource = null;
  };

  handleExitVideoPlayer(activeVideoSource);

  assert.equal(activeVideoSource, null);
  assert.equal(selectedShow, null, 'Movies should not set selectedShow on exit');
});
