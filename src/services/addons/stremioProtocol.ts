import { AddonManifest, AddonStream, StremioResourceDescriptor } from '../../types/addons';

const KNOWN_EMBED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)vidsrc\./i,
  /(^|\.)vidlink\./i,
  /(^|\.)vidapi\./i,
  /(^|\.)vaplayer\./i,
  /(^|\.)2embed\./i,
  /(^|\.)multiembed\./i,
  /(^|\.)autoembed\./i,
  /(^|\.)embedsu\./i,
  /(^|\.)smashy/i,
  /(^|\.)moviesapi\./i,
  /(^|\.)player\.videasy\./i,
];

/**
 * Normalizes user-supplied Stremio / Nuvio manifest URLs:
 * - Converts `stremio://` protocol links to `https://`
 * - Preserves configured JSON / base64 path segments before `/manifest.json`
 * - Appends `/manifest.json` if omitted
 * - Validates HTTP(S) protocol
 */
export function normalizeAddonManifestUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Please enter a Stremio addon manifest URL');
  }

  let candidate = trimmed;
  if (/^stremio:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^stremio:\/\//i, 'https://');
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Invalid manifest URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Addon URL must use https://, http://, or stremio://');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  if (!/\/manifest\.json$/i.test(normalizedPath)) {
    parsed.pathname = `${normalizedPath}/manifest.json`;
  } else {
    parsed.pathname = normalizedPath;
  }

  return parsed.toString();
}

/**
 * Checks whether a Stremio v3 manifest supports a given resource (e.g. 'stream'),
 * handling both string entries ("stream") and object descriptors
 * ({ name: "stream", types: ["movie", "series"], idPrefixes: ["tt"] }).
 */
export function manifestSupportsResource(
  manifest: Pick<AddonManifest, 'resources' | 'types' | 'idPrefixes'> | undefined,
  resourceName: string,
  mediaType?: string,
  mediaId?: string
): boolean {
  if (!manifest || !Array.isArray(manifest.resources)) return false;

  const target = resourceName.toLowerCase();

  for (const entry of manifest.resources as StremioResourceDescriptor[]) {
    if (typeof entry === 'string') {
      if (entry.toLowerCase() !== target) continue;
      if (mediaType && Array.isArray(manifest.types) && manifest.types.length > 0) {
        if (!manifest.types.includes(mediaType)) continue;
      }
      if (mediaId && Array.isArray(manifest.idPrefixes) && manifest.idPrefixes.length > 0) {
        if (!manifest.idPrefixes.some((prefix) => mediaId.startsWith(prefix))) continue;
      }
      return true;
    }

    if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
      if (entry.name.toLowerCase() !== target) continue;

      const allowedTypes =
        Array.isArray(entry.types) && entry.types.length > 0 ? entry.types : manifest.types;
      if (mediaType && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
        if (!allowedTypes.includes(mediaType)) continue;
      }

      const allowedPrefixes =
        Array.isArray(entry.idPrefixes) && entry.idPrefixes.length > 0
          ? entry.idPrefixes
          : manifest.idPrefixes;
      if (mediaId && Array.isArray(allowedPrefixes) && allowedPrefixes.length > 0) {
        if (!allowedPrefixes.some((prefix) => mediaId.startsWith(prefix))) continue;
      }

      return true;
    }
  }

  return false;
}

/**
 * Produces concise capability tags for displaying installed addons in Settings.
 */
export function getManifestResourceLabels(manifest: AddonManifest | undefined): string[] {
  if (!manifest || !Array.isArray(manifest.resources)) return [];
  const names = new Set<string>();

  for (const entry of manifest.resources) {
    const rawName = typeof entry === 'string' ? entry : entry?.name;
    if (!rawName) continue;
    const lower = rawName.toLowerCase();
    if (lower === 'stream') names.add('Direct Streams');
    else if (lower === 'subtitles') names.add('Subtitles');
    else if (lower === 'catalog') names.add('Catalogs');
    else if (lower === 'meta') names.add('Metadata');
  }

  return Array.from(names);
}

/**
 * Extracts Stremio `behaviorHints.proxyHeaders.request` (or flat string headers).
 */
export function extractProxyHeaders(raw: any): Record<string, string> | undefined {
  const hints = raw?.behaviorHints?.proxyHeaders;
  if (!hints || typeof hints !== 'object') return undefined;

  const source =
    hints.request && typeof hints.request === 'object' && !Array.isArray(hints.request)
      ? hints.request
      : hints;

  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      cleaned[key] = value.trim();
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/**
 * Heuristic detector for HLS playlists, including extensionless Stremio proxy routes.
 */
export function isLikelyHlsUrl(url: string, behaviorHints?: any): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8') || lower.includes('mpegurl')) return true;
  if (/\/hls(\/|\?|$)/i.test(lower)) return true;
  if (/[?&](format|type|stream)=(hls|m3u8)\b/i.test(lower)) return true;
  const filename = typeof behaviorHints?.filename === 'string' ? behaviorHints.filename.toLowerCase() : '';
  if (filename.endsWith('.m3u8')) return true;
  return false;
}

/**
 * Detects third-party iframe web embed URLs so they are routed to EmbedDriver
 * while all direct HTTP/HLS Stremio stream URLs are routed to NativeDriver (Kaira Player).
 */
export function isKnownEmbedUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (KNOWN_EMBED_HOST_PATTERNS.some((re) => re.test(host))) {
      return true;
    }
    if (/\/embed\//i.test(parsed.pathname)) {
      return true;
    }
    return false;
  } catch {
    return /\/embed\//i.test(url);
  }
}

export interface ClassifiedStremioStream {
  streamType: 'direct' | 'embed' | 'youtube';
  url: string;
  isHls: boolean;
  proxyHeaders?: Record<string, string>;
}

/**
 * Classifies a raw Stremio stream object into Kaira's player driver taxonomy:
 * - `ytId` or YouTube links -> 'youtube'
 * - Known web embed players -> 'embed'
 * - Any HTTP(S) `stream.url` (even extensionless proxy/redirect URLs) -> 'direct' (Kaira Player)
 * - `externalUrl`-only / empty notices -> null (filtered out)
 */
export function classifyStremioStream(raw: any): ClassifiedStremioStream | null {
  if (!raw || typeof raw !== 'object') return null;

  if (typeof raw.ytId === 'string' && raw.ytId.trim()) {
    return {
      streamType: 'youtube',
      url: `https://www.youtube.com/embed/${encodeURIComponent(raw.ytId.trim())}?autoplay=1&enablejsapi=1`,
      isHls: false,
    };
  }

  if (typeof raw.url === 'string' && raw.url.trim()) {
    const trimmed = raw.url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return null;
    }

    if (/youtube\.com|youtu\.be/i.test(trimmed)) {
      return {
        streamType: 'youtube',
        url: trimmed,
        isHls: false,
      };
    }

    if (isKnownEmbedUrl(trimmed)) {
      return {
        streamType: 'embed',
        url: trimmed,
        isHls: false,
      };
    }

    const proxyHeaders = extractProxyHeaders(raw);
    return {
      streamType: 'direct',
      url: trimmed,
      isHls: isLikelyHlsUrl(trimmed, raw.behaviorHints),
      proxyHeaders,
    };
  }

  return null;
}

/**
 * Builds Kaira's local dev-server stream proxy URL for direct HTTP/HLS streams that
 * require custom Stremio `proxyHeaders` or hit browser CORS blocks.
 */
export function buildStreamProxyUrl(url: string, proxyHeaders?: Record<string, string>): string {
  if (!url) return url;
  if (url.startsWith('/api/stream-proxy')) return url;

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    ) {
      return url;
    }
  } catch {
    return url;
  }

  const params = new URLSearchParams();
  params.set('url', url);
  if (proxyHeaders && Object.keys(proxyHeaders).length > 0) {
    params.set('headers', JSON.stringify(proxyHeaders));
  }
  return `/api/stream-proxy?${params.toString()}`;
}

/**
 * Sorts streams for UI display so native Kaira Player (`direct`) sources always appear
 * above third-party `embed` mirrors and trailers.
 */
export function sortStreamsForDisplay(streams: AddonStream[]): AddonStream[] {
  const rankType = (streamType?: AddonStream['streamType']): number => {
    if (streamType === 'direct') return 0;
    if (streamType === 'embed') return 1;
    if (streamType === 'youtube') return 2;
    return 3;
  };

  const rankQuality = (quality?: AddonStream['quality']): number => {
    if (quality === '4K' || quality === 'HDR') return 0;
    if (quality === '1080p') return 1;
    if (quality === '720p') return 2;
    return 3;
  };

  return [...streams].sort((a, b) => {
    const typeDiff = rankType(a.streamType) - rankType(b.streamType);
    if (typeDiff !== 0) return typeDiff;

    const cachedDiff = (b.isCached ? 1 : 0) - (a.isCached ? 1 : 0);
    if (cachedDiff !== 0) return cachedDiff;

    return rankQuality(a.quality) - rankQuality(b.quality);
  });
}

/**
 * Human-readable player engine label for source lists.
 */
export function getStreamPlayerBadge(streamType?: AddonStream['streamType']): {
  label: string;
  tone: 'native' | 'embed' | 'trailer';
} {
  if (streamType === 'embed') {
    return { label: 'Web Embed', tone: 'embed' };
  }
  if (streamType === 'youtube') {
    return { label: 'Trailer', tone: 'trailer' };
  }
  return { label: 'Kaira Player', tone: 'native' };
}

const PROGRESSIVE_VIDEO_EXT_RE = /\.(mp4|m4v|mkv|webm|mov|avi)(\?|$|#)/i;

/**
 * Returns true when a stream URL or filename clearly points to a progressive video file
 * (MP4, MKV, WebM, MOV, AVI) rather than an HLS playlist.
 */
export function isProgressiveVideoUrl(url: string, filename?: string): boolean {
  if (url && PROGRESSIVE_VIDEO_EXT_RE.test(url)) return true;
  if (filename && PROGRESSIVE_VIDEO_EXT_RE.test(filename)) return true;
  if (url && /\/resolve\/(realdebrid|alldebrid|torbox|premiumize|debridlink|offcloud)\//i.test(url)) {
    return true;
  }
  return false;
}

/**
 * Detects whether an installed addon entry represents Torrentio
 * (accounting for both legacy 'com.stremio.torrentio' and official 'com.stremio.torrentio.addon').
 */
export function isTorrentioAddon(addon: {
  id?: string;
  manifestUrl?: string;
  manifest?: { id?: string; name?: string };
}): boolean {
  const id = (addon.id || '').toLowerCase();
  const manifestId = (addon.manifest?.id || '').toLowerCase();
  const url = (addon.manifestUrl || '').toLowerCase();
  return (
    id === 'torrentio' ||
    id === 'com.stremio.torrentio' ||
    id === 'com.stremio.torrentio.addon' ||
    manifestId === 'com.stremio.torrentio' ||
    manifestId === 'com.stremio.torrentio.addon' ||
    url.includes('torrentio.strem.fun')
  );
}

/**
 * Checks whether a Torrentio manifest URL already includes a Debrid provider token in its path.
 */
export function torrentioManifestHasDebrid(manifestUrl: string): boolean {
  if (!manifestUrl) return false;
  return /(realdebrid|alldebrid|torbox|premiumize|debridlink|offcloud|easydebrid|putio)=[^/|]+/i.test(
    manifestUrl
  );
}

/**
 * Detects Torrentio error/notice pseudo-streams (e.g. "Invalid RealDebrid ApiKey/Token!",
 * /videos/failed_access_v3.mp4) so Kaira never mistakes an error notice for a playable movie.
 */
export function isTorrentioErrorStream(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const combined = `${raw.name || ''} ${raw.title || ''} ${raw.description || ''}`.toLowerCase();
  const url = String(raw.url || '').toLowerCase();

  if (url.includes('torrentio.strem.fun/videos/')) return true;
  if (/\b(rd|ad|tb|pm|dl|debrid)\s+error\b/i.test(combined)) return true;
  if (/invalid\s+\w*\s*(apikey|api\s*key|token)/i.test(combined)) return true;
  if (/access\s+denied|expired\s+subscription|not\s+cached/i.test(combined) && url.includes('torrentio.strem.fun')) {
    return true;
  }
  return false;
}

/**
 * Scores how reliably a direct HTTP stream will decode in a browser's HTML5 <video> / hls.js engine.
 * Favors MP4, HLS (.m3u8), WebM, H.264/AVC, and AAC over huge Remux MKVs with DTS/TrueHD/DV
 * that frequently trigger FFmpegDemuxer failures in Chromium.
 */
export function getBrowserPlayabilityScore(stream: Pick<AddonStream, 'url' | 'title' | 'name' | 'description' | 'audio' | 'isHls' | 'behaviorHints'>): number {
  const filename = typeof stream.behaviorHints?.filename === 'string' ? stream.behaviorHints.filename : '';
  const combined = `${stream.url || ''} ${filename} ${stream.name || ''} ${stream.title || ''} ${stream.description || ''} ${stream.audio || ''}`.toUpperCase();

  let score = 0;

  // Container compatibility
  if (stream.isHls || /\.M3U8(\?|$|#)/i.test(stream.url || '')) {
    score += 450;
  } else if (/\.MP4(\?|$|#|\s)/i.test(combined) || /\.WEBM(\?|$|#|\s)/i.test(combined)) {
    score += 400;
  } else if (/\.AVI(\?|$|#|\s)/i.test(combined)) {
    score -= 900;
  } else if (/\.MKV(\?|$|#|\s)/i.test(combined)) {
    score -= 180;
  }

  // Video codec & profile compatibility
  if (/\b(REMUX|BDREMUX)\b/.test(combined)) {
    score -= 450;
  }
  if (/\b(DV|DOLBY\s*VISION)\b/.test(combined) && !/\bHDR\b/.test(combined)) {
    score -= 300;
  }
  if (/\b(X264|H\.?264|AVC)\b/.test(combined)) {
    score += 180;
  }
  if (/\b(WEB-DL|WEBRIP|YTS|YIFY)\b/.test(combined)) {
    score += 120;
  }

  // Browser audio codec compatibility (browsers decode AAC/Opus/MP3 natively; TrueHD/DTS often fail or go silent)
  if (/\b(AAC|OPUS|MP3)\b/.test(combined)) {
    score += 160;
  }
  if (/\b(TRUEHD|DTS-HD|DTS-X|DTS)\b/.test(combined)) {
    score -= 350;
  }

  return score;
}

/**
 * Converts cryptic Chromium/FFmpeg demuxer errors into clear, actionable guidance for users.
 */
export function formatPlayerErrorMessage(rawError: string | undefined, streamUrl?: string): string {
  const msg = (rawError || '').trim();
  const isSelfDebrid = Boolean(streamUrl && streamUrl.includes(':8081'));

  if (isSelfDebrid) {
    return 'Could not open this stream from Self-Debrid (:8081). Make sure your local Self-Debrid server is running and reachable, or pick another source below.';
  }

  if (/DEMUXER_ERROR|FFmpegDemuxer|MEDIA_ERR_SRC_NOT_SUPPORTED|NotSupportedError/i.test(msg)) {
    return 'This stream format could not be opened in the browser (often an incompatible MKV/audio codec, expired Debrid link, or blocked host). Try an MP4 / WEB-DL source in Sources or use Backup Mirror.';
  }

  if (/MEDIA_ERR_NETWORK|NETWORK_ERROR|Failed to fetch/i.test(msg)) {
    return 'Network error while loading this video stream. Try again, pick another source, or switch to Backup Mirror.';
  }

  return msg || 'Could not connect to this video source. Try retrying or choosing another mirror.';
}

