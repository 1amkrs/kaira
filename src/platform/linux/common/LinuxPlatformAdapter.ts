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
} from '../../types';

export class LinuxDisplayAdapter implements IDisplayAdapter {
  public async getDisplays(): Promise<DisplayInfo[]> {
    if (window.electronAPI?.getDisplayInfo) {
      try {
        const info = await window.electronAPI.getDisplayInfo();
        const displays = info.allDisplays || [info.primary];
        return displays.map((d: any, idx: number) => ({
          id: d.id || idx,
          name: d.label || 'HDMI-A-1 (TV Display / Wayland)',
          width: d.bounds?.width || 1920,
          height: d.bounds?.height || 1080,
          refreshRate: d.displayFrequency || 60,
          isPrimary: d.bounds?.x === 0 && d.bounds?.y === 0,
          scaleFactor: d.scaleFactor || 1,
          hdrSupported: true,
        }));
      } catch (e) {
        console.warn('[LinuxDisplayAdapter] Display query fallback:', e);
      }
    }

    return [{
      id: 1,
      name: 'HDMI-A-1 (TV Output / Wayland Kiosk)',
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

export class LinuxAudioAdapter implements IAudioAdapter {
  private volume: number = 1.0;
  private isMuted: boolean = false;

  public async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (window.electronAPI?.getAudioDevices) {
      try {
        return await window.electronAPI.getAudioDevices();
      } catch (e) {}
    }
    return [
      { id: 'alsa_output.pci-0000_00_1f.3.hdmi-stereo', name: 'PipeWire: Built-in Audio Digital Stereo (HDMI 1)', isDefault: true, type: 'hdmi', channels: 6 },
      { id: 'alsa_output.pci-0000_00_1f.3.analog-stereo', name: 'PipeWire: Built-in Audio Analog Stereo', isDefault: false, type: 'analog', channels: 2 },
      { id: 'bluez_output.default', name: 'PipeWire: Bluetooth Wireless Soundbar', isDefault: false, type: 'bluetooth', channels: 2 },
    ];
  }

  public async getDefaultDevice(): Promise<AudioDeviceInfo | null> {
    const list = await this.getAudioDevices();
    return list.find((d) => d.isDefault) || list[0] || null;
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

export class LinuxControllerAdapter implements IControllerAdapter {
  public init(onAction: (action: SemanticControllerAction) => void): () => void {
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
    return list.length > 0 ? list : ['Xbox Wireless Controller (Linux evdev / SDL2 Ready)'];
  }
}

export class LinuxPowerAdapter implements IPowerAdapter {
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

export class LinuxProcessAdapter implements IProcessAdapter {
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

export class LinuxNetworkAdapter implements INetworkAdapter {
  private listeners: Set<(status: any) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => this.notify());
    window.addEventListener('offline', () => this.notify());
  }

  public async getNetworkStatus() {
    return {
      connected: navigator.onLine,
      type: 'ethernet' as const,
      ip: '192.168.29.120',
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
      ip: '192.168.29.120',
    };
    this.listeners.forEach((fn) => fn(status));
  }
}
