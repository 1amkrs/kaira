export type NavigationTab = 'for-you' | 'movies' | 'shows' | 'music' | 'games' | 'library';

export type ScreenId = NavigationTab | 'search' | 'settings' | 'movie-details' | 'show-details' | 'album-details' | 'video-player' | 'music-player' | 'games';

export * from './media';
export * from './profile';

export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  backdropUrl: string;
  posterUrl?: string;
  logoUrl?: string;
  type: 'movie' | 'show' | 'game' | 'live' | 'app';
  genre?: string[];
  year?: number;
  duration?: string;
  rating?: string;
  progress?: number;
  source?: string;
  sourceIcon?: string;
  actionUrl?: string;
  appId?: string;
  featured?: boolean;
}

export interface ContentRailData {
  id: string;
  title: string;
  subtitle?: string;
  aspectRatio?: '16:9' | '16:10' | 'hero' | 'app';
  items: MediaItem[];
}

export interface AppItem {
  id: string;
  name: string;
  category: 'streaming' | 'gaming' | 'utility' | 'music' | 'media';
  iconType: 'lucide' | 'url' | 'svg';
  iconName?: string;
  iconUrl?: string;
  bgColor?: string;
  accentColor?: string;
  launchType: 'executable' | 'uri' | 'web';
  target: string;
  description?: string;
  installed?: boolean;
  isFavorite?: boolean;
}

export interface AmbientBulb {
  id: string;
  name: string;
  position: 'left' | 'top' | 'right';
  ip: string;
  online: boolean;
  colorHex?: string;
  brightness?: number;
}

export interface AmbientState {
  enabled: boolean;
  connected: boolean;
  mode: 'ambient' | 'static' | 'test' | 'cycle' | 'off';
  intensity: number;
  bulbs: AmbientBulb[];
}

export interface DisplaySettings {
  resolution: '1080p' | '1440p' | '4k' | 'auto';
  refreshRate: number;
  hdr: boolean;
  tvMode: boolean;
  autoHideCursor: boolean;
}

export interface ControllerState {
  connected: boolean;
  type: 'xbox' | 'playstation' | 'generic' | 'keyboard';
  lastInputTime: number;
  batteryLevel?: number;
}
