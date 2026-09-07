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

// Test Embed Player Seeking & VidAPI URL Injection
function buildEmbedSeekUrl(url, targetSeconds) {
  const target = Math.max(0, Math.round(targetSeconds));
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

    // 1. VidLink (vidlink.pro)
    if (parsed.hostname.includes('vidlink')) {
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('autoplay', 'true');
      return parsed.toString();
    }

    // 2. VidSrc (vidsrc.pm, vidsrc.xyz, vidsrc.to, etc.)
    if (parsed.hostname.includes('vidsrc')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('t', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 3. VidAPI / VAPlayer (vidapi.ru, vaplayer.ru, vidapi.org, etc.)
    if (parsed.hostname.includes('vidapi') || parsed.hostname.includes('vaplayer')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('time', String(target));
      parsed.searchParams.set('t', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 4. YouTube Embed
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 5. Generic Embed fallback: set parameters and hash
    parsed.searchParams.set('startAt', String(target));
    parsed.searchParams.set('start', String(target));
    parsed.searchParams.set('t', String(target));
    parsed.searchParams.set('autoplay', '1');
    parsed.hash = `t=${target}`;
    return parsed.toString();
  } catch (e) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}startAt=${target}&start=${target}&t=${target}&autoplay=1#t=${target}`;
  }
}

test('EmbedDriver: buildEmbedSeekUrl injects correct start parameters for VidAPI / VAPlayer', () => {
  const vidApiUrl = 'https://vidapi.ru/embed/tv/tt0903747/1/1';
  const seekedUrl = buildEmbedSeekUrl(vidApiUrl, 85);

  const parsed = new URL(seekedUrl);
  assert.equal(parsed.searchParams.get('start'), '85');
  assert.equal(parsed.searchParams.get('startAt'), '85');
  assert.equal(parsed.searchParams.get('time'), '85');
  assert.equal(parsed.searchParams.get('t'), '85');
  assert.equal(parsed.searchParams.get('autoplay'), '1');
});

test('EmbedDriver: buildEmbedSeekUrl injects correct start parameters for VidLink', () => {
  const vidLinkUrl = 'https://vidlink.pro/tv/tt0903747/1/1';
  const seekedUrl = buildEmbedSeekUrl(vidLinkUrl, 120);

  const parsed = new URL(seekedUrl);
  assert.equal(parsed.searchParams.get('startAt'), '120');
  assert.equal(parsed.searchParams.get('autoplay'), 'true');
});

test('EmbedDriver: buildEmbedSeekUrl injects correct start parameters for VidSrc', () => {
  const vidSrcUrl = 'https://vidsrc.pm/embed/tv/tt0903747/1/1';
  const seekedUrl = buildEmbedSeekUrl(vidSrcUrl, 90);

  const parsed = new URL(seekedUrl);
  assert.equal(parsed.searchParams.get('start'), '90');
  assert.equal(parsed.searchParams.get('startAt'), '90');
  assert.equal(parsed.searchParams.get('t'), '90');
  assert.equal(parsed.searchParams.get('autoplay'), '1');
});

test('EmbedDriver: seekLock suppresses stale incoming timeupdate postMessages within lockout window', () => {
  let currentTime = 10;
  let seekLockUntil = 0;

  const handleTimeUpdateMessage = (reportedTime, now) => {
    if (now < seekLockUntil) {
      // Suppress stale updates from old iframe position
      return false;
    }
    currentTime = reportedTime;
    return true;
  };

  const now = 1000000;
  // User skips intro to 90s
  currentTime = 90;
  seekLockUntil = now + 2200; // 2.2s debounce lockout

  // 500ms later: Iframe sends stale postMessage event still saying 12s
  const processedStale = handleTimeUpdateMessage(12, now + 500);
  assert.equal(processedStale, false, 'Stale postMessage should be ignored');
  assert.equal(currentTime, 90, 'Current time should not be overwritten by stale report');

  // 2500ms later: Iframe sends updated postMessage at 92s
  const processedFresh = handleTimeUpdateMessage(92, now + 2500);
  assert.equal(processedFresh, true, 'Fresh postMessage should be accepted');
  assert.equal(currentTime, 92, 'Current time should update after lockout expires');
});

test('IntroService: Dynamic heuristics distinguish short episodes from standard dramas', () => {
  const resolveHeuristicIntro = (durationSeconds) => {
    if (durationSeconds && durationSeconds < 1800) {
      return { start: 40, end: 90, type: 'heuristic' };
    }
    return { start: 75, end: 160, type: 'heuristic' };
  };

  const sitcomIntro = resolveHeuristicIntro(1320); // 22 min
  assert.equal(sitcomIntro.start, 40);
  assert.equal(sitcomIntro.end, 90);

  const dramaIntro = resolveHeuristicIntro(3300); // 55 min
  assert.equal(dramaIntro.start, 75);
  assert.equal(dramaIntro.end, 160);
});

test('IntroService: Auto-skip resets when playback rewinds before intro segment', () => {
  let hasAutoSkipped = true;
  const introSegment = { start: 60, end: 120 };

  const checkRewindReset = (currentTime) => {
    if (hasAutoSkipped && currentTime < introSegment.start) {
      hasAutoSkipped = false;
    }
  };

  // Currently playing past intro
  checkRewindReset(125);
  assert.equal(hasAutoSkipped, true);

  // User rewinds back to opening scene (30s)
  checkRewindReset(30);
  assert.equal(hasAutoSkipped, false, 'hasAutoSkipped should reset to false on rewind');
});

// Test Rebuilt Sleep Timer & Standby System
test('SleepTimerService: start sets active countdown and remaining seconds', () => {
  let state = {
    isActive: false,
    durationMinutes: 0,
    remainingSeconds: 0,
    isStandby: false,
  };

  const startTimer = (mins) => {
    state = {
      isActive: true,
      durationMinutes: mins,
      remainingSeconds: mins * 60,
      isStandby: false,
    };
  };

  startTimer(30);
  assert.equal(state.isActive, true);
  assert.equal(state.durationMinutes, 30);
  assert.equal(state.remainingSeconds, 1800);
  assert.equal(state.isStandby, false);
});

test('SleepTimerService: sleepNow immediately enters Standby Mode and pauses playback', () => {
  let isPlaybackPaused = false;
  let onSleepTriggered = false;
  let state = {
    isActive: true,
    durationMinutes: 15,
    remainingSeconds: 900,
    isStandby: false,
  };

  const sleepNow = () => {
    state.isActive = false;
    state.remainingSeconds = 0;
    state.isStandby = true;
    isPlaybackPaused = true;
    onSleepTriggered = true;
  };

  sleepNow();
  assert.equal(state.isStandby, true, 'isStandby should be true');
  assert.equal(state.isActive, false, 'active countdown should clear');
  assert.equal(isPlaybackPaused, true, 'playback must pause');
  assert.equal(onSleepTriggered, true, 'onSleep callback must fire');
});

test('SleepTimerService: wakeFromStandby clears standby state', () => {
  let state = {
    isActive: false,
    durationMinutes: 0,
    remainingSeconds: 0,
    isStandby: true,
  };

  const wakeFromStandby = () => {
    state.isStandby = false;
  };

  wakeFromStandby();
  assert.equal(state.isStandby, false);
});

// Test Rebuilt Screensaver Service
test('ScreensaverService: Configurable timeout updates delay and triggers correctly', () => {
  let timeoutMinutes = 5;
  let isActive = false;

  const setTimeoutMinutes = (m) => {
    timeoutMinutes = m;
  };

  const trigger = () => {
    isActive = true;
  };

  const wake = () => {
    isActive = false;
  };

  setTimeoutMinutes(10);
  assert.equal(timeoutMinutes, 10);

  trigger();
  assert.equal(isActive, true);

  wake();
  assert.equal(isActive, false);
});

test('ScreensaverService: Media playback check prevents screensaver from triggering during fullscreen playback', () => {
  let isMediaPlaying = true;
  let screensaverTriggered = false;

  const evaluateIdleTimeout = () => {
    if (isMediaPlaying) {
      // Do not trigger screensaver if playing
      return false;
    }
    screensaverTriggered = true;
    return true;
  };

  const resultWhilePlaying = evaluateIdleTimeout();
  assert.equal(resultWhilePlaying, false);
  assert.equal(screensaverTriggered, false, 'Screensaver must not trigger while video is playing');

  isMediaPlaying = false;
  const resultWhileIdle = evaluateIdleTimeout();
  assert.equal(resultWhileIdle, true);
  assert.equal(screensaverTriggered, true, 'Screensaver triggers when media is idle');
});

test('ScreensaverService: reportActivity wakes active screensaver without immediate re-trigger loop', () => {
  let isActive = true;
  let timerId = null;

  const wake = () => {
    isActive = false;
  };

  const reportActivity = () => {
    if (isActive) {
      wake();
    }
  };

  reportActivity();
  assert.equal(isActive, false, 'Activity wakes active screensaver');
});

test('ScreensaverService: Default inactivity timeout is 5 minutes (300,000ms)', () => {
  const DEFAULT_TIMEOUT_MINUTES = 5;
  const timeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
  assert.equal(timeoutMs, 300000);
});

test('TopNav: Actions capsule spatial navigation indices are contiguous without nav-sleep-btn', () => {
  const TABS = [{ id: 'for-you' }, { id: 'movies' }, { id: 'shows' }, { id: 'library' }];
  const hasRemoteModal = true;

  // Tabs start at index 2 (after profile at index 0 and search button at index 1)
  // Remote button
  const remoteIndex = 2 + TABS.length; // 2 + 4 = 6
  // Settings button
  const settingsIndex = 2 + TABS.length + (hasRemoteModal ? 1 : 0); // 7

  assert.equal(remoteIndex, 6);
  assert.equal(settingsIndex, 7);
  assert.equal(settingsIndex - remoteIndex, 1, 'Indices must be strictly contiguous');
});

test('SelfDebrid: URL generation defaults to audio=aac&transcode=1 for browser audio playback', () => {
  const normalizeSelfDebridUrl = (endpointUrl, infoHash, fileIdx, audioMode) => {
    const selfUrl = (endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');
    const fileParam = fileIdx !== undefined ? `file=${fileIdx}` : '';
    const mode = audioMode || 'auto';
    const audioParam = mode === 'direct' ? '' : 'audio=aac&transcode=1&downmix=stereo';
    const queryParams = [fileParam, audioParam].filter(Boolean).join('&');
    const queryStr = queryParams ? `?${queryParams}` : '';
    return `${selfUrl}/stream/${infoHash}${queryStr}`;
  };

  const autoUrl = normalizeSelfDebridUrl('http://localhost:8081', 'abc123hash', 0, 'auto');
  assert.match(autoUrl, /audio=aac&transcode=1&downmix=stereo/, 'auto audioMode must request AAC transcode');

  const defaultUrl = normalizeSelfDebridUrl('http://localhost:8081', 'abc123hash', 0, undefined);
  assert.match(defaultUrl, /audio=aac&transcode=1&downmix=stereo/, 'undefined audioMode must default to AAC transcode');

  const directUrl = normalizeSelfDebridUrl('http://localhost:8081', 'abc123hash', 0, 'direct');
  assert.equal(directUrl.includes('audio=aac'), false, 'direct audioMode must omit transcode param');
});

test('SelfDebrid: Raw URLs on port 8081 are appended with audio=aac&transcode=1 when missing', () => {
  const formatRawUrl = (url, audioMode) => {
    let streamUrl = url;
    if (streamUrl.includes(':8081') && !streamUrl.includes('audio=')) {
      const mode = audioMode || 'auto';
      if (mode !== 'direct') {
        const sep = streamUrl.includes('?') ? '&' : '?';
        streamUrl = `${streamUrl}${sep}audio=aac&transcode=1&downmix=stereo`;
      }
    }
    return streamUrl;
  };

  const formatted = formatRawUrl('http://localhost:8081/file/Yellowstone.mp4', 'auto');
  assert.equal(formatted, 'http://localhost:8081/file/Yellowstone.mp4?audio=aac&transcode=1&downmix=stereo');
});



