import { IPlaybackDriver, DriverCallbacks, DriverState, DriverType } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export class YouTubeDriver implements IPlaybackDriver {
  public readonly type: DriverType = 'youtube';

  private container: HTMLElement | null = null;
  private ytPlayer: any = null;
  private callbacks: DriverCallbacks | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
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

  public initialize(container: HTMLElement, callbacks: DriverCallbacks): void {
    this.container = container;
    this.callbacks = callbacks;
    this.isDestroyed = false;
  }

  private static loadYTApi(): Promise<void> {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      const existingScript = document.getElementById('youtube-iframe-api-script');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }

      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        resolve();
      };
    });
  }

  private extractVideoId(url: string): string {
    if (!url) return '';
    if (url.length === 11 && !url.includes('/') && !url.includes('.')) {
      return url;
    }
    const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : url;
  }

  public async loadSource(url: string, initialPosition = 0, expectedDuration?: number): Promise<void> {
    if (!this.container || this.isDestroyed) return;

    if (expectedDuration && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    this.state.status = 'buffering';
    this.callbacks?.onStatusChange('buffering');
    this.callbacks?.onBuffering(true);

    const videoId = this.extractVideoId(url);
    await YouTubeDriver.loadYTApi();

    if (this.isDestroyed || !this.container) return;

    // Remove existing iframe or element inside container
    this.container.innerHTML = '';
    const playerDiv = document.createElement('div');
    playerDiv.id = `yt-player-target-${Date.now()}`;
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    this.container.appendChild(playerDiv);

    return new Promise((resolve) => {
      this.ytPlayer = new window.YT.Player(playerDiv.id, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          start: Math.floor(initialPosition),
        },
        events: {
          onReady: () => {
            if (this.isDestroyed) return;
            const dur = this.ytPlayer.getDuration() || 0;
            this.state.duration = dur;
            this.callbacks?.onTimeUpdate(initialPosition, dur);
            this.startPolling();
            this.play();
            resolve();
          },
          onStateChange: (event: any) => {
            if (this.isDestroyed) return;
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
            switch (event.data) {
              case 1: // Playing
                this.state.status = 'playing';
                this.callbacks?.onStatusChange('playing');
                this.callbacks?.onBuffering(false);
                break;
              case 2: // Paused
                this.state.status = 'paused';
                this.callbacks?.onStatusChange('paused');
                break;
              case 3: // Buffering
                this.callbacks?.onBuffering(true);
                break;
              case 0: // Ended
                this.state.status = 'ended';
                this.callbacks?.onStatusChange('ended');
                this.callbacks?.onEnded();
                break;
            }
          },
          onError: (event: any) => {
            if (this.isDestroyed) return;
            const err = `YouTube playback error code: ${event.data}`;
            this.state.status = 'error';
            this.state.error = err;
            this.callbacks?.onError(err);
          },
        },
      });
    });
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!this.ytPlayer || this.isDestroyed) return;
      try {
        if (typeof this.ytPlayer.getCurrentTime === 'function') {
          const cur = this.ytPlayer.getCurrentTime() || 0;
          const dur = this.ytPlayer.getDuration() || this.state.duration || 0;
          this.state.currentTime = cur;
          if (dur > 0) this.state.duration = dur;
          this.callbacks?.onTimeUpdate(cur, this.state.duration);
        }
      } catch (e) {}
    }, 300);
  }

  public play(): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      if (typeof this.ytPlayer.playVideo === 'function') {
        this.ytPlayer.playVideo();
      }
    } catch (e) {}
  }

  public pause(): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      if (typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
    } catch (e) {}
  }

  public seekTo(seconds: number): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      const target = Math.max(0, Math.min(this.state.duration || Infinity, seconds));
      if (typeof this.ytPlayer.seekTo === 'function') {
        this.ytPlayer.seekTo(target, true);
        this.state.currentTime = target;
        this.callbacks?.onTimeUpdate(target, this.state.duration);
      }
    } catch (e) {}
  }

  public seekBy(deltaSeconds: number): void {
    const cur = this.state.currentTime || 0;
    this.seekTo(cur + deltaSeconds);
  }

  public setVolume(volume: number): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      const vol = Math.max(0, Math.min(100, Math.round(volume * 100)));
      if (typeof this.ytPlayer.setVolume === 'function') {
        this.ytPlayer.setVolume(vol);
      }
      this.state.volume = volume;
    } catch (e) {}
  }

  public setMuted(muted: boolean): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      if (muted && typeof this.ytPlayer.mute === 'function') {
        this.ytPlayer.mute();
      } else if (!muted && typeof this.ytPlayer.unMute === 'function') {
        this.ytPlayer.unMute();
      }
      this.state.isMuted = muted;
    } catch (e) {}
  }

  public setSpeed(speed: number): void {
    if (!this.ytPlayer || this.isDestroyed) return;
    try {
      if (typeof this.ytPlayer.setPlaybackRate === 'function') {
        this.ytPlayer.setPlaybackRate(speed);
      }
      this.state.playbackSpeed = speed;
    } catch (e) {}
  }

  public getState(): DriverState {
    return { ...this.state };
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy();
      } catch (e) {}
      this.ytPlayer = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.callbacks = null;
  }
}
