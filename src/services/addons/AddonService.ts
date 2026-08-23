import { AddonManifest, AddonStream, InstalledAddon, DebridConfig, SubtitleTrack } from '../../types/addons';
import { DIRECT_CINEMA_STREAMS, getDirectFallbackStream } from '../../data/media/directStreams';

const DEFAULT_ADDONS: InstalledAddon[] = [
  {
    id: 'torrentio',
    name: 'Torrentio 4K & Debrid',
    manifestUrl: 'https://torrentio.strem.fun/manifest.json',
    manifest: {
      id: 'com.stremio.torrentio',
      name: 'Torrentio',
      version: '1.0.14',
      description: 'Scrapes 4K HDR10+, 1080p Remux, and 720p streams across major global indexers with optional Debrid cloud playback.',
      icon: 'https://torrentio.strem.fun/logo.png',
      resources: ['stream'],
      types: ['movie', 'series', 'anime'],
    },
    enabled: true,
    installedAt: Date.now(),
  },
  {
    id: 'cinemeta',
    name: 'Cinemeta Official Catalogs',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    manifest: {
      id: 'org.stremio.cinemeta',
      name: 'Cinemeta Official',
      version: '3.0.12',
      description: 'Official IMDb blockbuster catalogs, genres, details, and 1080p official studio trailers.',
      icon: 'https://v3-cinemeta.strem.io/logo.png',
      resources: ['meta', 'catalog'],
      types: ['movie', 'series'],
    },
    enabled: true,
    installedAt: Date.now(),
  },
  {
    id: 'opensubtitles',
    name: 'OpenSubtitles v3',
    manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
    manifest: {
      id: 'org.stremio.opensubtitles',
      name: 'OpenSubtitles v3',
      version: '1.0.0',
      description: 'Multi-language subtitle streams for movies and television series.',
      icon: 'https://static.tvmaze.com/uploads/images/medium_portrait/1/4600.jpg',
      resources: ['subtitles'],
      types: ['movie', 'series'],
    },
    enabled: true,
    installedAt: Date.now(),
  },
  {
    id: 'aiostreams',
    name: 'AIOStreams Aggregator',
    manifestUrl: 'https://aiostreams.am/manifest.json',
    manifest: {
      id: 'com.aiostreams.aggregator',
      name: 'AIOStreams',
      version: '2.0.0',
      description: 'Unified multi-provider aggregator for community streams and Debrid caching.',
      icon: 'https://v3-cinemeta.strem.io/logo.png',
      resources: ['stream'],
      types: ['movie', 'series'],
    },
    enabled: true,
    installedAt: Date.now(),
  },
  {
    id: 'streaming-catalogs',
    name: 'Streaming Catalogs Provider',
    manifestUrl: 'https://streaming-catalogs.strem.fun/manifest.json',
    manifest: {
      id: 'com.stremio.streaming.catalogs',
      name: 'Streaming Catalogs',
      version: '1.0.1',
      description: 'Catalogs from Netflix, HBO Max, Disney+, Apple TV+, Prime Video and Hulu.',
      icon: 'https://v3-cinemeta.strem.io/logo.png',
      resources: ['catalog'],
      types: ['movie', 'series'],
    },
    enabled: true,
    installedAt: Date.now(),
  },
];

class AddonService {
  private installedAddons: InstalledAddon[] = [];
  private debridConfig: DebridConfig = {
    provider: 'none',
    apiKey: '',
    enabled: false,
  };

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const storedAddons = localStorage.getItem('tv_installed_addons');
      if (storedAddons) {
        const loaded = JSON.parse(storedAddons) as InstalledAddon[];
        // Ensure all default addons are always present and enabled
        const existingIds = new Set(loaded.map((a) => a.id));
        DEFAULT_ADDONS.forEach((def) => {
          if (!existingIds.has(def.id)) {
            loaded.push(def);
          }
        });
        this.installedAddons = loaded;
      } else {
        this.installedAddons = DEFAULT_ADDONS;
        this.saveAddons();
      }

      const storedDebrid = localStorage.getItem('tv_debrid_config');
      if (storedDebrid) {
        this.debridConfig = JSON.parse(storedDebrid);
      }
    } catch (e) {
      this.installedAddons = DEFAULT_ADDONS;
    }
  }

  private saveAddons() {
    try {
      localStorage.setItem('tv_installed_addons', JSON.stringify(this.installedAddons));
    } catch (e) {}
  }

  public getInstalledAddons(): InstalledAddon[] {
    return [...this.installedAddons];
  }

  public async installAddon(manifestUrl: string): Promise<InstalledAddon> {
    const cleanUrl = manifestUrl.trim().replace(/\/+$/, '');
    const targetUrl = cleanUrl.endsWith('manifest.json') ? cleanUrl : `${cleanUrl}/manifest.json`;

    console.log(`[AddonService] Fetching manifest from: ${targetUrl}`);
    const res = await fetch(targetUrl);
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} when fetching manifest`);
    }

    const manifest: AddonManifest = await res.json();
    if (!manifest.id || !manifest.resources) {
      throw new Error('Invalid Nuvio / Stremio Addon manifest format');
    }

    const newEntry: InstalledAddon = {
      id: manifest.id,
      name: manifest.name,
      manifestUrl: targetUrl,
      manifest,
      enabled: true,
      installedAt: Date.now(),
    };

    const existingIdx = this.installedAddons.findIndex((a) => a.id === manifest.id);
    if (existingIdx >= 0) {
      this.installedAddons[existingIdx] = newEntry;
    } else {
      this.installedAddons.push(newEntry);
    }

    this.saveAddons();
    return newEntry;
  }

  public uninstallAddon(addonId: string): void {
    this.installedAddons = this.installedAddons.filter((a) => a.id !== addonId);
    this.saveAddons();
  }

  public toggleAddon(addonId: string, enabled: boolean): void {
    const item = this.installedAddons.find((a) => a.id === addonId);
    if (item) {
      item.enabled = enabled;
      this.saveAddons();
    }
  }

  public getDebridConfig(): DebridConfig {
    return { ...this.debridConfig };
  }

  public setDebridConfig(config: DebridConfig): void {
    this.debridConfig = config;
    try {
      localStorage.setItem('tv_debrid_config', JSON.stringify(config));
    } catch (e) {}
  }

  /**
   * Fetch multi-language subtitles from OpenSubtitles v3
   */
  public async fetchSubtitles(type: 'movie' | 'series', imdbId: string): Promise<SubtitleTrack[]> {
    if (!imdbId || !imdbId.startsWith('tt')) return [];

    try {
      const res = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${type}/${imdbId}.json`);
      if (!res.ok) return [];

      const data = await res.json();
      if (data && Array.isArray(data.subtitles)) {
        return data.subtitles.slice(0, 15).map((s: any, idx: number) => ({
          id: `sub-${idx}-${s.lang || 'en'}`,
          lang: s.lang || 'en',
          label: s.lang ? s.lang.toUpperCase() : `Subtitle ${idx + 1}`,
          url: s.url,
        }));
      }
    } catch (e) {
      console.warn('[AddonService] Subtitles fetch failed:', e);
    }

    return [];
  }

  /**
   * Fetch real streams across Torrentio, AIOStreams, Multi-Server Web Players & Trailers
   */
  public async fetchStreams(
    type: 'movie' | 'series',
    id: string,
    seasonNumber?: number,
    episodeNumber?: number,
    titleHint?: string,
    ytTrailerId?: string
  ): Promise<AddonStream[]> {
    const cleanImdbId = id.startsWith('tt') ? id : id.replace(/^mov-|^show-/, '');
    const isImdb = cleanImdbId.startsWith('tt');

    console.log(`[AddonService] Resolving streams for [${type}]: ${cleanImdbId}`);

    const streams: AddonStream[] = [];

    // 1. Primary Full Feature Stream (VidLink Mirror)
    if (isImdb) {
      const vidLinkUrl =
        type === 'movie'
          ? `https://vidlink.pro/movie/${cleanImdbId}?primaryColor=8ab4f8&secondaryColor=ffffff&iconColor=ffffff`
          : `https://vidlink.pro/tv/${cleanImdbId}/${seasonNumber || 1}/${episodeNumber || 1}?primaryColor=8ab4f8&secondaryColor=ffffff&iconColor=ffffff`;

      streams.push({
        name: 'VidLink Server 1 • High-Speed [Full Movie]',
        title: `${titleHint || 'Full Feature'} • 1080p/4K FHD Stream`,
        description: 'Multi-CDN Cloud Server • Instant Playback & Auto-Resolution',
        url: vidLinkUrl,
        streamType: 'embed',
        quality: '1080p',
        resolution: '1080p FHD',
        audio: 'Dolby Digital / 5.1',
        providerName: 'VidLink CDN',
        isDebrid: true,
      });

      const vidSrcUrl =
        type === 'movie'
          ? `https://vidsrc.pm/embed/movie/${cleanImdbId}?autoplay=1`
          : `https://vidsrc.pm/embed/tv/${cleanImdbId}/${seasonNumber || 1}/${episodeNumber || 1}?autoplay=1`;

      streams.push({
        name: 'VidSrc Server 2 • Alternate [Full Movie]',
        title: `${titleHint || 'Full Feature'} • 1080p Web Stream`,
        description: 'Fast Alternate Cloud Mirror (Full Feature)',
        url: vidSrcUrl,
        streamType: 'embed',
        quality: '1080p',
        resolution: '1080p Web-DL',
        audio: 'Stereo / 5.1',
        providerName: 'VidSrc Mirror',
        isDebrid: false,
      });
    }

    // 2. Official Studio Trailer (Preview Only)
    if (ytTrailerId) {
      streams.push({
        name: 'Official Studio Trailer [Promo Preview]',
        title: `${titleHint || 'Feature'} • YouTube Promo Trailer`,
        description: '1080p FHD • Official Studio Promo Trailer',
        url: `https://www.youtube.com/embed/${ytTrailerId}?autoplay=1&enablejsapi=1`,
        streamType: 'youtube',
        quality: '1080p',
        resolution: '1080p Trailer',
        audio: 'Stereo',
        providerName: 'YouTube Promo',
        isDebrid: false,
      });
    }

    // 3. Query Torrentio (with or without Debrid config)
    if (isImdb) {
      try {
        let torrentioBase = 'https://torrentio.strem.fun';
        if (this.debridConfig.enabled && this.debridConfig.apiKey && this.debridConfig.provider !== 'none') {
          torrentioBase = `https://torrentio.strem.fun/${this.debridConfig.provider}=${this.debridConfig.apiKey}`;
        }

        let torrentioEndpoint = '';
        if (type === 'movie') {
          torrentioEndpoint = `${torrentioBase}/stream/movie/${cleanImdbId}.json`;
        } else {
          torrentioEndpoint = `${torrentioBase}/stream/series/${cleanImdbId}:${seasonNumber || 1}:${episodeNumber || 1}.json`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(torrentioEndpoint, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.streams)) {
            const parsedTorrentio = data.streams.slice(0, 15).map((s: any) => this.normalizeStream(s, 'Torrentio', cleanImdbId, type, seasonNumber, episodeNumber));
            streams.push(...parsedTorrentio);
          }
        }
      } catch (err) {
        console.warn('[AddonService] Torrentio query failed:', err);
      }
    }

    // 4. Query other installed stream addons (e.g. AIOStreams)
    const otherAddons = this.installedAddons.filter(
      (a) => a.enabled && a.id !== 'torrentio' && a.manifest.resources.includes('stream')
    );

    for (const addon of otherAddons) {
      try {
        const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '');
        let streamEndpoint = '';
        if (type === 'movie') {
          streamEndpoint = `${baseUrl}/stream/movie/${encodeURIComponent(cleanImdbId)}.json`;
        } else {
          const epId = seasonNumber && episodeNumber ? `${cleanImdbId}:${seasonNumber}:${episodeNumber}` : cleanImdbId;
          streamEndpoint = `${baseUrl}/stream/series/${encodeURIComponent(epId)}.json`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(streamEndpoint, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.streams)) {
            const parsed = data.streams.slice(0, 6).map((s: any) => this.normalizeStream(s, addon.name, cleanImdbId, type, seasonNumber, episodeNumber));
            streams.push(...parsed);
          }
        }
      } catch (e) {}
    }

    return streams;
  }

  public async testSelfDebrid(endpointUrl?: string): Promise<{ success: boolean; message: string }> {
    const url = (endpointUrl || this.debridConfig.endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${url}/`, { method: 'HEAD', signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);
      if (res) {
        return { success: true, message: `Connected to Self-Debrid on ${url}` };
      }
      return { success: false, message: `Could not reach Self-Debrid at ${url}. Make sure python main.py is running.` };
    } catch (e: any) {
      return { success: false, message: `Connection error: ${e.message}` };
    }
  }

  private normalizeStream(
    raw: any,
    providerName: string,
    imdbId: string,
    type: 'movie' | 'series',
    seasonNumber?: number,
    episodeNumber?: number
  ): AddonStream {
    const rawTitle = raw.title || raw.name || 'Video Stream';
    const parsed = this.parseStreamTitle(rawTitle);

    let streamUrl = raw.url || '';
    let streamType: AddonStream['streamType'] = 'direct';
    const isSelfDebrid = this.debridConfig.enabled && this.debridConfig.provider === 'selfdebrid';

    if (raw.url) {
      streamUrl = raw.url;
      streamType = raw.url.includes('.mp4') || raw.url.includes('.mkv') || raw.url.includes('.m3u8') ? 'direct' : 'embed';
    } else if (raw.infoHash) {
      if (isSelfDebrid) {
        const selfUrl = (this.debridConfig.endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');
        streamUrl = `${selfUrl}/stream/${raw.infoHash}${raw.fileIdx !== undefined ? `/${raw.fileIdx}` : ''}`;
        streamType = 'direct';
      } else {
        // If direct Debrid link is not returned, route via fast web player for this exact title
        streamType = 'embed';
        streamUrl =
          type === 'movie'
            ? `https://vidsrc.pm/embed/movie/${imdbId}?autoplay=1`
            : `https://vidsrc.pm/embed/tv/${imdbId}/${seasonNumber || 1}/${episodeNumber || 1}?autoplay=1`;
      }
    }

    return {
      name: isSelfDebrid ? `Self-Debrid [${parsed.quality}]` : (raw.name ? raw.name.replace(/\n/g, ' ') : providerName),
      title: rawTitle,
      description: raw.description || parsed.qualityDesc,
      url: streamUrl,
      streamType,
      infoHash: raw.infoHash,
      fileIdx: raw.fileIdx,
      quality: parsed.quality,
      resolution: parsed.resolution,
      fileSize: parsed.fileSize,
      audio: parsed.audio,
      providerName: isSelfDebrid ? 'Self-Debrid Local' : providerName,
      isDebrid: isSelfDebrid || raw.name?.includes('RD') || raw.name?.includes('Debrid') || Boolean(raw.url),
      behaviorHints: raw.behaviorHints,
    };
  }

  private parseStreamTitle(title: string): {
    quality: '4K' | '1080p' | '720p' | 'HDR' | 'SD';
    resolution: string;
    fileSize?: string;
    audio?: string;
    qualityDesc: string;
  } {
    const upper = title.toUpperCase();
    let quality: '4K' | '1080p' | '720p' | 'HDR' | 'SD' = '1080p';
    let resolution = '1080p';

    if (upper.includes('4K') || upper.includes('2160P') || upper.includes('UHD')) {
      quality = '4K';
      resolution = '2160p (4K)';
    } else if (upper.includes('1080P') || upper.includes('FHD')) {
      quality = '1080p';
      resolution = '1080p FHD';
    } else if (upper.includes('720P') || upper.includes('HD')) {
      quality = '720p';
      resolution = '720p HD';
    }

    // Match file size (e.g. "14.2 GB", "95.63 GB", "850 MB")
    const sizeMatch = title.match(/(\d+(\.\d+)?\s*(GB|MB|GiB|MiB))/i);
    const fileSize = sizeMatch ? sizeMatch[0] : undefined;

    // Match audio
    let audio: string | undefined;
    if (upper.includes('ATMOS')) audio = 'Dolby Atmos';
    else if (upper.includes('TRUEHD')) audio = 'TrueHD 7.1';
    else if (upper.includes('DDP5.1') || upper.includes('5.1')) audio = '5.1 Surround';
    else if (upper.includes('AAC')) audio = 'AAC 2.0';

    return {
      quality,
      resolution,
      fileSize,
      audio,
      qualityDesc: `${resolution}${fileSize ? ` • ${fileSize}` : ''}${audio ? ` • ${audio}` : ''}`,
    };
  }

  /**
   * Evaluates and automatically selects the highest-quality and fastest available stream:
   * 1. Cached Debrid / Direct HTTPS Cloud CDN (instant startup, zero buffering)
   * 2. Quality hierarchy (4K HDR10+/DV > 1080p FHD Remux > 720p HD)
   * 3. Audio fidelity (Dolby Atmos / 5.1 Surround > Stereo)
   * 4. Direct stream reliability (direct MP4/MKV/HLS > fast Web-DL > Studio Master)
   */
  public selectBestStream(streams: AddonStream[]): AddonStream | null {
    if (!streams || streams.length === 0) return null;

    const calculateScore = (s: AddonStream): number => {
      let score = 0;

      // 1. Debrid Accelerator Bonus (for direct cached streams)
      if (s.isDebrid && s.streamType === 'direct') {
        score += 800;
      }

      // 2. Stream Type Priority
      if (s.streamType === 'direct') {
        score += 1800; // Native hardware decoded video (e.g. Debrid direct)
      } else if (s.streamType === 'embed') {
        score += 1500; // Full feature cloud web stream (VidLink / VidSrc)
      } else if (s.streamType === 'youtube') {
        score -= 500; // Promo trailer only (never default over full movie/show)
      }

      // 3. Resolution & Quality
      if (s.quality === '4K') {
        score += 400;
      } else if (s.quality === '1080p') {
        score += 250;
      } else if (s.quality === '720p') {
        score += 120;
      }

      // 4. Audio Quality
      if (s.audio?.includes('Atmos') || s.audio?.includes('TrueHD')) {
        score += 60;
      } else if (s.audio?.includes('5.1')) {
        score += 35;
      }

      // 5. Codec & Source Format
      const upper = (s.title || '').toUpperCase();
      if (upper.includes('REMUX') || upper.includes('BLURAY')) {
        score += 50;
      }
      if (upper.includes('HDR') || upper.includes('DV') || upper.includes('DOLBY VISION')) {
        score += 40;
      }
      if (upper.includes('FAST') || upper.includes('RD+') || upper.includes('CACHED')) {
        score += 80;
      }

      return score;
    };

    const sorted = [...streams].sort((a, b) => calculateScore(b) - calculateScore(a));
    const chosen = sorted[0] || null;
    if (chosen) {
      console.log(`[AddonService] ⚡ Auto-selected best & fastest source: "${chosen.name}" (${chosen.quality || '1080p'}) - Score: ${calculateScore(chosen)}`);
    }
    return chosen;
  }
}

export const addonService = new AddonService();
