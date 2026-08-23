import { IPlaybackDriver, DriverType, DriverState, SubtitleCue } from './types';
import { NativeDriver } from './drivers/NativeDriver';
import { YouTubeDriver } from './drivers/YouTubeDriver';
import { EmbedDriver } from './drivers/EmbedDriver';
import { SubtitleEngine } from './SubtitleEngine';
import { AudioBoostEngine } from './AudioBoostEngine';

export interface PlayerEngineState extends DriverState {
  driverType: DriverType;
  currentSubtitleText: string | null;
  vocalBoostEnabled: boolean;
}

const DEFAULT_STATE: PlayerEngineState = {
  driverType: 'direct',
  status: 'idle',
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackSpeed: 1,
  bufferedPercent: 0,
  currentSubtitleText: null,
  vocalBoostEnabled: false,
};

export class PlayerEngineController {
  private container: HTMLElement | null = null;
  private currentDriver: IPlaybackDriver | null = null;
  private currentDriverType: DriverType = 'direct';

  private subtitleEngine: SubtitleEngine = new SubtitleEngine();
  private audioBoostEngine: AudioBoostEngine = new AudioBoostEngine();

  private state: PlayerEngineState = { ...DEFAULT_STATE };
  private listeners: Set<(state: PlayerEngineState) => void> = new Set();
  private isDestroyed = false;

  // ─── Init ────────────────────────────────────────────────────────────────

  public initialize(container: HTMLElement): void {
    this.container = container;
    this.isDestroyed = false;

    this.subtitleEngine.subscribe((text) => {
      this.state.currentSubtitleText = text;
      this.notify();
    });
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  public subscribe(listener: (state: PlayerEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): PlayerEngineState {
    return { ...this.state };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  // ─── Driver Factory ───────────────────────────────────────────────────────

  private createDriver(type: DriverType): IPlaybackDriver {
    switch (type) {
      case 'youtube': return new YouTubeDriver();
      case 'embed':   return new EmbedDriver();
      case 'direct':
      default:        return new NativeDriver();
    }
  }

  // ─── Media Loading ────────────────────────────────────────────────────────

  public async loadMedia(
    url: string,
    driverType: DriverType,
    initialPosition = 0,
    subtitleUrl?: string,
    expectedDuration?: number,
  ): Promise<void> {
    if (!this.container || this.isDestroyed) return;

    if (expectedDuration && isFinite(expectedDuration) && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    console.log(`[PlayerEngine] loadMedia [${driverType}] → ${url}`);

    // Rebuild driver if type changed
    if (!this.currentDriver || this.currentDriverType !== driverType) {
      if (this.currentDriver) {
        this.currentDriver.destroy();
        this.currentDriver = null;
      }

      this.currentDriverType = driverType;
      this.state.driverType = driverType;
      this.currentDriver = this.createDriver(driverType);

      this.currentDriver.initialize(this.container, {
        onTimeUpdate: (cur, dur) => {
          if (!isFinite(cur) || cur < 0) return;
          this.state.currentTime = cur;
          if (isFinite(dur) && dur > 0) this.state.duration = dur;
          this.subtitleEngine.updateTime(cur);
          this.notify();
        },
        onStatusChange: (status) => {
          this.state.status = status;
          this.notify();
        },
        onBuffering: (isBuffering) => {
          if (isBuffering && this.state.status !== 'error') {
            this.state.status = 'buffering';
          } else if (!isBuffering && this.state.status === 'buffering') {
            this.state.status = 'playing';
          }
          this.notify();
        },
        onEnded: () => {
          this.state.status = 'ended';
          this.notify();
        },
        onError: (err) => {
          this.state.status = 'error';
          this.state.error = err;
          this.notify();
        },
      });
    }

    // Subtitles
    if (subtitleUrl) {
      this.subtitleEngine.loadSubtitles(subtitleUrl);
    } else {
      this.subtitleEngine.clear();
    }

    // Load source
    await this.currentDriver.loadSource(url, initialPosition, expectedDuration);

    // Sync volume/speed from saved engine state
    this.currentDriver.setVolume(this.state.volume);
    this.currentDriver.setMuted(this.state.isMuted);
    this.currentDriver.setSpeed(this.state.playbackSpeed);

    this.notify();
  }

  // ─── Transport Controls — these directly delegate to the driver ────────────

  public async play(): Promise<void> {
    if (this.currentDriver) await this.currentDriver.play();
  }

  public pause(): void {
    if (this.currentDriver) this.currentDriver.pause();
  }

  public togglePlayPause(): void {
    if (!this.currentDriver) return;
    if (typeof this.currentDriver.togglePlayPause === 'function') {
      this.currentDriver.togglePlayPause();
      return;
    }
    const driverState = this.currentDriver.getState();
    if (driverState.status === 'playing') {
      this.currentDriver.pause();
    } else {
      this.currentDriver.play();
    }
  }

  public seekTo(seconds: number): void {
    if (!this.currentDriver || !isFinite(seconds)) return;
    this.currentDriver.seekTo(seconds);
    this.subtitleEngine.updateTime(seconds);
  }

  public seekBy(deltaSeconds: number): void {
    if (!this.currentDriver || !isFinite(deltaSeconds)) return;
    this.currentDriver.seekBy(deltaSeconds);
  }

  public setVolume(volume: number): void {
    const vol = Math.max(0, Math.min(1, isFinite(volume) ? volume : 1));
    this.state.volume = vol;
    this.state.isMuted = vol === 0;
    if (this.currentDriver) {
      this.currentDriver.setVolume(vol);
      this.currentDriver.setMuted(vol === 0);
    }
    this.notify();
  }

  public adjustVolume(delta: number): number {
    const cur = this.state.isMuted ? 0 : (isFinite(this.state.volume) ? this.state.volume : 1);
    const next = Math.max(0, Math.min(1, Math.round((cur + delta) * 100) / 100));
    this.setVolume(next);
    return next;
  }

  public setMuted(muted: boolean): void {
    this.state.isMuted = Boolean(muted);
    if (this.currentDriver) {
      this.currentDriver.setMuted(Boolean(muted));
      if (!muted && this.state.volume === 0) {
        this.setVolume(0.5);
      }
    }
    this.notify();
  }

  public toggleMute(): boolean {
    const next = !this.state.isMuted;
    this.setMuted(next);
    return next;
  }

  public setSpeed(speed: number): void {
    this.state.playbackSpeed = speed;
    if (this.currentDriver) this.currentDriver.setSpeed(speed);
    this.notify();
  }

  public setVocalBoost(enabled: boolean): void {
    this.state.vocalBoostEnabled = enabled;
    if (enabled && this.currentDriverType === 'direct' && this.currentDriver instanceof NativeDriver) {
      const videoEl = (this.currentDriver as NativeDriver).getVideoElement();
      if (videoEl) this.audioBoostEngine.attachToVideo(videoEl);
    }
    this.audioBoostEngine.setEnabled(enabled);
    this.notify();
  }

  public loadSubtitleTrack(url: string): Promise<number> {
    return this.subtitleEngine.loadSubtitles(url);
  }

  public clearSubtitles(): void {
    this.subtitleEngine.clear();
  }

  // ─── Destroy ─────────────────────────────────────────────────────────────

  public destroy(): void {
    this.isDestroyed = true;
    if (this.currentDriver) {
      this.currentDriver.destroy();
      this.currentDriver = null;
    }
    this.subtitleEngine.clear();
    this.audioBoostEngine.destroy();
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.listeners.clear();
  }
}
