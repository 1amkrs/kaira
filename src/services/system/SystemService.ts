import { platform } from '../../platform';
import { SystemDiagnostics } from '../../platform/types';

class SystemService {
  private diagnostics: SystemDiagnostics | null = null;
  private listeners: Set<(diag: SystemDiagnostics) => void> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.refreshDiagnostics();
    this.startPolling();
  }

  public async refreshDiagnostics(): Promise<SystemDiagnostics> {
    try {
      this.diagnostics = await platform.system.getDiagnostics();
    } catch (e) {
      console.warn('[SystemService] Error querying system diagnostics:', e);
    }
    if (this.diagnostics) {
      this.notify();
    }
    return this.diagnostics!;
  }

  public getCachedDiagnostics(): SystemDiagnostics | null {
    return this.diagnostics;
  }

  public subscribe(listener: (diag: SystemDiagnostics) => void): () => void {
    this.listeners.add(listener);
    if (this.diagnostics) {
      listener(this.diagnostics);
    } else {
      this.refreshDiagnostics().then((d) => listener(d));
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    if (!this.diagnostics) return;
    this.listeners.forEach((fn) => fn(this.diagnostics!));
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.refreshDiagnostics();
    }, 5000);
  }
}

export const systemService = new SystemService();
