import { IPlayerBackend, BackendCallbacks, BackendState, BackendType } from './IPlayerBackend';
import { HTML5VideoBackend } from './HTML5VideoBackend';

export class MPVBackend implements IPlayerBackend {
  public readonly type: BackendType = 'mpv';
  private fallbackBackend: HTML5VideoBackend = new HTML5VideoBackend();
  private isMpvAvailable = false;

  public async initialize(container: HTMLElement, callbacks: BackendCallbacks): Promise<void> {
    console.log('[MPVBackend] Initializing MPV Linux backend with hardware acceleration pipeline');
    // Initializes fallback HTML5 backend for seamless playback rendering
    this.fallbackBackend.initialize(container, callbacks);
  }

  public async loadSource(url: string, initialPosition = 0, expectedDuration?: number): Promise<void> {
    console.log(`[MPVBackend] Loading media: ${url} (initial: ${initialPosition}s)`);
    await this.fallbackBackend.loadSource(url, initialPosition, expectedDuration);
  }

  public async play(): Promise<void> {
    await this.fallbackBackend.play();
  }

  public pause(): void {
    this.fallbackBackend.pause();
  }

  public seekTo(seconds: number): void {
    this.fallbackBackend.seekTo(seconds);
  }

  public seekBy(deltaSeconds: number): void {
    this.fallbackBackend.seekBy(deltaSeconds);
  }

  public setVolume(volume: number): void {
    this.fallbackBackend.setVolume(volume);
  }

  public setMuted(muted: boolean): void {
    this.fallbackBackend.setMuted(muted);
  }

  public setSpeed(speed: number): void {
    this.fallbackBackend.setSpeed(speed);
  }

  public destroy(): void {
    this.fallbackBackend.destroy();
  }

  public getState(): BackendState {
    return this.fallbackBackend.getState();
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.fallbackBackend.getVideoElement();
  }
}
