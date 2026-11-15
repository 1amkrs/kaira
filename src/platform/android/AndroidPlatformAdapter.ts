import {
  IPlatformAdapter,
  IDisplayAdapter,
  IAudioAdapter,
  IControllerAdapter,
  IPowerAdapter,
  ISystemAdapter,
  IProcessAdapter,
  INetworkAdapter,
  PlatformType,
  DisplayInfo,
  AudioDeviceInfo,
  SystemDiagnostics,
  SemanticControllerAction,
} from '../types';
import { AndroidEnvironmentInfo, detectAndroidEnvironment } from './androidDetection';
import { resolveAndroidAppTarget } from './androidApps';

function getWebGLGpuInfo(): { gpuModel: string; gpuDriver: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && 'getExtension' in gl) {
      const webgl = gl as WebGLRenderingContext;
      const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = webgl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        if (renderer) {
          return {
            gpuModel: String(renderer),
            gpuDriver: vendor ? `${String(vendor)} / Vulkan / OpenGL ES 3.2` : 'OpenGL ES 3.2 / Vulkan',
          };
        }
      }
    }
  } catch {
    // Ignore headless WebGL probe issues
  }
  return {
    gpuModel: 'Adreno / Mali GPU (Vulkan 1.3)',
    gpuDriver: 'Android SurfaceFlinger / OpenGL ES 3.2',
  };
}

class AndroidDisplayAdapter implements IDisplayAdapter {
  constructor(private readonly env: AndroidEnvironmentInfo) {}

  public async getDisplays(): Promise<DisplayInfo[]> {
    const width = window.screen?.width ? window.screen.width * (window.devicePixelRatio || 1) : window.innerWidth || 1080;
    const height = window.screen?.height ? window.screen.height * (window.devicePixelRatio || 1) : window.innerHeight || 2400;

    return [
      {
        id: 'android-primary',
        name: this.env.isAndroidTV ? `${this.env.deviceModel} (HDMI / Leanback)` : `${this.env.deviceModel} Display`,
        width: Math.round(width),
        height: Math.round(height),
        refreshRate: 60,
        isPrimary: true,
        scaleFactor: window.devicePixelRatio || 1,
        hdrSupported: typeof window.matchMedia === 'function' ? window.matchMedia('(dynamic-range: high)').matches : true,
      },
    ];
  }

  public async getPrimaryDisplay(): Promise<DisplayInfo> {
    const list = await this.getDisplays();
    return list[0];
  }

  public async setFullscreen(flag: boolean): Promise<boolean> {
    if (window.AndroidBridge?.setImmersiveMode) {
      window.AndroidBridge.setImmersiveMode(flag);
      return flag;
    }
    try {
      if (flag && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (!flag && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may require direct user gesture in Android Chrome
    }
    return !!document.fullscreenElement;
  }

  public async setResolution(width: number, _height: number): Promise<void> {
    if (!this.env.isAndroidTV) return;
    const root = document.documentElement;
    if (width >= 3840) {
      root.style.fontSize = '18px';
    } else if (width >= 2560) {
      root.style.fontSize = '16px';
    } else {
      root.style.fontSize = '15px';
    }
  }

  public async getHDRSupport(): Promise<boolean> {
    return typeof window.matchMedia === 'function' ? window.matchMedia('(dynamic-range: high)').matches : true;
  }
}

class AndroidAudioAdapter implements IAudioAdapter {
  private volume: number = 1.0;
  private isMuted: boolean = false;

  constructor(private readonly env: AndroidEnvironmentInfo) {}

  public async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (this.env.isAndroidTV) {
      return [
        { id: 'aaudio-hdmi', name: 'Android TV HDMI eARC / AudioTrack', isDefault: true, type: 'hdmi', channels: 6 },
        { id: 'aaudio-bt', name: 'Bluetooth Audio (A2DP / LDAC)', isDefault: false, type: 'bluetooth', channels: 2 },
      ];
    }
    return [
      { id: 'aaudio-speaker', name: 'Android Device Speaker (AAudio)', isDefault: true, type: 'analog', channels: 2 },
      { id: 'aaudio-bt', name: 'Bluetooth Headphones / Buds', isDefault: false, type: 'bluetooth', channels: 2 },
      { id: 'aaudio-usb', name: 'USB-C DAC Audio', isDefault: false, type: 'usb', channels: 2 },
    ];
  }

  public async getDefaultDevice(): Promise<AudioDeviceInfo | null> {
    const list = await this.getAudioDevices();
    return list[0] || null;
  }

  public async setDevice(_deviceId: string): Promise<boolean> {
    return true;
  }

  public async getVolume(): Promise<number> {
    return this.isMuted ? 0 : this.volume;
  }

  public async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume));
    this.isMuted = this.volume === 0;
  }

  public async setMute(muted: boolean): Promise<void> {
    this.isMuted = muted;
  }
}

class AndroidControllerAdapter implements IControllerAdapter {
  public init(onAction: (action: SemanticControllerAction) => void): () => void {
    const keyHandler = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput && e.key !== 'Escape' && e.key !== 'GoBack' && e.key !== 'BrowserBack') return;

      switch (e.key) {
        case 'ArrowUp':
          onAction('NAV_UP');
          break;
        case 'ArrowDown':
          onAction('NAV_DOWN');
          break;
        case 'ArrowLeft':
          onAction('NAV_LEFT');
          break;
        case 'ArrowRight':
          onAction('NAV_RIGHT');
          break;
        case 'Enter':
        case ' ':
        case 'Select':
          onAction('SELECT');
          break;
        case 'Escape':
        case 'Backspace':
        case 'GoBack':
        case 'BrowserBack':
          onAction('BACK');
          break;
        case 'MediaPlayPause':
        case 'MediaPlay':
        case 'MediaPause':
          onAction('PLAY_PAUSE');
          break;
        case 'MediaFastForward':
        case 'MediaTrackNext':
          onAction('SEEK_FORWARD');
          break;
        case 'MediaRewind':
        case 'MediaTrackPrevious':
          onAction('SEEK_BACKWARD');
          break;
        case 'ContextMenu':
        case 'm':
        case 'M':
          onAction('MENU');
          break;
        case 'y':
        case 'Y':
        case '/':
          onAction('SEARCH');
          break;
      }
    };

    const nativeBackHandler = () => {
      onAction('BACK');
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('kaira:android-back', nativeBackHandler);

    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('kaira:android-back', nativeBackHandler);
    };
  }

  public getActiveControllers(): string[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list: string[] = [];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        list.push(pads[i]!.id);
      }
    }
    return list;
  }
}

class AndroidPowerAdapter implements IPowerAdapter {
  public async sleep(): Promise<void> {
    if (window.AndroidBridge?.sleep) {
      window.AndroidBridge.sleep();
    }
  }

  public async restart(): Promise<void> {
    window.location.reload();
  }

  public async shutdown(): Promise<void> {
    if (window.AndroidBridge?.exitApp) {
      window.AndroidBridge.exitApp();
    }
  }
}

class AndroidSystemAdapter implements ISystemAdapter {
  constructor(private readonly env: AndroidEnvironmentInfo) {}

  public async getDiagnostics(): Promise<SystemDiagnostics> {
    const nativeInfo = window.AndroidBridge?.getDeviceInfo ? (() => {
      try {
        return JSON.parse(window.AndroidBridge!.getDeviceInfo());
      } catch {
        return null;
      }
    })() : null;

    const { gpuModel, gpuDriver } = getWebGLGpuInfo();
    const conn = (navigator as any).connection;
    const netType = !navigator.onLine
      ? 'offline'
      : conn?.type === 'ethernet'
      ? 'ethernet'
      : conn?.type === 'cellular'
      ? 'cellular'
      : 'wifi';

    const deviceMemoryGB = (navigator as any).deviceMemory || 8;
    const totalBytes = deviceMemoryGB * 1024 * 1024 * 1024;

    return {
      os: nativeInfo?.os || `Android ${this.env.androidVersion}${this.env.isAndroidTV ? ' (Android TV)' : ' (Mobile)'}`,
      kernel: nativeInfo?.kernel || `Android SDK ${nativeInfo?.sdkInt || '34'} / Linux ARM64`,
      distro: this.env.isAndroidTV ? 'Android TV / Google TV' : 'Android OS',
      arch: 'aarch64',
      deviceModel: nativeInfo?.model || this.env.deviceModel,
      cpuModel: nativeInfo?.hardware || 'ARM64 Octa-Core SoC (Snapdragon / Tensor / MediaTek)',
      cpuCores: navigator.hardwareConcurrency || 8,
      ramTotalBytes: totalBytes,
      ramUsedBytes: totalBytes * 0.42,
      ramFreeBytes: totalBytes * 0.58,
      gpuModel,
      gpuDriver,
      hardwareVideoDecode: 'Android MediaCodec Hardware Decode (H.264, HEVC, VP9, AV1)',
      displayServer: 'android-hwc',
      activeDisplay: {
        id: 'android-primary',
        name: this.env.isAndroidTV ? 'Android TV Display (SurfaceFlinger)' : `${this.env.deviceModel} OLED / LCD`,
        width: window.innerWidth || 1080,
        height: window.innerHeight || 2400,
        refreshRate: 60,
        isPrimary: true,
        scaleFactor: window.devicePixelRatio || 1,
        hdrSupported: true,
      },
      audioServer: 'aaudio',
      activeAudioDevice: {
        id: 'aaudio-default',
        name: this.env.isAndroidTV ? 'AAudio HDMI / TV Speakers' : 'AAudio Device Speaker / Bluetooth',
        isDefault: true,
        type: this.env.isAndroidTV ? 'hdmi' : 'analog',
        channels: this.env.isAndroidTV ? 6 : 2,
      },
      networkType: netType,
      ipAddress: 'DHCP (Android Local)',
      controllerConnected: true,
      controllerName: this.env.isAndroidTV ? 'Android TV Remote / Bluetooth Gamepad' : 'Android Touch + HID Gamepad',
      storageTotalBytes: 128 * 1024 * 1024 * 1024,
      storageFreeBytes: 64 * 1024 * 1024 * 1024,
      uptimeSeconds: Math.round(performance.now() / 1000),
    };
  }

  public async getUptime(): Promise<number> {
    return performance.now() / 1000;
  }
}

class AndroidProcessAdapter implements IProcessAdapter {
  constructor(private readonly env: AndroidEnvironmentInfo) {}

  public async launchApp(
    target: string,
    launchType: 'executable' | 'uri' | 'web',
    appId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const mapped = resolveAndroidAppTarget(appId || target, this.env.isAndroidTV);

    if (window.AndroidBridge?.launchApp) {
      const pkg = mapped?.packageName || '';
      const fallback = mapped?.webFallback || (target.startsWith('http') ? target : '');
      const ok = window.AndroidBridge.launchApp(pkg, fallback || target);
      if (ok) return { success: true };
    }

    if (mapped) {
      if (this.env.isNativeBridge) {
        window.location.href = mapped.intentUri;
      } else {
        const opened = window.open(mapped.webFallback, '_blank', 'noopener,noreferrer');
        if (!opened) {
          window.location.href = mapped.webFallback;
        }
      }
      return { success: true };
    }

    if (launchType === 'web' || target.startsWith('http')) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return { success: true };
    }

    if (target.includes('://')) {
      window.location.href = target;
      return { success: true };
    }

    return { success: false, error: 'App package not installed on this Android device' };
  }

  public async openExternal(url: string): Promise<void> {
    if (window.AndroidBridge?.openExternal) {
      window.AndroidBridge.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  public async openPath(_filePath: string): Promise<string> {
    return '';
  }
}

class AndroidNetworkAdapter implements INetworkAdapter {
  private listeners: Set<(status: { connected: boolean; type: 'ethernet' | 'wifi' | 'cellular' | 'offline'; ip: string }) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => this.notify());
    window.addEventListener('offline', () => this.notify());
    const conn = (navigator as any).connection;
    if (conn?.addEventListener) {
      conn.addEventListener('change', () => this.notify());
    }
  }

  private getCurrentStatus(): { connected: boolean; type: 'ethernet' | 'wifi' | 'cellular' | 'offline'; ip: string } {
    if (!navigator.onLine) {
      return { connected: false, type: 'offline', ip: '0.0.0.0' };
    }
    const conn = (navigator as any).connection;
    const type = conn?.type === 'ethernet' ? 'ethernet' : conn?.type === 'cellular' ? 'cellular' : 'wifi';
    return { connected: true, type, ip: 'DHCP' };
  }

  public async getNetworkStatus() {
    return this.getCurrentStatus();
  }

  public subscribe(listener: (status: { connected: boolean; type: 'ethernet' | 'wifi' | 'cellular' | 'offline'; ip: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getCurrentStatus();
    this.listeners.forEach((fn) => fn(status));
  }
}

export class AndroidPlatformAdapter implements IPlatformAdapter {
  public readonly platform: PlatformType;
  public readonly isLinux: boolean = false;
  public readonly isARM64: boolean = true;
  public readonly isAndroid: boolean = true;
  public readonly isAndroidTV: boolean;

  public readonly display: IDisplayAdapter;
  public readonly audio: IAudioAdapter;
  public readonly controller: IControllerAdapter;
  public readonly power: IPowerAdapter;
  public readonly system: ISystemAdapter;
  public readonly process: IProcessAdapter;
  public readonly network: INetworkAdapter;

  constructor(env: AndroidEnvironmentInfo = detectAndroidEnvironment()) {
    this.isAndroidTV = env.isAndroidTV;
    this.platform = env.isAndroidTV ? 'android-tv' : 'android-mobile';

    this.display = new AndroidDisplayAdapter(env);
    this.audio = new AndroidAudioAdapter(env);
    this.controller = new AndroidControllerAdapter();
    this.power = new AndroidPowerAdapter();
    this.system = new AndroidSystemAdapter(env);
    this.process = new AndroidProcessAdapter(env);
    this.network = new AndroidNetworkAdapter();
  }
}
