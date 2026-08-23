import { platform } from '../../platform';
import { AudioDeviceInfo } from '../../platform/types';

class AudioService {
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private listeners: Set<(state: { volume: number; isMuted: boolean; devices: AudioDeviceInfo[] }) => void> = new Set();
  private devices: AudioDeviceInfo[] = [];

  constructor() {
    this.refreshDevices();
  }

  public async refreshDevices(): Promise<AudioDeviceInfo[]> {
    try {
      this.devices = await platform.audio.getAudioDevices();
    } catch (e) {
      console.warn('[AudioService] Failed to query audio devices:', e);
    }
    this.notify();
    return this.devices;
  }

  public async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (this.devices.length === 0) {
      return await this.refreshDevices();
    }
    return this.devices;
  }

  public async getDefaultDevice(): Promise<AudioDeviceInfo | null> {
    return await platform.audio.getDefaultDevice();
  }

  public async setAudioDevice(deviceId: string): Promise<boolean> {
    const success = await platform.audio.setDevice(deviceId);
    await this.refreshDevices();
    return success;
  }

  public getVolume(): number {
    return this.volume;
  }

  public async setVolume(volume: number): Promise<void> {
    const val = Math.max(0, Math.min(1, volume));
    this.volume = val;
    this.isMuted = val === 0;
    await platform.audio.setVolume(val);
    this.notify();
  }

  public async toggleMute(): Promise<boolean> {
    this.isMuted = !this.isMuted;
    await platform.audio.setMute(this.isMuted);
    this.notify();
    return this.isMuted;
  }

  public subscribe(listener: (state: { volume: number; isMuted: boolean; devices: AudioDeviceInfo[] }) => void): () => void {
    this.listeners.add(listener);
    listener({ volume: this.volume, isMuted: this.isMuted, devices: this.devices });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = { volume: this.volume, isMuted: this.isMuted, devices: this.devices };
    this.listeners.forEach((fn) => fn(s));
  }
}

export const audioService = new AudioService();
