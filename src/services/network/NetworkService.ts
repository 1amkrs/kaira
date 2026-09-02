import { platform } from '../../platform';

export interface NetworkState {
  connected: boolean;
  type: 'ethernet' | 'wifi' | 'offline';
  ip: string;
}

class NetworkService {
  private state: NetworkState = {
    connected: navigator.onLine,
    type: 'wifi',
    ip: '127.0.0.1',
  };
  private listeners: Set<(state: NetworkState) => void> = new Set();

  constructor() {
    this.refresh();
    platform.network.subscribe((s) => {
      this.state = s;
      this.notify();
    });
  }

  public async refresh(): Promise<NetworkState> {
    try {
      this.state = await platform.network.getNetworkStatus();
    } catch (e) {
      this.state = {
        connected: navigator.onLine,
        type: 'wifi',
        ip: '127.0.0.1',
      };
    }

    // Try fetching real IP from server if available
    try {
      const res = await fetch('/api/remote/info');
      if (res.ok) {
        const data = await res.json();
        if (data && data.ip) {
          this.state.ip = data.ip;
          const ifaceName = (data.interfaces?.[0]?.name || '').toLowerCase();
          if (ifaceName.includes('wi-fi') || ifaceName.includes('wifi')) {
            this.state.type = 'wifi';
          } else if (ifaceName.includes('ethernet')) {
            this.state.type = 'ethernet';
          }
        }
      }
    } catch (e) {}

    this.notify();
    return this.state;
  }

  public setIp(ip: string): void {
    if (this.state.ip !== ip) {
      this.state.ip = ip;
      this.notify();
    }
  }

  public getState(): NetworkState {
    return { ...this.state };
  }

  public subscribe(listener: (state: NetworkState) => void): () => void {
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
}

export const networkService = new NetworkService();
