export type SubtitleSize = 'sm' | 'md' | 'lg';
export type SubtitleBackdrop = 'none' | 'dim' | 'box';

export interface SubtitleStylePrefs {
  size: SubtitleSize;
  backdrop: SubtitleBackdrop;
}

export const SUBTITLE_STYLE_STORAGE_KEY = 'kaira_subtitle_style_v1';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStylePrefs = {
  size: 'md',
  backdrop: 'none',
};

/**
 * Formats seconds as M:SS or H:MM:SS.
 */
export function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '0:00';
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Formats remaining time with a leading minus sign, e.g. "-1:48:10" or "-0:00".
 */
export function formatRemainingTime(currentSecs: number, durationSecs: number): string {
  const safeDuration = Number.isFinite(durationSecs) && durationSecs > 0 ? durationSecs : 0;
  const safeCurrent = Number.isFinite(currentSecs) && currentSecs > 0 ? currentSecs : 0;
  const remaining = Math.max(0, safeDuration - safeCurrent);
  return `-${formatTime(remaining)}`;
}

/**
 * Computes the projected local finish time string, e.g. "Ends 10:14 PM".
 * Returns empty string if duration is invalid or playback is already finished.
 */
export function formatEndsAt(
  currentSecs: number,
  durationSecs: number,
  playbackSpeed: number = 1,
  now: Date = new Date()
): string {
  if (!Number.isFinite(durationSecs) || durationSecs <= 0) return '';
  const safeCurrent = Number.isFinite(currentSecs) && currentSecs > 0 ? currentSecs : 0;
  const remaining = Math.max(0, durationSecs - safeCurrent);
  if (remaining <= 0) return '';

  const safeSpeed = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
  const wallRemainingMs = (remaining / safeSpeed) * 1000;
  const endDate = new Date(now.getTime() + wallRemainingMs);

  let hours = endDate.getHours();
  const minutes = endDate.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `Ends ${hours}:${minStr} ${period}`;
}

/**
 * Converts an intro segment { start, end } into percentage coordinates on the timeline.
 * Returns null if the segment or duration is invalid or has no visible span.
 */
export function computeIntroRangePercent(
  intro: { start: number; end: number } | null | undefined,
  durationSecs: number
): { leftPct: number; widthPct: number } | null {
  if (!intro || !Number.isFinite(durationSecs) || durationSecs <= 0) return null;
  if (!Number.isFinite(intro.start) || !Number.isFinite(intro.end)) return null;

  const start = Math.max(0, Math.min(durationSecs, intro.start));
  const end = Math.max(0, Math.min(durationSecs, intro.end));
  if (end <= start) return null;

  const leftPct = (start / durationSecs) * 100;
  const widthPct = ((end - start) / durationSecs) * 100;
  if (widthPct <= 0) return null;

  return {
    leftPct: Number(leftPct.toFixed(3)),
    widthPct: Number(widthPct.toFixed(3)),
  };
}

/**
 * Validates and normalizes subtitle style preferences from persisted storage.
 */
export function parseSubtitleStyle(raw: string | null): SubtitleStylePrefs {
  if (!raw) return { ...DEFAULT_SUBTITLE_STYLE };
  try {
    const parsed = JSON.parse(raw) as Partial<SubtitleStylePrefs>;
    const size: SubtitleSize =
      parsed.size === 'sm' || parsed.size === 'md' || parsed.size === 'lg'
        ? parsed.size
        : DEFAULT_SUBTITLE_STYLE.size;
    const backdrop: SubtitleBackdrop =
      parsed.backdrop === 'none' || parsed.backdrop === 'dim' || parsed.backdrop === 'box'
        ? parsed.backdrop
        : DEFAULT_SUBTITLE_STYLE.backdrop;
    return { size, backdrop };
  } catch {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }
}

export function loadSubtitleStyle(): SubtitleStylePrefs {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_SUBTITLE_STYLE };
    }
    return parseSubtitleStyle(window.localStorage.getItem(SUBTITLE_STYLE_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }
}

export function saveSubtitleStyle(prefs: SubtitleStylePrefs): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SUBTITLE_STYLE_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // Ignore storage quota or private mode errors
  }
}
