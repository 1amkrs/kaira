import { PlaybackSource, PlaybackState } from '../../types/media';

export interface MediaSessionMetadataPayload {
  title: string;
  artist: string;
  album: string;
  artwork: Array<{ src: string; sizes?: string; type?: string }>;
}

export function buildMediaSessionPayload(source: PlaybackSource): MediaSessionMetadataPayload {
  const artworkUrl = source.artwork || source.backdrop || '';
  return {
    title: source.title || 'Kaira Media',
    artist: source.artist || source.subtitle || 'Kaira TV',
    album: source.album || (source.type === 'video' ? 'Kaira Cinema' : 'Kaira Music'),
    artwork: artworkUrl
      ? [
          { src: artworkUrl, sizes: '512x512' },
          { src: artworkUrl, sizes: '192x192' },
        ]
      : [],
  };
}

export class MediaSessionBridge {
  private wakeLockSentinel: any = null;
  private lastSourceId: string | null = null;
  private handlersBound = false;

  public bindActions(callbacks: {
    onPlay: () => void;
    onPause: () => void;
    onSeekBackward: () => void;
    onSeekForward: () => void;
    onSeekTo: (seconds: number) => void;
    onPrevious: () => void;
    onNext: () => void;
    onStop: () => void;
  }): void {
    if (this.handlersBound) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;
    const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported actions in older WebViews
      }
    };

    safeSet('play', callbacks.onPlay);
    safeSet('pause', callbacks.onPause);
    safeSet('seekbackward', () => callbacks.onSeekBackward());
    safeSet('seekforward', () => callbacks.onSeekForward());
    safeSet('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        callbacks.onSeekTo(details.seekTime);
      }
    });
    safeSet('previoustrack', callbacks.onPrevious);
    safeSet('nexttrack', callbacks.onNext);
    safeSet('stop', callbacks.onStop);

    this.handlersBound = true;
  }

  public syncState(state: PlaybackState): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    if (!state.currentSource || state.status === 'idle') {
      ms.playbackState = 'none';
      this.lastSourceId = null;
      this.releaseWakeLock();
      return;
    }

    if (this.lastSourceId !== state.currentSource.id && typeof MediaMetadata !== 'undefined') {
      const payload = buildMediaSessionPayload(state.currentSource);
      try {
        ms.metadata = new MediaMetadata({
          title: payload.title,
          artist: payload.artist,
          album: payload.album,
          artwork: payload.artwork,
        });
      } catch {
        // Ignore invalid artwork URLs
      }
      this.lastSourceId = state.currentSource.id;
    }

    ms.playbackState = state.status === 'playing' ? 'playing' : 'paused';

    if (typeof ms.setPositionState === 'function' && state.duration > 0 && isFinite(state.duration)) {
      try {
        ms.setPositionState({
          duration: state.duration,
          playbackRate: 1,
          position: Math.min(state.duration, Math.max(0, state.currentTime || 0)),
        });
      } catch {
        // Ignore out-of-range transient values
      }
    }

    if (state.status === 'playing') {
      this.acquireWakeLock();
    } else {
      this.releaseWakeLock();
    }
  }

  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      this.wakeLockSentinel?.addEventListener?.('release', () => {
        this.wakeLockSentinel = null;
      });
    } catch {
      // WakeLock requires visibility/user gesture on some browsers
    }
  }

  private releaseWakeLock(): void {
    if (!this.wakeLockSentinel) return;
    try {
      this.wakeLockSentinel.release();
    } catch {
      // Ignore already released sentinel
    }
    this.wakeLockSentinel = null;
  }
}

export const mediaSessionBridge = new MediaSessionBridge();
