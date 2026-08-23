import Hls from 'hls.js';
import { IPlaybackDriver, DriverCallbacks, DriverState, DriverType } from '../types';

export class NativeDriver implements IPlaybackDriver {
  public readonly type: DriverType = 'direct';

  private videoElement: HTMLVideoElement | null = null;
  private hlsInstance: Hls | null = null;
  private callbacks: DriverCallbacks | null = null;
  private state: DriverState = {
    status: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 0,
  };
  private isDestroyed = false;

  public initialize(container: HTMLElement, callbacks: DriverCallbacks): void {
    this.callbacks = callbacks;
    this.isDestroyed = false;

    // Check if video element already exists in container or create new
    let video = container.querySelector<HTMLVideoElement>('video.tv-native-video-el');
    if (!video) {
      video = document.createElement('video');
      video.className = 'tv-native-video-el';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.style.backgroundColor = '#000000';
      video.playsInline = true;
      video.autoplay = true;
      video.muted = false;
      video.volume = 1.0;
      container.appendChild(video);
    } else {
      video.muted = false;
      video.volume = 1.0;
    }

    this.videoElement = video;
    this.attachEventListeners(video);
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  private attachEventListeners(video: HTMLVideoElement): void {
    video.addEventListener('timeupdate', this.handleTimeUpdate);
    video.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    video.addEventListener('durationchange', this.handleDurationChange);
    video.addEventListener('playing', this.handlePlaying);
    video.addEventListener('pause', this.handlePause);
    video.addEventListener('waiting', this.handleWaiting);
    video.addEventListener('seeking', this.handleSeeking);
    video.addEventListener('seeked', this.handleSeeked);
    video.addEventListener('ended', this.handleEnded);
    video.addEventListener('error', this.handleError);
    video.addEventListener('progress', this.handleProgress);
  }

  private detachEventListeners(video: HTMLVideoElement): void {
    video.removeEventListener('timeupdate', this.handleTimeUpdate);
    video.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    video.removeEventListener('durationchange', this.handleDurationChange);
    video.removeEventListener('playing', this.handlePlaying);
    video.removeEventListener('pause', this.handlePause);
    video.removeEventListener('waiting', this.handleWaiting);
    video.removeEventListener('seeking', this.handleSeeking);
    video.removeEventListener('seeked', this.handleSeeked);
    video.removeEventListener('ended', this.handleEnded);
    video.removeEventListener('error', this.handleError);
    video.removeEventListener('progress', this.handleProgress);
  }

  private handleTimeUpdate = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const cur = this.videoElement.currentTime || 0;
    const dur = this.videoElement.duration || this.state.duration || 0;
    this.state.currentTime = cur;
    if (dur > 0 && isFinite(dur)) {
      this.state.duration = dur;
    }
    this.callbacks?.onTimeUpdate(cur, this.state.duration);
  };

  private handleLoadedMetadata = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const dur = this.videoElement.duration || 0;
    if (dur > 0 && isFinite(dur)) {
      this.state.duration = dur;
      this.callbacks?.onTimeUpdate(this.videoElement.currentTime, dur);
    }
  };

  private handleDurationChange = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const dur = this.videoElement.duration || 0;
    if (dur > 0 && isFinite(dur)) {
      this.state.duration = dur;
      this.callbacks?.onTimeUpdate(this.videoElement.currentTime, dur);
    }
  };

  private handlePlaying = (): void => {
    if (this.isDestroyed) return;
    this.state.status = 'playing';
    this.callbacks?.onStatusChange('playing');
    this.callbacks?.onBuffering(false);
  };

  private handlePause = (): void => {
    if (this.isDestroyed) return;
    if (this.state.status !== 'ended' && this.state.status !== 'error') {
      this.state.status = 'paused';
      this.callbacks?.onStatusChange('paused');
    }
  };

  private handleWaiting = (): void => {
    if (this.isDestroyed) return;
    this.callbacks?.onBuffering(true);
  };

  private handleSeeking = (): void => {
    if (this.isDestroyed) return;
    this.callbacks?.onBuffering(true);
  };

  private handleSeeked = (): void => {
    if (this.isDestroyed) return;
    this.callbacks?.onBuffering(false);
  };

  private handleEnded = (): void => {
    if (this.isDestroyed) return;
    this.state.status = 'ended';
    this.callbacks?.onStatusChange('ended');
    this.callbacks?.onEnded();
  };

  private handleError = (): void => {
    if (this.isDestroyed) return;
    const err = this.videoElement?.error?.message || 'Video playback failed';
    this.state.status = 'error';
    this.state.error = err;
    this.callbacks?.onError(err);
  };

  private handleProgress = (): void => {
    if (!this.videoElement || !this.videoElement.buffered || this.videoElement.buffered.length === 0) return;
    const dur = this.videoElement.duration;
    if (dur > 0) {
      const bufferedEnd = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
      this.state.bufferedPercent = Math.min(100, (bufferedEnd / dur) * 100);
    }
  };

  public async loadSource(url: string, initialPosition = 0, expectedDuration?: number): Promise<void> {
    if (!this.videoElement || this.isDestroyed) return;

    if (expectedDuration && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    this.state.status = 'buffering';
    this.callbacks?.onStatusChange('buffering');
    this.callbacks?.onBuffering(true);
    this.callbacks?.onTimeUpdate(initialPosition, this.state.duration);

    // Destroy existing HLS instance if any
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    const isHls = url.includes('.m3u8') || url.includes('application/x-mpegURL');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      this.hlsInstance = hls;
      hls.loadSource(url);
      hls.attachMedia(this.videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialPosition > 0 && this.videoElement) {
          this.videoElement.currentTime = initialPosition;
        }
        this.play();
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              this.handleError();
              break;
          }
        }
      });
    } else {
      this.videoElement.src = url;
      this.videoElement.load();
      if (initialPosition > 0) {
        this.videoElement.currentTime = initialPosition;
      }
      this.play();
    }
  }

  public async play(): Promise<void> {
    if (!this.videoElement || this.isDestroyed) return;
    try {
      await this.videoElement.play();
      this.state.status = 'playing';
      this.callbacks?.onStatusChange('playing');
    } catch (e) {
      console.warn('[NativeDriver] play() exception:', e);
      this.state.status = 'paused';
      this.callbacks?.onStatusChange('paused');
    }
  }

  public pause(): void {
    if (!this.videoElement || this.isDestroyed) return;
    this.videoElement.pause();
    this.state.status = 'paused';
    this.callbacks?.onStatusChange('paused');
  }

  public seekTo(seconds: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    const maxDur = this.videoElement.duration || this.state.duration || Infinity;
    const target = Math.max(0, Math.min(maxDur, seconds));
    this.videoElement.currentTime = target;
    this.state.currentTime = target;
    this.callbacks?.onTimeUpdate(target, this.state.duration);
  }

  public seekBy(deltaSeconds: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    const cur = this.videoElement.currentTime || this.state.currentTime || 0;
    this.seekTo(cur + deltaSeconds);
  }

  public setVolume(volume: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    const vol = Math.max(0, Math.min(1, volume));
    this.videoElement.volume = vol;
    this.state.volume = vol;
  }

  public setMuted(muted: boolean): void {
    if (!this.videoElement || this.isDestroyed) return;
    this.videoElement.muted = muted;
    this.state.isMuted = muted;
  }

  public setSpeed(speed: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    this.videoElement.playbackRate = speed;
    this.state.playbackSpeed = speed;
  }

  public getState(): DriverState {
    return { ...this.state };
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    if (this.videoElement) {
      this.detachEventListeners(this.videoElement);
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      if (this.videoElement.parentElement) {
        this.videoElement.parentElement.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    this.callbacks = null;
  }
}
