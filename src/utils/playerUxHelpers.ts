export type VolumeIconTier = 'muted' | 'low' | 'high';
export type TapZone = 'left' | 'center' | 'right';

export interface VolumeToggleResult {
  volume: number;
  muted: boolean;
  lastNonZeroVolume: number;
}

export interface DoubleTapState {
  lastTapTime: number;
  lastTapZone: TapZone | null;
  activeBurstZone: 'left' | 'right' | null;
  accumulatedSeconds: number;
}

export interface ProcessTapInput {
  zone: TapZone;
  nowMs: number;
  doubleTapMs?: number;
  chainMs?: number;
  stepSeconds?: number;
}

export interface ProcessTapResult {
  nextState: DoubleTapState;
  action: 'single-pending' | 'seek';
  direction?: 'left' | 'right';
  deltaSeconds?: number;
  accumulatedSeconds?: number;
}

export interface RawSubtitleTrack {
  language: string;
  src: string;
  sdh?: boolean;
  source?: string;
  downloads?: number;
}

export interface DeduplicatedSubtitleOption {
  id: string;
  language: string;
  label: string;
  src: string | null;
  candidates: string[];
  sdh?: boolean;
  source?: string;
}

export interface UpNextCheckInput {
  isShow: boolean;
  isAnime?: boolean;
  currentTime: number;
  duration: number;
  dismissed: boolean;
  thresholdSeconds?: number;
}

export interface NextEpisodeRouteResult {
  url: string;
  label: string;
  shortLabel: string;
  nextSeason: number;
  nextEpisode: number;
}

const ISO3_TO_2: Record<string, string> = {
  eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it',
  por: 'pt', pob: 'pt-BR', pb: 'pt-BR', rus: 'ru', jpn: 'ja', kor: 'ko',
  chi: 'zh', zho: 'zh', ara: 'ar', hin: 'hi', dut: 'nl', nld: 'nl', pol: 'pl',
  tur: 'tr', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', cze: 'cs', ces: 'cs',
  gre: 'el', ell: 'el', heb: 'he', hun: 'hu', ind: 'id', rum: 'ro', ron: 'ro',
  tha: 'th', ukr: 'uk', vie: 'vi', bul: 'bg', hrv: 'hr', srp: 'sr', slk: 'sk',
  per: 'fa', fas: 'fa', may: 'ms', msa: 'ms', ben: 'bn', mal: 'ml', tam: 'ta',
  tel: 'te', urd: 'ur', fil: 'tl', tgl: 'tl',
};

const SUBTITLE_LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', 'pt-BR': 'Portuguese (Brazil)', 'pt-br': 'Portuguese (Brazil)',
  ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
  hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
  no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech', el: 'Greek',
  he: 'Hebrew', hu: 'Hungarian', id: 'Indonesian', ro: 'Romanian', th: 'Thai',
  uk: 'Ukrainian', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian',
  sr: 'Serbian', sk: 'Slovak', fa: 'Persian', ms: 'Malay', bn: 'Bengali',
  ml: 'Malayalam', ta: 'Tamil', te: 'Telugu', ur: 'Urdu', tl: 'Tagalog',
};

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

export function getVolumeIconTier(volume: number, muted: boolean): VolumeIconTier {
  const safeVol = clampVolume(volume);
  if (muted || safeVol <= 0.001) return 'muted';
  if (safeVol <= 0.5) return 'low';
  return 'high';
}

export function getVolumePercent(volume: number, muted: boolean): number {
  if (muted) return 0;
  return Math.round(clampVolume(volume) * 100);
}

export function toggleMuteState(
  volume: number,
  muted: boolean,
  lastNonZeroVolume = 0.8
): VolumeToggleResult {
  const safeVol = clampVolume(volume);
  const safeLast = clampVolume(lastNonZeroVolume > 0.05 ? lastNonZeroVolume : 0.8);
  const currentlyMuted = muted || safeVol <= 0.001;

  if (currentlyMuted) {
    const restored = safeVol > 0.001 ? safeVol : safeLast;
    return {
      volume: restored,
      muted: false,
      lastNonZeroVolume: restored,
    };
  }

  return {
    volume: safeVol,
    muted: true,
    lastNonZeroVolume: safeVol,
  };
}

export function classifyTapZone(clientX: number, rectLeft: number, rectWidth: number): TapZone {
  if (!Number.isFinite(rectWidth) || rectWidth <= 0) return 'center';
  const ratio = (clientX - rectLeft) / rectWidth;
  if (ratio <= 0.35) return 'left';
  if (ratio >= 0.65) return 'right';
  return 'center';
}

export function createDoubleTapState(): DoubleTapState {
  return {
    lastTapTime: 0,
    lastTapZone: null,
    activeBurstZone: null,
    accumulatedSeconds: 0,
  };
}

export function processStageTap(
  state: DoubleTapState,
  input: ProcessTapInput
): ProcessTapResult {
  const doubleTapMs = input.doubleTapMs ?? 260;
  const chainMs = input.chainMs ?? 650;
  const stepSeconds = input.stepSeconds ?? 10;
  const elapsed = input.nowMs - state.lastTapTime;

  if (input.zone === 'center') {
    return {
      nextState: {
        lastTapTime: input.nowMs,
        lastTapZone: 'center',
        activeBurstZone: null,
        accumulatedSeconds: 0,
      },
      action: 'single-pending',
    };
  }

  // Case 1: Active seek burst on the SAME side within chainMs -> stack +10s
  if (state.activeBurstZone === input.zone && elapsed >= 0 && elapsed <= chainMs) {
    const accumulatedSeconds = state.accumulatedSeconds + stepSeconds;
    return {
      nextState: {
        lastTapTime: input.nowMs,
        lastTapZone: input.zone,
        activeBurstZone: input.zone,
        accumulatedSeconds,
      },
      action: 'seek',
      direction: input.zone,
      deltaSeconds: input.zone === 'left' ? -stepSeconds : stepSeconds,
      accumulatedSeconds,
    };
  }

  // Case 2: Second rapid tap on the SAME side within doubleTapMs -> start seek burst
  if (state.lastTapZone === input.zone && elapsed >= 0 && elapsed <= doubleTapMs) {
    return {
      nextState: {
        lastTapTime: input.nowMs,
        lastTapZone: input.zone,
        activeBurstZone: input.zone,
        accumulatedSeconds: stepSeconds,
      },
      action: 'seek',
      direction: input.zone,
      deltaSeconds: input.zone === 'left' ? -stepSeconds : stepSeconds,
      accumulatedSeconds: stepSeconds,
    };
  }

  // Case 3: First tap on this side (or direction switched / previous burst expired)
  return {
    nextState: {
      lastTapTime: input.nowMs,
      lastTapZone: input.zone,
      activeBurstZone: null,
      accumulatedSeconds: 0,
    },
    action: 'single-pending',
  };
}

export function clampSeekTime(
  currentTime: number,
  deltaSeconds: number,
  duration: number
): number {
  const base = Number.isFinite(currentTime) ? currentTime : 0;
  const next = base + deltaSeconds;
  const maxDur = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(maxDur, next));
}

export function shouldCancelHoldOnMove(
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  thresholdPx = 12
): boolean {
  const dx = curX - startX;
  const dy = curY - startY;
  return dx * dx + dy * dy > thresholdPx * thresholdPx;
}

export function normalizeSubtitleLangCode(raw: string): string {
  const cleaned = String(raw || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (ISO3_TO_2[cleaned]) return ISO3_TO_2[cleaned];
  if (cleaned === 'pt-br' || cleaned === 'pt_br') return 'pt-BR';
  return cleaned.slice(0, 2);
}

export function formatSubtitleLanguageLabel(code: string, sdh = false): string {
  const clean = String(code || '').trim();
  const base =
    SUBTITLE_LANG_NAMES[clean] ||
    SUBTITLE_LANG_NAMES[clean.toLowerCase()] ||
    clean.toUpperCase() ||
    'Unknown';
  return sdh ? `${base} CC` : base;
}

/**
 * Builds an OpenSubtitles REST API URL with strictly alphabetical path segments
 * (required by rest.opensubtitles.org).
 */
export function buildOpenSubtitlesRestUrl(params: {
  imdbId?: string;
  query?: string;
  isShow?: boolean;
  season?: number;
  episode?: number;
}): string | null {
  const segments: Array<[string, string]> = [];
  const cleanImdb = String(params.imdbId || '').trim();
  const imdbDigits = /^tt(\d+)$/i.exec(cleanImdb)?.[1];
  const cleanQuery = String(params.query || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (imdbDigits) {
    segments.push(['imdbid', imdbDigits]);
  } else if (cleanQuery) {
    segments.push(['query', encodeURIComponent(cleanQuery.toLowerCase())]);
  } else {
    return null;
  }

  if (params.isShow) {
    const s = Math.max(1, Math.floor(Number(params.season) || 1));
    const e = Math.max(1, Math.floor(Number(params.episode) || 1));
    segments.push(['episode', String(e)]);
    segments.push(['season', String(s)]);
  }

  segments.sort((a, b) => a[0].localeCompare(b[0]));
  return `https://rest.opensubtitles.org/search/${segments.map(([k, v]) => `${k}-${v}`).join('/')}`;
}

/**
 * Normalizes raw entries from rest.opensubtitles.org, sorts by download count desc,
 * and maps each IDSubtitleFile to a direct CORS-safe UTF-8 .srt stream URL.
 */
export function normalizeOpenSubtitlesRestEntries(entries: unknown): RawSubtitleTrack[] {
  if (!Array.isArray(entries)) return [];
  const parsed: RawSubtitleTrack[] = [];

  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const fileId = String(rec.IDSubtitleFile || '').trim();
    if (!/^\d+$/.test(fileId)) continue;

    const format = String(rec.SubFormat || 'srt').toLowerCase();
    if (format && format !== 'srt' && format !== 'vtt' && format !== 'sub') continue;

    const rawLang = String(rec.SubLanguageID || rec.ISO639 || '').trim();
    const lang = normalizeSubtitleLangCode(rawLang);
    if (!lang) continue;

    const downloads = Number(rec.SubDownloadsCnt) || 0;
    const sdh =
      rec.SubHearingImpaired === '1' ||
      rec.SubHearingImpaired === 1 ||
      /\b(sdh|cc|hi)\b/i.test(String(rec.SubFileName || ''));

    parsed.push({
      language: lang,
      src: `https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${fileId}`,
      sdh,
      source: 'OpenSubtitles',
      downloads,
    });
  }

  parsed.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  return parsed;
}

export function deduplicateSubtitleTracksWithFailover(
  rawTracks: RawSubtitleTrack[],
  maxCandidates = 3
): DeduplicatedSubtitleOption[] {
  const valid = (Array.isArray(rawTracks) ? rawTracks : []).filter(
    (t) => t && typeof t.src === 'string' && t.src.trim() && t.language
  );
  const byKey = new Map<string, DeduplicatedSubtitleOption>();

  for (const t of valid) {
    const lang = normalizeSubtitleLangCode(t.language) || String(t.language).trim();
    const isSdh = Boolean(t.sdh);
    const key = lang.toLowerCase() === 'en' ? `en:${isSdh ? 'cc' : 'std'}` : lang.toLowerCase();
    const cleanSrc = String(t.src).trim();
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        id: `${key}:${byKey.size}`,
        language: lang,
        label: formatSubtitleLanguageLabel(lang, lang.toLowerCase() === 'en' ? isSdh : false),
        src: cleanSrc,
        candidates: [cleanSrc],
        sdh: isSdh,
        source: t.source || 'OpenSubtitles',
      });
    } else if (
      existing.candidates.length < maxCandidates &&
      !existing.candidates.includes(cleanSrc)
    ) {
      existing.candidates.push(cleanSrc);
    }
  }

  const sorted = Array.from(byKey.values()).sort((a, b) => {
    const aEn = a.language.toLowerCase().startsWith('en') ? 0 : 1;
    const bEn = b.language.toLowerCase().startsWith('en') ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    if (aEn === 0 && bEn === 0 && Boolean(a.sdh) !== Boolean(b.sdh)) {
      return a.sdh ? 1 : -1;
    }
    return a.label.localeCompare(b.label);
  });

  const autoTrack = sorted.find((t) => t.language.toLowerCase().startsWith('en')) || sorted[0] || null;
  return [
    { id: 'off', language: 'off', label: 'Off', src: null, candidates: [] },
    {
      id: 'auto',
      language: autoTrack ? autoTrack.language : 'en',
      label: 'Auto',
      src: autoTrack ? autoTrack.src : null,
      candidates: autoTrack ? [...autoTrack.candidates] : [],
      source: autoTrack?.source,
    },
    ...sorted,
  ];
}

export function pickPreferredSubtitleOption(
  options: DeduplicatedSubtitleOption[],
  preferredLang: string | null | undefined
): DeduplicatedSubtitleOption | null {
  const pref = String(preferredLang || '').trim().toLowerCase();
  if (!pref || pref === 'off') return null;
  if (!Array.isArray(options) || options.length === 0) return null;

  if (pref === 'auto') {
    const autoOpt = options.find((o) => o.id === 'auto' && o.src);
    return autoOpt || null;
  }

  const exact = options.find(
    (o) => o.id !== 'off' && o.id !== 'auto' && o.language.toLowerCase() === pref && o.src
  );
  if (exact) return exact;

  const prefixMatch = options.find(
    (o) =>
      o.id !== 'off' &&
      o.id !== 'auto' &&
      o.language.toLowerCase().startsWith(pref.slice(0, 2)) &&
      o.src
  );
  return prefixMatch || null;
}

export function shouldShowUpNextCard(input: UpNextCheckInput): boolean {
  if (!input.isShow && !input.isAnime) return false;
  if (input.dismissed) return false;
  if (!Number.isFinite(input.duration) || input.duration < 45) return false;
  if (!Number.isFinite(input.currentTime) || input.currentTime < 10) return false;
  const threshold = input.thresholdSeconds ?? 25;
  const remaining = input.duration - input.currentTime;
  return remaining <= threshold && remaining >= -1;
}

export function buildNextEpisodeRoute(params: {
  slug: string;
  isAnime?: boolean;
  season: number;
  episode: number;
  basePath?: string;
}): NextEpisodeRouteResult {
  const safeSlug = encodeURIComponent(String(params.slug || '').trim());
  const nextSeason = Math.max(1, Math.floor(Number(params.season) || 1));
  const nextEpisode = Math.max(1, Math.floor(Number(params.episode) || 1)) + 1;
  const cleanBase = String(params.basePath || '/').replace(/\/$/, '');
  const prefix = cleanBase === '/' ? '' : cleanBase;

  if (params.isAnime) {
    return {
      url: `${prefix}/watch/anime/${safeSlug}/${nextEpisode}`,
      label: `Episode ${nextEpisode}`,
      shortLabel: `EP ${nextEpisode}`,
      nextSeason: 1,
      nextEpisode,
    };
  }

  return {
    url: `${prefix}/watch/${safeSlug}/s${nextSeason}e${nextEpisode}`,
    label: `Season ${nextSeason} · Episode ${nextEpisode}`,
    shortLabel: `S${nextSeason}E${nextEpisode}`,
    nextSeason,
    nextEpisode,
  };
}
