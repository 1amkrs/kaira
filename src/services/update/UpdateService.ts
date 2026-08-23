export interface SystemUpdateInfo {
  hasUpdate: boolean;
  version?: string;
  releaseDate?: string;
  changelog?: string;
  downloadSize?: string;
  status: 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready_to_reboot' | 'error';
  progressPercent?: number;
  error?: string;
}

export class UpdateService {
  private state: SystemUpdateInfo = {
    hasUpdate: false,
    status: 'idle',
  };
  private listeners: Set<(state: SystemUpdateInfo) => void> = new Set();

  public getState(): SystemUpdateInfo {
    return { ...this.state };
  }

  public subscribe(listener: (state: SystemUpdateInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public async checkForUpdates(): Promise<SystemUpdateInfo> {
    console.log('[UpdateService] Checking for TV OS A/B image updates...');
    this.state = { ...this.state, status: 'checking' };
    this.notify();

    // Simulated check (A/B Atomic Immutable architecture stub)
    await new Promise((r) => setTimeout(r, 1500));

    this.state = {
      hasUpdate: false,
      version: '1.0.0-appliance',
      status: 'idle',
    };
    this.notify();
    return this.state;
  }

  public async downloadUpdate(): Promise<void> {
    console.log('[UpdateService] downloadUpdate() invoked');
  }

  public async verifyUpdate(): Promise<boolean> {
    console.log('[UpdateService] verifyUpdate() invoked');
    return true;
  }

  public async installUpdate(): Promise<void> {
    console.log('[UpdateService] installUpdate() invoked');
  }

  public async rollback(): Promise<void> {
    console.log('[UpdateService] rollback() invoked');
  }
}

export const updateService = new UpdateService();
