export interface CastServerCandidate {
  name: string;
  kind?: string;
  src: string;
  quality?: string;
  group?: string;
}

export interface CastTargetResult {
  kind: 'direct' | 'embed-only';
  server: CastServerCandidate | null;
  url: string | null;
  contentType: string | null;
}

export interface ExternalPlayerLinks {
  vlcUrl: string | null;
  infuseUrl: string | null;
}

export function isPublicHttpStreamUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('/') || trimmed.startsWith('data:')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function inferCastContentType(rawUrl: string): string {
  const lower = String(rawUrl || '').toLowerCase().split('?')[0].split('#')[0];
  if (lower.endsWith('.m3u8') || lower.includes('.m3u8')) return 'application/x-mpegurl';
  if (lower.endsWith('.mpd') || lower.includes('.mpd')) return 'application/dash+xml';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

function qualityRank(quality?: string): number {
  const q = String(quality || '').toUpperCase();
  if (q.includes('4K') || q.includes('2160')) return 4;
  if (q.includes('1080')) return 3;
  if (q.includes('720')) return 2;
  if (q.includes('HD')) return 1;
  return 0;
}

/**
 * Selects the best TV/Chromecast/AirPlay-reachable direct stream URL.
 * Chromecasts cannot fetch browser `blob:` MediaSource URLs or `http://localhost:3000/api/s/...`
 * proxy paths, so we prefer direct public HTTPS HLS/MP4 servers (e.g. Vega/Sirius on s.fli.cx).
 */
export function pickCastableStreamSource(
  servers: CastServerCandidate[],
  currentServer?: CastServerCandidate | null
): CastTargetResult {
  if (
    currentServer &&
    currentServer.kind !== 'embed' &&
    isPublicHttpStreamUrl(currentServer.src)
  ) {
    const url = currentServer.src.trim();
    return {
      kind: 'direct',
      server: currentServer,
      url,
      contentType: inferCastContentType(url)
    };
  }

  const directPublic = (Array.isArray(servers) ? servers : [])
    .filter((s) => s && s.kind !== 'embed' && isPublicHttpStreamUrl(s.src))
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

  if (directPublic.length > 0) {
    const best = directPublic[0];
    const url = best.src.trim();
    return {
      kind: 'direct',
      server: best,
      url,
      contentType: inferCastContentType(url)
    };
  }

  return {
    kind: 'embed-only',
    server: currentServer || (Array.isArray(servers) && servers[0]) || null,
    url: null,
    contentType: null
  };
}

export function buildExternalPlayerLinks(streamUrl: string | null | undefined): ExternalPlayerLinks {
  if (!streamUrl || !isPublicHttpStreamUrl(streamUrl)) {
    return { vlcUrl: null, infuseUrl: null };
  }
  const clean = streamUrl.trim();
  return {
    vlcUrl: `vlc://${clean}`,
    infuseUrl: `infuse://x-callback-url/play?url=${encodeURIComponent(clean)}`
  };
}

export function parsePersonRouteToSearchQuery(pathname: string): string | null {
  const clean = String(pathname || '').split('?')[0].split('#')[0];
  const match = clean.match(/\/person\/(?:\d+-)?([a-z0-9-]+)\/?$/i);
  if (!match) return null;
  const words = match[1]
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(' ') : null;
}
