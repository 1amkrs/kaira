import { DisplaySettings } from '../../types';
import { platform } from '../../platform';

class DisplayService {
  private settings: DisplaySettings = {
    resolution: '1080p',
    refreshRate: 60,
    hdr: true,
    tvMode: true,
    autoHideCursor: true,
  };

  private isFullscreen: boolean = false;

  constructor() {
    this.isFullscreen = !!document.fullscreenElement;
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  }

  public getSettings(): DisplaySettings {
    return { ...this.settings };
  }

  public async toggleFullscreen(): Promise<boolean> {
    this.isFullscreen = !this.isFullscreen;
    return await platform.display.setFullscreen(this.isFullscreen);
  }

  public async setResolution(res: '1080p' | '1440p' | '4k' | 'auto'): Promise<void> {
    this.settings.resolution = res;
    const width = res === '4k' ? 3840 : res === '1440p' ? 2560 : 1920;
    const height = res === '4k' ? 2160 : res === '1440p' ? 1440 : 1080;
    await platform.display.setResolution(width, height);
  }

  public async triggerPowerAction(action: 'sleep' | 'restart' | 'shutdown'): Promise<void> {
    console.log(`[DisplayService] Power action requested: ${action}`);
    if (action === 'sleep') await platform.power.sleep();
    else if (action === 'restart') await platform.power.restart();
    else if (action === 'shutdown') await platform.power.shutdown();
  }
}

export const displayService = new DisplayService();
