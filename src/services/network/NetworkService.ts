import { platform } from '../../platform';

export interface NetworkState {
  connected: boolean;
  type: 'ethernet' | 'wifi' | 'offline';
  ip: string;
}

class NetworkService {
  private state: NetworkState = {
    connected: navigator.onLine,
    type: 'ethernet',
    ip: '192.168.29.120',
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
        type: 'ethernet',
        ip: '127.0.0.1',
      };
    }
    this.notify();
    return this.state;
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
