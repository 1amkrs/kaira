export interface RawSubtitleTrack {
  language?: string;
  src?: string;
  format?: string;
  sdh?: boolean;
  label?: string;
}

export interface AppleTvSubtitleOption {
  id: string;
  language: string;
  label: string;
  src: string | null;
  sdh?: boolean;
}

export interface AppleTvChapter {
  index: number;
  title: string;
  startSeconds: number;
  timeLabel: string;
}

const SUBTITLE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English (US)',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  ar: 'Arabic',
  bg: 'Bulgarian',
  bn: 'Bengali',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  es: 'Spanish',
  'es-419': 'Spanish (Latin America)',
  'es-ES': 'Spanish (Spain)',
  et: 'Estonian',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  id: 'Indonesian',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  lv: 'Latvian',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  ms: 'Malay',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  'pt-BR': 'Portuguese (Brazil)',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sq: 'Albanian',
  sr: 'Serbian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese, Simplified',
  'zh-Hans': 'Chinese, Simplified',
  'zh-Hant': 'Chinese, Traditional',
  yue: 'Cantonese, Traditional',
};

export function formatAppleTvTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatAppleTvRemaining(currentSeconds: number, durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return '-0:00';
  const safeCurrent = Number.isFinite(currentSeconds) && currentSeconds > 0 ? currentSeconds : 0;
  const remaining = Math.max(0, durationSeconds - safeCurrent);
  return `-${formatAppleTvTime(remaining)}`;
}

export function computeFloatingTimePercent(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const safeCurrent = Number.isFinite(currentSeconds) ? Math.max(0, Math.min(durationSeconds, currentSeconds)) : 0;
  const rawPct = (safeCurrent / durationSeconds) * 100;
  return Math.max(2, Math.min(86, rawPct));
}

export function formatSubtitleLanguageLabel(code: string, sdh = false): string {
  const cleanCode = String(code || '').trim();
  const base =
    SUBTITLE_LANGUAGE_NAMES[cleanCode] ||
    SUBTITLE_LANGUAGE_NAMES[cleanCode.toLowerCase()] ||
    cleanCode.toUpperCase() ||
    'Unknown';
  return sdh ? `${base} CC` : base;
}

export function deduplicateSubtitleTracks(rawTracks: RawSubtitleTrack[]): AppleTvSubtitleOption[] {
  const validTracks = (Array.isArray(rawTracks) ? rawTracks : []).filter(
    (t) => t && typeof t.src === 'string' && t.src.trim().length > 0 && typeof t.language === 'string' && t.language.trim().length > 0
  );

  // Pick one clean track per (language, sdh) key — preferring English CC + standard tracks
  const byKey = new Map<string, AppleTvSubtitleOption>();
  for (const track of validTracks) {
    const lang = String(track.language).trim();
    const isSdh = Boolean(track.sdh);
    const key = lang.toLowerCase() === 'en' ? `en:${isSdh ? 'cc' : 'std'}` : lang.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: `${key}:${byKey.size}`,
        language: lang,
        label: formatSubtitleLanguageLabel(lang, lang.toLowerCase() === 'en' ? isSdh : false),
        src: String(track.src).trim(),
        sdh: isSdh,
      });
    }
  }

  const languageItems = Array.from(byKey.values()).sort((a, b) => {
    const aEn = a.language.toLowerCase().startsWith('en') ? 0 : 1;
    const bEn = b.language.toLowerCase().startsWith('en') ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    if (aEn === 0 && bEn === 0) {
      // Put English (US) CC first just like Apple TV
      if (a.sdh !== b.sdh) return a.sdh ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  const autoTrack = languageItems.find((t) => t.language.toLowerCase().startsWith('en')) || languageItems[0] || null;

  return [
    { id: 'off', language: 'off', label: 'Off', src: null },
    { id: 'auto', language: autoTrack?.language || 'en', label: 'Auto', src: autoTrack?.src || null },
    ...languageItems,
  ];
}

export function buildAppleTvChapters(durationSeconds: number, isShow = false): AppleTvChapter[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 60) return [];
  const labels = isShow
    ? ['Cold Open', 'Opening Credits', 'Act I', 'Act II', 'Climax', 'Ending']
    : ['Opening', 'Act I', 'Rising Action', 'Midpoint', 'Act II', 'Climax', 'Finale'];
  const count = durationSeconds < 1800 ? 4 : labels.length;
  const chosenLabels = labels.slice(0, count);
  return chosenLabels.map((title, idx) => {
    const startSeconds = idx === 0 ? 0 : Math.floor((durationSeconds * idx) / count);
    return {
      index: idx + 1,
      title,
      startSeconds,
      timeLabel: formatAppleTvTime(startSeconds),
    };
  });
}
