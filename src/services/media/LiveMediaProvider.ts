import {
  Movie,
  Show,
  Season,
  Episode,
  Album,
  Artist,
  Track,
  PlaybackSource,
  SyncedLyricLine,
  MediaSearchCategoryResult,
} from '../../types/media';
import { MediaProvider, ContinueWatchingItem } from './MediaProvider';
import { addonService } from '../addons/AddonService';
import { musicPluginService } from '../music/MusicPluginService';
import { profileService } from '../profile/ProfileService';
import { introService } from '../playback/IntroService';
import {
  MALAYALAM_MOVIES,
  HINDI_MOVIES,
  TAMIL_MOVIES,
  ALL_REGIONAL_MOVIES,
} from '../../data/media/regionalMedia';
import { HOLLYWOOD_MOVIES } from '../../data/media/hollywoodMedia';
import {
  SHOWCASE_HERO_ITEMS,
  SHOWCASE_CONTINUE_ITEMS,
  POPULAR_SERIES_ITEMS,
} from '../../data/media/showcaseData';

import {
  SAMPLE_CDN_POOL,
  getDirectFallbackStream,
  DIRECT_CINEMA_STREAMS,
} from '../../data/media/directStreams';

export { SAMPLE_CDN_POOL, getDirectFallbackStream, DIRECT_CINEMA_STREAMS };
export type { ContinueWatchingItem };

class LiveMediaProviderService implements MediaProvider {
  private moviesCache: Movie[] = [];
  private movieDetailsCache: Map<string, Movie> = new Map();
  private showsCache: Show[] = [];
  private showDetailsCache: Map<string, Show> = new Map();
  private episodesCache: Map<string, Episode[]> = new Map();
  private albumsCache: Album[] = [];
  private albumDetailsCache: Map<string, Album> = new Map();
  private artistsCache: Artist[] = [];
  private favorites: Set<string> = new Set();

  constructor() {
    this.loadFavorites();
    // Re-synchronize favorites and media cache when profile changes
    profileService.subscribe(() => {
      this.loadFavorites();
      this.moviesCache = [];
      this.showsCache = [];
      this.albumsCache = [];
      this.movieDetailsCache.clear();
      this.showDetailsCache.clear();
      this.albumDetailsCache.clear();
    });
  }

  private getActiveProfileId(): string {
    return profileService.getActiveProfile().id;
  }

  private getFavoritesStorageKey(): string {
    const profileId = this.getActiveProfileId();
    return `tv_favorites_${profileId}`;
  }

  private loadFavorites() {
    try {
      const key = this.getFavoritesStorageKey();
      let stored = localStorage.getItem(key);
      if (!stored && (this.getActiveProfileId() === 'prof-primary' || this.getActiveProfileId() === 'primary')) {
        stored = localStorage.getItem('tv_favorites');
      }
      if (stored) {
        this.favorites = new Set(JSON.parse(stored));
      } else {
        this.favorites = new Set();
      }
    } catch (e) {
      this.favorites = new Set();
    }
  }

  private saveFavorites() {
    try {
      const key = this.getFavoritesStorageKey();
      const favArray = Array.from(this.favorites);
      localStorage.setItem(key, JSON.stringify(favArray));
      if (this.getActiveProfileId() === 'prof-primary' || this.getActiveProfileId() === 'primary') {
        localStorage.setItem('tv_favorites', JSON.stringify(favArray));
      }
    } catch (e) {}
  }


  // --- MOVIES (Live Cinemeta / IMDb Real Blockbuster Catalog, Hollywood & Curated Regional) ---
  public async getMovies(): Promise<Movie[]> {
    if (this.moviesCache.length > 0) return this.moviesCache;

    // Start with curated Hollywood and latest global blockbusters + curated Regional hits
    const combined: Movie[] = [...HOLLYWOOD_MOVIES, ...ALL_REGIONAL_MOVIES];

    try {
      const res = await fetch('https://v3-cinemeta.strem.io/catalog/movie/top.json');
      const data = await res.json();

      if (data && Array.isArray(data.metas)) {
        const cinemetaList = data.metas
          .filter((m: any) => m.id && m.name && m.poster)
          .map((m: any) => this.mapCinemetaMovie(m));

        cinemetaList.forEach((m: Movie) => {
          if (!combined.some(existing => existing.id === m.id)) {
            combined.push(m);
          }
        });
      }
    } catch (e) {
      console.warn('[LiveMediaProvider] Cinemeta fetch failed, using local catalogs', e);
    }

    this.moviesCache = combined;
    return this.moviesCache;
  }

  public async getHollywoodMovies(): Promise<Movie[]> {
    return HOLLYWOOD_MOVIES;
  }

  /**
   * Returns the Top 10 trending movies for today.
   * Fetches fresh data daily from Cinemeta/Stremio catalog.
   * Uses date-keyed localStorage to cache until tomorrow.
   */
  public async getTop10Daily(): Promise<Movie[]> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `tv_top10_daily_${today}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length >= 5) {
          console.log('[LiveMediaProvider] ✅ Top 10 loaded from daily cache:', today);
          return parsed;
        }
      }
    } catch (e) {}

    console.log('[LiveMediaProvider] 🔄 Fetching fresh Top 10 for:', today);
    const top10: Movie[] = [];

    try {
      const res = await fetch('https://v3-cinemeta.strem.io/catalog/movie/top.json');
      const data = await res.json();

      if (data && Array.isArray(data.metas)) {
        const cinemetaList = data.metas
          .filter((m: any) => m.id && m.name && m.poster)
          .slice(0, 10)
          .map((m: any, idx: number) => ({
            ...this.mapCinemetaMovie(m),
            rank: idx + 1, // #1 to #10 rank badge
          }));
        top10.push(...cinemetaList);
      }
    } catch (e) {
      console.warn('[LiveMediaProvider] Top 10 Cinemeta fetch failed, using local fallback:', e);
    }

    // Fallback to top-rated Hollywood movies if fetch fails
    if (top10.length < 5) {
      const fallback = [...HOLLYWOOD_MOVIES]
        .sort((a, b) => {
          const ra = parseFloat(a.rating) || 7.0;
          const rb = parseFloat(b.rating) || 7.0;
          return rb - ra;
        })
        .slice(0, 10)
        .map((m, idx) => ({ ...m, rank: idx + 1 }));
      top10.push(...fallback.filter(f => !top10.some(t => t.id === f.id)));
    }

    const result = top10.slice(0, 10);

    // Purge old date caches to avoid localStorage bloat
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('tv_top10_daily_') && k !== cacheKey)
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(cacheKey, JSON.stringify(result));
    } catch (e) {}

    return result;
  }

  public async getFeaturedMovie(): Promise<Movie> {
    const movies = await this.getMovies();
    // Candidates for Featured in 4K: blockbuster movies with high-definition backdrop artwork and top ratings
    const candidates = movies.filter(
      m => m.backdrop && m.poster && (m.year >= 2022 || (parseFloat(m.rating) || 0) >= 8.0)
    );

    const pool = candidates.length >= 3 ? candidates : (movies.length > 0 ? movies : HOLLYWOOD_MOVIES);

    // Retrieve previous featured movie ID from sessionStorage or memory to ensure a fresh movie on every app open/refresh
    let lastId = '';
    try {
      lastId = sessionStorage.getItem('tv_featured_movie_id') || localStorage.getItem('tv_last_featured_movie_id') || '';
    } catch (e) {}

    // Filter out the one just shown so it always rotates
    const eligible = pool.filter(m => m.id !== lastId);
    const chosenPool = eligible.length > 0 ? eligible : pool;

    const randomIndex = Math.floor(Math.random() * chosenPool.length);
    const selected = chosenPool[randomIndex] || HOLLYWOOD_MOVIES[0];

    try {
      sessionStorage.setItem('tv_featured_movie_id', selected.id);
      localStorage.setItem('tv_last_featured_movie_id', selected.id);
    } catch (e) {}

    return selected;
  }

  public async getMovie(id: string): Promise<Movie | null> {
    if (this.movieDetailsCache.has(id)) {
      return this.movieDetailsCache.get(id)!;
    }

    const hollywood = HOLLYWOOD_MOVIES.find(m => m.id === id);
    if (hollywood) {
      this.movieDetailsCache.set(id, hollywood);
      return hollywood;
    }

    const regional = ALL_REGIONAL_MOVIES.find(m => m.id === id);
    if (regional) {
      this.movieDetailsCache.set(id, regional);
      return regional;
    }

    try {
      const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${id}.json`);
      const data = await res.json();

      if (data && data.meta) {
        const fullMovie = this.mapCinemetaMovie(data.meta);
        this.movieDetailsCache.set(id, fullMovie);
        return fullMovie;
      }
    } catch (e) {
      console.warn(`[LiveMediaProvider] Failed to fetch movie details for ${id}`, e);
    }

    const cached = this.moviesCache.find(m => m.id === id);
    return cached || null;
  }

  public async getMalayalamMovies(): Promise<Movie[]> {
    return MALAYALAM_MOVIES;
  }

  public async getHindiMovies(): Promise<Movie[]> {
    return HINDI_MOVIES;
  }

  public async getTamilMovies(): Promise<Movie[]> {
    return TAMIL_MOVIES;
  }

  public async getRegionalMovies(category?: 'malayalam' | 'hindi' | 'tamil' | 'all'): Promise<Movie[]> {
    if (category === 'malayalam') return MALAYALAM_MOVIES;
    if (category === 'hindi') return HINDI_MOVIES;
    if (category === 'tamil') return TAMIL_MOVIES;
    return ALL_REGIONAL_MOVIES;
  }

  // --- TV SHOWS (Live TVMaze API) ---
  public async getShows(): Promise<Show[]> {
    if (this.showsCache.length > 0) return this.showsCache;

    try {
      const res = await fetch('https://api.tvmaze.com/shows?page=0');
      const data = await res.json();

      const filtered = (data as any[])
        .filter(s => s.image?.original && s.rating?.average && s.rating.average >= 7.5)
        .slice(0, 20);

      this.showsCache = filtered.map(item => this.mapTvMazeShow(item));
      return this.showsCache;
    } catch (e) {
      console.warn('[LiveMediaProvider] TVMaze fetch failed', e);
      return [];
    }
  }

  public async getShow(id: string): Promise<Show | null> {
    if (this.showDetailsCache.has(id)) {
      return this.showDetailsCache.get(id)!;
    }

    const cleanId = id.replace(/^show-/, '');

    // 1. If it's an IMDb ID (e.g. tt4574334 for Stranger Things, tt11280740 for Severance, tt12637874 for Fallout)
    if (cleanId.startsWith('tt')) {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${cleanId}.json`);
        const data = await res.json();
        if (data && data.meta) {
          const meta = data.meta;
          const videos = Array.isArray(meta.videos) ? meta.videos : [];

          // Compute distinct season numbers (> 0)
          const seasonNums = Array.from(
            new Set<number>(
              videos
                .map((v: any) => v.season)
                .filter((s: any) => typeof s === 'number' && s > 0)
            )
          ).sort((a, b) => a - b);

          const validSeasons = seasonNums.length > 0 ? seasonNums : [1];

          const seasonsList = validSeasons.map((sNum) => {
            const count = videos.filter((v: any) => v.season === sNum).length;
            return {
              id: `season-${sNum}`,
              showId: id,
              number: sNum,
              name: `Season ${sNum}`,
              episodeCount: count || 8,
            };
          });

          // Map all episodes from Cinemeta
          const allMappedEpisodes: Episode[] = videos.map((v: any) => ({
            id: `ep-${v.id || cleanId + '-' + v.season + '-' + (v.number || v.episode || 1)}`,
            showId: id,
            seasonId: `season-${v.season || 1}`,
            number: v.number || v.episode || 1,
            seasonNumber: v.season || 1,
            title: v.title || v.name || `Episode ${v.number || v.episode || 1}`,
            description: this.stripHtml(v.overview || v.description || 'No episode synopsis available.'),
            thumbnail:
              v.thumbnail ||
              `https://episodes.metahub.space/${cleanId}/${v.season || 1}/${v.number || v.episode || 1}/w780.jpg`,
            runtime: `${v.runtime || meta.runtime || 45} min`,
            runtimeMinutes: parseInt(String(v.runtime || meta.runtime || 45), 10) || 45,
            airDate: v.released || v.firstAired,
            streamUrl: DIRECT_CINEMA_STREAMS[cleanId] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          }));

          // Pre-cache episodes per season
          validSeasons.forEach((sNum) => {
            const sEps = allMappedEpisodes.filter((e) => e.seasonNumber === sNum);
            const epsToCache = sEps.length > 0 ? sEps : allMappedEpisodes;
            this.episodesCache.set(`${id}-s${sNum}`, epsToCache);
            this.episodesCache.set(`${cleanId}-s${sNum}`, epsToCache);
          });

          const SHOW_TRAILERS: Record<string, string> = {
            'tt0903747': 'HhesaQXLuRY', // Breaking Bad
            'tt0944947': 'KPLWWIOCOOQ', // Game of Thrones
            'tt4574334': 'b9EkMc79ZSU', // Stranger Things
            'tt0460649': 'Hl4bOuGNMwo', // HIMYM
            'tt0475784': 'd8sYpS6hWp0', // Westworld
            'tt1475582': 'rLw3ZkL6b8E', // Sherlock
            'tt2442560': '78R2b6m6_hE', // Peaky Blinders
            'tt3581920': '8hP9D6kZseM', // The Last of Us
            'tt7366338': '3rP_w8qE5-g', // The Boys
            'tt11198330': '0Z760XNy4VM', // House of the Dragon
            'tt11280740': 'xEQP4VVuyrY', // Severance
            'tt12637874': 'V-mugKDQDlg', // Fallout
            'tt11126994': 'fXmAurh012s', // Arcane
            'tt2788316': 'yDf__65ew6E',  // Shogun
            'tt14452776': 'y-c1a1rY1o0', // The Bear
            'tt7660850': 'OzYxJV_RM4o',  // Succession
          };

          const showObj: Show = {
            id: id,
            imdbId: cleanId,
            title: meta.name || 'Television Series',
            description: this.stripHtml(meta.description || 'Critically acclaimed television series.'),
            poster: meta.poster || `https://images.metahub.space/poster/medium/${cleanId}/img`,
            backdrop: meta.background || `https://images.metahub.space/background/medium/${cleanId}/img`,
            logo: meta.logo || `https://images.metahub.space/logo/medium/${cleanId}/img`,
            year: meta.year ? parseInt(String(meta.year).slice(0, 4), 10) : 2023,
            rating: meta.imdbRating ? `${meta.imdbRating}` : '8.6',
            genres: Array.isArray(meta.genres) ? meta.genres : ['Drama'],
            network: meta.network || 'Streaming',
            status: meta.status || 'Ongoing',
            ytTrailerId: SHOW_TRAILERS[cleanId] || (Array.isArray(meta.trailers) && meta.trailers[0]?.source) || undefined,
            seasons: seasonsList,
            seasonsCount: seasonsList.length,
            isFavorite: this.favorites.has(id),
          };

          this.showDetailsCache.set(id, showObj);
          this.showDetailsCache.set(cleanId, showObj);
          return showObj;
        }
      } catch (e) {
        console.warn(`[LiveMediaProvider] Cinemeta series fetch failed for ${cleanId}`, e);
      }
    }

    // 2. TVMaze Numeric ID Fallback
    try {
      const [showRes, seasonsRes] = await Promise.all([
        fetch(`https://api.tvmaze.com/shows/${cleanId}`),
        fetch(`https://api.tvmaze.com/shows/${cleanId}/seasons`),
      ]);

      const showData = await showRes.json();
      const seasonsData = await seasonsRes.json();

      const show = this.mapTvMazeShow(showData);
      show.seasons = Array.isArray(seasonsData)
        ? seasonsData.map((s: any) => ({
            id: `season-${s.id}`,
            showId: id,
            number: s.number,
            name: s.name || `Season ${s.number}`,
            episodeCount: s.episodeOrder || 8,
          }))
        : [{ id: 'season-1', showId: id, number: 1, name: 'Season 1', episodeCount: 10 }];
      show.seasonsCount = show.seasons.length;

      this.showDetailsCache.set(id, show);
      return show;
    } catch (e) {
      console.error('[LiveMediaProvider] Failed to fetch TV show details', e);
      return null;
    }
  }

  public async getEpisodes(showId: string, seasonNumber: number = 1): Promise<Episode[]> {
    const cleanId = showId.replace(/^show-/, '');
    const cacheKey = `${showId}-s${seasonNumber}`;
    if (this.episodesCache.has(cacheKey)) {
      return this.episodesCache.get(cacheKey)!;
    }
    if (this.episodesCache.has(`${cleanId}-s${seasonNumber}`)) {
      return this.episodesCache.get(`${cleanId}-s${seasonNumber}`)!;
    }

    // 1. If it's an IMDb ID or show cached via Cinemeta
    if (cleanId.startsWith('tt')) {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${cleanId}.json`);
        const data = await res.json();
        if (data && data.meta && Array.isArray(data.meta.videos)) {
          const videos = data.meta.videos;
          const allEpisodes: Episode[] = videos.map((v: any) => ({
            id: `ep-${v.id || cleanId + '-' + (v.season || 1) + '-' + (v.number || v.episode || 1)}`,
            showId: showId,
            seasonId: `season-${v.season || 1}`,
            number: v.number || v.episode || 1,
            seasonNumber: v.season || 1,
            title: v.title || v.name || `Episode ${v.number || v.episode || 1}`,
            description: this.stripHtml(v.overview || v.description || 'No episode synopsis available.'),
            thumbnail:
              v.thumbnail ||
              `https://episodes.metahub.space/${cleanId}/${v.season || 1}/${v.number || v.episode || 1}/w780.jpg`,
            runtime: `${v.runtime || 45} min`,
            runtimeMinutes: parseInt(String(v.runtime || 45), 10) || 45,
            airDate: v.released || v.firstAired,
            streamUrl: DIRECT_CINEMA_STREAMS[cleanId] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          }));

          const seasonEps = allEpisodes.filter((e) => e.seasonNumber === seasonNumber);
          const result = seasonEps.length > 0 ? seasonEps : allEpisodes.slice(0, 15);
          this.episodesCache.set(cacheKey, result);
          this.episodesCache.set(`${cleanId}-s${seasonNumber}`, result);
          return result;
        }
      } catch (e) {
        console.warn(`[LiveMediaProvider] Cinemeta episodes fetch failed for ${cleanId}`, e);
      }
    }

    // 2. TVMaze Numeric ID Lookup
    try {
      const res = await fetch(`https://api.tvmaze.com/shows/${cleanId}/episodes`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const episodes: Episode[] = (data as any[])
          .filter((ep) => ep.season === seasonNumber)
          .map((ep) => ({
            id: `ep-${ep.id}`,
            showId: showId,
            seasonId: `season-${ep.season}`,
            number: ep.number,
            seasonNumber: ep.season,
            title: ep.name,
            description: this.stripHtml(ep.summary || 'No episode synopsis available.'),
            thumbnail:
              ep.image?.original ||
              ep.image?.medium ||
              `https://images.metahub.space/background/medium/${cleanId}/img`,
            runtime: `${ep.runtime || 45} min`,
            runtimeMinutes: ep.runtime || 45,
            airDate: ep.airdate,
            streamUrl: DIRECT_CINEMA_STREAMS[cleanId] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          }));

        const finalEps =
          episodes.length > 0
            ? episodes
            : (data as any[]).slice(0, 15).map((ep) => ({
                id: `ep-${ep.id}`,
                showId: showId,
                seasonId: `season-${ep.season}`,
                number: ep.number,
                seasonNumber: ep.season,
                title: ep.name,
                description: this.stripHtml(ep.summary || 'No episode synopsis available.'),
                thumbnail:
                  ep.image?.original ||
                  ep.image?.medium ||
                  `https://images.metahub.space/background/medium/${cleanId}/img`,
                runtime: `${ep.runtime || 45} min`,
                runtimeMinutes: ep.runtime || 45,
                airDate: ep.airdate,
                streamUrl: DIRECT_CINEMA_STREAMS[cleanId] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
              }));

        this.episodesCache.set(cacheKey, finalEps);
        this.episodesCache.set(`${cleanId}-s${seasonNumber}`, finalEps);
        return finalEps;
      }
    } catch (e) {
      console.error('[LiveMediaProvider] Failed to fetch episodes', e);
    }

    return [];
  }

  // --- MUSIC (Audius Protocol + iTunes Live API) ---
  public async getMusic(): Promise<{
    recentlyPlayed: Album[];
    albums: Album[];
    artists: Artist[];
    topTracks: Track[];
  }> {
    const albums = await this.getAlbums();
    const artists = await this.getArtists();

    const topTracks: Track[] = [];

    // 1. Fetch live 320kbps full-length tracks from Audius Open Music Protocol
    try {
      const audiusTrending = await musicPluginService.fetchTrendingTracks(15);
      if (audiusTrending && audiusTrending.length > 0) {
        topTracks.push(...audiusTrending);
      }
    } catch (e) {}

    // 2. Fetch iTunes tracks
    for (const alb of albums.slice(0, 4)) {
      const fullAlb = await this.getAlbum(alb.id);
      if (fullAlb?.tracks) {
        topTracks.push(...fullAlb.tracks.slice(0, 2));
      }
    }

    return {
      recentlyPlayed: albums.slice(0, 5),
      albums: albums,
      artists: artists,
      topTracks: topTracks,
    };
  }

  public async getAlbums(): Promise<Album[]> {
    if (this.albumsCache.length > 0) return this.albumsCache;

    try {
      const queries = ['Daft Punk', 'Hans Zimmer', 'The Weeknd', 'Pink Floyd', 'Interstellar Soundtrack', 'Synthwave', 'Oppenheimer Soundtrack'];
      const promises = queries.map(q =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=4`)
          .then(r => r.json())
          .catch(() => ({ results: [] }))
      );

      const responses = await Promise.all(promises);
      const allResults: any[] = [];
      responses.forEach(r => {
        if (r.results) allResults.push(...r.results);
      });

      const uniqueAlbums = new Map<number, any>();
      allResults.forEach(item => {
        if (item.collectionId && !uniqueAlbums.has(item.collectionId)) {
          uniqueAlbums.set(item.collectionId, item);
        }
      });

      this.albumsCache = Array.from(uniqueAlbums.values()).map(item => ({
        id: `album-${item.collectionId}`,
        title: item.collectionName,
        artist: item.artistName,
        artistId: `artist-${item.artistId}`,
        artwork: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2023,
        genre: item.primaryGenreName,
        trackCount: item.trackCount || 10,
        isFavorite: this.favorites.has(`album-${item.collectionId}`),
      }));

      return this.albumsCache;
    } catch (e) {
      console.error('[LiveMediaProvider] iTunes albums fetch failed', e);
      return [];
    }
  }

  public async getAlbum(id: string): Promise<Album | null> {
    if (this.albumDetailsCache.has(id)) {
      return this.albumDetailsCache.get(id)!;
    }

    try {
      const collectionId = id.replace('album-', '');
      const res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song`);
      const data = await res.json();

      if (!data.results || data.results.length === 0) return null;

      const albumMeta = data.results[0];
      const songs = data.results.slice(1);

      const tracks: Track[] = songs.map((s: any, idx: number) => ({
        id: `track-${s.trackId || idx}`,
        title: s.trackName || `Track ${idx + 1}`,
        artist: s.artistName || albumMeta.artistName,
        album: albumMeta.collectionName,
        albumId: id,
        duration: this.formatMillis(s.trackTimeMillis || 210000),
        durationSeconds: Math.round((s.trackTimeMillis || 210000) / 1000),
        trackNumber: s.trackNumber || idx + 1,
        artwork: (albumMeta.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        audioUrl: s.previewUrl || 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/ce/15/b1/ce15b154-2b27-9d65-4d12-7736f3e029c2/mzaf_15463046040604482889.plus.aac.p.m4a',
      }));

      const fullAlbum: Album = {
        id: id,
        title: albumMeta.collectionName,
        artist: albumMeta.artistName,
        artistId: `artist-${albumMeta.artistId}`,
        artwork: (albumMeta.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        year: albumMeta.releaseDate ? new Date(albumMeta.releaseDate).getFullYear() : 2023,
        genre: albumMeta.primaryGenreName,
        trackCount: tracks.length,
        tracks: tracks,
        isFavorite: this.favorites.has(id),
      };

      this.albumDetailsCache.set(id, fullAlbum);
      return fullAlbum;
    } catch (e) {
      console.error('[LiveMediaProvider] Failed to fetch album tracks', e);
      return null;
    }
  }

  public async getArtists(): Promise<Artist[]> {
    if (this.artistsCache.length > 0) return this.artistsCache;
    const albums = await this.getAlbums();

    const artistMap = new Map<string, Artist>();
    albums.forEach(alb => {
      if (!artistMap.has(alb.artist)) {
        artistMap.set(alb.artist, {
          id: alb.artistId || `artist-${alb.artist.toLowerCase().replace(/\s+/g, '-')}`,
          name: alb.artist,
          genre: alb.genre,
          artwork: alb.artwork,
          albums: [alb],
        });
      } else {
        artistMap.get(alb.artist)!.albums?.push(alb);
      }
    });

    this.artistsCache = Array.from(artistMap.values());
    return this.artistsCache;
  }

  public async getArtist(id: string): Promise<Artist | null> {
    const artists = await this.getArtists();
    return artists.find(a => a.id === id || a.name.toLowerCase() === id.toLowerCase()) || null;
  }

  // --- UNIVERSAL SEARCH (Movies, TV Series, iTunes + Audius Music) ---
  public async search(query: string): Promise<MediaSearchCategoryResult> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return { movies: [], shows: [], episodes: [], albums: [], artists: [], tracks: [] };
    }

    const result: MediaSearchCategoryResult = {
      movies: [],
      shows: [],
      episodes: [],
      albums: [],
      artists: [],
      tracks: [],
    };

    // Parallel fetch across all providers with timeout protection
    const [cinemetaMovies, cinemetaShows, tvMazeShows, audiusMusic, itunesAlbums, itunesSongs] = await Promise.allSettled([
      // 1. Cinemeta Movies
      fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`)
        .then(r => r.json())
        .catch(() => ({ metas: [] })),

      // 2. Cinemeta Series
      fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`)
        .then(r => r.json())
        .catch(() => ({ metas: [] })),

      // 3. TVMaze Series
      fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .catch(() => []),

      // 4. Audius Open Music
      musicPluginService.searchAudius(query).catch(() => []),

      // 5. iTunes Albums
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=8`)
        .then(r => r.json())
        .catch(() => ({ results: [] })),

      // 6. iTunes Songs
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`)
        .then(r => r.json())
        .catch(() => ({ results: [] })),
    ]);

    // Process Movies
    const regionalMatches = ALL_REGIONAL_MOVIES.filter(m => 
      m.title.toLowerCase().includes(trimmed) ||
      (m.language && m.language.toLowerCase().includes(trimmed)) ||
      (m.director && m.director.toLowerCase().includes(trimmed)) ||
      (m.cast && m.cast.some(c => c.toLowerCase().includes(trimmed))) ||
      m.genres.some(g => g.toLowerCase().includes(trimmed))
    );

    if (cinemetaMovies.status === 'fulfilled' && cinemetaMovies.value?.metas) {
      const cinemetaList = cinemetaMovies.value.metas
        .filter((m: any) => m.id && m.name && m.poster)
        .slice(0, 10)
        .map((m: any) => this.mapCinemetaMovie(m));
      
      const combined = [...regionalMatches];
      cinemetaList.forEach((m: Movie) => {
        if (!combined.some(existing => existing.id === m.id)) {
          combined.push(m);
        }
      });
      result.movies = combined;
    } else {
      result.movies = regionalMatches;
    }

    // Local cached movies fallback if Cinemeta search was thin
    if (result.movies.length === 0 && this.moviesCache.length > 0) {
      result.movies = this.moviesCache
        .filter(m => m.title.toLowerCase().includes(trimmed) || m.genres.some(g => g.toLowerCase().includes(trimmed)))
        .slice(0, 8);
    }

    // Process TV Shows (Cinemeta + TVMaze)
    const showMap = new Map<string, Show>();

    if (cinemetaShows.status === 'fulfilled' && cinemetaShows.value?.metas) {
      cinemetaShows.value.metas.forEach((m: any) => {
        if (m.id && m.name && m.poster) {
          const s = this.mapCinemetaMovie(m);
          showMap.set(s.id, {
            id: s.id,
            title: s.title,
            description: s.description,
            poster: s.poster,
            backdrop: s.backdrop,
            year: s.year,
            rating: s.rating,
            genres: s.genres,
            network: 'Streaming',
            status: 'Ongoing',
            isFavorite: this.favorites.has(s.id),
          });
        }
      });
    }

    if (tvMazeShows.status === 'fulfilled' && Array.isArray(tvMazeShows.value)) {
      tvMazeShows.value.forEach((item: any) => {
        if (item.show && item.show.image?.original) {
          const s = this.mapTvMazeShow(item.show);
          if (!showMap.has(s.id)) {
            showMap.set(s.id, s);
          }
        }
      });
    }

    result.shows = Array.from(showMap.values()).slice(0, 8);

    // Process Audius Tracks
    if (audiusMusic.status === 'fulfilled' && Array.isArray(audiusMusic.value)) {
      result.tracks.push(...audiusMusic.value.slice(0, 8));
    }

    // Process iTunes Albums
    if (itunesAlbums.status === 'fulfilled' && itunesAlbums.value?.results) {
      result.albums = itunesAlbums.value.results.map((a: any) => ({
        id: `album-${a.collectionId}`,
        title: a.collectionName,
        artist: a.artistName,
        artwork: (a.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        year: a.releaseDate ? new Date(a.releaseDate).getFullYear() : 2023,
        genre: a.primaryGenreName,
        trackCount: a.trackCount,
      }));
    }

    // Process iTunes Songs
    if (itunesSongs.status === 'fulfilled' && itunesSongs.value?.results) {
      const itunesTracks = itunesSongs.value.results.map((s: any, idx: number) => ({
        id: `track-${s.trackId || idx}`,
        title: s.trackName,
        artist: s.artistName,
        album: s.collectionName,
        albumId: `album-${s.collectionId}`,
        duration: this.formatMillis(s.trackTimeMillis || 200000),
        durationSeconds: Math.round((s.trackTimeMillis || 200000) / 1000),
        trackNumber: s.trackNumber || 1,
        artwork: (s.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        audioUrl: s.previewUrl,
      }));
      result.tracks.push(...itunesTracks.slice(0, 8));
    }

    return result;
  }

  // --- CONTINUE WATCHING & FAVORITES ---
  public async getContinueWatching(): Promise<ContinueWatchingItem[]> {
    const items: ContinueWatchingItem[] = [];
    const movies = await this.getMovies();
    const profileId = this.getActiveProfileId();
    const profilePrefix = `tv_playback_progress_${profileId}_`;
    const legacyPrefix = 'tv_playback_progress_';

    try {
      const allKeys = Object.keys(localStorage);
      const keys = allKeys.filter((k) => {
        if (k.startsWith(profilePrefix)) return true;
        if (
          (profileId === 'prof-primary' || profileId === 'primary') &&
          k.startsWith(legacyPrefix) &&
          !k.slice(legacyPrefix.length).startsWith('prof-')
        ) {
          return true;
        }
        return false;
      });

      for (const k of keys) {
        let id = k;
        if (k.startsWith(profilePrefix)) {
          id = k.replace(profilePrefix, '');
        } else if (k.startsWith(legacyPrefix)) {
          id = k.replace(legacyPrefix, '');
        }
        const data = JSON.parse(localStorage.getItem(k) || '{}');
        if (data.position && data.duration && data.position > 5 && data.position < data.duration - 10) {
          const progress = Math.min(100, Math.round((data.position / data.duration) * 100));
          const movie = movies.find((m) => m.id === id);

          if (data.mediaType === 'episode') {
            items.push({
              id: id,
              type: 'episode',
              title: data.title || 'Episode',
              subtitle: data.subtitle || `Resume at ${this.formatSeconds(data.position)}`,
              poster: data.artwork || data.backdrop || `https://images.metahub.space/background/medium/tt0903747/img`,
              backdrop: data.backdrop || data.artwork || `https://images.metahub.space/background/medium/tt0903747/img`,
              progress: progress,
              duration: this.formatSeconds(data.duration),
              lastPlayedPosition: data.position,
              media: {
                id: id,
                showId: data.showId || 'show-unknown',
                seasonId: `season-${data.seasonNumber || 1}`,
                number: data.episodeNumber || 1,
                seasonNumber: data.seasonNumber || 1,
                title: data.title || 'Episode',
                description: '',
                thumbnail: data.artwork || data.backdrop || '',
                runtime: `${Math.round(data.duration / 60)} min`,
                runtimeMinutes: Math.round(data.duration / 60),
              } as Episode,
            });
          } else if (movie) {
            items.push({
              id: movie.id,
              type: 'movie',
              title: movie.title,
              subtitle: `Resume at ${this.formatSeconds(data.position)}`,
              poster: movie.poster,
              backdrop: movie.backdrop,
              progress: progress,
              duration: movie.runtime,
              lastPlayedPosition: data.position,
              media: movie,
            });
          } else if (data.title) {
            // Fallback for custom or direct streamed movie
            const cleanImdb = id.startsWith('tt') ? id : 'tt0816692';
            items.push({
              id: id,
              type: 'movie',
              title: data.title,
              subtitle: data.subtitle || `Resume at ${this.formatSeconds(data.position)}`,
              poster: data.artwork || `https://images.metahub.space/poster/medium/${cleanImdb}/img`,
              backdrop: data.backdrop || `https://images.metahub.space/background/medium/${cleanImdb}/img`,
              progress: progress,
              duration: this.formatSeconds(data.duration),
              lastPlayedPosition: data.position,
              media: {
                id: id,
                imdbId: cleanImdb,
                title: data.title,
                description: '',
                poster: data.artwork || `https://images.metahub.space/poster/medium/${cleanImdb}/img`,
                backdrop: data.backdrop || `https://images.metahub.space/background/medium/${cleanImdb}/img`,
                year: 2024,
                runtime: `${Math.round(data.duration / 60)} min`,
                runtimeMinutes: Math.round(data.duration / 60),
                rating: '8.5',
                genres: ['Drama'],
              } as Movie,
            });
          }
        }
      }
    } catch (e) {}

    if (items.length === 0) {
      return SHOWCASE_CONTINUE_ITEMS;
    }

    return items;
  }

  public async getRecentlyAdded(): Promise<{ movies: Movie[]; shows: Show[]; albums: Album[] }> {
    const movies = await this.getMovies();
    const shows = await this.getShows();
    const albums = await this.getAlbums();

    return {
      movies: movies.slice(0, 8),
      shows: shows.slice(0, 8),
      albums: albums.slice(0, 8),
    };
  }

  public async getFavorites(): Promise<{ movies: Movie[]; shows: Show[]; albums: Album[] }> {
    const movies = await this.getMovies();
    const shows = await this.getShows();
    const albums = await this.getAlbums();

    return {
      movies: movies.filter((m) => this.favorites.has(m.id)),
      shows: shows.filter((s) => this.favorites.has(s.id)),
      albums: albums.filter((a) => this.favorites.has(a.id)),
    };
  }

  public async toggleFavorite(id: string, type: 'movie' | 'show' | 'album'): Promise<boolean> {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
      this.saveFavorites();
      return false;
    } else {
      this.favorites.add(id);
      this.saveFavorites();
      return true;
    }
  }

  private parseRuntimeToSeconds(runtime?: string, runtimeMinutes?: number, defaultFallback = 7200): number {
    if (runtimeMinutes && runtimeMinutes > 0) {
      return runtimeMinutes * 60;
    }
    if (runtime && typeof runtime === 'string') {
      const hoursMatch = runtime.match(/(\d+)\s*h/i);
      const minsMatch = runtime.match(/(\d+)\s*m/i);
      let totalSecs = 0;
      if (hoursMatch) totalSecs += parseInt(hoursMatch[1], 10) * 3600;
      if (minsMatch) totalSecs += parseInt(minsMatch[1], 10) * 60;
      if (totalSecs > 0) return totalSecs;

      const minOnlyMatch = runtime.match(/(\d+)\s*(?:min|mins)/i);
      if (minOnlyMatch) return parseInt(minOnlyMatch[1], 10) * 60;
    }
    return defaultFallback;
  }

  // --- PLAYBACK SOURCE RESOLVER ---
  public async getPlaybackSource(item: Movie | Episode | Track): Promise<PlaybackSource> {
    let savedPos = 0;
    try {
      const profileId = this.getActiveProfileId();
      const stored =
        localStorage.getItem(`tv_playback_progress_${profileId}_${item.id}`) ||
        localStorage.getItem(`tv_playback_progress_${item.id}`);
      if (stored) {
        savedPos = JSON.parse(stored).position || 0;
      }
    } catch (e) {}


    if ('director' in item) {
      // Movie
      const mov = item as Movie;
      const cleanImdb = mov.id.startsWith('tt') ? mov.id : 'tt0816692';
      const subs = await addonService.fetchSubtitles('movie', cleanImdb);

      let targetUrl: string;
      let targetStreamType: 'direct' | 'embed' | 'youtube' = 'direct';

      // Priority 1: explicit .mp4/.m3u8 on the movie object
      if (mov.streamUrl && (mov.streamUrl.endsWith('.mp4') || mov.streamUrl.endsWith('.mkv') || mov.streamUrl.endsWith('.m3u8'))) {
        targetUrl = mov.streamUrl;
        targetStreamType = 'direct';
      }
      // Priority 2: Full feature cloud stream mirror (VidLink)
      else {
        targetUrl = `https://vidlink.pro/movie/${cleanImdb}?primaryColor=8ab4f8&secondaryColor=ffffff&iconColor=ffffff`;
        targetStreamType = 'embed';
      }

      const calculatedDuration = this.parseRuntimeToSeconds(mov.runtime, mov.runtimeMinutes, 7200);

      return {
        id: `source-${mov.id}`,
        type: 'video',
        streamType: targetStreamType,
        title: mov.title,
        subtitle: `${mov.year} • ${mov.runtime}`,
        artwork: mov.poster,
        backdrop: mov.backdrop,
        streamUrl: targetUrl,
        durationSeconds: calculatedDuration,
        initialPosition: savedPos,
        mediaType: 'movie',
        mediaId: mov.id,
        imdbId: cleanImdb,
        subtitles: subs,
        ytTrailerId: mov.ytTrailerId,
      };
    } else if ('seasonNumber' in item) {
      // Episode
      const ep = item as Episode;
      const cleanShowId = ep.showId.replace(/^show-/, '');
      const cleanImdb = cleanShowId.startsWith('tt') ? cleanShowId : 'tt0903747';
      const subs = await addonService.fetchSubtitles('series', cleanImdb);

      let targetUrl: string;
      let targetStreamType: 'direct' | 'embed' | 'youtube' = 'embed';

      // Priority 1: explicit .mp4/.m3u8 on the episode object
      if (ep.streamUrl && (ep.streamUrl.endsWith('.mp4') || ep.streamUrl.endsWith('.mkv') || ep.streamUrl.endsWith('.m3u8'))) {
        targetUrl = ep.streamUrl;
        targetStreamType = 'direct';
      }
      // Priority 2: Full feature series stream mirror (VidLink)
      else {
        targetUrl = `https://vidlink.pro/tv/${cleanImdb}/${ep.seasonNumber || 1}/${ep.number || 1}?primaryColor=8ab4f8&secondaryColor=ffffff&iconColor=ffffff`;
        targetStreamType = 'embed';
      }

      const calculatedEpDuration = this.parseRuntimeToSeconds(ep.runtime, ep.runtimeMinutes, 2700);

      const intro = ep.intro || (await introService.getIntroTimestamps({
        id: `source-${ep.id}`,
        type: 'video',
        title: ep.title,
        streamUrl: targetUrl,
        mediaType: 'episode',
        mediaId: ep.id,
        showId: ep.showId,
        episodeNumber: ep.number,
        seasonNumber: ep.seasonNumber,
        imdbId: cleanImdb,
        durationSeconds: calculatedEpDuration,
      }));

      return {
        id: `source-${ep.id}`,
        type: 'video',
        streamType: targetStreamType,
        title: ep.title,
        subtitle: `S${ep.seasonNumber} : E${ep.number} • ${ep.runtime}`,
        artwork: ep.thumbnail,
        backdrop: ep.thumbnail,
        streamUrl: targetUrl,
        durationSeconds: calculatedEpDuration,
        initialPosition: savedPos,
        mediaType: 'episode',
        mediaId: ep.id,
        showId: ep.showId,
        seasonId: ep.seasonId,
        episodeNumber: ep.number,
        seasonNumber: ep.seasonNumber,
        imdbId: cleanImdb,
        subtitles: subs,
        intro: intro ? { start: intro.start, end: intro.end, type: intro.type } : undefined,
      };
    } else {
      // Track (Audio)
      const trk = item as Track;
      
      // Resolve full-length uninterrupted audio stream with fast timeout fallback
      let streamAudioUrl = trk.audioUrl;
      try {
        if (!trk.isAudius || !streamAudioUrl) {
          const resolvePromise = musicPluginService.resolveFullAudioStream(trk.title, trk.artist, trk.audioUrl);
          const timeoutPromise = new Promise<string>((res) => setTimeout(() => res(trk.audioUrl || ''), 2500));
          streamAudioUrl = await Promise.race([resolvePromise, timeoutPromise]);
        }
      } catch (e) {
        streamAudioUrl = trk.audioUrl;
      }

      // Fetch LRCLIB Synced Lyrics with fast timeout
      let lyricsList: SyncedLyricLine[] = [];
      try {
        const lyricsPromise = musicPluginService.fetchSyncedLyrics(trk.title, trk.artist);
        const lyricsTimeout = new Promise<{ synced: SyncedLyricLine[] }>((res) => setTimeout(() => res({ synced: [] }), 1500));
        const lyricsData = await Promise.race([lyricsPromise, lyricsTimeout]);
        lyricsList = lyricsData.synced;
      } catch (e) {}

      return {
        id: `source-${trk.id}`,
        type: 'audio',
        title: trk.title,
        subtitle: `${trk.artist} — ${trk.album}`,
        artist: trk.artist,
        album: trk.album,
        artwork: trk.artwork,
        streamUrl: streamAudioUrl || trk.audioUrl || 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/ce/15/b1/ce15b154-2b27-9d65-4d12-7736f3e029c2/mzaf_15463046040604482889.plus.aac.p.m4a',
        durationSeconds: trk.durationSeconds || 210,
        initialPosition: 0,
        mediaType: 'track',
        mediaId: trk.id,
        lyrics: lyricsList,
      };
    }
  }

  // --- MAPPING HELPERS ---
  private mapCinemetaMovie(item: any): Movie {
    const genres = Array.isArray(item.genres)
      ? item.genres
      : Array.isArray(item.genre)
      ? item.genre
      : typeof item.genre === 'string'
      ? item.genre.split(',').map((s: string) => s.trim())
      : ['Drama', 'Action'];

    const directors = Array.isArray(item.director)
      ? item.director.join(', ')
      : typeof item.director === 'string'
      ? item.director
      : 'Director';

    const castList = Array.isArray(item.cast)
      ? item.cast
      : typeof item.cast === 'string'
      ? item.cast.split(',').map((s: string) => s.trim())
      : [];

    const cleanImdb = item.id || item.imdb_id;
    const poster = item.poster || (cleanImdb && cleanImdb.startsWith('tt') ? `https://images.metahub.space/poster/medium/${cleanImdb}/img` : 'https://images.metahub.space/poster/medium/tt0816692/img');
    const backdrop = item.background || item.backdrop || (cleanImdb && cleanImdb.startsWith('tt') ? `https://images.metahub.space/background/medium/${cleanImdb}/img` : poster);

    let runtimeMinutes = 120;
    if (typeof item.runtime === 'string') {
      const match = item.runtime.match(/(\d+)/);
      if (match) runtimeMinutes = parseInt(match[1], 10);
    } else if (typeof item.runtime === 'number') {
      runtimeMinutes = item.runtime;
    }

    const yearVal = item.year ? parseInt(String(item.year).slice(0, 4), 10) : item.releaseInfo ? parseInt(String(item.releaseInfo).slice(0, 4), 10) : 2024;
    
    // Extract YouTube trailer ID from Cinemeta meta structures
    let ytTrailerId: string | undefined = undefined;
    if (Array.isArray(item.trailers) && item.trailers.length > 0) {
      ytTrailerId = item.trailers[0]?.source || item.trailers[0]?.ytId;
    }
    if (!ytTrailerId && Array.isArray(item.trailerStreams) && item.trailerStreams.length > 0) {
      ytTrailerId = item.trailerStreams[0]?.ytId || item.trailerStreams[0]?.source;
    }
    if (!ytTrailerId && typeof item.trailer === 'string') {
      const match = item.trailer.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
      if (match) ytTrailerId = match[1];
      else if (item.trailer.length === 11) ytTrailerId = item.trailer;
    }
    if (!ytTrailerId && item.ytTrailerId) {
      ytTrailerId = item.ytTrailerId;
    }

    // High quality trailer fallbacks for major cinema titles if not bundled in meta
    const POPULAR_TRAILERS: Record<string, string> = {
      'tt0816692': 'zSWdZVtXT7E', // Interstellar
      'tt15398776': 'uYPbbksJxIg', // Oppenheimer
      'tt15239678': 'Way9Dexny3w', // Dune Part 2
      'tt1160419': 'n9xhJrPXop4',  // Dune
      'tt1375666': 'YoHD9XEInc0',  // Inception
      'tt0468569': 'EXeTwQWrcwY',  // The Dark Knight
      'tt0111161': 'PLl99DlL6b4',  // Shawshank Redemption
      'tt0109830': 'bLvqoHBptjg',  // Forrest Gump
      'tt0133093': 'vKQi3bBA1y8',  // The Matrix
      'tt0172495': 'P5ieIbInFpg',  // Gladiator
      'tt1745960': 'giXco2jaZ_4',  // Top Gun Maverick
      'tt1877830': 'mqqft2x_Aa4',  // The Batman
      'tt1087260': 'JfVOs4VSpmA',  // Spider-Man No Way Home
      'tt0499549': '5PSNL1qE6VY',  // Avatar
      'tt1630029': 'd9MyW72ELq0',  // Avatar 2: The Way of Water
      'tt0068646': 'sY1S34973zA',  // The Godfather
      'tt0110912': 'tGpTpVyI_OQ',  // Pulp Fiction
      'tt0120737': 'V75dMMIW2B4',  // Fellowship of the Ring
      'tt0167260': 'r5X-hFf6Bwo',  // Return of the King
      'tt0080684': 'JNwNXF9Y6kY',  // Empire Strikes Back
      'tt0076759': 'vZ734NWnAHA',  // Star Wars A New Hope
      'tt1853728': '0fUCuvNlOCg',  // Django Unchained
      'tt0848228': 'eOrNdBpGMv8',  // The Avengers
      'tt4154796': 'TcMBFSGVi1c',  // Avengers Endgame
      'tt4154756': '6ZfuNTqbHE8',  // Avengers Infinity War
    };

    if (!ytTrailerId && cleanImdb && POPULAR_TRAILERS[cleanImdb]) {
      ytTrailerId = POPULAR_TRAILERS[cleanImdb];
    }

    const logoUrl =
      item.logo ||
      item.clearlogo ||
      (cleanImdb && cleanImdb.startsWith('tt') ? `https://images.metahub.space/logo/medium/${cleanImdb}/img` : undefined);

    return {
      id: item.id || item.imdb_id || `mov-${item.name?.toLowerCase().replace(/\s+/g, '-')}`,
      title: item.name || item.title || 'Feature Film',
      description: item.description || 'Critically acclaimed motion picture.',
      poster: poster,
      backdrop: backdrop,
      logo: logoUrl,
      year: yearVal,
      runtime: `${runtimeMinutes} min`,
      runtimeMinutes: runtimeMinutes,
      rating: item.imdbRating ? `${item.imdbRating}` : '8.5',
      genres: genres,
      director: directors,
      cast: castList,
      ytTrailerId: ytTrailerId,
      imdbId: item.id || item.imdb_id,
      isFavorite: this.favorites.has(item.id || item.imdb_id),
    };
  }

  private mapTvMazeShow(item: any): Show {
    const showImdb = item.externals?.imdb;
    const logoUrl = showImdb ? `https://images.metahub.space/logo/medium/${showImdb}/img` : undefined;

    const POPULAR_SHOW_TRAILERS: Record<string, string> = {
      'tt0903747': 'HhesaQXLuRY', // Breaking Bad
      'tt0944947': 'KPLWWIOCOOQ', // Game of Thrones
      'tt4574334': 'b9EkMc79ZSU', // Stranger Things
      'tt0460649': 'Hl4bOuGNMwo', // How I Met Your Mother
      'tt0475784': 'd8sYpS6hWp0', // Westworld
      'tt1475582': 'rLw3ZkL6b8E', // Sherlock
      'tt2442560': '78R2b6m6_hE', // Peaky Blinders
      'tt3581920': '8hP9D6kZseM', // The Last of Us
      'tt7366338': '3rP_w8qE5-g', // The Boys
      'tt11198330': '0Z760XNy4VM', // House of the Dragon
    };

    let ytTrailerId: string | undefined = undefined;
    if (showImdb && POPULAR_SHOW_TRAILERS[showImdb]) {
      ytTrailerId = POPULAR_SHOW_TRAILERS[showImdb];
    } else if (item.name?.toLowerCase().includes('breaking bad')) {
      ytTrailerId = 'HhesaQXLuRY';
    } else if (item.name?.toLowerCase().includes('stranger things')) {
      ytTrailerId = 'b9EkMc79ZSU';
    } else if (item.name?.toLowerCase().includes('game of thrones')) {
      ytTrailerId = 'KPLWWIOCOOQ';
    } else if (item.name?.toLowerCase().includes('last of us')) {
      ytTrailerId = '8hP9D6kZseM';
    }

    const castList = Array.isArray(item.cast)
      ? item.cast
      : Array.isArray(item._embedded?.cast)
      ? item._embedded.cast.map((c: any) => c.person?.name).filter(Boolean)
      : undefined;

    return {
      id: `show-${item.id}`,
      title: item.name,
      description: this.stripHtml(item.summary || 'Critically acclaimed television series.'),
      poster: item.image?.original || item.image?.medium || (showImdb ? `https://images.metahub.space/poster/medium/${showImdb}/img` : 'https://images.metahub.space/poster/medium/tt0903747/img'),
      backdrop: item.image?.original || (showImdb ? `https://images.metahub.space/background/medium/${showImdb}/img` : 'https://images.metahub.space/background/medium/tt0903747/img'),
      logo: logoUrl,
      year: item.premiered ? new Date(item.premiered).getFullYear() : 2023,
      rating: item.rating?.average ? `${item.rating.average}` : '8.2',
      genres: item.genres && item.genres.length > 0 ? item.genres : ['Drama'],
      network: item.network?.name || item.webChannel?.name || 'Streaming',
      status: item.status || 'Ended',
      imdbId: showImdb,
      ytTrailerId: ytTrailerId,
      cast: castList,
      isFavorite: this.favorites.has(`show-${item.id}`),
    };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>?/gm, '').trim();
  }

  private formatMillis(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  private formatSeconds(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

export const liveMediaProvider = new LiveMediaProviderService();
export const mediaProvider: MediaProvider = liveMediaProvider;
