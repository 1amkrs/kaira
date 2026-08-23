import { AppItem, MediaItem } from '../../types';
import { APP_REGISTRY } from '../../data/apps/appRegistry';


export interface LaunchFeedback {
  active: boolean;
  appName: string;
  target: string;
  status: 'launching' | 'success' | 'error';
  message?: string;
}

class AppLauncherService {
  private recentAppIds: string[] = ['youtube', 'netflix', 'steam', 'spotify'];
  private launchListeners: Set<(feedback: LaunchFeedback | null) => void> = new Set();

  public getAllApps(): AppItem[] {
    return APP_REGISTRY;
  }

  public getFavoriteApps(): AppItem[] {
    return APP_REGISTRY.filter(app => app.isFavorite);
  }

  public getAppById(id: string): AppItem | undefined {
    return APP_REGISTRY.find(app => app.id === id);
  }

  public subscribeToLaunchEvents(listener: (feedback: LaunchFeedback | null) => void): () => void {
    this.launchListeners.add(listener);
    return () => {
      this.launchListeners.delete(listener);
    };
  }

  private notifyLaunch(feedback: LaunchFeedback | null) {
    this.launchListeners.forEach(fn => fn(feedback));
  }

  public async launchMedia(media: MediaItem): Promise<boolean> {
    const target = media.actionUrl || (media.source ? `${media.source.toLowerCase().replace(/\s+/g, '')}:` : '');
    console.log(`[AppLauncher] Launching media "${media.title}" -> ${target}`);
    
    this.notifyLaunch({
      active: true,
      appName: media.title,
      target: target,
      status: 'launching',
      message: `Opening on ${media.source || 'TV'}...`
    });

    const success = await this.launchTarget(target, media.type === 'game' ? 'uri' : (target.startsWith('http') ? 'web' : 'uri'));

    setTimeout(() => {
      this.notifyLaunch(null);
    }, 2500);

    return success;
  }

  public async launchApp(app: AppItem): Promise<boolean> {
    console.log(`[AppLauncher] Launching App "${app.name}" [${app.launchType}] -> ${app.target}`);

    // Update recent apps
    this.recentAppIds = [app.id, ...this.recentAppIds.filter(id => id !== app.id)].slice(0, 8);

    this.notifyLaunch({
      active: true,
      appName: app.name,
      target: app.target,
      status: 'launching',
      message: `Launching ${app.name}...`
    });

    const success = await this.launchTarget(app.target, app.launchType, app);

    setTimeout(() => {
      this.notifyLaunch(null);
    }, 2500);

    return success;
  }

  public async launchTarget(target: string, launchType: 'executable' | 'uri' | 'web', fullApp?: AppItem): Promise<boolean> {
    if (!target) return false;

    // 1. If running inside Electron Native Shell
    if (window.electronAPI) {
      try {
        if (fullApp) {
          const res = await window.electronAPI.launchApp(fullApp);
          return res.success;
        } else if (launchType === 'web' || target.startsWith('http')) {
          await window.electronAPI.openExternal(target);
          return true;
        } else {
          const res = await window.electronAPI.launchApp({ target, type: launchType });
          return res.success;
        }
      } catch (err) {
        console.error('[AppLauncher] Electron launch error:', err);
      }
    }

    // 2. Web / Browser fallback
    try {
      if (launchType === 'web' || target.startsWith('http')) {
        window.open(target, '_blank');
        return true;
      } else if (launchType === 'uri') {
        // Trigger URI protocol in Windows
        const link = document.createElement('a');
        link.href = target;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } else {
        // Executable launch in browser simulation
        console.log(`[AppLauncher] Simulated Windows executable launch: ${target}`);
        return true;
      }
    } catch (e) {
      console.error('[AppLauncher] Launch failed:', e);
      return false;
    }
  }
}

export const appLauncher = new AppLauncherService();
