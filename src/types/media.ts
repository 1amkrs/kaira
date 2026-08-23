import { SubtitleTrack } from './addons';

export interface SyncedLyricLine {
  time: number; // In seconds
  text: string;
}

export interface Movie {
  id: string; // e.g. "tt0816692"
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  logo?: string;
  year: number;
  runtime: string;
  runtimeMinutes?: number;
  rating: string;
  genres: string[];
  director?: string;
  cast?: string[];
  streamUrl?: string;
  trailerUrl?: string;
  ytTrailerId?: string;
  imdbId?: string;
  language?: string;
  regionalCategory?: 'malayalam' | 'hindi' | 'tamil' | 'english';
  progress?: number; // 0 to 100
  isFavorite?: boolean;
}

export interface Show {
  id: string; // e.g. "tt0903747" or "show-123"
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  logo?: string;
  year: number;
  rating: string;
  genres: string[];
  network?: string;
  status?: string;
  imdbId?: string;
  creator?: string;
  cast?: string[];
  ytTrailerId?: string;
  trailerUrl?: string;
  seasonsCount?: number;
  seasons?: Season[];
  isFavorite?: boolean;
}

export interface Season {
  id: string;
  showId: string;
  number: number;
  name: string;
  episodeCount?: number;
  episodes?: Episode[];
}

export interface Episode {
  id: string;
  showId: string;
  seasonId: string;
  number: number;
  seasonNumber: number;
  title: string;
  description: string;
  thumbnail: string;
  runtime: string;
  runtimeMinutes?: number;
  airDate?: string;
  streamUrl?: string;
  imdbId?: string;
  progress?: number; // 0 to 100
  intro?: { start: number; end: number; type?: string };
  outro?: { start: number; end: number };
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artwork: string;
  year: number;
  genre?: string;
  trackCount?: number;
  tracks?: Track[];
  isFavorite?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  genre?: string;
  artwork?: string;
  albums?: Album[];
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  duration: string; // e.g. "3:45"
  durationSeconds: number;
  trackNumber: number;
  artwork: string;
  audioUrl: string; // Real playable audio stream URL
  isAudius?: boolean;
  audiusId?: string;
  lyrics?: SyncedLyricLine[];
  plainLyrics?: string;
}

export interface PlaybackSource {
  id: string;
  type: 'video' | 'audio';
  streamType?: 'direct' | 'embed' | 'youtube' | 'torrent';
  title: string;
  subtitle?: string;
  artwork?: string;
  backdrop?: string;
  streamUrl: string;
  durationSeconds?: number;
  initialPosition?: number;
  mediaType: 'movie' | 'episode' | 'track';
  mediaId: string;
  showId?: string;
  seasonId?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  imdbId?: string;
  subtitles?: SubtitleTrack[];
  ytTrailerId?: string;
  lyrics?: SyncedLyricLine[];
  artist?: string;
  album?: string;
  intro?: { start: number; end: number; type?: string };
  outro?: { start: number; end: number };
}

export interface PlaybackState {
  currentSource: PlaybackSource | null;
  status: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended';
  currentTime: number; // in seconds
  duration: number; // in seconds
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  queue: PlaybackSource[];
  queueIndex: number;
  isShuffle: boolean;
  isRepeat: boolean;
}

export interface MediaSearchCategoryResult {
  movies: Movie[];
  shows: Show[];
  episodes: Episode[];
  albums: Album[];
  artists: Artist[];
  tracks: Track[];
}
