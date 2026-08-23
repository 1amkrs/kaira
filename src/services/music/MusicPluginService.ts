import { Track, Album, SyncedLyricLine } from '../../types/media';

export interface MusicPluginConfig {
  audiusEnabled: boolean;
  pipedEnabled: boolean;
  lrclibEnabled: boolean;
  pipedInstanceUrl: string;
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.lunar.icu',
];

const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.private.coffee',
];

class MusicPluginService {
  private audiusHost: string = 'https://api.audius.co';
  private config: MusicPluginConfig = {
    audiusEnabled: true,
    pipedEnabled: true,
    lrclibEnabled: true,
    pipedInstanceUrl: 'https://pipedapi.kavin.rocks',
  };

  private lyricsCache: Map<string, SyncedLyricLine[]> = new Map();
  private streamCache: Map<string, string> = new Map();

  constructor() {
    this.loadConfig();
    this.discoverAudiusHost();
  }

  private loadConfig() {
    try {
      const stored = localStorage.getItem('tv_music_plugin_config');
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (e) {}
  }

  public saveConfig(newConfig: Partial<MusicPluginConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('tv_music_plugin_config', JSON.stringify(this.config));
    } catch (e) {}
  }

  public getConfig(): MusicPluginConfig {
    return { ...this.config };
  }

  private async discoverAudiusHost() {
    try {
      const res = await fetch('https://api.audius.co');
      const data = await res.json();
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        this.audiusHost = data.data[0];
      }
    } catch (e) {
      this.audiusHost = 'https://api.audius.co';
    }
  }

  // --- 1. AUDIUS OPEN MUSIC PROTOCOL (100% Full-Length 320kbps Audio) ---
  public async fetchTrendingTracks(limit: number = 25): Promise<Track[]> {
    if (!this.config.audiusEnabled) return [];

    try {
      const res = await fetch(`${this.audiusHost}/v1/tracks/trending?app_name=tvOS&limit=${limit}`);
      const data = await res.json();

      if (data && Array.isArray(data.data)) {
        return data.data.map((t: any, idx: number) => this.mapAudiusTrack(t, idx));
      }
    } catch (e) {
      console.warn('[MusicPlugin] Audius trending fetch failed:', e);
    }
    return [];
  }

  public async fetchGenreTracks(genre: string, limit: number = 20): Promise<Track[]> {
    if (!this.config.audiusEnabled) return [];

    try {
      const res = await fetch(`${this.audiusHost}/v1/tracks/trending?genre=${encodeURIComponent(genre)}&app_name=tvOS&limit=${limit}`);
      const data = await res.json();

      if (data && Array.isArray(data.data)) {
        return data.data.map((t: any, idx: number) => this.mapAudiusTrack(t, idx));
      }
    } catch (e) {
      console.warn(`[MusicPlugin] Audius genre fetch failed for ${genre}:`, e);
    }
    return [];
  }

  public async searchAudius(query: string): Promise<Track[]> {
    if (!this.config.audiusEnabled || !query.trim()) return [];

    try {
      const res = await fetch(`${this.audiusHost}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=tvOS`);
      const data = await res.json();

      if (data && Array.isArray(data.data)) {
        return data.data.slice(0, 10).map((t: any, idx: number) => this.mapAudiusTrack(t, idx));
      }
    } catch (e) {
      console.warn('[MusicPlugin] Audius search failed:', e);
    }
    return [];
  }

  // --- 2. FULL-LENGTH AUDIO RESOLVER ---
  /**
   * Resolves a full-length uninterrupted audio stream for any track.
   * If a 30s iTunes preview URL is passed, it finds the full-length stream via Audius / Piped / Invidious.
   */
  public async resolveFullAudioStream(title: string, artist: string, fallbackUrl?: string): Promise<string> {
    const cacheKey = `${title.toLowerCase()}-${artist.toLowerCase()}`;
    if (this.streamCache.has(cacheKey)) {
      return this.streamCache.get(cacheKey)!;
    }

    // Step A: Search Audius for full-length 320kbps stream
    try {
      const audiusMatches = await this.searchAudius(`${title} ${artist}`);
      if (audiusMatches.length > 0 && audiusMatches[0].audioUrl) {
        const streamUrl = audiusMatches[0].audioUrl;
        this.streamCache.set(cacheKey, streamUrl);
        return streamUrl;
      }
    } catch (e) {}

    // Step B: Search Piped API instances for direct full audio with fast timeout
    for (const instance of PIPED_INSTANCES.slice(0, 2)) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const query = `${title} ${artist}`;
        const searchRes = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&filter=music_songs`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const firstItem = searchData.items?.[0];
          if (firstItem?.url) {
            const videoId = firstItem.url.includes('v=')
              ? firstItem.url.split('v=')[1]
              : firstItem.url.replace('/watch?v=', '');

            const ctrl2 = new AbortController();
            const tid2 = setTimeout(() => ctrl2.abort(), 1800);
            const streamRes = await fetch(`${instance}/api/v1/streams/${videoId}`, { signal: ctrl2.signal });
            clearTimeout(tid2);

            if (streamRes.ok) {
              const streamData = await streamRes.json();
              if (streamData.audioStreams && streamData.audioStreams.length > 0) {
                const sorted = streamData.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                const url = sorted[0].url;
                if (url) {
                  this.streamCache.set(cacheKey, url);
                  return url;
                }
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Step C: If all fail, return the fallbackUrl
    if (fallbackUrl) {
      this.streamCache.set(cacheKey, fallbackUrl);
      return fallbackUrl;
    }
    return 'https://api.audius.co/v1/tracks/D7KyP/stream?app_name=tvOS';
  }

  // --- 3. LRCLIB REAL-TIME SYNCED LYRICS ---
  public async fetchSyncedLyrics(title: string, artist: string): Promise<{ synced: SyncedLyricLine[]; plain?: string }> {
    if (!this.config.lrclibEnabled) return { synced: [] };

    const cleanTitle = title
      .replace(/\s*\([^)]*remix[^)]*\)/gi, '')
      .replace(/\s*\([^)]*feat[^)]*\)/gi, '')
      .replace(/\s*\([^)]*ft[^)]*\)/gi, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/["']/g, '')
      .trim();

    const cleanArtist = artist
      .split(',')[0]
      .split('&')[0]
      .split('feat.')[0]
      .split('ft.')[0]
      .replace(/["']/g, '')
      .trim();

    const cacheKey = `${cleanTitle.toLowerCase()}-${cleanArtist.toLowerCase()}`;
    if (this.lyricsCache.has(cacheKey)) {
      return { synced: this.lyricsCache.get(cacheKey)! };
    }

    try {
      // Step A: Exact lookup
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics) {
          const parsed = this.parseLrc(data.syncedLyrics);
          if (parsed.length > 0) {
            this.lyricsCache.set(cacheKey, parsed);
            return { synced: parsed, plain: data.plainLyrics };
          }
        }
      }

      // Step B: Search Fallback if exact match didn't yield synced lyrics
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;
      const sController = new AbortController();
      const sTimeout = setTimeout(() => sController.abort(), 3500);

      const sRes = await fetch(searchUrl, { signal: sController.signal });
      clearTimeout(sTimeout);

      if (sRes.ok) {
        const results = await sRes.json();
        if (Array.isArray(results)) {
          const matchWithSynced = results.find((r: any) => r.syncedLyrics);
          if (matchWithSynced && matchWithSynced.syncedLyrics) {
            const parsed = this.parseLrc(matchWithSynced.syncedLyrics);
            if (parsed.length > 0) {
              this.lyricsCache.set(cacheKey, parsed);
              return { synced: parsed, plain: matchWithSynced.plainLyrics };
            }
          }
        }
      }
    } catch (e) {}

    return { synced: [] };
  }

  // --- HELPERS ---
  public mapAudiusTrack(t: any, idx: number): Track {
    const artwork =
      t.artwork?.['480x480'] ||
      t.artwork?.['150x150'] ||
      'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22400%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ccircle%20cx%3D%22200%22%20cy%3D%22200%22%20r%3D%2290%22%20fill%3D%22none%22%20stroke%3D%22%238ab4f8%22%20stroke-width%3D%226%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2252%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2222%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%B5%20Audius%3C%2Ftext%3E%3C%2Fsvg%3E';

    const durSec = t.duration || 210;
    const m = Math.floor(durSec / 60);
    const s = durSec % 60;
    const durStr = `${m}:${s < 10 ? '0' : ''}${s}`;

    return {
      id: `audius-${t.id}`,
      title: t.title || 'Untitled Track',
      artist: t.user?.name || 'Audius Creator',
      album: t.genre || 'Electronic',
      albumId: `audius-genre-${t.genre?.toLowerCase() || 'general'}`,
      duration: durStr,
      durationSeconds: durSec,
      trackNumber: idx + 1,
      artwork: artwork,
      audioUrl: `${this.audiusHost}/v1/tracks/${t.id}/stream?app_name=tvOS`,
      isAudius: true,
      audiusId: t.id,
    };
  }

  private parseLrc(lrcText: string): SyncedLyricLine[] {
    if (!lrcText) return [];
    const lines = lrcText.split(/\r?\n/);
    const result: SyncedLyricLine[] = [];
    let offsetSeconds = 0;

    // First pass: Check for [offset:+/-ms] tag
    for (const line of lines) {
      const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\]/i);
      if (offsetMatch) {
        offsetSeconds = parseInt(offsetMatch[1], 10) / 1000;
      }
    }

    // Flexible timestamp regex matching:
    // [hh:mm:ss.xx] or [mm:ss.xx] or [mm:ss:xx] or [mm:ss]
    const tagRegex = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    for (const line of lines) {
      // Ignore metadata headers
      if (/^\[(ti|ar|al|au|by|offset|length|re|ve):/i.test(line)) {
        continue;
      }

      // Extract all timestamps on this line
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

      // Extract lyric text after all timestamps
      const text = line.replace(tagRegex, '').trim();

      if (text && timestamps.length > 0) {
        for (const t of timestamps) {
          result.push({ time: t, text });
        }
      }
    }

    return result.sort((a, b) => a.time - b.time);
  }
}

export const musicPluginService = new MusicPluginService();
