import { AppItem, MediaItem } from '../../types';
import { APP_REGISTRY } from '../../data/apps/appRegistry';
import { platform } from '../../platform';

export interface AppLaunchFeedback {
  active: boolean;
  appName: string;
  target: string;
  status: 'launching' | 'success' | 'error';
  message?: string;
}

class AppService {
  private recentAppIds: string[] = ['youtube', 'netflix', 'steam', 'spotify'];
  private launchListeners: Set<(feedback: AppLaunchFeedback | null) => void> = new Set();

  public getAllApps(): AppItem[] {
    return APP_REGISTRY;
  }

  public getFavoriteApps(): AppItem[] {
    return APP_REGISTRY.filter((app) => app.isFavorite);
  }

  public getAppById(id: string): AppItem | undefined {
    return APP_REGISTRY.find((app) => app.id === id);
  }

  public subscribeToLaunchEvents(listener: (feedback: AppLaunchFeedback | null) => void): () => void {
    this.launchListeners.add(listener);
    return () => {
      this.launchListeners.delete(listener);
    };
  }

  private notifyLaunch(feedback: AppLaunchFeedback | null) {
    this.launchListeners.forEach((fn) => fn(feedback));
  }

  public async launchApp(app: AppItem): Promise<boolean> {
    console.log(`[AppService] Launching App "${app.name}" [${app.launchType}] -> ${app.target}`);

    this.recentAppIds = [app.id, ...this.recentAppIds.filter((id) => id !== app.id)].slice(0, 8);

    this.notifyLaunch({
      active: true,
      appName: app.name,
      target: app.target,
      status: 'launching',
      message: `Launching ${app.name}...`,
    });

    const res = await platform.process.launchApp(app.target, app.launchType);

    setTimeout(() => {
      this.notifyLaunch(null);
    }, 2500);

    return res.success;
  }

  public async launchMedia(media: MediaItem): Promise<boolean> {
    const target = media.actionUrl || (media.source ? `${media.source.toLowerCase().replace(/\s+/g, '')}:` : '');
    console.log(`[AppService] Launching media "${media.title}" -> ${target}`);

    this.notifyLaunch({
      active: true,
      appName: media.title,
      target: target,
      status: 'launching',
      message: `Opening on ${media.source || 'TV'}...`,
    });

    const launchType = media.type === 'game' ? 'uri' : target.startsWith('http') ? 'web' : 'uri';
    const res = await platform.process.launchApp(target, launchType);

    setTimeout(() => {
      this.notifyLaunch(null);
    }, 2500);

    return res.success;
  }
}

export const appService = new AppService();
