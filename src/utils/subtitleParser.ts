export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface StreamSourceItem {
  name: string;
  kind: 'hls' | 'embed' | string;
  src: string;
  quality?: string;
  group?: string;
  has?: boolean;
}

export function parseSubtitleTimestamp(raw: string): number {
  const cleaned = String(raw || '').trim().replace(',', '.');
  const match = cleaned.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return NaN;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const msStr = (match[4] || '0').padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msStr, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(ms)) {
    return NaN;
  }
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function cleanCueText(rawText: string): string {
  return rawText
    // Strip ASS/SSA style override tags like {\an8}
    .replace(/\{\\[^}]+\}/g, '')
    // Convert <br> tags to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip WebVTT/HTML formatting tags (<c.color>, <i>, <b>, <font ...>, timestamps <00:01.000>)
    .replace(/<\/?[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function parseSubtitleText(raw: string): SubtitleCue[] {
  if (!raw || typeof raw !== 'string') return [];
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim().length > 0);
    if (lines.length === 0) continue;

    const firstTrimmed = lines[0].trim();
    if (
      /^WEBVTT\b/i.test(firstTrimmed) ||
      /^NOTE\b/i.test(firstTrimmed) ||
      /^STYLE\b/i.test(firstTrimmed) ||
      /^REGION\b/i.test(firstTrimmed)
    ) {
      continue;
    }

    const timingIdx = lines.findIndex(line => line.includes('-->'));
    if (timingIdx === -1) continue;

    const timingLine = lines[timingIdx].trim();
    const parts = timingLine.split('-->');
    if (parts.length < 2) continue;

    const startRaw = parts[0].trim().split(/\s+/)[0];
    const endRaw = parts[1].trim().split(/\s+/)[0];
    const start = parseSubtitleTimestamp(startRaw);
    const end = parseSubtitleTimestamp(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const text = cleanCueText(lines.slice(timingIdx + 1).join('\n'));
    if (!text) continue;

    cues.push({ start, end, text });
  }

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

export function getActiveSubtitleText(cues: SubtitleCue[], currentTime: number): string {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(currentTime) || currentTime < 0) {
    return '';
  }
  const active: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.start > currentTime) break;
    if (currentTime >= cue.start && currentTime <= cue.end) {
      active.push(cue.text);
    }
  }
  return active.join('\n');
}

export function buildEmbedFallbackServers(
  imdbId: string,
  isShow: boolean,
  season = 1,
  episode = 1
): StreamSourceItem[] {
  const cleanImdb = String(imdbId || '').trim();
  if (!/^tt\d+$/i.test(cleanImdb)) return [];
  const s = Math.max(1, Number(season) || 1);
  const e = Math.max(1, Number(episode) || 1);

  if (isShow) {
    return [
      {
        name: '2Embed',
        kind: 'embed',
        src: `https://www.2embed.cc/embedtv/${encodeURIComponent(cleanImdb)}?s=${s}&e=${e}`,
        quality: 'HD',
        group: 'embed'
      }
    ];
  }

  return [
    {
      name: '2Embed',
      kind: 'embed',
      src: `https://www.2embed.cc/embed/${encodeURIComponent(cleanImdb)}`,
      quality: 'HD',
      group: 'embed'
    }
  ];
}

export function filterStaticHostSources(
  sources: StreamSourceItem[],
  isStaticHost: boolean
): StreamSourceItem[] {
  const list = Array.isArray(sources) ? sources.filter(s => s && s.name && s.src) : [];
  if (!isStaticHost) return list;
  return list.filter(s => {
    const src = String(s.src || '').trim();
    // On static GitHub Pages, relative /api/s/... proxy streams do not exist
    if (src.startsWith('/api/')) return false;
    return /^https:\/\//i.test(src);
  });
}

export function withBasePath(path: string, basePath = '/'): string {
  const raw = String(path || '/');
  if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(raw)) return raw;
  const cleanBase = String(basePath || '/').replace(/\/$/, '');
  if (!cleanBase) return raw.startsWith('/') ? raw : `/${raw}`;
  const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  if (normalizedPath === cleanBase || normalizedPath.startsWith(`${cleanBase}/`)) {
    return normalizedPath;
  }
  return `${cleanBase}${normalizedPath}`;
}
