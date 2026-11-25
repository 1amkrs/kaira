import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume,
  getVolumeIconTier,
  getVolumePercent,
  toggleMuteState,
  classifyTapZone,
  createDoubleTapState,
  processStageTap,
  clampSeekTime,
  shouldCancelHoldOnMove,
  buildOpenSubtitlesRestUrl,
  normalizeOpenSubtitlesRestEntries,
  deduplicateSubtitleTracksWithFailover,
  pickPreferredSubtitleOption,
  shouldShowUpNextCard,
  buildNextEpisodeRoute,
} from './playerUxHelpers';

test('volume helpers clamp, report tiers, and restore previous non-zero volume on unmute', () => {
  assert.equal(clampVolume(1.5), 1);
  assert.equal(clampVolume(-0.2), 0);
  assert.equal(getVolumeIconTier(0.8, false), 'high');
  assert.equal(getVolumeIconTier(0.35, false), 'low');
  assert.equal(getVolumeIconTier(0.8, true), 'muted');
  assert.equal(getVolumeIconTier(0, false), 'muted');
  assert.equal(getVolumePercent(0.65, false), 65);
  assert.equal(getVolumePercent(0.65, true), 0);

  const muted = toggleMuteState(0.7, false, 0.8);
  assert.deepEqual(muted, { volume: 0.7, muted: true, lastNonZeroVolume: 0.7 });

  const unmuted = toggleMuteState(0, true, 0.65);
  assert.deepEqual(unmuted, { volume: 0.65, muted: false, lastNonZeroVolume: 0.65 });
});

test('classifyTapZone splits video width into 35% left, 30% center, and 35% right zones', () => {
  assert.equal(classifyTapZone(10, 0, 1000), 'left');
  assert.equal(classifyTapZone(350, 0, 1000), 'left');
  assert.equal(classifyTapZone(500, 0, 1000), 'center');
  assert.equal(classifyTapZone(650, 0, 1000), 'right');
  assert.equal(classifyTapZone(990, 0, 1000), 'right');
});

test('processStageTap handles double-tap seek, stacked +10/+20/+30 chaining, direction switch, and expiry', () => {
  let state = createDoubleTapState();

  // First right tap waits for disambiguation
  const t1 = processStageTap(state, { zone: 'right', nowMs: 1000 });
  assert.equal(t1.action, 'single-pending');
  state = t1.nextState;

  // Second right tap within 260ms triggers +10s
  const t2 = processStageTap(state, { zone: 'right', nowMs: 1200 });
  assert.equal(t2.action, 'seek');
  assert.equal(t2.direction, 'right');
  assert.equal(t2.deltaSeconds, 10);
  assert.equal(t2.accumulatedSeconds, 10);
  state = t2.nextState;

  // Third right tap within 650ms stacks to +20s
  const t3 = processStageTap(state, { zone: 'right', nowMs: 1650 });
  assert.equal(t3.action, 'seek');
  assert.equal(t3.deltaSeconds, 10);
  assert.equal(t3.accumulatedSeconds, 20);
  state = t3.nextState;

  // Fourth right tap stacks to +30s
  const t4 = processStageTap(state, { zone: 'right', nowMs: 2100 });
  assert.equal(t4.action, 'seek');
  assert.equal(t4.accumulatedSeconds, 30);
  state = t4.nextState;

  // Switching to left side resets burst cleanly (needs a double tap on left)
  const switch1 = processStageTap(state, { zone: 'left', nowMs: 2300 });
  assert.equal(switch1.action, 'single-pending');
  state = switch1.nextState;

  const switch2 = processStageTap(state, { zone: 'left', nowMs: 2480 });
  assert.equal(switch2.action, 'seek');
  assert.equal(switch2.direction, 'left');
  assert.equal(switch2.deltaSeconds, -10);
  assert.equal(switch2.accumulatedSeconds, 10);
  state = switch2.nextState;

  // After 650ms chain expiry, next left tap starts fresh single-pending
  const afterExpiry = processStageTap(state, { zone: 'left', nowMs: 3300 });
  assert.equal(afterExpiry.action, 'single-pending');
});

test('clampSeekTime and shouldCancelHoldOnMove respect bounds cleanly', () => {
  assert.equal(clampSeekTime(4, -10, 300), 0);
  assert.equal(clampSeekTime(295, 10, 300), 300);
  assert.equal(clampSeekTime(120, 10, 300), 130);

  assert.equal(shouldCancelHoldOnMove(100, 100, 108, 106, 12), false);
  assert.equal(shouldCancelHoldOnMove(100, 100, 120, 100, 12), true);
});

test('buildOpenSubtitlesRestUrl produces alphabetically sorted movie, TV, and title-query URLs', () => {
  assert.equal(
    buildOpenSubtitlesRestUrl({ imdbId: 'tt0816692', isShow: false }),
    'https://rest.opensubtitles.org/search/imdbid-0816692'
  );
  assert.equal(
    buildOpenSubtitlesRestUrl({ imdbId: 'tt0903747', isShow: true, season: 2, episode: 5 }),
    'https://rest.opensubtitles.org/search/episode-5/imdbid-0903747/season-2'
  );
  assert.equal(
    buildOpenSubtitlesRestUrl({ query: 'The Odyssey', isShow: false }),
    'https://rest.opensubtitles.org/search/query-the%20odyssey'
  );
  assert.equal(buildOpenSubtitlesRestUrl({}), null);
});

test('normalizeOpenSubtitlesRestEntries ranks by downloads and deduplication keeps up to 3 failover candidates', () => {
  const normalized = normalizeOpenSubtitlesRestEntries([
    { IDSubtitleFile: '1001', SubLanguageID: 'eng', SubDownloadsCnt: '150', SubFormat: 'srt', SubHearingImpaired: '0' },
    { IDSubtitleFile: '1002', SubLanguageID: 'eng', SubDownloadsCnt: '9800', SubFormat: 'srt', SubHearingImpaired: '0' },
    { IDSubtitleFile: '1003', SubLanguageID: 'eng', SubDownloadsCnt: '4200', SubFormat: 'srt', SubHearingImpaired: '0' },
    { IDSubtitleFile: '1004', SubLanguageID: 'eng', SubDownloadsCnt: '12', SubFormat: 'srt', SubHearingImpaired: '0' },
    { IDSubtitleFile: '2001', SubLanguageID: 'spa', SubDownloadsCnt: '500', SubFormat: 'srt', SubHearingImpaired: '0' },
  ]);

  assert.equal(normalized[0].src.endsWith('/1002'), true);
  assert.equal(normalized[1].src.endsWith('/1003'), true);

  const options = deduplicateSubtitleTracksWithFailover(normalized, 3);
  const enOpt = options.find((o) => o.language === 'en' && !o.sdh);
  assert.ok(enOpt);
  assert.equal(enOpt.candidates.length, 3);
  assert.equal(enOpt.candidates[0].endsWith('/1002'), true);
  assert.equal(enOpt.candidates[1].endsWith('/1003'), true);
  assert.equal(enOpt.candidates[2].endsWith('/1001'), true);

  const esPick = pickPreferredSubtitleOption(options, 'es');
  assert.equal(esPick?.language, 'es');
  assert.equal(pickPreferredSubtitleOption(options, 'off'), null);
});

test('TV Up Next triggers inside final 25s and constructs next episode URL cleanly', () => {
  assert.equal(
    shouldShowUpNextCard({ isShow: true, currentTime: 2500, duration: 2520, dismissed: false }),
    true
  );
  assert.equal(
    shouldShowUpNextCard({ isShow: true, currentTime: 1000, duration: 2520, dismissed: false }),
    false
  );
  assert.equal(
    shouldShowUpNextCard({ isShow: false, currentTime: 2500, duration: 2520, dismissed: false }),
    false
  );
  assert.equal(
    shouldShowUpNextCard({ isShow: true, currentTime: 2500, duration: 2520, dismissed: true }),
    false
  );

  const nextTv = buildNextEpisodeRoute({ slug: 'the-chosen-2019', season: 1, episode: 3 });
  assert.equal(nextTv.url, '/watch/the-chosen-2019/s1e4');
  assert.equal(nextTv.label, 'Season 1 · Episode 4');

  const nextAnime = buildNextEpisodeRoute({ slug: '1735', isAnime: true, season: 1, episode: 7 });
  assert.equal(nextAnime.url, '/watch/anime/1735/8');
  assert.equal(nextAnime.label, 'Episode 8');
});
