export type SpatialDirection = 'up' | 'down' | 'left' | 'right';

export interface SpatialRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SpatialCandidate {
  id: string;
  rect: SpatialRect;
  group?: string;
}

export interface NativeStreamServer {
  name: string;
  src: string;
  quality?: string;
  kind?: string;
  group?: string;
}

export interface NativePlaybackPayloadInput {
  origin: string;
  title: string;
  subtitle?: string;
  slug: string;
  imdbId: string;
  isShow: boolean;
  season?: number;
  episode?: number;
  resumeSeconds?: number;
  activeServerIndex?: number;
  servers: NativeStreamServer[];
}

export interface NativePlaybackPayload {
  title: string;
  subtitle: string;
  slug: string;
  imdbId: string;
  isShow: boolean;
  season: number;
  episode: number;
  resumeSeconds: number;
  activeServerIndex: number;
  servers: Array<{
    name: string;
    src: string;
    quality: string;
    group: string;
  }>;
}

/**
 * Detects whether the current runtime should enable Android TV / 10-foot D-pad mode.
 */
export function isTvModeEnvironment(params: {
  search?: string;
  userAgent?: string;
  platformFlag?: string;
  androidBridgeIsTv?: boolean;
}): boolean {
  if (params.androidBridgeIsTv) return true;
  const flag = String(params.platformFlag || '').toLowerCase();
  if (flag === 'android-tv' || flag === 'tvos' || flag === 'tv') return true;
  const search = String(params.search || '').toLowerCase();
  if (/[?&](android=tv|tv=1|mode=tv)\b/.test(search)) return true;
  const ua = String(params.userAgent || '');
  if (/\b(Android TV|GoogleTV|AFT[A-Z0-9]+|BRAVIA|SHIELD Android TV|MIBOX|SmartTV|Tizen|Web0S|CrKey)\b/i.test(ua)) {
    return true;
  }
  return false;
}

/**
 * Geometric 2D spatial focus finder tuned for Apple TV / Android TV rails and grids.
 * Prefers elements along the primary axis of movement and strongly favors items in the
 * same horizontal rail when moving left/right.
 */
export function findNextSpatialCandidate(
  currentId: string | null,
  currentRect: SpatialRect,
  candidates: SpatialCandidate[],
  direction: SpatialDirection,
  currentGroup?: string
): string | null {
  if (!candidates || candidates.length === 0) return null;

  const curCx = currentRect.left + currentRect.width / 2;
  const curCy = currentRect.top + currentRect.height / 2;

  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const cand of candidates) {
    if (!cand || cand.id === currentId) continue;
    const r = cand.rect;
    if (r.width <= 0 || r.height <= 0) continue;

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - curCx;
    const dy = cy - curCy;

    let primary = 0;
    let secondary = 0;

    if (direction === 'right') {
      if (dx <= 4) continue;
      primary = Math.max(0, r.left - currentRect.right) + dx * 0.35;
      secondary = Math.abs(dy);
    } else if (direction === 'left') {
      if (dx >= -4) continue;
      primary = Math.max(0, currentRect.left - r.right) + Math.abs(dx) * 0.35;
      secondary = Math.abs(dy);
    } else if (direction === 'down') {
      if (dy <= 4) continue;
      primary = Math.max(0, r.top - currentRect.bottom) + dy * 0.35;
      secondary = Math.abs(dx);
    } else {
      if (dy >= -4) continue;
      primary = Math.max(0, currentRect.top - r.bottom) + Math.abs(dy) * 0.35;
      secondary = Math.abs(dx);
    }

    // Penalize cross-axis drift so Left/Right stays inside the active rail whenever possible
    const crossAxisWeight = direction === 'left' || direction === 'right' ? 4.2 : 1.85;
    let score = primary + secondary * crossAxisWeight;

    // Slight bonus for staying in the same horizontal rail on Left/Right
    if (
      (direction === 'left' || direction === 'right') &&
      currentGroup &&
      cand.group &&
      currentGroup === cand.group
    ) {
      score *= 0.65;
    }

    // Slight penalty for jumping vertically within the exact same horizontal rail
    if (
      (direction === 'up' || direction === 'down') &&
      currentGroup &&
      cand.group &&
      currentGroup === cand.group &&
      Math.abs(dy) < Math.max(currentRect.height * 0.6, 24)
    ) {
      continue;
    }

    if (score < bestScore) {
      bestScore = score;
      bestId = cand.id;
    }
  }

  return bestId;
}

/**
 * Resolves a stream URL to an absolute HTTP(S) URL for Android Media3 ExoPlayer,
 * filtering out iframe embed fallbacks so native ExoPlayer only receives direct HLS streams.
 */
export function buildNativePlaybackPayload(input: NativePlaybackPayloadInput): NativePlaybackPayload | null {
  const cleanOrigin = String(input.origin || '').replace(/\/+$/, '');
  const hlsServers: NativePlaybackPayload['servers'] = [];

  for (const srv of Array.isArray(input.servers) ? input.servers : []) {
    if (!srv || !srv.src || srv.kind === 'embed') continue;
    const raw = String(srv.src).trim();
    if (!raw) continue;
    const resolvedSrc = raw.startsWith('/')
      ? cleanOrigin
        ? `${cleanOrigin}${raw}`
        : raw
      : raw;
    if (!/^https?:\/\//i.test(resolvedSrc)) continue;
    hlsServers.push({
      name: srv.name === 'Flicx' ? 'Kaira' : String(srv.name || 'Kaira'),
      src: resolvedSrc,
      quality: String(srv.quality || 'HD'),
      group: String(srv.group || 'external'),
    });
  }

  if (hlsServers.length === 0) return null;

  const rawIdx = Number(input.activeServerIndex);
  const safeIdx =
    Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < hlsServers.length ? rawIdx : 0;

  return {
    title: String(input.title || 'Kaira'),
    subtitle: String(input.subtitle || ''),
    slug: String(input.slug || ''),
    imdbId: String(input.imdbId || ''),
    isShow: Boolean(input.isShow),
    season: Math.max(1, Number(input.season) || 1),
    episode: Math.max(1, Number(input.episode) || 1),
    resumeSeconds: Math.max(0, Math.floor(Number(input.resumeSeconds) || 0)),
    activeServerIndex: safeIdx,
    servers: hlsServers,
  };
}
