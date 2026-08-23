export interface UBlockFilterList {
  id: string;
  name: string;
  enabled: boolean;
  rulesCount: number;
}

export interface UBlockState {
  enabled: boolean;
  antiPopup: boolean;
  blockedCount: number;
  filterLists: UBlockFilterList[];
}

const DEFAULT_UBLOCK_STATE: UBlockState = {
  enabled: true,
  antiPopup: true,
  blockedCount: 1428,
  filterLists: [
    { id: 'ublock-filters', name: 'uBlock filters', enabled: true, rulesCount: 38420 },
    { id: 'ublock-badware', name: 'uBlock filters – Badware risks', enabled: true, rulesCount: 9240 },
    { id: 'ublock-privacy', name: 'uBlock filters – Privacy & Trackers', enabled: true, rulesCount: 18900 },
    { id: 'ublock-quick-fixes', name: 'uBlock filters – Quick fixes', enabled: true, rulesCount: 4120 },
    { id: 'ublock-unbreak', name: 'uBlock filters – Unbreak', enabled: true, rulesCount: 2310 },
    { id: 'easylist', name: 'EasyList Standard', enabled: true, rulesCount: 78500 },
    { id: 'easyprivacy', name: 'EasyPrivacy Standard', enabled: true, rulesCount: 42100 },
    { id: 'peter-lowe', name: 'Peter Lowe’s Ad and Tracking List', enabled: true, rulesCount: 4100 },
  ],
};

const STORAGE_KEY = 'tv_ublock_origin_state';

class UBlockService {
  private state: UBlockState = DEFAULT_UBLOCK_STATE;
  private listeners: Set<(state: UBlockState) => void> = new Set();

  constructor() {
    this.loadState();
    this.initBrowserPopupSuppression();
  }

  private loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.state = { ...DEFAULT_UBLOCK_STATE, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // If running in Electron, sync with Electron backend
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getUblockStatus) {
      (window as any).electronAPI.getUblockStatus().then((res: any) => {
        if (res) {
          this.state = {
            ...this.state,
            enabled: res.enabled,
            antiPopup: res.antiPopup,
            blockedCount: res.blockedCount || this.state.blockedCount,
          };
          this.notify();
        }
      });
    }
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {}
    this.notify();
  }

  private initBrowserPopupSuppression() {
    if (typeof window === 'undefined') return;

    // Intercept window.open in browser to prevent streaming embed popup redirects
    const originalWindowOpen = window.open;
    window.open = (url?: string | URL, target?: string, features?: string) => {
      if (this.state.enabled && this.state.antiPopup) {
        this.recordBlocked();
        console.log(`[uBlock Origin] Neutralized in-browser popup redirect: ${url}`);
        return null;
      }
      return originalWindowOpen.call(window, url, target, features);
    };
  }

  public getState(): UBlockState {
    return { ...this.state };
  }

  public subscribe(listener: (state: UBlockState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.state.enabled = enabled;
    this.saveState();

    if (typeof window !== 'undefined' && (window as any).electronAPI?.setUblockEnabled) {
      try {
        await (window as any).electronAPI.setUblockEnabled(enabled);
      } catch (e) {}
    }
  }

  public async setAntiPopup(enabled: boolean): Promise<void> {
    this.state.antiPopup = enabled;
    this.saveState();

    if (typeof window !== 'undefined' && (window as any).electronAPI?.setUblockAntiPopup) {
      try {
        await (window as any).electronAPI.setUblockAntiPopup(enabled);
      } catch (e) {}
    }
  }

  public toggleFilterList(id: string): void {
    this.state.filterLists = this.state.filterLists.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    this.saveState();
  }

  public async resetStats(): Promise<void> {
    this.state.blockedCount = 0;
    this.saveState();

    if (typeof window !== 'undefined' && (window as any).electronAPI?.resetUblockStats) {
      try {
        await (window as any).electronAPI.resetUblockStats();
      } catch (e) {}
    }
  }

  public recordBlocked(): void {
    this.state.blockedCount += 1;
    this.saveState();
  }

  public getTotalRulesCount(): number {
    return this.state.filterLists
      .filter((l) => l.enabled)
      .reduce((sum, l) => sum + l.rulesCount, 0);
  }
}

export const ublockService = new UBlockService();
