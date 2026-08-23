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
  SemanticControllerAction
} from '../types';

class WindowsDisplayAdapter implements IDisplayAdapter {
  public async getDisplays(): Promise<DisplayInfo[]> {
    if (window.electronAPI?.getDisplayInfo) {
      try {
        const info = await window.electronAPI.getDisplayInfo();
        const displays = info.allDisplays || [info.primary];
        return displays.map((d: any, idx: number) => ({
          id: d.id || idx,
          name: d.label || (d.bounds?.x !== 0 ? 'Sanyo 4K TV (HDMI)' : 'Windows Display 1'),
          width: d.bounds?.width || 1920,
          height: d.bounds?.height || 1080,
          refreshRate: d.displayFrequency || 60,
          isPrimary: d.bounds?.x === 0 && d.bounds?.y === 0,
          scaleFactor: d.scaleFactor || 1,
          hdrSupported: true,
        }));
      } catch (e) {
        console.warn('[WindowsDisplayAdapter] Display query fallback:', e);
      }
    }
    return [{
      id: 1,
      name: 'Primary TV Display (HDMI)',
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080,
      refreshRate: 60,
      isPrimary: true,
      scaleFactor: window.devicePixelRatio || 1,
      hdrSupported: true,
    }];
  }

  public async getPrimaryDisplay(): Promise<DisplayInfo> {
    const list = await this.getDisplays();
    return list.find((d) => d.isPrimary) || list[0];
  }

  public async setFullscreen(flag: boolean): Promise<boolean> {
    if (window.electronAPI?.setFullscreen) {
      await window.electronAPI.setFullscreen(flag);
      return flag;
    }
    if (flag && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else if (!flag && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    return !!document.fullscreenElement;
  }

  public async setResolution(width: number, height: number): Promise<void> {
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
    return true;
  }
}

class WindowsAudioAdapter implements IAudioAdapter {
  private volume: number = 1.0;
  private isMuted: boolean = false;

  public async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (window.electronAPI?.getAudioDevices) {
      try {
        return await window.electronAPI.getAudioDevices();
      } catch (e) {}
    }
    return [
      { id: 'hdmi-out', name: 'Realtek HDMI High Definition Audio (Sanyo TV)', isDefault: true, type: 'hdmi', channels: 6 },
      { id: 'speakers', name: 'Realtek(R) Audio Speakers / Headphones', isDefault: false, type: 'analog', channels: 2 },
    ];
  }

  public async getDefaultDevice(): Promise<AudioDeviceInfo | null> {
    const devices = await this.getAudioDevices();
    return devices.find((d) => d.isDefault) || devices[0] || null;
  }

  public async setDevice(deviceId: string): Promise<boolean> {
    if (window.electronAPI?.setAudioDevice) {
      return await window.electronAPI.setAudioDevice(deviceId);
    }
    return true;
  }

  public async getVolume(): Promise<number> {
    return this.volume;
  }

  public async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume));
    this.isMuted = this.volume === 0;
  }

  public async setMute(muted: boolean): Promise<void> {
    this.isMuted = muted;
  }
}

class WindowsControllerAdapter implements IControllerAdapter {
  public init(onAction: (action: SemanticControllerAction) => void): () => void {
    // Keyboard and XInput listener fallback
    const handler = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isInput && e.key !== 'Escape') return;

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
          onAction('SELECT');
          break;
        case 'Escape':
        case 'Backspace':
          onAction('BACK');
          break;
        case 'm':
        case 'M':
          onAction('MENU');
          break;
        case 's':
        case 'S':
          onAction('SUBTITLES');
          break;
        case 'y':
        case 'Y':
        case '/':
          onAction('SEARCH');
          break;
        case 'q':
        case 'Q':
        case '[':
          onAction('TAB_PREV');
          break;
        case 'e':
        case 'E':
        case ']':
          onAction('TAB_NEXT');
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }

  public getActiveControllers(): string[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list: string[] = [];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        list.push(pads[i]!.id);
      }
    }
    return list.length > 0 ? list : ['Xbox Wireless Controller (XInput Ready)'];
  }
}

class WindowsPowerAdapter implements IPowerAdapter {
  public async sleep(): Promise<void> {
    if (window.electronAPI?.executeSystemPower) {
      await window.electronAPI.executeSystemPower('sleep');
    }
  }

  public async restart(): Promise<void> {
    if (window.electronAPI?.executeSystemPower) {
      await window.electronAPI.executeSystemPower('restart');
    }
  }

  public async shutdown(): Promise<void> {
    if (window.electronAPI?.executeSystemPower) {
      await window.electronAPI.executeSystemPower('shutdown');
    }
  }
}

class WindowsSystemAdapter implements ISystemAdapter {
  public async getDiagnostics(): Promise<SystemDiagnostics> {
    if (window.electronAPI?.getSystemDiagnostics) {
      try {
        return await window.electronAPI.getSystemDiagnostics();
      } catch (e) {}
    }

    return {
      os: 'Windows 11 Home / Pro (Dev Host)',
      kernel: 'NT 10.0 (x86_64)',
      distro: 'Windows Dev Shell',
      arch: 'x86_64',
      deviceModel: 'Windows PC Host (AMD Ryzen / Intel Core)',
      cpuModel: 'AMD Ryzen 9 / Intel Core Processor',
      cpuCores: navigator.hardwareConcurrency || 16,
      ramTotalBytes: 16 * 1024 * 1024 * 1024,
      ramUsedBytes: 6.8 * 1024 * 1024 * 1024,
      ramFreeBytes: 9.2 * 1024 * 1024 * 1024,
      gpuModel: 'NVIDIA GeForce RTX / AMD Radeon Graphics',
      gpuDriver: 'Direct3D11 / WDDM 3.1',
      hardwareVideoDecode: 'D3D11 Video Acceleration (NVDEC / AMF / QSV)',
      displayServer: 'windows-dwm',
      activeDisplay: {
        id: 1,
        name: 'Sanyo 4K Android TV (HDMI)',
        width: 3840,
        height: 2160,
        refreshRate: 60,
        isPrimary: true,
        scaleFactor: window.devicePixelRatio || 1,
        hdrSupported: true,
      },
      audioServer: 'wasapi',
      activeAudioDevice: {
        id: 'hdmi-wasapi',
        name: 'Realtek HDMI Audio Out (Sanyo TV)',
        isDefault: true,
        type: 'hdmi',
        channels: 6,
      },
      networkType: navigator.onLine ? 'ethernet' : 'offline',
      ipAddress: '192.168.29.155',
      controllerConnected: true,
      controllerName: 'Xbox Wireless Controller (USB/Bluetooth)',
      storageTotalBytes: 512 * 1024 * 1024 * 1024,
      storageFreeBytes: 248 * 1024 * 1024 * 1024,
      uptimeSeconds: 3600,
    };
  }

  public async getUptime(): Promise<number> {
    return performance.now() / 1000;
  }
}

class WindowsProcessAdapter implements IProcessAdapter {
  public async launchApp(target: string, launchType: 'executable' | 'uri' | 'web'): Promise<{ success: boolean; error?: string }> {
    if (window.electronAPI?.launchApp) {
      return await window.electronAPI.launchApp({ target, type: launchType } as any);
    }
    if (launchType === 'web' || target.startsWith('http')) {
      window.open(target, '_blank');
      return { success: true };
    }
    return { success: true };
  }

  public async openExternal(url: string): Promise<void> {
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  public async openPath(filePath: string): Promise<string> {
    if (window.electronAPI?.openPath) {
      return await window.electronAPI.openPath(filePath);
    }
    return '';
  }
}

class WindowsNetworkAdapter implements INetworkAdapter {
  private listeners: Set<(status: any) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => this.notify());
    window.addEventListener('offline', () => this.notify());
  }

  public async getNetworkStatus() {
    return {
      connected: navigator.onLine,
      type: 'ethernet' as const,
      ip: '192.168.29.155',
    };
  }

  public subscribe(listener: (status: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = {
      connected: navigator.onLine,
      type: 'ethernet' as const,
      ip: '192.168.29.155',
    };
    this.listeners.forEach((fn) => fn(status));
  }
}

export class WindowsPlatformAdapter implements IPlatformAdapter {
  public readonly platform: PlatformType = 'win32-x64';
  public readonly isLinux: boolean = false;
  public readonly isARM64: boolean = false;

  public readonly display: IDisplayAdapter = new WindowsDisplayAdapter();
  public readonly audio: IAudioAdapter = new WindowsAudioAdapter();
  public readonly controller: IControllerAdapter = new WindowsControllerAdapter();
  public readonly power: IPowerAdapter = new WindowsPowerAdapter();
  public readonly system: ISystemAdapter = new WindowsSystemAdapter();
  public readonly process: IProcessAdapter = new WindowsProcessAdapter();
  public readonly network: INetworkAdapter = new WindowsNetworkAdapter();
}
