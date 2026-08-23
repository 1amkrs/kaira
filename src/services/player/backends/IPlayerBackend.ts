export type BackendType = 'html5' | 'mpv' | 'youtube' | 'embed';

export type BackendStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface BackendState {
  status: BackendStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  bufferedPercent: number;
  error?: string;
}

export interface BackendCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onStatusChange: (status: BackendStatus) => void;
  onBuffering: (isBuffering: boolean) => void;
  onEnded: () => void;
  onError: (error: string) => void;
}

export interface IPlayerBackend {
  readonly type: BackendType;
  initialize(container: HTMLElement, callbacks: BackendCallbacks): Promise<void> | void;
  loadSource(url: string, initialPosition?: number, expectedDuration?: number): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seekTo(seconds: number): void;
  seekBy(deltaSeconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setSpeed(speed: number): void;
  destroy(): void;
  getState(): BackendState;
  getVideoElement?(): HTMLVideoElement | null;
}
