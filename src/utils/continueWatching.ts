export type ContinueWatchingKind = 'movie' | 'show' | 'anime';
export type ContinueWatchingMode = 'direct' | 'embed';

export interface ContinueWatchingEntry {
  slug: string;
  title: string;
  kind: ContinueWatchingKind;
  imdbId?: string;
  year?: string;
  poster?: string;
  still?: string;
  rating?: string;
  genre?: string;
  tone?: string;
  watchUrl: string;
  detailUrl: string;
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  progressPercent: number;
  mode: ContinueWatchingMode;
  serverName?: string;
  updatedAt: number;
}

export interface ProgressMetrics {
  shouldTrack: boolean;
  isCompleted: boolean;
  progressPercent: number;
  remainingSeconds: number;
}

export const CONTINUE_WATCHING_STORAGE_KEY = 'flicx:player:progress';
export const CONTINUE_WATCHING_MIN_SECONDS = 5;
export const CONTINUE_WATCHING_COMPLETE_RATIO = 0.92;
export const CONTINUE_WATCHING_MAX_ITEMS = 24;

export function normalizeProgressSlug(raw: string | undefined | null): string {
  return String(raw || '')
    .trim()
    .replace(/^\/(movie|tv|watch)\//, '')
    .replace(/\/.*$/, '')
    .replace(/\?.*$/, '')
    .toLowerCase();
}

export function computeProgressMetrics(
  currentTime: number,
  duration: number,
  mode: ContinueWatchingMode = 'direct'
): ProgressMetrics {
  if (mode === 'embed') {
    return {
      shouldTrack: true,
      isCompleted: false,
      progressPercent: 0,
      remainingSeconds: 0,
    };
  }

  const safeTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  if (safeDuration > 0) {
    const ratio = safeTime / safeDuration;
    if (ratio >= CONTINUE_WATCHING_COMPLETE_RATIO) {
      return {
        shouldTrack: false,
        isCompleted: true,
        progressPercent: 100,
        remainingSeconds: 0,
      };
    }
  }

  if (safeTime < CONTINUE_WATCHING_MIN_SECONDS) {
    return {
      shouldTrack: false,
      isCompleted: false,
      progressPercent: 0,
      remainingSeconds: safeDuration > 0 ? Math.max(0, safeDuration - safeTime) : 0,
    };
  }

  const pct =
    safeDuration > 0
      ? Math.min(99, Math.max(1, Math.round((safeTime / safeDuration) * 100)))
      : 0;
  const remaining = safeDuration > 0 ? Math.max(0, safeDuration - safeTime) : 0;

  return {
    shouldTrack: true,
    isCompleted: false,
    progressPercent: pct,
    remainingSeconds: remaining,
  };
}

export function upsertContinueWatchingList(
  existing: ContinueWatchingEntry[],
  incoming: Omit<ContinueWatchingEntry, 'progressPercent' | 'updatedAt'> & {
    updatedAt?: number;
  },
  maxItems: number = CONTINUE_WATCHING_MAX_ITEMS
): ContinueWatchingEntry[] {
  const cleanSlug = normalizeProgressSlug(incoming.slug);
  if (!cleanSlug) return Array.isArray(existing) ? existing.slice(0, maxItems) : [];

  const metrics = computeProgressMetrics(
    incoming.currentTime,
    incoming.duration,
    incoming.mode
  );
  const filtered = (Array.isArray(existing) ? existing : []).filter(
    (item) => item && normalizeProgressSlug(item.slug) !== cleanSlug
  );

  if (metrics.isCompleted) {
    return filtered.slice(0, maxItems);
  }

  if (!metrics.shouldTrack) {
    // Do not overwrite an already-tracked item with a <5s restart unless explicitly cleared
    return Array.isArray(existing) ? existing.slice(0, maxItems) : [];
  }

  const nextEntry: ContinueWatchingEntry = {
    ...incoming,
    slug: cleanSlug,
    currentTime: incoming.mode === 'embed' ? 0 : Math.floor(incoming.currentTime),
    duration: incoming.mode === 'embed' ? 0 : Math.floor(Math.max(0, incoming.duration)),
    progressPercent: metrics.progressPercent,
    updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : Date.now(),
  };

  return [nextEntry, ...filtered]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, maxItems);
}

export function removeContinueWatchingEntry(
  existing: ContinueWatchingEntry[],
  slug: string
): ContinueWatchingEntry[] {
  const cleanSlug = normalizeProgressSlug(slug);
  if (!cleanSlug) return Array.isArray(existing) ? existing : [];
  return (Array.isArray(existing) ? existing : []).filter(
    (item) => item && normalizeProgressSlug(item.slug) !== cleanSlug
  );
}

export function getResumeTimeForEntry(
  entry: ContinueWatchingEntry | null | undefined,
  season?: number,
  episode?: number
): number {
  if (!entry || entry.mode !== 'direct') return 0;
  if (entry.kind === 'show') {
    if (
      typeof season === 'number' &&
      typeof entry.season === 'number' &&
      entry.season !== season
    ) {
      return 0;
    }
    if (
      typeof episode === 'number' &&
      typeof entry.episode === 'number' &&
      entry.episode !== episode
    ) {
      return 0;
    }
  }
  const metrics = computeProgressMetrics(entry.currentTime, entry.duration, 'direct');
  if (!metrics.shouldTrack || metrics.isCompleted) return 0;
  return Math.floor(entry.currentTime);
}

export function formatContinueTimeLeft(entry: ContinueWatchingEntry): string {
  const epPrefix =
    entry.kind === 'show' && entry.season && entry.episode
      ? `S${entry.season} E${entry.episode} · `
      : entry.kind === 'anime' && entry.episode
        ? `Ep ${entry.episode} · `
        : '';

  if (entry.mode === 'embed' || !entry.duration || entry.duration <= 0) {
    return `${epPrefix}Resume`;
  }

  const remaining = Math.max(0, entry.duration - entry.currentTime);
  if (remaining < 60) {
    return `${epPrefix}< 1m left`;
  }

  const totalMins = Math.ceil(remaining / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours > 0) {
    return mins > 0 ? `${epPrefix}${hours}h ${mins}m left` : `${epPrefix}${hours}h left`;
  }
  return `${epPrefix}${mins}m left`;
}

export function formatResumeTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
