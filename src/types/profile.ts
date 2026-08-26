export type AvatarIconType = 'user' | 'sparkles' | 'gamepad' | 'film' | 'music' | 'baby' | 'heart' | 'tv' | 'star';

export type PinMemoryPolicy = 'always' | 'session' | 'device';

export interface UserProfile {
  id: string; // e.g. "prof-primary", "prof-kids", "prof-guest", "prof-12345"
  name: string;
  avatarColor: string; // CSS linear-gradient or hex color
  avatarIcon?: AvatarIconType;
  type: 'adult' | 'kids' | 'guest';
  badge: string;
  pin?: string; // 4-digit numeric string e.g. "1234", if set requires PIN entry
  isKid?: boolean;
  createdAt: number;
}

export interface ProfileMemoryData {
  lastTab?: 'for-you' | 'movies' | 'shows' | 'music' | 'games' | 'library';
  lastPlayedMediaId?: string;
  lastPlayedTitle?: string;
  lastActiveTimestamp?: number;
  volume?: number;
  subtitlesEnabled?: boolean;
  preferredAudioLang?: string;
}

export interface WatchHistoryEntry {
  id: string;
  mediaId: string;
  title: string;
  type: 'movie' | 'show' | 'track';
  poster?: string;
  backdrop?: string;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  timestamp: number;
  genres?: string[];
  rating?: string;
  year?: number | string;
  episodeInfo?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle?: string;
  };
}

export interface GenreAffinity {
  genre: string;
  count: number;
  percentage: number;
  weight: number;
}

export interface RecommendationContext {
  topGenres: string[];
  genreAffinities: GenreAffinity[];
  totalWatched: number;
  primaryGenre: string | null;
  reason: string;
}

export interface ProfileServiceState {
  profiles: UserProfile[];
  activeProfileId: string;
  promptOnLaunch: boolean;
  pinMemoryPolicy: PinMemoryPolicy;
  rememberLastTab: boolean;
  unlockedProfileIds: string[]; // IDs of profiles unlocked in current session
}

export interface CreateProfileDTO {
  name: string;
  avatarColor: string;
  avatarIcon?: AvatarIconType;
  type: 'adult' | 'kids' | 'guest';
  pin?: string;
  isKid?: boolean;
}

export interface UpdateProfileDTO {
  name?: string;
  avatarColor?: string;
  avatarIcon?: AvatarIconType;
  type?: 'adult' | 'kids' | 'guest';
  pin?: string | null; // null to remove pin
  isKid?: boolean;
}


