import { AmbientState, AmbientBulb } from '../../types';

const DEFAULT_BULBS: AmbientBulb[] = [
  { id: 'left', name: 'Syska 1 (Left)', position: 'left', ip: '192.168.29.203', online: false, colorHex: '#4285f4', brightness: 80 },
  { id: 'top', name: 'Wipro (Top)', position: 'top', ip: '192.168.29.109', online: false, colorHex: '#34a853', brightness: 80 },
  { id: 'right', name: 'Syska 2 (Right)', position: 'right', ip: '192.168.29.216', online: false, colorHex: '#ea4335', brightness: 80 },
];

class AmbientLightService {
  private state: AmbientState = {
    enabled: true,
    connected: false,
    mode: 'ambient',
    intensity: 85,
    bulbs: DEFAULT_BULBS,
  };

  private listeners: Set<(state: AmbientState) => void> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startStatusCheck();
  }

  public getState(): AmbientState {
    return { ...this.state };
  }

  public subscribe(listener: (state: AmbientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach(fn => fn(currentState));
  }

  public async refreshStatus(): Promise<void> {
    if (window.electronAPI?.getAmbientStatus) {
      try {
        const res = await window.electronAPI.getAmbientStatus();
        if (res) {
          this.state = {
            ...this.state,
            connected: res.connected ?? this.state.connected,
            enabled: res.enabled ?? this.state.enabled,
            mode: res.mode ?? this.state.mode,
            bulbs: res.bulbs && Array.isArray(res.bulbs) ? res.bulbs : this.state.bulbs,
          };
          this.notify();
        }
      } catch (e) {
        // Graceful fallback
      }
    }
  }

  public async toggleScreenSync(): Promise<boolean> {
    const newEnabled = !this.state.enabled;
    const newMode = newEnabled ? 'ambient' : 'off';
    
    this.state = {
      ...this.state,
      enabled: newEnabled,
      mode: newMode
    };

    if (window.electronAPI?.setAmbientMode) {
      try {
        await window.electronAPI.setAmbientMode(newMode);
      } catch (e) {
        console.warn('[AmbientService] Failed to send mode to Electron bridge', e);
      }
    }

    this.notify();
    return newEnabled;
  }

  public async setMode(mode: 'ambient' | 'static' | 'test' | 'cycle' | 'off'): Promise<void> {
    this.state = {
      ...this.state,
      mode,
      enabled: mode !== 'off'
    };

    if (window.electronAPI?.setAmbientMode) {
      try {
        await window.electronAPI.setAmbientMode(mode);
      } catch (e) {
        console.warn('[AmbientService] Electron IPC error:', e);
      }
    }

    this.notify();
  }

  public async setIntensity(intensity: number): Promise<void> {
    this.state = {
      ...this.state,
      intensity: Math.max(0, Math.min(100, intensity))
    };

    if (window.electronAPI?.setAmbientIntensity) {
      try {
        await window.electronAPI.setAmbientIntensity(this.state.intensity);
      } catch (e) {
        console.warn('[AmbientService] Electron IPC error:', e);
      }
    }

    this.notify();
  }

  private startStatusCheck() {
    this.refreshStatus();
    this.checkInterval = setInterval(() => this.refreshStatus(), 15000);
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

export const ambientService = new AmbientLightService();
