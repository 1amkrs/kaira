import Hls from 'hls.js';
import { IPlaybackDriver, DriverCallbacks, DriverState, DriverType } from '../types';

/**
 * NativeDriver — owns a real <video> element and controls it directly.
 * This is the ONLY driver where HUD transport controls (play/pause, seek, volume)
 * actually work, because we have a direct JS reference to the HTMLVideoElement.
 */
export class NativeDriver implements IPlaybackDriver {
  public readonly type: DriverType = 'direct';

  private videoElement: HTMLVideoElement | null = null;
  private hlsInstance: Hls | null = null;
  private callbacks: DriverCallbacks | null = null;
  private isDestroyed = false;

  private state: DriverState = {
    status: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 0,
  };

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  public initialize(container: HTMLElement, callbacks: DriverCallbacks): void {
    if (this.isDestroyed) return;
    this.callbacks = callbacks;

    // Reuse existing video element if already mounted
    let video = container.querySelector<HTMLVideoElement>('video.tv-native-video-el');
    if (!video) {
      video = document.createElement('video');
      video.className = 'tv-native-video-el';
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block;';
      video.playsInline = true;
      video.autoplay = false; // we call play() ourselves after load
      video.preload = 'auto';
      video.controls = false;
      container.appendChild(video);
    }

    // Always unmute and set full volume on init
    video.volume = 1;
    video.muted = false;

    this.videoElement = video;
    this.state.volume = 1;
    this.state.isMuted = false;

    this.attachEventListeners(video);
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────

  private attachEventListeners(video: HTMLVideoElement): void {
    video.addEventListener('timeupdate',     this.onTimeUpdate);
    video.addEventListener('loadedmetadata', this.onLoadedMetadata);
    video.addEventListener('durationchange', this.onDurationChange);
    video.addEventListener('playing',        this.onPlaying);
    video.addEventListener('pause',          this.onPause);
    video.addEventListener('waiting',        this.onWaiting);
    video.addEventListener('canplay',        this.onCanPlay);
    video.addEventListener('seeking',        this.onSeeking);
    video.addEventListener('seeked',         this.onSeeked);
    video.addEventListener('ended',          this.onEnded);
    video.addEventListener('error',          this.onError);
    video.addEventListener('progress',       this.onProgress);
    video.addEventListener('volumechange',   this.onVolumeChange);
  }

  private detachEventListeners(video: HTMLVideoElement): void {
    video.removeEventListener('timeupdate',     this.onTimeUpdate);
    video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    video.removeEventListener('durationchange', this.onDurationChange);
    video.removeEventListener('playing',        this.onPlaying);
    video.removeEventListener('pause',          this.onPause);
    video.removeEventListener('waiting',        this.onWaiting);
    video.removeEventListener('canplay',        this.onCanPlay);
    video.removeEventListener('seeking',        this.onSeeking);
    video.removeEventListener('seeked',         this.onSeeked);
    video.removeEventListener('ended',          this.onEnded);
    video.removeEventListener('error',          this.onError);
    video.removeEventListener('progress',       this.onProgress);
    video.removeEventListener('volumechange',   this.onVolumeChange);
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────

  private onTimeUpdate = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const cur = this.videoElement.currentTime || 0;
    const dur = this.getValidDuration();
    this.state.currentTime = cur;
    this.callbacks?.onTimeUpdate(cur, dur);
  };

  private onLoadedMetadata = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const dur = this.videoElement.duration;
    if (isFinite(dur) && dur > 0) {
      this.state.duration = dur;
      this.callbacks?.onTimeUpdate(this.videoElement.currentTime, dur);
    }
  };

  private onDurationChange = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    const dur = this.videoElement.duration;
    if (isFinite(dur) && dur > 0) {
      this.state.duration = dur;
    }
  };

  private onPlaying = (): void => {
    if (this.isDestroyed) return;
    this.state.status = 'playing';
    this.callbacks?.onStatusChange('playing');
    this.callbacks?.onBuffering(false);
  };

  private onPause = (): void => {
    if (this.isDestroyed) return;
    if (this.state.status !== 'ended' && this.state.status !== 'error') {
      this.state.status = 'paused';
      this.callbacks?.onStatusChange('paused');
    }
  };

  private onWaiting = (): void => {
    if (this.isDestroyed) return;
    this.state.status = 'buffering';
    this.callbacks?.onBuffering(true);
  };

  private retryCount = 0;

  private onCanPlay = (): void => {
    if (this.isDestroyed) return;
    this.retryCount = 0;
    this.callbacks?.onBuffering(false);
  };

  private wasPlayingBeforeSeek = false;

  private onSeeking = (): void => {
    if (this.isDestroyed) return;
    this.callbacks?.onBuffering(true);
  };

  private onSeeked = (): void => {
    if (this.isDestroyed) return;
    this.callbacks?.onBuffering(false);
    if (this.videoElement) {
      this.callbacks?.onTimeUpdate(this.videoElement.currentTime, this.getValidDuration());
      if (this.wasPlayingBeforeSeek || this.state.status === 'playing') {
        if (this.videoElement.paused) {
          this.videoElement.play().catch(() => {});
        }
      }
    }
  };

  private onEnded = (): void => {
    if (this.isDestroyed) return;
    this.state.status = 'ended';
    this.callbacks?.onStatusChange('ended');
    this.callbacks?.onEnded();
  };

  private onError = (): void => {
    if (this.isDestroyed) return;
    if (this.retryCount < 20 && this.state.currentTime === 0) {
      this.retryCount++;
      console.log(`[NativeDriver] Waiting for torrent buffer from Self-Debrid (attempt ${this.retryCount}/20)...`);
      this.state.status = 'buffering';
      this.callbacks?.onBuffering(true);
      setTimeout(() => {
        if (!this.isDestroyed && this.videoElement && this.videoElement.src) {
          try {
            this.videoElement.load();
            this.doPlay();
          } catch (_) {}
        }
      }, 2500);
      return;
    }
    const msg = this.videoElement?.error?.message || 'Video playback error';
    this.state.status = 'error';
    this.state.error = msg;
    this.callbacks?.onError(msg);
  };

  private onProgress = (): void => {
    if (!this.videoElement) return;
    const buf = this.videoElement.buffered;
    const dur = this.videoElement.duration;
    if (buf.length > 0 && dur > 0) {
      this.state.bufferedPercent = Math.min(100, (buf.end(buf.length - 1) / dur) * 100);
    }
  };

  private onVolumeChange = (): void => {
    if (!this.videoElement || this.isDestroyed) return;
    this.state.volume = this.videoElement.volume;
    this.state.isMuted = this.videoElement.muted;
  };

  // ─── Source Loading ───────────────────────────────────────────────────────

  public async loadSource(url: string, initialPosition = 0, expectedDuration?: number): Promise<void> {
    if (this.isDestroyed || !this.videoElement) return;

    if (!url || !url.trim()) {
      console.warn('[NativeDriver] loadSource called with empty URL');
      return;
    }

    if (expectedDuration && isFinite(expectedDuration) && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    this.state.status = 'buffering';
    this.callbacks?.onStatusChange('buffering');
    this.callbacks?.onBuffering(true);

    // Tear down existing HLS instance
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch (_) {}
      this.hlsInstance = null;
    }

    const isHls = url.includes('.m3u8') || url.includes('mpegURL');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 90 });
      this.hlsInstance = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!this.videoElement || this.isDestroyed) return;
        if (initialPosition > 0) {
          try { this.videoElement.currentTime = initialPosition; } catch (_) {}
        }
        this.doPlay();
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || this.isDestroyed) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.onError();
      });

      hls.loadSource(url);
      hls.attachMedia(this.videoElement);
    } else {
      // Direct MP4 / native HLS (Safari)
      try {
        this.videoElement.src = url;
        this.videoElement.load();

        if (initialPosition > 0) {
          // Wait for metadata then seek
          const seekOnce = () => {
            if (this.videoElement && isFinite(this.videoElement.duration) && this.videoElement.duration > 0) {
              try { this.videoElement.currentTime = initialPosition; } catch (_) {}
            }
            this.videoElement?.removeEventListener('loadedmetadata', seekOnce);
          };
          this.videoElement.addEventListener('loadedmetadata', seekOnce);
        }

        await this.doPlay();
      } catch (err) {
        console.warn('[NativeDriver] Error loading source:', err);
      }
    }
  }

  // ─── Transport Controls ───────────────────────────────────────────────────

  private async doPlay(): Promise<void> {
    if (!this.videoElement || this.isDestroyed) return;

    // Do not attempt play if no source is attached to avoid "The element has no supported sources"
    if (!this.videoElement.src && !this.hlsInstance) {
      console.warn('[NativeDriver] doPlay skipped: no video src or HLS instance');
      return;
    }

    // Always explicitly ensure unmuted + correct volume before every play call
    const targetVolume = (isFinite(this.state.volume) && this.state.volume > 0) ? this.state.volume : 1;
    try {
      if (this.videoElement) {
        this.videoElement.volume = targetVolume;
        if (!this.state.isMuted) {
          this.videoElement.muted = false;
        }
      }
    } catch (_) {}

    try {
      if (!this.videoElement || this.isDestroyed) return;
      await this.videoElement.play();
      if (!this.videoElement || this.isDestroyed) return;

      // Ensure we're unmuted after play succeeds (in case browser kept it muted)
      if (!this.state.isMuted && this.videoElement.muted) {
        this.videoElement.muted = false;
        this.videoElement.volume = targetVolume;
        this.state.isMuted = false;
      }
      this.state.status = 'playing';
      this.callbacks?.onStatusChange('playing');
      this.callbacks?.onBuffering(false);
    } catch (err: any) {
      if (!this.videoElement || this.isDestroyed) return;

      // Autoplay policy blocked — only retry muted if the browser specifically threw NotAllowedError
      if (err?.name === 'NotAllowedError') {
        console.warn('[NativeDriver] play() blocked by browser autoplay policy, retrying muted:', err);
        try {
          if (!this.videoElement || this.isDestroyed) return;
          this.videoElement.muted = true;
          await this.videoElement.play();
          if (!this.videoElement || this.isDestroyed) return;

          // Unmute as soon as the first frame is playing
          const unmute = () => {
            if (!this.videoElement || this.isDestroyed) return;
            try {
              this.videoElement.muted = false;
              this.videoElement.volume = targetVolume;
              this.state.isMuted = false;
            } catch (_) {}
            this.videoElement.removeEventListener('timeupdate', unmute);
          };
          this.videoElement.addEventListener('timeupdate', unmute, { once: true });
          setTimeout(() => {
            if (this.videoElement && !this.isDestroyed && this.videoElement.muted && !this.state.isMuted) {
              try {
                this.videoElement.muted = false;
                this.videoElement.volume = targetVolume;
                this.state.isMuted = false;
              } catch (_) {}
              this.videoElement.removeEventListener('timeupdate', unmute);
            }
          }, 300);
          this.state.status = 'playing';
          this.callbacks?.onStatusChange('playing');
          this.callbacks?.onBuffering(false);
        } catch (err2) {
          console.warn('[NativeDriver] play() retry failed:', err2);
          this.state.status = 'paused';
          this.callbacks?.onStatusChange('paused');
        }
      } else {
        console.warn('[NativeDriver] play() rejected:', err?.name, err?.message || err);
        if (err?.name === 'NotSupportedError') {
          this.onError();
        } else if (err?.name !== 'AbortError') {
          this.state.status = 'paused';
          this.callbacks?.onStatusChange('paused');
        }
      }
    }
  }

  public async play(): Promise<void> {
    if (!this.videoElement || this.isDestroyed) return;
    if (!this.videoElement.paused && !this.videoElement.ended) return; // already playing
    await this.doPlay();
  }

  public pause(): void {
    if (!this.videoElement || this.isDestroyed) return;
    try {
      this.videoElement.pause();
    } catch (_) {}
    this.state.status = 'paused';
    this.callbacks?.onStatusChange('paused');
  }

  public togglePlayPause(): void {
    if (!this.videoElement || this.isDestroyed) return;
    if (this.videoElement.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public seekTo(seconds: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    if (!isFinite(seconds)) return;

    this.wasPlayingBeforeSeek = this.state.status === 'playing' || !this.videoElement.paused;
    const dur = this.getValidDuration();
    const target = dur > 0 ? Math.max(0, Math.min(dur, seconds)) : Math.max(0, seconds);

    try {
      this.videoElement.currentTime = target;
      if (this.wasPlayingBeforeSeek && this.videoElement.paused) {
        this.videoElement.play().catch(() => {});
      }
    } catch (e) {
      console.warn('[NativeDriver] currentTime assignment failed:', e);
    }

    this.state.currentTime = target;
    this.callbacks?.onTimeUpdate(target, dur > 0 ? dur : this.state.duration);
  }

  public seekBy(deltaSeconds: number): void {
    if (!this.videoElement || this.isDestroyed || !isFinite(deltaSeconds)) return;
    const cur = isFinite(this.videoElement.currentTime) ? this.videoElement.currentTime : (this.state.currentTime || 0);
    this.seekTo(cur + deltaSeconds);
  }

  public setVolume(volume: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    const vol = Math.max(0, Math.min(1, isFinite(volume) ? volume : 1));
    try {
      this.videoElement.volume = vol;
      if (vol > 0 && this.videoElement.muted) {
        this.videoElement.muted = false;
        this.state.isMuted = false;
      } else if (vol === 0) {
        this.videoElement.muted = true;
        this.state.isMuted = true;
      }
    } catch (e) {}
    this.state.volume = vol;
  }

  public setMuted(muted: boolean): void {
    if (!this.videoElement || this.isDestroyed) return;
    try {
      this.videoElement.muted = Boolean(muted);
    } catch (_) {}
    this.state.isMuted = Boolean(muted);
  }

  public setSpeed(speed: number): void {
    if (!this.videoElement || this.isDestroyed) return;
    try {
      this.videoElement.playbackRate = speed;
    } catch (_) {}
    this.state.playbackSpeed = speed;
  }

  public getAudioTracks(): Array<{ id: string; label: string; language: string; enabled: boolean }> {
    if (!this.videoElement) return [];
    try {
      const list = (this.videoElement as any).audioTracks;
      if (!list || list.length === 0) return [];
      const tracks: Array<{ id: string; label: string; language: string; enabled: boolean }> = [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        tracks.push({
          id: t.id || `track-${i}`,
          label: t.label || `Audio Track ${i + 1} (${t.language || 'Stereo/5.1'})`,
          language: t.language || '',
          enabled: Boolean(t.enabled),
        });
      }
      return tracks;
    } catch (_) {
      return [];
    }
  }

  public selectAudioTrack(index: number): void {
    if (!this.videoElement) return;
    try {
      const list = (this.videoElement as any).audioTracks;
      if (!list || list.length === 0) return;
      for (let i = 0; i < list.length; i++) {
        list[i].enabled = i === index;
      }
    } catch (_) {}
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getValidDuration(): number {
    if (!this.videoElement) return this.state.duration || 0;
    const d = this.videoElement.duration;
    if (isFinite(d) && d > 0) {
      this.state.duration = d;
      return d;
    }
    return this.state.duration || 0;
  }

  public getState(): DriverState {
    if (this.videoElement) {
      if (this.videoElement.paused) {
        if (this.state.status === 'playing') {
          this.state.status = 'paused';
        }
      } else if (!this.videoElement.ended) {
        if (this.state.status === 'paused' || this.state.status === 'idle') {
          this.state.status = 'playing';
        }
      }
      if (isFinite(this.videoElement.currentTime)) {
        this.state.currentTime = this.videoElement.currentTime;
      }
      const dur = this.getValidDuration();
      if (dur > 0) this.state.duration = dur;
      this.state.volume = this.videoElement.volume;
      this.state.isMuted = this.videoElement.muted;
    }
    return { ...this.state };
  }

  // ─── Destroy ──────────────────────────────────────────────────────────────

  public destroy(): void {
    this.isDestroyed = true;

    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch (_) {}
      this.hlsInstance = null;
    }

    if (this.videoElement) {
      const el = this.videoElement;
      this.videoElement = null;
      this.detachEventListeners(el);
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch (_) {}
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    }

    this.callbacks = null;
  }
}
