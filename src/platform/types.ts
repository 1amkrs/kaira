export type PlatformType = 'linux-x64' | 'linux-arm64' | 'win32-x64' | 'browser-fallback';

export interface DisplayInfo {
  id: number | string;
  name: string;
  width: number;
  height: number;
  refreshRate: number;
  isPrimary: boolean;
  scaleFactor: number;
  hdrSupported: boolean;
  colorDepth?: number;
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
  type: 'hdmi' | 'analog' | 'usb' | 'bluetooth' | 'other';
  channels?: number;
}

export type SemanticControllerAction =
  | 'NAV_UP'
  | 'NAV_DOWN'
  | 'NAV_LEFT'
  | 'NAV_RIGHT'
  | 'SELECT'
  | 'BACK'
  | 'PLAY_PAUSE'
  | 'SEEK_FORWARD'
  | 'SEEK_BACKWARD'
  | 'SUBTITLES'
  | 'MENU'
  | 'SEARCH'
  | 'TAB_PREV'
  | 'TAB_NEXT'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'MUTE';

export interface SystemDiagnostics {
  os: string;
  kernel: string;
  distro?: string;
  arch: 'x86_64' | 'aarch64' | 'x64' | 'arm64' | 'unknown';
  deviceModel: string;
  cpuModel: string;
  cpuCores: number;
  ramTotalBytes: number;
  ramUsedBytes: number;
  ramFreeBytes: number;
  gpuModel: string;
  gpuDriver: string;
  hardwareVideoDecode: string;
  displayServer: 'wayland' | 'x11' | 'windows-dwm' | 'web';
  activeDisplay: DisplayInfo;
  audioServer: 'pipewire' | 'pulseaudio' | 'wasapi' | 'web-audio';
  activeAudioDevice: AudioDeviceInfo;
  networkType: 'ethernet' | 'wifi' | 'offline' | 'unknown';
  ipAddress: string;
  controllerConnected: boolean;
  controllerName: string;
  storageTotalBytes: number;
  storageFreeBytes: number;
  uptimeSeconds: number;
}

export interface IDisplayAdapter {
  getDisplays(): Promise<DisplayInfo[]>;
  getPrimaryDisplay(): Promise<DisplayInfo>;
  setFullscreen(flag: boolean): Promise<boolean>;
  setResolution(width: number, height: number): Promise<void>;
  getHDRSupport(): Promise<boolean>;
}

export interface IAudioAdapter {
  getAudioDevices(): Promise<AudioDeviceInfo[]>;
  getDefaultDevice(): Promise<AudioDeviceInfo | null>;
  setDevice(deviceId: string): Promise<boolean>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  setMute(muted: boolean): Promise<void>;
}

export interface IControllerAdapter {
  init(onAction: (action: SemanticControllerAction) => void): () => void;
  getActiveControllers(): string[];
}

export interface IPowerAdapter {
  sleep(): Promise<void>;
  restart(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ISystemAdapter {
  getDiagnostics(): Promise<SystemDiagnostics>;
  getUptime(): Promise<number>;
}

export interface IProcessAdapter {
  launchApp(target: string, launchType: 'executable' | 'uri' | 'web'): Promise<{ success: boolean; error?: string }>;
  openExternal(url: string): Promise<void>;
  openPath(filePath: string): Promise<string>;
}

export interface INetworkAdapter {
  getNetworkStatus(): Promise<{ connected: boolean; type: 'ethernet' | 'wifi' | 'offline'; ip: string }>;
  subscribe(listener: (status: { connected: boolean; type: 'ethernet' | 'wifi' | 'offline'; ip: string }) => void): () => void;
}

export interface IPlatformAdapter {
  readonly platform: PlatformType;
  readonly isLinux: boolean;
  readonly isARM64: boolean;
  readonly display: IDisplayAdapter;
  readonly audio: IAudioAdapter;
  readonly controller: IControllerAdapter;
  readonly power: IPowerAdapter;
  readonly system: ISystemAdapter;
  readonly process: IProcessAdapter;
  readonly network: INetworkAdapter;
}
