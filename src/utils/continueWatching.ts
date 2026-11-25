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

export const CONTINUE_WATCHING_STORAGE_KEY = 'kaira:continue-watching:v1';
export const LEGACY_CONTINUE_WATCHING_STORAGE_KEY = 'flicx:player:progress';
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

function humanizeSlugTitle(slug: string): string {
  return slug
    .replace(/-\d{4}$/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeEntryRecord(rawItem: Record<string, unknown>, fallbackSlug?: string): ContinueWatchingEntry | null {
  const cleanSlug = normalizeProgressSlug(
    typeof rawItem.slug === 'string' && rawItem.slug ? rawItem.slug : fallbackSlug
  );
  if (!cleanSlug) return null;

  const isLegacyNextShape =
    typeof rawItem.t === 'number' || typeof rawItem.d === 'number' || typeof rawItem.at === 'number';
  const currentTime = Number(isLegacyNextShape ? (rawItem.currentTime ?? rawItem.t) : rawItem.currentTime) || 0;
  const duration = Number(isLegacyNextShape ? (rawItem.duration ?? rawItem.d) : rawItem.duration) || 0;
  const updatedAt = Number(isLegacyNextShape ? (rawItem.updatedAt ?? rawItem.at) : rawItem.updatedAt) || 0;

  const seasonVal = Number(rawItem.season);
  const episodeVal = Number(rawItem.episode);
  const season = Number.isFinite(seasonVal) && seasonVal > 0 ? Math.floor(seasonVal) : undefined;
  const episode = Number.isFinite(episodeVal) && episodeVal > 0 ? Math.floor(episodeVal) : undefined;

  const kind: ContinueWatchingKind =
    rawItem.kind === 'anime'
      ? 'anime'
      : rawItem.kind === 'show' || rawItem.show === true || (season !== undefined && episode !== undefined)
        ? 'show'
        : 'movie';

  const mode: ContinueWatchingMode = rawItem.mode === 'embed' ? 'embed' : 'direct';
  const metrics = computeProgressMetrics(currentTime, duration, mode);
  if (metrics.isCompleted) return null;
  if (mode === 'direct' && !metrics.shouldTrack) return null;

  const defaultWatchUrl =
    kind === 'show' && season && episode
      ? `/watch/${encodeURIComponent(cleanSlug)}/s${season}e${episode}`
      : `/watch/${encodeURIComponent(cleanSlug)}`;
  const defaultDetailUrl =
    kind === 'anime'
      ? '/anime'
      : kind === 'show'
        ? `/tv/${encodeURIComponent(cleanSlug)}`
        : `/movie/${encodeURIComponent(cleanSlug)}`;

  return {
    slug: cleanSlug,
    title: typeof rawItem.title === 'string' && rawItem.title.trim() ? rawItem.title.trim() : humanizeSlugTitle(cleanSlug),
    kind,
    imdbId: typeof rawItem.imdbId === 'string' && rawItem.imdbId ? rawItem.imdbId : undefined,
    year: typeof rawItem.year === 'string' ? rawItem.year : undefined,
    poster: typeof rawItem.poster === 'string' ? rawItem.poster : undefined,
    still: typeof rawItem.still === 'string' ? rawItem.still : undefined,
    rating: typeof rawItem.rating === 'string' ? rawItem.rating : undefined,
    genre: typeof rawItem.genre === 'string' ? rawItem.genre : undefined,
    tone: typeof rawItem.tone === 'string' ? rawItem.tone : undefined,
    watchUrl: typeof rawItem.watchUrl === 'string' && rawItem.watchUrl ? rawItem.watchUrl : defaultWatchUrl,
    detailUrl: typeof rawItem.detailUrl === 'string' && rawItem.detailUrl ? rawItem.detailUrl : defaultDetailUrl,
    season,
    episode,
    currentTime: mode === 'embed' ? 0 : Math.floor(currentTime),
    duration: mode === 'embed' ? 0 : Math.floor(Math.max(0, duration)),
    progressPercent:
      typeof rawItem.progressPercent === 'number' && rawItem.progressPercent > 0
        ? Math.min(99, Math.round(rawItem.progressPercent))
        : metrics.progressPercent,
    mode,
    serverName: typeof rawItem.serverName === 'string' ? rawItem.serverName : undefined,
    updatedAt,
  };
}

export function parseContinueWatchingStorage(raw: unknown): ContinueWatchingEntry[] {
  if (!raw || typeof raw !== 'object') return [];

  const list: ContinueWatchingEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (candidate: ContinueWatchingEntry | null) => {
    if (!candidate || seen.has(candidate.slug)) return;
    seen.add(candidate.slug);
    list.push(candidate);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        pushEntry(normalizeEntryRecord(item as Record<string, unknown>));
      }
    }
  } else {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      for (const item of obj.items) {
        if (item && typeof item === 'object') {
          pushEntry(normalizeEntryRecord(item as Record<string, unknown>));
        }
      }
    } else {
      // Legacy Next.js map format: { [slug]: { t, d, at, show, season, episode } }
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'items' || !val || typeof val !== 'object' || Array.isArray(val)) continue;
        pushEntry(normalizeEntryRecord(val as Record<string, unknown>, key));
      }
    }
  }

  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CONTINUE_WATCHING_MAX_ITEMS);
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

  const prevList = Array.isArray(existing) ? existing : [];
  const prevMatch = prevList.find((item) => item && normalizeProgressSlug(item.slug) === cleanSlug);
  const metrics = computeProgressMetrics(
    incoming.currentTime,
    incoming.duration,
    incoming.mode
  );
  const filtered = prevList.filter(
    (item) => item && normalizeProgressSlug(item.slug) !== cleanSlug
  );

  if (metrics.isCompleted) {
    return filtered.slice(0, maxItems);
  }

  if (!metrics.shouldTrack) {
    // Do not overwrite an already-tracked item with a <5s restart unless explicitly cleared
    return prevList.slice(0, maxItems);
  }

  const sameEpisode =
    !prevMatch ||
    (prevMatch.kind === 'show'
      ? prevMatch.season === incoming.season && prevMatch.episode === incoming.episode
      : prevMatch.kind === 'anime'
        ? prevMatch.episode === incoming.episode
        : true);

  const shouldPreserveDirectProgress =
    incoming.mode === 'embed' &&
    Boolean(prevMatch) &&
    sameEpisode &&
    prevMatch!.mode === 'direct' &&
    prevMatch!.currentTime >= CONTINUE_WATCHING_MIN_SECONDS &&
    prevMatch!.duration > 0;

  const nextEntry: ContinueWatchingEntry = shouldPreserveDirectProgress
    ? {
        ...prevMatch!,
        ...incoming,
        slug: cleanSlug,
        mode: 'direct',
        currentTime: prevMatch!.currentTime,
        duration: prevMatch!.duration,
        progressPercent: prevMatch!.progressPercent,
        updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : Date.now(),
      }
    : {
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
  } else if (entry.kind === 'anime') {
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
