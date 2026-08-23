import { SubtitleTrack, AddonStream } from '../../types/addons';
import { PlaybackSource } from '../../types/media';

export type DriverType = 'direct' | 'youtube' | 'embed';

export type DriverStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface DriverState {
  status: DriverStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  bufferedPercent: number;
  error?: string;
}

export interface DriverCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onStatusChange: (status: DriverStatus) => void;
  onBuffering: (isBuffering: boolean) => void;
  onEnded: () => void;
  onError: (error: string) => void;
}

export interface IPlaybackDriver {
  readonly type: DriverType;
  initialize(container: HTMLElement, callbacks: DriverCallbacks): Promise<void> | void;
  loadSource(url: string, initialPosition?: number, expectedDuration?: number): Promise<void> | void;
  play(): Promise<void> | void;
  pause(): void;
  togglePlayPause?(): void;
  seekTo(seconds: number): void;
  seekBy(deltaSeconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setSpeed(speed: number): void;
  destroy(): void;
  getState(): DriverState;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface PlayerEngineConfig {
  autoSkipIntro?: boolean;
  vocalBoost?: boolean;
  preferredSubtitleLang?: string;
  playbackSpeed?: number;
}
