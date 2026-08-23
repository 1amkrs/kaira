import {
  Movie,
  Show,
  Episode,
  Album,
  Artist,
  Track,
  PlaybackSource,
  MediaSearchCategoryResult,
} from '../../types/media';

export interface ContinueWatchingItem {
  id: string;
  type: 'movie' | 'episode';
  title: string;
  subtitle?: string;
  poster: string;
  backdrop: string;
  progress: number;
  duration: string;
  lastPlayedPosition: number;
  media: Movie | Episode;
}

export interface MediaProvider {
  // Movies
  getMovies(): Promise<Movie[]>;
  getMovie(id: string): Promise<Movie | null>;
  getHollywoodMovies(): Promise<Movie[]>;
  getFeaturedMovie(): Promise<Movie>;
  getRegionalMovies(category?: 'malayalam' | 'hindi' | 'tamil' | 'all'): Promise<Movie[]>;
  getMalayalamMovies(): Promise<Movie[]>;
  getHindiMovies(): Promise<Movie[]>;
  getTamilMovies(): Promise<Movie[]>;

  // TV Shows
  getShows(): Promise<Show[]>;
  getShow(id: string): Promise<Show | null>;
  getEpisodes(showId: string, seasonNumber?: number): Promise<Episode[]>;

  // Music
  getMusic(): Promise<{
    recentlyPlayed: Album[];
    albums: Album[];
    artists: Artist[];
    topTracks: Track[];
  }>;
  getAlbums(): Promise<Album[]>;
  getAlbum(id: string): Promise<Album | null>;
  getArtists(): Promise<Artist[]>;
  getArtist(id: string): Promise<Artist | null>;

  // Search
  search(query: string): Promise<MediaSearchCategoryResult>;

  // Curation & User State
  getContinueWatching(): Promise<ContinueWatchingItem[]>;
  getRecentlyAdded(): Promise<{ movies: Movie[]; shows: Show[]; albums: Album[] }>;
  getFavorites(): Promise<{ movies: Movie[]; shows: Show[]; albums: Album[] }>;
  toggleFavorite(id: string, type: 'movie' | 'show' | 'album'): Promise<boolean>;

  // Playback
  getPlaybackSource(item: Movie | Episode | Track): Promise<PlaybackSource>;
}
