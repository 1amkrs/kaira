import { IPlaybackDriver, DriverCallbacks, DriverState, DriverType } from '../types';

/**
 * Builds a player embed URL with the requested seek/start timestamp for
 * VidAPI, VidLink, VidSrc, and standard web embed providers.
 */
export function buildEmbedSeekUrl(url: string, targetSeconds: number): string {
  const target = Math.max(0, Math.round(targetSeconds));
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

    // 1. VidLink (vidlink.pro)
    if (parsed.hostname.includes('vidlink')) {
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('autoplay', 'true');
      return parsed.toString();
    }

    // 2. VidSrc (vidsrc.pm, vidsrc.xyz, vidsrc.to, etc.)
    if (parsed.hostname.includes('vidsrc')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('t', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 3. VidAPI / VAPlayer (vidapi.ru, vaplayer.ru, vidapi.org, etc.)
    if (parsed.hostname.includes('vidapi') || parsed.hostname.includes('vaplayer')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('startAt', String(target));
      parsed.searchParams.set('time', String(target));
      parsed.searchParams.set('t', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 4. YouTube Embed
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      parsed.searchParams.set('start', String(target));
      parsed.searchParams.set('autoplay', '1');
      return parsed.toString();
    }

    // 5. Generic Embed fallback: set parameters and hash
    parsed.searchParams.set('startAt', String(target));
    parsed.searchParams.set('start', String(target));
    parsed.searchParams.set('t', String(target));
    parsed.searchParams.set('autoplay', '1');
    parsed.hash = `t=${target}`;
    return parsed.toString();
  } catch (e) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}startAt=${target}&start=${target}&t=${target}&autoplay=1#t=${target}`;
  }
}

export class EmbedDriver implements IPlaybackDriver {
  public readonly type: DriverType = 'embed';

  private container: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private callbacks: DriverCallbacks | null = null;
  private isDestroyed = false;
  private tickerTimer: NodeJS.Timeout | null = null;
  private currentSourceUrl = '';
  private seekLockUntil = 0;

  private state: DriverState = {
    status: 'idle',
    currentTime: 0,
    duration: 7200, // Default 2h fallback for full feature films until reported
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 100,
  };

  public initialize(container: HTMLElement, callbacks: DriverCallbacks): void {
    this.container = container;
    this.callbacks = callbacks;
    this.isDestroyed = false;

    window.addEventListener('message', this.handlePostMessage);
  }

  private handlePostMessage = (event: MessageEvent): void => {
    if (this.isDestroyed || !event.data) return;
    // Suppress stale timeupdate notifications immediately after seeking
    if (Date.now() < this.seekLockUntil) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'PLAYER_EVENT' || data.event === 'timeupdate' || data.type === 'TVOS_TIMEUPDATE' || data.event === 'seeked' || data.type === 'seeked') {
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

    this.currentSourceUrl = url;

    if (expectedDuration && expectedDuration > 0) {
      this.state.duration = expectedDuration;
    }

    this.state.status = 'buffering';
    this.callbacks?.onStatusChange('buffering');
    this.callbacks?.onBuffering(true);
    this.callbacks?.onTimeUpdate(initialPosition, this.state.duration);

    // If initial position requested, inject start parameter directly into embed URL
    const loadUrl = initialPosition > 0 ? buildEmbedSeekUrl(url, initialPosition) : url;

    this.container.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'tv-embed-viewport-iframe';
    iframe.src = loadUrl;
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
      if (this.state.status === 'playing') {
        const dur = this.state.duration > 0 ? this.state.duration : 7200;
        const nextTime = this.state.currentTime + 0.5 * (this.state.playbackSpeed || 1);
        if (nextTime >= dur) {
          this.state.currentTime = dur;
          this.state.status = 'ended';
          if (this.tickerTimer) {
            clearInterval(this.tickerTimer);
            this.tickerTimer = null;
          }
          this.callbacks?.onTimeUpdate(dur, dur);
          this.callbacks?.onStatusChange('ended');
          this.callbacks?.onEnded();
        } else {
          this.state.currentTime = nextTime;
          this.callbacks?.onTimeUpdate(this.state.currentTime, dur);
        }
      }
      if (typeof window !== 'undefined' && (window as any).electronAPI?.controlMedia) {
        (window as any).electronAPI.controlMedia('sync', 0);
      }
    }, 500);
  }

  private sendPostMessage(payload: any): void {
    if (!this.iframe || !this.iframe.contentWindow || this.isDestroyed) return;
    try {
      this.iframe.contentWindow.postMessage(payload, '*');
      this.iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
    } catch (e) {}

    // If running in Electron, forward media action
    if (typeof window !== 'undefined' && (window as any).electronAPI?.controlMedia) {
      (window as any).electronAPI.controlMedia(payload.action || payload.command, payload.value);
    }
  }

  public play(): void {
    if (this.isDestroyed) return;
    this.state.status = 'playing';
    this.startInternalTicker();
    this.sendPostMessage({ command: 'play', action: 'play' });
    this.sendPostMessage({ command: 'unmute', action: 'unmute' });
    this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: this.state.volume || 1.0 });
    this.callbacks?.onStatusChange('playing');
    this.callbacks?.onBuffering(false);
  }

  public pause(): void {
    if (this.isDestroyed) return;
    this.state.status = 'paused';
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
    this.sendPostMessage({ command: 'pause', action: 'pause' });
    this.callbacks?.onStatusChange('paused');
  }

  public seekTo(seconds: number): void {
    if (this.isDestroyed) return;
    const dur = this.state.duration > 0 ? this.state.duration : 7200;
    const target = Math.max(0, Math.min(dur, typeof seconds === 'number' && isFinite(seconds) ? seconds : 0));
    const previousTime = this.state.currentTime;
    this.state.currentTime = target;

    // Suppress stale incoming timeupdate messages for 2.2 seconds following seek
    this.seekLockUntil = Date.now() + 2200;

    // 1. Send all common embed player postMessage dialects
    this.sendPostMessage({ command: 'seek', action: 'seek', value: target, time: target });
    this.sendPostMessage({ event: 'command', func: 'seekTo', args: [target, true] });
    this.sendPostMessage({ type: 'seek', value: target });
    this.sendPostMessage({ type: 'setCurrentTime', time: target });
    this.sendPostMessage({ method: 'setCurrentTime', value: target });
    this.sendPostMessage({ action: 'seekTo', time: target });
    this.sendPostMessage({ context: 'player.js', version: '0.0.11', event: 'command', method: 'setCurrentTime', value: target });
    this.sendPostMessage({ type: 'TVOS_SEEK', time: target });

    // 2. If running in Electron, perform deep iframe DOM seek
    if (typeof window !== 'undefined' && (window as any).electronAPI?.controlMedia) {
      (window as any).electronAPI.controlMedia('seek', target);
    }

    // 3. For web browser / cross-origin iframes (VidAPI, VidLink, VidSrc) that don't accept postMessage:
    // If the jump is substantial (e.g. Skip Intro >= 2s or scrubbing), reload iframe with start parameter
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);
    if (!isElectron && Math.abs(target - previousTime) >= 2 && this.iframe && this.currentSourceUrl) {
      const seekUrl = buildEmbedSeekUrl(this.currentSourceUrl, target);
      if (this.iframe.src !== seekUrl) {
        this.iframe.src = seekUrl;
      }
    }

    this.callbacks?.onTimeUpdate(target, dur);
  }

  public seekBy(deltaSeconds: number): void {
    const cur = typeof this.state.currentTime === 'number' && isFinite(this.state.currentTime) ? this.state.currentTime : 0;
    const delta = typeof deltaSeconds === 'number' && isFinite(deltaSeconds) ? deltaSeconds : 0;
    this.seekTo(cur + delta);
  }

  public setVolume(volume: number): void {
    if (this.isDestroyed) return;
    const vol = Math.max(0, Math.min(1, typeof volume === 'number' && isFinite(volume) ? volume : 1));
    this.state.volume = vol;
    this.state.isMuted = vol === 0;
    this.sendPostMessage({ command: 'setVolume', action: 'setVolume', value: vol });
    if (vol > 0) {
      this.sendPostMessage({ command: 'unmute', action: 'unmute' });
    }
  }

  public setMuted(muted: boolean): void {
    if (this.isDestroyed) return;
    this.state.isMuted = Boolean(muted);
    this.sendPostMessage({ command: 'setMuted', action: 'setMuted', value: Boolean(muted) });
  }

  public setSpeed(speed: number): void {
    if (this.isDestroyed) return;
    this.state.playbackSpeed = speed;
    this.sendPostMessage({ command: 'setPlaybackRate', action: 'setPlaybackRate', value: speed });
  }

  public getState(): DriverState {
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
