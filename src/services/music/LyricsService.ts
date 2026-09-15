import { SyncedLyricLine } from '../../types/media';

export interface LyricsResult {
  synced: SyncedLyricLine[];
  plain?: string;
  isInstrumental?: boolean;
}

export class LyricsService {
  private cache: Map<string, LyricsResult> = new Map();

  public async fetchLyrics(title: string, artist: string): Promise<LyricsResult> {
    const cleanTitle = this.sanitizeTitle(title);
    const cleanArtist = this.sanitizeArtist(artist);
    const cacheKey = `${cleanTitle.toLowerCase()}:::${cleanArtist.toLowerCase()}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Step A: Exact lookup on LRCLIB
      const exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
      const ctrl1 = new AbortController();
      const tid1 = setTimeout(() => ctrl1.abort(), 3500);

      const res1 = await fetch(exactUrl, { signal: ctrl1.signal });
      clearTimeout(tid1);

      if (res1.ok) {
        const data = await res1.json();
        if (data.syncedLyrics) {
          const parsed = this.parseLrc(data.syncedLyrics);
          if (parsed.length > 0) {
            const result: LyricsResult = {
              synced: parsed,
              plain: data.plainLyrics,
              isInstrumental: data.instrumental || false,
            };
            this.cache.set(cacheKey, result);
            return result;
          }
        } else if (data.plainLyrics) {
          const result: LyricsResult = {
            synced: [],
            plain: data.plainLyrics,
            isInstrumental: data.instrumental || false,
          };
          this.cache.set(cacheKey, result);
          return result;
        }
      }

      // Step B: Search Fallback on LRCLIB
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;
      const ctrl2 = new AbortController();
      const tid2 = setTimeout(() => ctrl2.abort(), 3500);

      const res2 = await fetch(searchUrl, { signal: ctrl2.signal });
      clearTimeout(tid2);

      if (res2.ok) {
        const results = await res2.json();
        if (Array.isArray(results) && results.length > 0) {
          // Prefer item with synced lyrics
          const matchWithSynced = results.find((r: any) => r.syncedLyrics);
          if (matchWithSynced && matchWithSynced.syncedLyrics) {
            const parsed = this.parseLrc(matchWithSynced.syncedLyrics);
            if (parsed.length > 0) {
              const result: LyricsResult = {
                synced: parsed,
                plain: matchWithSynced.plainLyrics,
                isInstrumental: matchWithSynced.instrumental || false,
              };
              this.cache.set(cacheKey, result);
              return result;
            }
          }

          // Fallback to plain lyrics if synced not available
          const firstWithPlain = results.find((r: any) => r.plainLyrics);
          if (firstWithPlain) {
            const result: LyricsResult = {
              synced: [],
              plain: firstWithPlain.plainLyrics,
              isInstrumental: firstWithPlain.instrumental || false,
            };
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch (e) {
      console.warn('[LyricsService] Lyrics fetch notice:', e);
    }

    const emptyResult: LyricsResult = { synced: [] };
    this.cache.set(cacheKey, emptyResult);
    return emptyResult;
  }

  public parseLrc(lrcText: string): SyncedLyricLine[] {
    if (!lrcText) return [];
    const lines = lrcText.split(/\r?\n/);
    const result: SyncedLyricLine[] = [];
    let offsetSeconds = 0;

    // Pass 1: Parse global [offset:+/-ms] tag
    for (const line of lines) {
      const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\]/i);
      if (offsetMatch) {
        offsetSeconds = parseInt(offsetMatch[1], 10) / 1000;
      }
    }

    // Pass 2: Parse timestamps [hh:mm:ss.xxx] or [mm:ss.xx] or [mm:ss:xx] or [mm:ss]
    const tagRegex = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    for (const line of lines) {
      // Ignore metadata headers
      if (/^\[(ti|ar|al|au|by|offset|length|re|ve):/i.test(line)) {
        continue;
      }

      const timestamps: number[] = [];
      let match: RegExpExecArray | null;

      while ((match = tagRegex.exec(line)) !== null) {
        const hrs = match[1] ? parseInt(match[1], 10) : 0;
        const min = parseInt(match[2], 10);
        const sec = parseInt(match[3], 10);
        let millis = 0;
        if (match[4]) {
          const rawMs = match[4];
          if (rawMs.length === 1) millis = parseInt(rawMs, 10) * 100;
          else if (rawMs.length === 2) millis = parseInt(rawMs, 10) * 10;
          else millis = parseInt(rawMs, 10);
        }
        const timeInSec = hrs * 3600 + min * 60 + sec + millis / 1000 + offsetSeconds;
        timestamps.push(Math.max(0, timeInSec));
      }

      const text = line.replace(tagRegex, '').trim();

      if (text && timestamps.length > 0) {
        for (const t of timestamps) {
          result.push({ time: t, text });
        }
      }
    }

    return result.sort((a, b) => a.time - b.time);
  }

  private sanitizeTitle(title: string): string {
    return title
      .replace(/\s*\([^)]*remix[^)]*\)/gi, '')
      .replace(/\s*\([^)]*feat[^)]*\)/gi, '')
      .replace(/\s*\([^)]*ft[^)]*\)/gi, '')
      .replace(/\s*\([^)]*official[^)]*\)/gi, '')
      .replace(/\s*\([^)]*audio[^)]*\)/gi, '')
      .replace(/\s*\([^)]*video[^)]*\)/gi, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/["']/g, '')
      .trim();
  }

  private sanitizeArtist(artist: string): string {
    return artist
      .split(',')[0]
      .split('&')[0]
      .split('feat.')[0]
      .split('ft.')[0]
      .replace(/["']/g, '')
      .trim();
  }
}

export const lyricsService = new LyricsService();
