import { IPlayerBackend, BackendCallbacks, BackendState, BackendType } from './IPlayerBackend';

export class EmbedBackend implements IPlayerBackend {
  public readonly type: BackendType = 'embed';

  private container: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private callbacks: BackendCallbacks | null = null;
  private isDestroyed = false;
  private tickerTimer: NodeJS.Timeout | null = null;

  private state: BackendState = {
    status: 'idle',
    currentTime: 0,
    duration: 7200,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 100,
  };

  public initialize(container: HTMLElement, callbacks: BackendCallbacks): void {
    this.container = container;
    this.callbacks = callbacks;
    this.isDestroyed = false;

    window.addEventListener('message', this.handlePostMessage);
  }

  private handlePostMessage = (event: MessageEvent): void => {
    if (this.isDestroyed || !event.data) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'PLAYER_EVENT' || data.event === 'timeupdate' || data.type === 'TVOS_TIMEUPDATE') {
        const cur = Number(data.currentTime !== undefined ? data.currentTime : (data.time !== undefined ? data.time : data.progress));
        const dur = Number(data.duration !== undefined ? data.duration : data.total);
        if (!isNaN(cur) && cur >= 0) {
          this.state.currentTime = cur;
          if (!isNaN(dur) && dur > 0) {
            this.state.duration = dur;
          }
          this.callbacks?.onTimeUpdate(this.state.currentTime, this.state.duration);
        }

        if (data.paused !== undefined) {
          const nextStatus = data.paused ? 'paused' : 'playing';
          if (this.state.status !== nextStatus && this.state.status !== 'buffering') {
            this.state.status = nextStatus;
            this.callbacks?.onStatusChange(nextStatus);
          }
        }
      }

      if (data.event === 'play' || data.type === 'TVOS_PLAY') {
        this.state.status = 'playing';
        this.callbacks?.onStatusChange('playing');
        this.callbacks?.onBuffering(false);
      } else if (data.event === 'pause' || data.type === 'TVOS_PAUSE') {
        this.state.status = 'paused';
        this.callbacks?.onStatusChange('paused');
      } else if (data.event === 'ended' || data.type === 'TVOS_ENDED') {
        this.state.status = 'ended';
        this.callbacks?.onStatusChange('ended');
        this.callbacks?.onEnded();
      }
    } catch (e) {}
  };

  public async loadSource(url: string, initialPosition = 0, expectedDuration?: number): Promise<void> {
    if (!this.container || this.isDestroyed) return;

    if (expectedDuration && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    this.state.status = 'buffering';
    this.callbacks?.onStatusChange('buffering');
    this.callbacks?.onBuffering(true);
    this.callbacks?.onTimeUpdate(initialPosition, this.state.duration);

    this.container.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'tv-embed-viewport-iframe';
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.pointerEvents = 'auto';
    iframe.allow = 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; accelerometer; gyroscope; cross-origin-isolated';
    iframe.allowFullscreen = true;

    iframe.onload = () => {
      if (this.isDestroyed) return;
      this.state.status = 'playing';
      this.callbacks?.onStatusChange('playing');
      this.callbacks?.onBuffering(false);
      this.startInternalTicker();
      this.setMuted(false);
      this.setVolume(this.state.volume || 1);
      this.sendPostMessage({ command: 'unmute', action: 'unmute' });
      this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: 1.0 });

      setTimeout(() => {
        if (!this.isDestroyed) {
          this.sendPostMessage({ command: 'unmute', action: 'unmute' });
          this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: this.state.volume || 1.0 });
        }
      }, 600);

      setTimeout(() => {
        if (!this.isDestroyed) {
          this.sendPostMessage({ command: 'unmute', action: 'unmute' });
          this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: this.state.volume || 1.0 });
        }
      }, 1600);

      if (initialPosition > 0) {
        this.seekTo(initialPosition);
      }
    };

    this.iframe = iframe;
    this.container.appendChild(iframe);
  }

  private startInternalTicker(): void {
    if (this.tickerTimer) clearInterval(this.tickerTimer);
    this.tickerTimer = setInterval(() => {
      if (this.isDestroyed) return;
      if (typeof window !== 'undefined' && (window as any).electronAPI?.controlMedia) {
        (window as any).electronAPI.controlMedia('sync', 0);
      }
    }, 750);
  }

  private sendPostMessage(payload: any): void {
    if (!this.iframe || !this.iframe.contentWindow || this.isDestroyed) return;
    try {
      this.iframe.contentWindow.postMessage(payload, '*');
      this.iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
    } catch (e) {}

    if (typeof window !== 'undefined' && (window as any).electronAPI?.controlMedia) {
      (window as any).electronAPI.controlMedia(payload.action || payload.command, payload.value);
    }
  }

  public async play(): Promise<void> {
    if (this.isDestroyed) return;
    this.state.status = 'playing';
    this.sendPostMessage({ command: 'play', action: 'play' });
    this.sendPostMessage({ command: 'unmute', action: 'unmute' });
    this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: this.state.volume || 1.0 });
    this.callbacks?.onStatusChange('playing');
  }

  public pause(): void {
    if (this.isDestroyed) return;
    this.state.status = 'paused';
    this.sendPostMessage({ command: 'pause', action: 'pause' });
    this.callbacks?.onStatusChange('paused');
  }

  public seekTo(seconds: number): void {
    if (this.isDestroyed) return;
    const target = Math.max(0, Math.min(this.state.duration, seconds));
    this.state.currentTime = target;
    this.sendPostMessage({ command: 'seek', action: 'seek', value: target, time: target });
    this.callbacks?.onTimeUpdate(target, this.state.duration);
  }

  public seekBy(deltaSeconds: number): void {
    const cur = this.state.currentTime || 0;
    this.seekTo(cur + deltaSeconds);
  }

  public setVolume(volume: number): void {
    if (this.isDestroyed) return;
    this.state.volume = volume;
    this.state.isMuted = volume === 0;
    this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: volume });
    if (volume > 0) {
      this.sendPostMessage({ command: 'unmute', action: 'unmute' });
    }
  }

  public setMuted(muted: boolean): void {
    if (this.isDestroyed) return;
    this.state.isMuted = muted;
    this.sendPostMessage({ command: 'setMuted', action: 'setMuted', value: muted });
  }

  public setSpeed(speed: number): void {
    if (this.isDestroyed) return;
    this.state.playbackSpeed = speed;
    this.sendPostMessage({ command: 'setPlaybackRate', action: 'setPlaybackRate', value: speed });
  }

  public getState(): BackendState {
    return { ...this.state };
  }

  public destroy(): void {
    this.isDestroyed = true;
    window.removeEventListener('message', this.handlePostMessage);
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
    if (this.iframe) {
      this.iframe.src = 'about:blank';
      if (this.iframe.parentElement) {
        this.iframe.parentElement.removeChild(this.iframe);
      }
      this.iframe = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.callbacks = null;
  }
}
