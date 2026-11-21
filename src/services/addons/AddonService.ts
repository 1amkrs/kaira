import { AddonManifest, AddonStream, InstalledAddon, DebridConfig, SubtitleTrack } from '../../types/addons';
import {
  normalizeAddonManifestUrl,
  manifestSupportsResource,
  classifyStremioStream,
  sortStreamsForDisplay,
  isTorrentioAddon,
  torrentioManifestHasDebrid,
  isTorrentioErrorStream,
  getBrowserPlayabilityScore,
} from './stremioProtocol';
import {
  isValidStreamUrl,
  extractImdbId,
  buildEmergencyFallbackStreams,
  deduplicateStreams,
  createFailedStreamTracker,
  pickNextFallbackStream,
} from './streamFallback';

export interface ResolveStreamPlanParams {
  type: 'movie' | 'series';
  id: string;
  imdbId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  titleHint?: string;
  ytTrailerId?: string;
  preferredStreamUrl?: string;
  preferredStreamType?: AddonStream['streamType'];
  preferredProxyHeaders?: Record<string, string>;
  preferredDurationSeconds?: number;
  preloadedStreams?: AddonStream[];
}

export interface StreamResolutionPlan {
  primary: AddonStream | null;
  candidates: AddonStream[];
  imdbId: string;
  warnings: string[];
  usedFallback: boolean;
}

const DEFAULT_ADDONS: InstalledAddon[] = [
  {
    id: 'torrentio',
    name: 'Torrentio 4K & Debrid',
    manifestUrl: 'https://torrentio.strem.fun/manifest.json',
    manifest: {
      id: 'com.stremio.torrentio.addon',
      name: 'Torrentio',
      version: '0.0.15',
      description: 'Scrapes 4K HDR10+, 1080p, and 720p streams across global indexers. Requires Debrid (Real-Debrid / AllDebrid / TorBox / Self-Debrid) for browser playback.',
      icon: 'https://torrentio.strem.fun/images/logo_v1.png',
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
  private cachedTorrentHashes: Set<string> = new Set();
  private uninstalledDefaultIds: Set<string> = new Set();
  private failedStreamTracker = createFailedStreamTracker();
  private lastFetchWarnings: string[] = [];

  constructor() {
    this.loadState();
  }

  public reloadState() {
    this.loadState();
  }

  public markStreamFailed(url: string, reason: string = 'Playback error'): void {
    this.failedStreamTracker.markFailed(url, reason);
  }

  public isStreamFailed(url: string): boolean {
    return this.failedStreamTracker.isFailed(url);
  }

  public clearFailedStreams(url?: string): void {
    this.failedStreamTracker.clearFailed(url);
  }

  public getLastFetchWarnings(): string[] {
    return [...this.lastFetchWarnings];
  }

  public getNextFallbackStream(
    candidates: AddonStream[],
    extraFailedUrls?: Iterable<string>,
    options?: { allowDirect?: boolean; allowSelfDebrid?: boolean; maxDirectAttemptsReached?: boolean }
  ): AddonStream | null {
    const combinedFailed = this.failedStreamTracker.getFailedUrls();
    if (extraFailedUrls) {
      for (const u of extraFailedUrls) {
        if (typeof u === 'string' && u.trim()) {
          combinedFailed.add(u.trim());
        }
      }
    }
    return pickNextFallbackStream(candidates, combinedFailed, options);
  }

  private async fetchJsonWithRetry(
    url: string,
    timeoutMs: number,
    maxRetries: number = 1
  ): Promise<{ ok: boolean; status: number; data: any | null; error?: string }> {
    let lastError = 'Unknown network error';
    let lastStatus = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        lastStatus = res.status;

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          const isRetryable = res.status === 429 || res.status >= 500;
          if (isRetryable && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
            continue;
          }
          return { ok: false, status: res.status, data: null, error: lastError };
        }

        const rawText = await res.text();
        try {
          const data = JSON.parse(rawText);
          return { ok: true, status: res.status, data };
        } catch {
          return { ok: false, status: res.status, data: null, error: 'Invalid JSON response' };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err?.name === 'AbortError' ? 'Request timed out' : err?.message || 'Network error';
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
      }
    }

    return { ok: false, status: lastStatus, data: null, error: lastError };
  }

  private loadState() {
    try {
      const storedUninstalled = localStorage.getItem('tv_uninstalled_default_addons');
      if (storedUninstalled) {
        const parsedUninstalled = JSON.parse(storedUninstalled);
        this.uninstalledDefaultIds = new Set(Array.isArray(parsedUninstalled) ? parsedUninstalled : []);
      } else {
        this.uninstalledDefaultIds = new Set();
      }

      const storedAddons = localStorage.getItem('tv_installed_addons');
      if (storedAddons) {
        // Prune legacy unreachable aiostreams.am default entry if present
        const rawLoaded = (JSON.parse(storedAddons) as InstalledAddon[]).filter(
          (a) => a.manifestUrl !== 'https://aiostreams.am/manifest.json'
        );

        // Deduplicate Torrentio entries (legacy 'com.stremio.torrentio' vs official 'com.stremio.torrentio.addon'),
        // preferring any configured URL with Debrid parameters over the default unconfigured URL.
        const loaded: InstalledAddon[] = [];
        let seenTorrentioIndex = -1;
        for (const addon of rawLoaded) {
          if (isTorrentioAddon(addon)) {
            if (seenTorrentioIndex === -1) {
              seenTorrentioIndex = loaded.length;
              loaded.push(addon);
            } else if (
              torrentioManifestHasDebrid(addon.manifestUrl) &&
              !torrentioManifestHasDebrid(loaded[seenTorrentioIndex].manifestUrl)
            ) {
              loaded[seenTorrentioIndex] = addon;
            }
          } else {
            loaded.push(addon);
          }
        }

        // Ensure default addons that the user has not explicitly uninstalled are present
        const existingIds = new Set(loaded.map((a) => a.id));
        const existingManifestIds = new Set(loaded.map((a) => a.manifest?.id).filter(Boolean));
        const hasTorrentio = loaded.some((a) => isTorrentioAddon(a));
        DEFAULT_ADDONS.forEach((def) => {
          const isUninstalled =
            this.uninstalledDefaultIds.has(def.id) ||
            this.uninstalledDefaultIds.has(def.manifest.id) ||
            (def.id === 'torrentio' && this.uninstalledDefaultIds.has('com.stremio.torrentio'));
          if (def.id === 'torrentio' && hasTorrentio) return;
          if (!isUninstalled && !existingIds.has(def.id) && !existingManifestIds.has(def.manifest.id)) {
            loaded.push({ ...def });
          }
        });
        this.installedAddons = loaded;
      } else {
        this.installedAddons = DEFAULT_ADDONS.filter(
          (def) => !this.uninstalledDefaultIds.has(def.id) && !this.uninstalledDefaultIds.has(def.manifest.id)
        ).map((def) => ({ ...def }));
        this.saveAddons();
      }

      const storedDebrid = localStorage.getItem('tv_debrid_config');
      if (storedDebrid) {
        this.debridConfig = JSON.parse(storedDebrid);
      }
    } catch (e) {
      this.installedAddons = DEFAULT_ADDONS.map((def) => ({ ...def }));
    }
  }

  private saveUninstalledDefaults() {
    try {
      localStorage.setItem(
        'tv_uninstalled_default_addons',
        JSON.stringify(Array.from(this.uninstalledDefaultIds))
      );
    } catch (e) {}
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
    const targetUrl = normalizeAddonManifestUrl(manifestUrl);

    console.log(`[AddonService] Fetching manifest from: ${targetUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(targetUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} when fetching manifest`);
    }

    const rawText = await res.text();
    let manifest: AddonManifest;
    try {
      manifest = JSON.parse(rawText);
    } catch {
      throw new Error('URL did not return a valid JSON Stremio manifest');
    }

    if (!manifest || !manifest.id || !manifest.name || !Array.isArray(manifest.resources)) {
      throw new Error('Invalid Stremio / Nuvio addon manifest (missing id, name, or resources)');
    }

    const newEntry: InstalledAddon = {
      id: manifest.id,
      name: manifest.name,
      manifestUrl: targetUrl,
      manifest,
      enabled: true,
      installedAt: Date.now(),
    };

    const existingIdx = this.installedAddons.findIndex(
      (a) =>
        a.id === manifest.id ||
        a.manifest?.id === manifest.id ||
        (isTorrentioAddon(newEntry) && isTorrentioAddon(a))
    );
    if (existingIdx >= 0) {
      this.installedAddons[existingIdx] = newEntry;
    } else {
      this.installedAddons.push(newEntry);
    }

    // If user re-installs a previously uninstalled default addon, clear its tombstone
    DEFAULT_ADDONS.forEach((def) => {
      if (
        def.id === manifest.id ||
        def.manifest.id === manifest.id ||
        (def.id === 'torrentio' && isTorrentioAddon(newEntry))
      ) {
        this.uninstalledDefaultIds.delete(def.id);
        this.uninstalledDefaultIds.delete(def.manifest.id);
        this.uninstalledDefaultIds.delete('com.stremio.torrentio');
      }
    });
    this.saveUninstalledDefaults();
    this.saveAddons();
    return newEntry;
  }

  public uninstallAddon(addonId: string): void {
    const removed = this.installedAddons.find(
      (a) => a.id === addonId || a.manifest?.id === addonId
    );
    this.installedAddons = this.installedAddons.filter(
      (a) => a.id !== addonId && a.manifest?.id !== addonId
    );
    DEFAULT_ADDONS.forEach((def) => {
      if (
        def.id === addonId ||
        def.manifest.id === addonId ||
        (removed && (def.id === removed.id || def.manifest.id === removed.manifest?.id))
      ) {
        this.uninstalledDefaultIds.add(def.id);
      }
    });
    this.saveUninstalledDefaults();
    this.saveAddons();
  }

  public toggleAddon(addonId: string, enabled: boolean): void {
    const item = this.installedAddons.find(
      (a) => a.id === addonId || a.manifest?.id === addonId
    );
    if (item) {
      item.enabled = enabled;
      this.saveAddons();
    }
  }

  public getDebridConfig(): DebridConfig {
    return { ...this.debridConfig };
  }

  public isTorrentioConfigured(addon?: InstalledAddon): boolean {
    if (addon && torrentioManifestHasDebrid(addon.manifestUrl)) {
      return true;
    }
    if (this.debridConfig.enabled && this.debridConfig.provider === 'selfdebrid') {
      return Boolean((this.debridConfig.endpointUrl || '').trim());
    }
    if (
      this.debridConfig.enabled &&
      this.debridConfig.provider !== 'none' &&
      Boolean((this.debridConfig.apiKey || '').trim())
    ) {
      return true;
    }
    return false;
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
    const cleanImdbId = extractImdbId(id);
    const isImdb = cleanImdbId.startsWith('tt');
    this.lastFetchWarnings = [];

    console.log(`[AddonService] Resolving streams for [${type}]: ${cleanImdbId || id}`);

    const streams: AddonStream[] = [];
    let selfDebridReachable = true;

    // 0. Pre-check Self-Debrid Local Disk Cache & Completed Torrents (only when explicitly enabled)
    if (this.debridConfig.enabled && this.debridConfig.provider === 'selfdebrid') {
      const selfUrl = (this.debridConfig.endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');

      try {
        const cleanTitle = (titleHint || '')
          .replace(/\b[sS]\d+[\.\-_ ]?[eE]\d+\b/gi, ' ')
          .replace(/\b\d+x\d+\b/gi, ' ')
          .replace(/\b[sS]\d+\b/gi, ' ')
          .replace(/\b[eE]\d+\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const checkParams = new URLSearchParams();
        if (cleanTitle) checkParams.set('title', cleanTitle);
        if (seasonNumber !== undefined) checkParams.set('season', String(seasonNumber));
        if (episodeNumber !== undefined) checkParams.set('episode', String(episodeNumber));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const [cacheCheckRes, cacheInvRes] = await Promise.allSettled([
          fetch(`${selfUrl}/cache/check?${checkParams.toString()}`, { signal: controller.signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
          fetch(`${selfUrl}/cache`, { signal: controller.signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
        ]);
        clearTimeout(timeoutId);

        if (cacheCheckRes.status === 'rejected' && cacheInvRes.status === 'rejected') {
          selfDebridReachable = false;
          const warning = `Self-Debrid server at ${selfUrl} is unreachable; skipping local :8081 streams.`;
          this.lastFetchWarnings.push(warning);
          console.warn(`[AddonService] ${warning}`);
        }

        if (cacheInvRes.status === 'fulfilled' && cacheInvRes.value?.cached_hashes) {
          this.cachedTorrentHashes.clear();
          const hashes = cacheInvRes.value.cached_hashes;
          Object.keys(hashes).forEach((h) => {
            if (hashes[h]?.completed) {
              this.cachedTorrentHashes.add(h.toLowerCase());
            }
          });
        }

        let cachedItem: any = null;
        if (cacheCheckRes.status === 'fulfilled' && cacheCheckRes.value?.cached) {
          cachedItem = cacheCheckRes.value;
        } else if (cacheInvRes.status === 'fulfilled' && Array.isArray(cacheInvRes.value?.cached_files)) {
          // Fallback: search cached_files inventory directly
          const titleWords = cleanTitle.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
          const files: any[] = cacheInvRes.value.cached_files;
          for (const f of files) {
            const combined = `${f.name || ''} ${f.relpath || ''}`.toLowerCase();
            if (seasonNumber !== undefined && episodeNumber !== undefined) {
              const epRegex = new RegExp(`[sS]0?${seasonNumber}[\\.\\-_ ]?[eE]0?${episodeNumber}\\b|\\b0?${seasonNumber}x0?${episodeNumber}\\b`, 'i');
              if (!epRegex.test(combined)) continue;
            }
            if (titleWords.length > 0) {
              const matches = titleWords.filter((w) => combined.includes(w));
              if (matches.length >= Math.min(1, titleWords.length)) {
                cachedItem = f;
                break;
              }
            } else {
              cachedItem = f;
              break;
            }
          }

          // Pass 2: if no cached item yet, match by season & episode
          if (!cachedItem && seasonNumber !== undefined && episodeNumber !== undefined) {
            for (const f of files) {
              const combined = `${f.name || ''} ${f.relpath || ''}`.toLowerCase();
              const epRegex = new RegExp(`[sS]0?${seasonNumber}[\\.\\-_ ]?[eE]0?${episodeNumber}\\b|\\b0?${seasonNumber}x0?${episodeNumber}\\b`, 'i');
              if (epRegex.test(combined)) {
                cachedItem = f;
                break;
              }
            }
          }
        }

        if (cachedItem && isValidStreamUrl(cachedItem.stream_url)) {
          console.log(`[AddonService] ⚡ Found local cached file in Self-Debrid:`, cachedItem.name);
          streams.unshift({
            name: 'Self-Debrid [⚡ Local Disk Cache]',
            title: `${titleHint || cachedItem.name} • Instant Disk Playback`,
            description: `Pre-downloaded in Debrid Cache (${cachedItem.name}) • Zero Buffering`,
            url: cachedItem.stream_url,
            streamType: 'direct',
            quality: '1080p',
            resolution: '1080p Disk Cache',
            audio: 'AAC Stereo Transcode',
            providerName: 'Self-Debrid Local',
            isDebrid: true,
            isCached: true,
            durationSeconds: cachedItem.duration ? Math.round(cachedItem.duration) : undefined,
          });
        }
      } catch (err) {
        selfDebridReachable = false;
        const warning = `Self-Debrid local cache pre-check failed: ${err instanceof Error ? err.message : String(err)}`;
        this.lastFetchWarnings.push(warning);
        console.warn('[AddonService]', warning);
      }
    }

    // 1. Guaranteed Multi-Server Web Mirrors (VidLink, VidSrc) & Optional Studio Trailer
    streams.push(
      ...buildEmergencyFallbackStreams({
        type,
        imdbId: cleanImdbId,
        seasonNumber,
        episodeNumber,
        titleHint,
        ytTrailerId,
      })
    );

    // 2. Query Torrentio + all enabled Stremio v3 stream addons IN PARALLEL with retry-once resilience
    if (isImdb) {
      const addonQueries: Promise<AddonStream[]>[] = [];

      const torrentioAddon = this.installedAddons.find((a) => isTorrentioAddon(a));

      if (torrentioAddon && torrentioAddon.enabled) {
        addonQueries.push(
          (async () => {
            try {
              let torrentioBase = torrentioAddon.manifestUrl.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
              const hasManifestDebrid = torrentioManifestHasDebrid(torrentioAddon.manifestUrl);
              const cleanApiKey = (this.debridConfig.apiKey || '').trim();

              if (
                !hasManifestDebrid &&
                this.debridConfig.enabled &&
                cleanApiKey &&
                this.debridConfig.provider !== 'none' &&
                this.debridConfig.provider !== 'selfdebrid'
              ) {
                const isRootTorrentio = /^https?:\/\/torrentio\.strem\.fun$/i.test(torrentioBase);
                torrentioBase = isRootTorrentio
                  ? `${torrentioBase}/${this.debridConfig.provider}=${encodeURIComponent(cleanApiKey)}`
                  : `${torrentioBase}|${this.debridConfig.provider}=${encodeURIComponent(cleanApiKey)}`;
              }

              const torrentioEndpoint =
                type === 'movie'
                  ? `${torrentioBase}/stream/movie/${cleanImdbId}.json`
                  : `${torrentioBase}/stream/series/${cleanImdbId}:${seasonNumber || 1}:${episodeNumber || 1}.json`;

              const result = await this.fetchJsonWithRetry(torrentioEndpoint, 6500, 1);
              if (!result.ok || !result.data || !Array.isArray(result.data.streams)) {
                const reason = result.error || 'Empty Torrentio response';
                this.lastFetchWarnings.push(`Torrentio unavailable (${reason}); using fallback sources.`);
                console.warn(`[AddonService] Torrentio query failed (${reason})`);
                return [];
              }

              const normalized = result.data.streams
                .slice(0, 20)
                .map((s: any) =>
                  this.normalizeStream(
                    s,
                    'Torrentio',
                    cleanImdbId,
                    type,
                    seasonNumber,
                    episodeNumber,
                    selfDebridReachable
                  )
                )
                .filter((s: AddonStream | null): s is AddonStream => s !== null && isValidStreamUrl(s.url));

              if (normalized.length === 0 && result.data.streams.length > 0) {
                this.lastFetchWarnings.push(
                  'Torrentio returned no directly playable browser streams; falling back to backup mirrors.'
                );
              }
              return normalized;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.lastFetchWarnings.push(`Torrentio query error (${msg}); using fallback sources.`);
              console.warn('[AddonService] Torrentio query failed:', err);
              return [];
            }
          })()
        );
      }

      const otherStreamAddons = this.installedAddons.filter(
        (a) =>
          a.enabled &&
          !isTorrentioAddon(a) &&
          manifestSupportsResource(a.manifest, 'stream', type, cleanImdbId)
      );

      for (const addon of otherStreamAddons) {
        addonQueries.push(
          (async () => {
            try {
              const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
              const streamEndpoint =
                type === 'movie'
                  ? `${baseUrl}/stream/movie/${encodeURIComponent(cleanImdbId)}.json`
                  : `${baseUrl}/stream/series/${encodeURIComponent(
                      seasonNumber && episodeNumber
                        ? `${cleanImdbId}:${seasonNumber}:${episodeNumber}`
                        : cleanImdbId
                    )}.json`;

              const result = await this.fetchJsonWithRetry(streamEndpoint, 6500, 1);
              if (!result.ok || !result.data || !Array.isArray(result.data.streams)) {
                const reason = result.error || 'Empty addon response';
                this.lastFetchWarnings.push(`Addon "${addon.name}" failed (${reason}).`);
                console.warn(`[AddonService] Addon "${addon.name}" stream query failed (${reason})`);
                return [];
              }

              return result.data.streams
                .slice(0, 12)
                .map((s: any) =>
                  this.normalizeStream(
                    s,
                    addon.manifest?.name || addon.name,
                    cleanImdbId,
                    type,
                    seasonNumber,
                    episodeNumber,
                    selfDebridReachable
                  )
                )
                .filter((s: AddonStream | null): s is AddonStream => s !== null && isValidStreamUrl(s.url));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.lastFetchWarnings.push(`Addon "${addon.name}" failed (${msg}).`);
              console.warn(`[AddonService] Addon "${addon.name}" stream query failed:`, err);
              return [];
            }
          })()
        );
      }

      if (addonQueries.length > 0) {
        const settled = await Promise.allSettled(addonQueries);
        for (const result of settled) {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            streams.push(...result.value);
          }
        }
      }
    }

    return sortStreamsForDisplay(deduplicateStreams(streams));
  }

  /**
   * High-level resilient stream resolver for handlePlayMovie / handlePlayEpisode and details screens.
   * Never throws: validates preferred URLs, skips session-failed URLs, and always guarantees fallback candidates.
   */
  public async resolveStreamPlan(params: ResolveStreamPlanParams): Promise<StreamResolutionPlan> {
    const cleanImdbId = extractImdbId(params.imdbId, params.id);
    const warnings: string[] = [];
    let usedFallback = false;

    const emergencyFallbacks = buildEmergencyFallbackStreams({
      type: params.type,
      imdbId: cleanImdbId,
      seasonNumber: params.seasonNumber,
      episodeNumber: params.episodeNumber,
      titleHint: params.titleHint,
      ytTrailerId: params.ytTrailerId,
    });

    let fetchedStreams: AddonStream[] = [];
    if (params.preloadedStreams && params.preloadedStreams.length > 0) {
      fetchedStreams = params.preloadedStreams;
    } else if (cleanImdbId) {
      try {
        fetchedStreams = await this.fetchStreams(
          params.type,
          cleanImdbId,
          params.seasonNumber,
          params.episodeNumber,
          params.titleHint,
          params.ytTrailerId
        );
        if (this.lastFetchWarnings.length > 0) {
          warnings.push(...this.lastFetchWarnings);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Stream resolution failed (${msg}); using emergency fallback mirrors.`);
        console.warn('[AddonService] resolveStreamPlan fell back after fetchStreams error:', err);
        usedFallback = true;
      }
    }

    let candidates = sortStreamsForDisplay(
      deduplicateStreams([...fetchedStreams, ...emergencyFallbacks])
    );

    let primary: AddonStream | null = null;
    const rawPreferredUrl = params.preferredStreamUrl?.trim();

    if (rawPreferredUrl) {
      if (!isValidStreamUrl(rawPreferredUrl)) {
        warnings.push('Requested stream URL is invalid; falling back to best available mirror.');
        usedFallback = true;
        primary = this.selectBestStream(candidates);
      } else if (this.isStreamFailed(rawPreferredUrl)) {
        warnings.push('Requested stream URL previously failed in this session; selecting healthy alternate.');
        usedFallback = true;
        primary = this.selectBestStream(candidates);
        if (!primary) {
          primary =
            candidates.find((c) => c.url === rawPreferredUrl) || {
              name: params.titleHint || 'Selected Stream',
              title: params.titleHint || 'Selected Stream',
              url: rawPreferredUrl,
              streamType: params.preferredStreamType || 'direct',
              proxyHeaders: params.preferredProxyHeaders,
              durationSeconds: params.preferredDurationSeconds,
            };
        }
      } else {
        const matched = candidates.find((c) => c.url === rawPreferredUrl);
        if (matched) {
          primary = {
            ...matched,
            streamType: params.preferredStreamType || matched.streamType,
            proxyHeaders: params.preferredProxyHeaders || matched.proxyHeaders,
            durationSeconds: params.preferredDurationSeconds || matched.durationSeconds,
          };
        } else {
          primary = {
            name: params.titleHint || 'Selected Stream',
            title: params.titleHint || 'Selected Stream',
            url: rawPreferredUrl,
            streamType: params.preferredStreamType || 'direct',
            proxyHeaders: params.preferredProxyHeaders,
            durationSeconds: params.preferredDurationSeconds,
          };
          candidates = deduplicateStreams([primary, ...candidates]);
        }
      }
    } else {
      primary = this.selectBestStream(candidates);
      if (primary && primary.streamType !== 'direct' && warnings.length > 0) {
        usedFallback = true;
      }
    }

    if (!primary && candidates.length > 0) {
      primary = candidates[0];
      usedFallback = true;
    }

    return {
      primary,
      candidates,
      imdbId: cleanImdbId,
      warnings,
      usedFallback,
    };
  }

  public async testSelfDebrid(endpointUrl?: string): Promise<{ success: boolean; message: string }> {
    const url = (endpointUrl || this.debridConfig.endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      await fetch(`${url}/`, { mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      return { success: true, message: `Connected to Self-Debrid on ${url}!` };
    } catch (e: any) {
      return { success: false, message: `Could not reach Self-Debrid at ${url}. Error: ${e.message}` };
    }
  }

  public async testCloudDebrid(
    provider: 'realdebrid' | 'alldebrid' | 'torbox',
    apiKey: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      return { success: false, message: 'Enter an API token before testing.' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const endpoint = `https://torrentio.strem.fun/${provider}=${encodeURIComponent(cleanKey)}/stream/movie/tt0133093.json`;
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { success: false, message: `Torrentio returned HTTP ${res.status}.` };
      }

      const data = await res.json();
      const list = Array.isArray(data?.streams) ? data.streams : [];
      if (list.length === 0) {
        return { success: false, message: 'Torrentio returned 0 streams for this key.' };
      }

      const errorStream = list.find((s: any) => isTorrentioErrorStream(s));
      if (errorStream) {
        const reason = String(errorStream.title || errorStream.name || 'Invalid API key').replace(/\s+/g, ' ').trim();
        return { success: false, message: `Torrentio rejected key: ${reason}` };
      }

      const directCount = list.filter((s: any) => typeof s?.url === 'string' && /^https?:\/\//i.test(s.url)).length;
      if (directCount > 0) {
        return {
          success: true,
          message: `Connected! Torrentio returned ${directCount} direct ${provider.toUpperCase()} streams.`,
        };
      }

      return {
        success: false,
        message: 'Torrentio returned P2P torrents instead of Debrid URLs. Double-check your token.',
      };
    } catch (e: any) {
      return { success: false, message: `Could not reach Torrentio: ${e?.message || 'Network timeout'}` };
    }
  }

  private normalizeStream(
    raw: any,
    providerName: string,
    _imdbId: string,
    _type: 'movie' | 'series',
    _seasonNumber?: number,
    _episodeNumber?: number,
    selfDebridReachable: boolean = true
  ): AddonStream | null {
    if (!raw || typeof raw !== 'object') return null;

    // Filter out Torrentio error-notice pseudo-streams (e.g. "Invalid RealDebrid ApiKey/Token!")
    if (isTorrentioErrorStream(raw)) {
      console.warn('[AddonService] Ignoring Torrentio error notice:', raw.title || raw.name);
      return null;
    }

    const rawTitle = raw.title || raw.description || raw.name || 'Video Stream';
    const parsed = this.parseStreamTitle(`${raw.name || ''} ${rawTitle}`);

    let streamUrl = '';
    let streamType: AddonStream['streamType'] = 'direct';
    let isHls = false;
    let proxyHeaders: Record<string, string> | undefined;
    const isSelfDebrid = this.debridConfig.enabled && this.debridConfig.provider === 'selfdebrid';

    const classified = classifyStremioStream(raw);

    if (classified) {
      streamUrl = classified.url;
      streamType = classified.streamType;
      isHls = classified.isHls;
      proxyHeaders = classified.proxyHeaders;

      if (streamUrl.includes(':8081') && !selfDebridReachable) {
        return null;
      }

      if (isSelfDebrid && streamUrl.includes(':8081') && !streamUrl.includes('audio=')) {
        const audioMode = this.debridConfig.audioMode || 'auto';
        if (audioMode !== 'direct') {
          const sep = streamUrl.includes('?') ? '&' : '?';
          streamUrl = `${streamUrl}${sep}audio=aac&transcode=1&downmix=stereo`;
        }
      }
    } else if (raw.infoHash) {
      if (isSelfDebrid && selfDebridReachable) {
        const selfUrl = (this.debridConfig.endpointUrl || 'http://localhost:8081').replace(/\/+$/, '');
        // an0mal1a/self-debrid route is /stream/<torrent_hash>
        const fileParam = raw.fileIdx !== undefined ? `file=${raw.fileIdx}` : '';
        const audioMode = this.debridConfig.audioMode || 'auto';
        const audioParam = audioMode === 'direct' ? '' : 'audio=aac&transcode=1&downmix=stereo';
        const queryParams = [fileParam, audioParam].filter(Boolean).join('&');
        const queryStr = queryParams ? `?${queryParams}` : '';

        streamUrl = `${selfUrl}/stream/${raw.infoHash}${queryStr}`;
        streamType = 'direct';

        // Proactively register magnet link with local qBittorrent via Web UI if available
        try {
          const magnetUrl = `magnet:?xt=urn:btih:${raw.infoHash}`;
          fetch('http://localhost:8080/api/v2/torrents/add', {
            method: 'POST',
            body: new URLSearchParams({ urls: magnetUrl, sequentialDownload: 'true', firstLastPiecePrio: 'true' }),
            mode: 'no-cors',
          }).catch(() => {});
        } catch (_) {}
      } else {
        // Browser cannot play raw P2P infoHash without Debrid or a reachable Self-Debrid server
        return null;
      }
    } else {
      // Drop externalUrl-only or empty notice items
      return null;
    }

    if (!isValidStreamUrl(streamUrl)) {
      return null;
    }

    const isCachedTorrent =
      (isSelfDebrid || this.cachedTorrentHashes.size > 0) &&
      Boolean(raw.infoHash && this.cachedTorrentHashes.has(raw.infoHash.toLowerCase()));

    const cleanRawName = raw.name ? String(raw.name).replace(/\s*\n+\s*/g, ' · ').trim() : '';

    return {
      name: isCachedTorrent
        ? `Self-Debrid [⚡ Cached ${parsed.quality}]`
        : isSelfDebrid && raw.infoHash
        ? `Self-Debrid [${parsed.quality}]`
        : cleanRawName || providerName,
      title: rawTitle,
      description: isCachedTorrent
        ? '100% Downloaded in Local Debrid Cache • Instant Playback'
        : raw.description
        ? String(raw.description).replace(/\s*\n+\s*/g, ' · ').trim()
        : parsed.qualityDesc,
      url: streamUrl,
      streamType,
      infoHash: raw.infoHash,
      fileIdx: raw.fileIdx,
      quality: parsed.quality,
      resolution: parsed.resolution,
      fileSize: parsed.fileSize,
      sizeBytes: parsed.sizeBytes,
      audio: parsed.audio,
      providerName: isSelfDebrid && raw.infoHash ? 'Self-Debrid Local' : providerName,
      isDebrid: isSelfDebrid || raw.name?.includes('RD') || raw.name?.includes('Debrid') || streamType === 'direct',
      isCached: isCachedTorrent || Boolean(raw.isCached),
      isHls,
      proxyHeaders,
      behaviorHints: raw.behaviorHints,
    };
  }

  private parseStreamTitle(title: string): {
    quality: '4K' | '1080p' | '720p' | 'HDR' | 'SD';
    resolution: string;
    fileSize?: string;
    sizeBytes?: number;
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
    const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB|GiB|MiB)/i);
    const fileSize = sizeMatch ? sizeMatch[0] : undefined;
    let sizeBytes: number | undefined;

    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      if (unit.startsWith('G')) {
        sizeBytes = val * 1024 * 1024 * 1024;
      } else if (unit.startsWith('M')) {
        sizeBytes = val * 1024 * 1024;
      }
    }

    // Match audio
    let audio: string | undefined;
    if (upper.includes('ATMOS')) audio = 'Dolby Atmos';
    else if (upper.includes('TRUEHD')) audio = 'TrueHD 7.1';
    else if (upper.includes('DTS-HD') || upper.includes('DTS')) audio = 'DTS-HD';
    else if (upper.includes('EAC3') || upper.includes('DDP5.1') || upper.includes('DDP')) audio = 'Dolby Digital+ 5.1';
    else if (upper.includes('AC3') || upper.includes('DD5.1') || upper.includes('5.1')) audio = 'Dolby Digital 5.1';
    else if (upper.includes('AAC2.0') || upper.includes('AAC') || upper.includes('STEREO') || upper.includes('2.0')) audio = 'AAC Stereo 2.0';
    else if (upper.includes('OPUS')) audio = 'Opus Stereo';

    return {
      quality,
      resolution,
      fileSize,
      sizeBytes,
      audio,
      qualityDesc: `${resolution}${fileSize ? ` • ${fileSize}` : ''}${audio ? ` • ${audio}` : ''}`,
    };
  }

  /**
   * Evaluates and automatically selects the highest-quality and fastest available stream:
   * 1. Native Kaira Player (`direct`) HTTP/HLS/Debrid streams over 3rd-party `embed` mirrors
   * 2. Resolution & Quality hierarchy (4K > 1080p > 720p)
   * 3. Lowest file size within high-quality bracket for instant buffering & zero stutter
   * 4. Modern efficient codecs (HEVC / x265 / AV1 / Web-DL)
   */
  public selectBestStream(streams: AddonStream[], excludeUrls?: Set<string>): AddonStream | null {
    if (!streams || streams.length === 0) return null;

    const validStreams = deduplicateStreams(streams);
    if (validStreams.length === 0) return null;

    const healthyStreams = validStreams.filter(
      (s) => !this.failedStreamTracker.isFailed(s.url) && !(excludeUrls && excludeUrls.has(s.url))
    );

    const pool =
      healthyStreams.length > 0
        ? healthyStreams
        : validStreams.filter((s) => !(excludeUrls && excludeUrls.has(s.url)));

    if (pool.length === 0) return null;

    const calculateScore = (s: AddonStream): number => {
      let score = 0;

      // 0. Local Debrid Cache Absolute Priority (+50,000)
      if (s.isCached || s.name?.includes('Local Disk Cache') || s.name?.includes('Cached')) {
        score += 50000;
      }

      // 1. Debrid & Direct HTTP Stream Priority Bonus
      if (s.isDebrid && s.streamType === 'direct') {
        score += 1200;
      }

      // 2. Stream Type Priority — strongly prefer native Kaira Player ('direct') over 3rd-party web embeds
      if (s.streamType === 'direct') {
        score += 3500; // Direct HTTP/HLS video (plays in Kaira Native Player)
      } else if (s.streamType === 'embed') {
        score += 1500; // Third-party Cloud Web Embed fallback
      } else if (s.streamType === 'youtube') {
        score -= 1000; // Promo trailer only
      }

      // 3. Resolution & High Quality Bracket (Primary Weight)
      if (s.quality === '4K') {
        score += 1000;
      } else if (s.quality === '1080p') {
        score += 650;
      } else if (s.quality === '720p') {
        score += 300;
      }

      // 4. Lowest File Size Bonus for Fast Playback (Secondary Optimization)
      if (s.sizeBytes && s.sizeBytes > 0) {
        const sizeGB = s.sizeBytes / (1024 * 1024 * 1024);
        if (sizeGB <= 3.5) {
          score += 350;
        } else if (sizeGB <= 8.0) {
          score += 250;
        } else if (sizeGB <= 18.0) {
          score += 120;
        } else if (sizeGB > 40.0) {
          score -= 300;
        }
      }

      // 5. Browser Container & Codec Playability (for remote direct HTTP/HLS streams)
      const isSelfDebridStream = Boolean(s.url && s.url.includes(':8081'));
      if (s.streamType === 'direct' && !isSelfDebridStream) {
        score += getBrowserPlayabilityScore(s);
      } else {
        const upper = (s.title || '').toUpperCase();
        if (upper.includes('HEVC') || upper.includes('X265') || upper.includes('H.265') || upper.includes('10BIT')) {
          score += 180;
        }
        if (upper.includes('WEB-DL') || upper.includes('WEBRIP')) {
          score += 90;
        }
        if (upper.includes('HDR') || upper.includes('DV') || upper.includes('DOLBY VISION')) {
          score += 80;
        }
      }

      // 6. Audio Fidelity (only boost lossless surround when locally transcoded via Self-Debrid)
      if (isSelfDebridStream) {
        if (s.audio?.includes('Atmos') || s.audio?.includes('TrueHD')) {
          score += 50;
        } else if (s.audio?.includes('5.1')) {
          score += 30;
        }
      }

      return score;
    };

    const sorted = [...pool].sort((a, b) => calculateScore(b) - calculateScore(a));
    const chosen = sorted[0] || null;
    if (chosen) {
      console.log(
        `[AddonService] Auto-selected best source: "${chosen.name}" [${chosen.streamType}] (${chosen.quality || '1080p'}) - Score: ${calculateScore(chosen)}`
      );
    }
    return chosen;
  }
}

export const addonService = new AddonService();
