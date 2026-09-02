import { NavigationTab } from '../../types';

export type RemoteCommandType =
  | 'NAV_UP'
  | 'NAV_DOWN'
  | 'NAV_LEFT'
  | 'NAV_RIGHT'
  | 'SELECT'
  | 'BACK'
  | 'HOME'
  | 'MENU'
  | 'SEARCH'
  | 'QUICK_SETTINGS'
  | 'TAB_PREV'
  | 'TAB_NEXT'
  | 'SET_TAB'
  | 'SEARCH_QUERY'
  | 'VOICE_QUERY'
  | 'INPUT_TEXT'
  | 'KEY_PRESS'
  | 'PLAY_PAUSE'
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'SEEK_RELATIVE'
  | 'NEXT_TRACK'
  | 'PREV_TRACK'
  | 'SET_VOLUME'
  | 'VOLUME_DELTA'
  | 'MUTE_TOGGLE'
  | 'SUBTITLES_TOGGLE'
  | 'TRIGGER_SCREENSAVER'
  | 'OPEN_SLEEP_TIMER'
  | 'SET_AMBIENT_MODE'
  | 'SET_AMBIENT_INTENSITY'
  | 'LAUNCH_APP'
  | 'PLAY_MEDIA'
  | 'POWER_ACTION';

export interface RemoteCommand {
  id?: string;
  type: RemoteCommandType;
  payload?: any;
  timestamp?: number;
}

export interface NowPlayingMedia {
  id: string;
  title: string;
  subtitle?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  type: 'movie' | 'show' | 'episode' | 'track' | 'audio' | 'video';
  durationSeconds: number;
  positionSeconds: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
}

export interface TVStateSnapshot {
  activeTab: NavigationTab;
  activeModal: 'search' | 'settings' | 'quick-settings' | 'profile' | 'sleep' | 'remote' | null;
  nowPlaying: NowPlayingMedia | null;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  ambientState: {
    enabled: boolean;
    mode: string;
    intensity: number;
    connected: boolean;
  };
  connectedClients: number;
  serverIp: string;
  serverPort: number;
  tvName: string;
  uptimeSeconds: number;
  timestamp: number;
}

export type RemoteServerMessage =
  | { type: 'STATE_UPDATE'; payload: TVStateSnapshot }
  | { type: 'CLIENT_COUNT'; payload: { count: number } }
  | { type: 'COMMAND_ACK'; payload: { id?: string; success: boolean; error?: string } }
  | { type: 'PONG'; timestamp: number }
  | { type: 'TOAST'; payload: { message: string; type?: 'info' | 'success' | 'warning' } };

export type RemoteClientMessage =
  | { type: 'COMMAND'; payload: RemoteCommand }
  | { type: 'REQUEST_STATE' }
  | { type: 'PING'; timestamp: number }
  | { type: 'IDENTIFY'; payload: { deviceName?: string; os?: string; browser?: string } };
