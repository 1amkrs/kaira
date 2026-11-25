import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProgressMetrics,
  upsertContinueWatchingList,
  removeContinueWatchingEntry,
  getResumeTimeForEntry,
  formatContinueTimeLeft,
  formatResumeTimestamp,
  type ContinueWatchingEntry,
} from './continueWatching.ts';

test('computeProgressMetrics tracks direct playback past 5s and auto-completes past 92%', () => {
  assert.deepEqual(computeProgressMetrics(2, 6000, 'direct'), {
    shouldTrack: false,
    isCompleted: false,
    progressPercent: 0,
    remainingSeconds: 5998,
  });

  const mid = computeProgressMetrics(1800, 7200, 'direct');
  assert.equal(mid.shouldTrack, true);
  assert.equal(mid.isCompleted, false);
  assert.equal(mid.progressPercent, 25);
  assert.equal(mid.remainingSeconds, 5400);

  const done = computeProgressMetrics(6700, 7200, 'direct');
  assert.equal(done.shouldTrack, false);
  assert.equal(done.isCompleted, true);
  assert.equal(done.progressPercent, 100);

  const embed = computeProgressMetrics(0, 0, 'embed');
  assert.equal(embed.shouldTrack, true);
  assert.equal(embed.isCompleted, false);
  assert.equal(embed.progressPercent, 0);
});

test('upsertContinueWatchingList deduplicates by slug, sorts newest first, and clears on completion', () => {
  const movieA = {
    slug: 'the-odyssey-2026',
    title: 'The Odyssey',
    kind: 'movie' as const,
    watchUrl: '/watch/the-odyssey-2026',
    detailUrl: '/movie/the-odyssey-2026',
    currentTime: 600,
    duration: 10380,
    mode: 'direct' as const,
    updatedAt: 1000,
  };

  const showB = {
    slug: 'breaking-bad-2008',
    title: 'Breaking Bad',
    kind: 'show' as const,
    season: 1,
    episode: 2,
    watchUrl: '/watch/breaking-bad-2008/s1e2',
    detailUrl: '/tv/breaking-bad-2008',
    currentTime: 1200,
    duration: 2880,
    mode: 'direct' as const,
    updatedAt: 2000,
  };

  let list: ContinueWatchingEntry[] = [];
  list = upsertContinueWatchingList(list, movieA);
  list = upsertContinueWatchingList(list, showB);
  assert.equal(list.length, 2);
  assert.equal(list[0].slug, 'breaking-bad-2008');
  assert.equal(list[1].slug, 'the-odyssey-2026');

  // Updating movieA moves it back to front without duplicating
  list = upsertContinueWatchingList(list, { ...movieA, currentTime: 2400, updatedAt: 3000 });
  assert.equal(list.length, 2);
  assert.equal(list[0].slug, 'the-odyssey-2026');
  assert.equal(list[0].currentTime, 2400);

  // Finishing movieA (>92%) automatically removes it
  list = upsertContinueWatchingList(list, { ...movieA, currentTime: 9800, updatedAt: 4000 });
  assert.equal(list.length, 1);
  assert.equal(list[0].slug, 'breaking-bad-2008');
});

test('removeContinueWatchingEntry removes matching slug cleanly', () => {
  const initial = upsertContinueWatchingList([], {
    slug: 'dune-part-two-2024',
    title: 'Dune: Part Two',
    kind: 'movie',
    watchUrl: '/watch/dune-part-two-2024',
    detailUrl: '/movie/dune-part-two-2024',
    currentTime: 900,
    duration: 9960,
    mode: 'direct',
    updatedAt: 1000,
  });
  const after = removeContinueWatchingEntry(initial, '/movie/dune-part-two-2024');
  assert.equal(after.length, 0);
});

test('getResumeTimeForEntry validates mode and TV episode match', () => {
  const directMovie: ContinueWatchingEntry = {
    slug: 'the-odyssey-2026',
    title: 'The Odyssey',
    kind: 'movie',
    watchUrl: '/watch/the-odyssey-2026',
    detailUrl: '/movie/the-odyssey-2026',
    currentTime: 1450,
    duration: 10380,
    progressPercent: 14,
    mode: 'direct',
    updatedAt: 1000,
  };
  assert.equal(getResumeTimeForEntry(directMovie), 1450);

  const directShow: ContinueWatchingEntry = {
    ...directMovie,
    slug: 'dark-2017',
    kind: 'show',
    season: 2,
    episode: 4,
    currentTime: 725,
    duration: 3200,
    progressPercent: 23,
  };
  assert.equal(getResumeTimeForEntry(directShow, 2, 4), 725);
  assert.equal(getResumeTimeForEntry(directShow, 2, 5), 0);

  const embedMovie: ContinueWatchingEntry = {
    ...directMovie,
    mode: 'embed',
    currentTime: 0,
    duration: 0,
    progressPercent: 0,
  };
  assert.equal(getResumeTimeForEntry(embedMovie), 0);
});

test('formatContinueTimeLeft and formatResumeTimestamp produce clean Apple TV labels', () => {
  const movieEntry: ContinueWatchingEntry = {
    slug: 'the-odyssey-2026',
    title: 'The Odyssey',
    kind: 'movie',
    watchUrl: '/watch/the-odyssey-2026',
    detailUrl: '/movie/the-odyssey-2026',
    currentTime: 3600,
    duration: 10380,
    progressPercent: 35,
    mode: 'direct',
    updatedAt: 1000,
  };
  assert.equal(formatContinueTimeLeft(movieEntry), '1h 53m left');

  const showEntry: ContinueWatchingEntry = {
    ...movieEntry,
    kind: 'show',
    season: 1,
    episode: 3,
    currentTime: 1440,
    duration: 2880,
    progressPercent: 50,
  };
  assert.equal(formatContinueTimeLeft(showEntry), 'S1 E3 · 24m left');

  const embedEntry: ContinueWatchingEntry = {
    ...movieEntry,
    mode: 'embed',
    currentTime: 0,
    duration: 0,
    progressPercent: 0,
  };
  assert.equal(formatContinueTimeLeft(embedEntry), 'Resume');

  assert.equal(formatResumeTimestamp(1455), '24:15');
  assert.equal(formatResumeTimestamp(3852), '1:04:12');
});
