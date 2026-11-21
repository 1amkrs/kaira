import { AddonStream } from '../../types/addons';
import { getBrowserPlayabilityScore, sortStreamsForDisplay } from './stremioProtocol';

export interface FailedStreamEntry {
  url: string;
  reason: string;
  failedAt: number;
}

export interface FailedStreamTracker {
  markFailed: (url: string, reason?: string, now?: number) => void;
  isFailed: (url: string, now?: number) => boolean;
  getFailureReason: (url: string, now?: number) => string | undefined;
  getFailedUrls: (now?: number) => Set<string>;
  clearFailed: (url?: string) => void;
}

/**
 * Validates that a candidate playback URL is a well-formed HTTP(S) or local stream-proxy URL.
 */
export function isValidStreamUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/stream-proxy?')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extracts a clean IMDb identifier (`tt...`) from one or more candidate IDs,
 * stripping Kaira prefixes like `mov-` or `show-`.
 */
export function extractImdbId(...candidates: Array<string | undefined | null>): string {
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const cleaned = raw.trim().replace(/^mov-|^show-/i, '');
    if (/^tt\d+$/i.test(cleaned)) {
      return cleaned;
    }
  }
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const cleaned = raw.trim().replace(/^mov-|^show-/i, '');
    if (cleaned.startsWith('tt')) {
      return cleaned;
    }
  }
  const fallback = candidates.find((c) => typeof c === 'string' && c.trim().length > 0);
  return fallback ? fallback.trim().replace(/^mov-|^show-/i, '') : '';
}

/**
 * Deterministically builds guaranteed emergency fallback mirrors (VidLink, VidSrc, optional trailer)
 * so playback always has viable fallback URLs even if Torrentio or remote addons time out.
 */
export function buildEmergencyFallbackStreams(params: {
  type: 'movie' | 'series';
  imdbId: string;
  seasonNumber?: number;
  episodeNumber?: number;
  titleHint?: string;
  ytTrailerId?: string;
}): AddonStream[] {
  const { type, imdbId, seasonNumber, episodeNumber, titleHint, ytTrailerId } = params;
  const fallbacks: AddonStream[] = [];
  const cleanImdb = extractImdbId(imdbId);
  const isImdb = cleanImdb.startsWith('tt');

  if (isImdb) {
    const vidLinkUrl =
      type === 'movie'
        ? `https://vidlink.pro/movie/${cleanImdb}?primaryColor=ff453a&secondaryColor=ffffff&iconColor=ffffff`
        : `https://vidlink.pro/tv/${cleanImdb}/${seasonNumber || 1}/${episodeNumber || 1}?primaryColor=ff453a&secondaryColor=ffffff&iconColor=ffffff`;

    const vidSrcUrl =
      type === 'movie'
        ? `https://vidsrc.pm/embed/movie/${cleanImdb}?autoplay=1`
        : `https://vidsrc.pm/embed/tv/${cleanImdb}/${seasonNumber || 1}/${episodeNumber || 1}?autoplay=1`;

    const vidLinkStream: AddonStream = {
      name:
        type === 'movie'
          ? 'VidLink Server 1 • High-Speed [Full Movie]'
          : 'VidLink Server 2 • Alternate [Episode]',
      title: `${titleHint || (type === 'movie' ? 'Full Feature' : 'Episode')} • 1080p/4K FHD Stream`,
      description: 'Multi-CDN Cloud Server • Instant Playback & Auto-Resolution',
      url: vidLinkUrl,
      streamType: 'embed',
      quality: '1080p',
      resolution: '1080p FHD',
      audio: 'Dolby Digital / 5.1',
      providerName: 'VidLink CDN',
      isDebrid: type === 'movie',
    };

    const vidSrcStream: AddonStream = {
      name:
        type === 'movie'
          ? 'VidSrc Server 2 • Alternate [Full Movie]'
          : 'VidSrc Server 1 • High-Speed [Episode]',
      title: `${titleHint || (type === 'movie' ? 'Full Feature' : 'Episode')} • 1080p Web Stream`,
      description:
        type === 'movie'
          ? 'Fast Alternate Cloud Mirror (Full Feature)'
          : 'IMDb-Native Cloud TV Server • Instant Episode Playback',
      url: vidSrcUrl,
      streamType: 'embed',
      quality: '1080p',
      resolution: '1080p Web-DL',
      audio: 'Stereo / 5.1',
      providerName: 'VidSrc Mirror',
      isDebrid: type === 'series',
    };

    // VidLink /tv/tt... can return HTTP 500 for IMDb IDs, so prefer IMDb-native VidSrc first for series
    if (type === 'series') {
      fallbacks.push(vidSrcStream, vidLinkStream);
    } else {
      fallbacks.push(vidLinkStream, vidSrcStream);
    }
  }

  if (ytTrailerId && ytTrailerId.trim()) {
    fallbacks.push({
      name: 'Official Studio Trailer [Promo Preview]',
      title: `${titleHint || 'Feature'} • YouTube Promo Trailer`,
      description: '1080p FHD • Official Studio Promo Trailer',
      url: `https://www.youtube.com/embed/${encodeURIComponent(ytTrailerId.trim())}?autoplay=1&enablejsapi=1`,
      streamType: 'youtube',
      quality: '1080p',
      resolution: '1080p Trailer',
      audio: 'Stereo',
      providerName: 'YouTube Promo',
      isDebrid: false,
    });
  }

  return fallbacks;
}

/**
 * Filters out invalid stream URLs and deduplicates candidates by trimmed URL,
 * keeping the first-seen entry (typically highest priority / richest metadata).
 */
export function deduplicateStreams(streams: AddonStream[]): AddonStream[] {
  const seen = new Set<string>();
  const result: AddonStream[] = [];

  for (const stream of streams) {
    if (!stream || !isValidStreamUrl(stream.url)) continue;
    const key = stream.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...stream, url: key });
  }

  return result;
}

/**
 * In-memory TTL tracker for stream URLs that failed to load during the current session,
 * preventing Kaira from re-selecting a broken Torrentio/direct URL in a loop.
 */
export function createFailedStreamTracker(ttlMs: number = 10 * 60 * 1000): FailedStreamTracker {
  const map = new Map<string, FailedStreamEntry>();

  const pruneExpired = (now: number) => {
    for (const [key, entry] of map.entries()) {
      if (now - entry.failedAt >= ttlMs) {
        map.delete(key);
      }
    }
  };

  return {
    markFailed(url: string, reason: string = 'Playback error', now: number = Date.now()) {
      if (!url || typeof url !== 'string') return;
      const key = url.trim();
      if (!key) return;
      map.set(key, { url: key, reason, failedAt: now });
    },

    isFailed(url: string, now: number = Date.now()): boolean {
      if (!url || typeof url !== 'string') return false;
      pruneExpired(now);
      return map.has(url.trim());
    },

    getFailureReason(url: string, now: number = Date.now()): string | undefined {
      if (!url || typeof url !== 'string') return undefined;
      pruneExpired(now);
      return map.get(url.trim())?.reason;
    },

    getFailedUrls(now: number = Date.now()): Set<string> {
      pruneExpired(now);
      return new Set(map.keys());
    },

    clearFailed(url?: string) {
      if (!url) {
        map.clear();
      } else {
        map.delete(url.trim());
      }
    },
  };
}

/**
 * Selects the next viable fallback stream given a candidate pool and a set of already-failed URLs:
 * 1. Highest browser-playability untested `direct` stream (staying in Kaira Player),
 * 2. Untested `embed` mirror (VidLink -> VidSrc),
 * 3. Untested `youtube` trailer as last resort.
 */
export function pickNextFallbackStream(
  candidates: AddonStream[],
  failedUrls: Set<string>,
  options: { allowDirect?: boolean; allowSelfDebrid?: boolean; maxDirectAttemptsReached?: boolean } = {}
): AddonStream | null {
  const {
    allowDirect = true,
    allowSelfDebrid = false,
    maxDirectAttemptsReached = false,
  } = options;

  const validUntested = deduplicateStreams(candidates).filter(
    (s) => !failedUrls.has(s.url)
  );
  if (validUntested.length === 0) return null;

  if (allowDirect && !maxDirectAttemptsReached) {
    const directCandidates = validUntested
      .filter((s) => {
        if (s.streamType !== 'direct') return false;
        if (!allowSelfDebrid && s.url.includes(':8081')) return false;
        return true;
      })
      .sort((a, b) => {
        const cachedDiff = (b.isCached ? 1 : 0) - (a.isCached ? 1 : 0);
        if (cachedDiff !== 0) return cachedDiff;
        return getBrowserPlayabilityScore(b) - getBrowserPlayabilityScore(a);
      });

    if (directCandidates.length > 0) {
      return directCandidates[0];
    }
  }

  const embedCandidates = sortStreamsForDisplay(
    validUntested.filter((s) => s.streamType === 'embed')
  );
  if (embedCandidates.length > 0) {
    const isSeriesImdbEmbed = embedCandidates.some((s) => /\/tv\/tt\d+/i.test(s.url));
    embedCandidates.sort((a, b) => {
      const rank = (u: string) => {
        if (isSeriesImdbEmbed) {
          return u.includes('vidsrc') ? 0 : u.includes('vidlink') ? 1 : 2;
        }
        return u.includes('vidlink') ? 0 : u.includes('vidsrc') ? 1 : 2;
      };
      return rank(a.url) - rank(b.url);
    });
    return embedCandidates[0];
  }

  const trailer = validUntested.find((s) => s.streamType === 'youtube');
  return trailer || null;
}
