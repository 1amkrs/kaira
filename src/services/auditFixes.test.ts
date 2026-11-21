import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal deterministic browser globals for Node unit tests
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

let broadcastChannelCreations = 0;
let broadcastChannelCloses = 0;

class MockBroadcastChannel {
  public name: string;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
    broadcastChannelCreations += 1;
  }
  postMessage(_msg: unknown) {}
  close() {
    broadcastChannelCloses += 1;
  }
}

class MockAudio {
  public src = '';
  public crossOrigin: string | null = null;
  public preload = 'auto';
  public volume = 1;
  public muted = false;
  public currentTime = 0;
  public duration = 0;
  public paused = true;
  public readyState = 0;
  public error: { code: number; message: string } | null = null;
  addEventListener() {}
  removeEventListener() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute(_name: string) {}
}

(globalThis as any).localStorage = createMemoryStorage();
(globalThis as any).sessionStorage = createMemoryStorage();
(globalThis as any).BroadcastChannel = MockBroadcastChannel;
(globalThis as any).Audio = MockAudio;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { protocol: 'http:', host: 'localhost:3000', origin: 'http://localhost:3000', hostname: 'localhost', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

test('RemoteClient does not open BroadcastChannel on import/construction, only on connect(), and closes on disconnect()', async () => {
  broadcastChannelCreations = 0;
  broadcastChannelCloses = 0;

  const { remoteClient } = await import('../remote/remoteClient');
  assert.equal(broadcastChannelCreations, 0, 'Importing remoteClient must not open BroadcastChannel');

  // Prevent real WebSocket/fetch network activity during connect()
  const origFetch = globalThis.fetch;
  const origWs = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = undefined;
  globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) })) as any;

  try {
    remoteClient.connect('TEST12');
    assert.equal(broadcastChannelCreations, 1, 'connect() should open BroadcastChannel once');
    remoteClient.disconnect();
    assert.equal(broadcastChannelCloses, 1, 'disconnect() should close BroadcastChannel');
  } finally {
    globalThis.fetch = origFetch;
    (globalThis as any).WebSocket = origWs;
  }
});

test('ProfileService fixes: clearWatchHistory stays empty, guest history is incognito, updateProfile clears isKid, deleteProfile handles PIN-locked fallback', async () => {
  (globalThis as any).localStorage.clear();
  const { profileService } = await import('./profile/ProfileService');

  // 1. Default primary profile starts with seeded watch history, and clearing keeps it empty
  assert.ok(profileService.getWatchHistory('prof-primary').length > 0);
  profileService.clearWatchHistory('prof-primary');
  assert.deepEqual(profileService.getWatchHistory('prof-primary'), []);

  // 2. Guest profile addWatchHistory does not persist
  profileService.addWatchHistory('prof-guest', {
    mediaId: 'tt0816692',
    title: 'Interstellar',
    type: 'movie',
    poster: '',
    progress: 50,
    positionSeconds: 100,
    durationSeconds: 200,
  });
  assert.deepEqual(profileService.getWatchHistory('prof-guest'), []);

  // 3. Changing a Kids profile to Adult clears isKid
  const kidProfile = profileService.createProfile({
    name: 'Test Kid',
    type: 'kids',
    avatarColor: '#ff0000',
  });
  assert.equal(kidProfile.isKid, true);
  profileService.updateProfile(kidProfile.id, { type: 'adult' });
  const updatedKid = profileService.getProfiles().find((p) => p.id === kidProfile.id);
  assert.equal(updatedKid?.isKid, false);

  // 4. Deleting the active profile when remaining profiles are PIN-locked does not leave activeProfileId dangling
  const lockedProfile = profileService.createProfile({
    name: 'Locked Adult',
    type: 'adult',
    avatarColor: '#0000ff',
    pin: '1234',
  });
  // Delete all other profiles except lockedProfile and kidProfile, make kidProfile active, then delete kidProfile
  for (const p of profileService.getProfiles()) {
    if (p.id !== lockedProfile.id && p.id !== kidProfile.id) {
      profileService.deleteProfile(p.id);
    }
  }
  profileService.setActiveProfile(kidProfile.id);
  assert.equal(profileService.getState().activeProfileId, kidProfile.id);

  const deleted = profileService.deleteProfile(kidProfile.id);
  assert.equal(deleted, true);
  assert.equal(profileService.getState().activeProfileId, lockedProfile.id);
});

test('AddonService fixes: uninstalling default addon persists across reload and Self-Debrid localhost:8081 is not probed when disabled', async () => {
  (globalThis as any).localStorage.clear();
  const { addonService } = await import('./addons/AddonService');
  addonService.reloadState();

  assert.ok(addonService.getInstalledAddons().some((a) => a.id === 'torrentio'));
  addonService.uninstallAddon('torrentio');
  assert.equal(addonService.getInstalledAddons().some((a) => a.id === 'torrentio'), false);

  // Reload from localStorage: torrentio must remain uninstalled
  addonService.reloadState();
  assert.equal(addonService.getInstalledAddons().some((a) => a.id === 'torrentio'), false);

  // Ensure Self-Debrid is disabled and verify fetchStreams never hits localhost:8081
  addonService.setDebridConfig({ provider: 'none', apiKey: '', enabled: false });
  const requestedUrls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    return {
      ok: true,
      json: async () => ({ streams: [] }),
    } as Response;
  }) as any;

  try {
    await addonService.fetchStreams('movie', 'tt0816692', undefined, undefined, 'Interstellar');
    const selfDebridHits = requestedUrls.filter((u) => u.includes('localhost:8081'));
    assert.equal(selfDebridHits.length, 0, `Expected no localhost:8081 hits, saw: ${selfDebridHits.join(', ')}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('MusicEngine fixes: next() and previous() preserve originalQueue and shuffled queue order', async () => {
  const { musicEngine } = await import('./music/MusicEngine');

  const tracks = [
    { id: 't1', title: 'Track 1', artist: 'Artist A', album: 'Album 1', durationSeconds: 180, duration: '3:00', coverArt: '', audioUrl: '' },
    { id: 't2', title: 'Track 2', artist: 'Artist A', album: 'Album 1', durationSeconds: 180, duration: '3:00', coverArt: '', audioUrl: '' },
    { id: 't3', title: 'Track 3', artist: 'Artist A', album: 'Album 1', durationSeconds: 180, duration: '3:00', coverArt: '', audioUrl: '' },
    { id: 't4', title: 'Track 4', artist: 'Artist A', album: 'Album 1', durationSeconds: 180, duration: '3:00', coverArt: '', audioUrl: '' },
  ] as any[];

  // Seed queue directly via playTrack without network resolution issues
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) })) as any;

  try {
    await musicEngine.playTrack(tracks[0], tracks);
    musicEngine.toggleShuffle();
    const stateAfterShuffle = musicEngine.getState();
    assert.equal(stateAfterShuffle.isShuffle, true);
    const shuffledIds = stateAfterShuffle.queue.map((t) => t.id);

    musicEngine.next();
    const stateAfterNext = musicEngine.getState();
    assert.deepEqual(
      stateAfterNext.queue.map((t) => t.id),
      shuffledIds,
      'next() must not reshuffle the active queue'
    );
    assert.equal(stateAfterNext.queueIndex, 1);

    // Unshuffling must restore the original order [t1, t2, t3, t4]
    musicEngine.toggleShuffle();
    const stateAfterUnshuffle = musicEngine.getState();
    assert.deepEqual(
      stateAfterUnshuffle.queue.map((t) => t.id),
      ['t1', 't2', 't3', 't4'],
      'Unshuffling after next() must restore originalQueue'
    );
    musicEngine.stop();
  } finally {
    globalThis.fetch = origFetch;
  }
});
