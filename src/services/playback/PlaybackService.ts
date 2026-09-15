import { PlaybackSource, PlaybackState } from '../../types/media';
import { musicEngine } from '../music/MusicEngine';

export interface IVideoPlaybackDelegate {
  seek(seconds: number): void;
  seekRelative(deltaSeconds: number): void;
  play(): void;
  pause(): void;
  togglePlayPause(): void;
}

class PlaybackService {
  private videoDelegate: IVideoPlaybackDelegate | null = null;
  private state: PlaybackState = {
    currentSource: null,
    status: 'idle',
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: 0,
    volume: 1,
    isMuted: false,
    isShuffle: false,
    isRepeat: false,
  };
  private listeners: Set<(state: PlaybackState) => void> = new Set();

  constructor() {
    this.initEngineBridge();
  }

  public setVideoDelegate(delegate: IVideoPlaybackDelegate | null): void {
    this.videoDelegate = delegate;
  }

  private initEngineBridge() {
    // Sync state from core musicEngine when playing audio
    musicEngine.subscribe((engineState) => {
      if (this.state.currentSource?.type === 'audio' || engineState.currentSource) {
        const queueSources: PlaybackSource[] = engineState.queue.map((t) => ({
          id: `source-${t.id}`,
          type: 'audio',
          title: t.title,
          subtitle: `${t.artist} — ${t.album}`,
          artist: t.artist,
          album: t.album,
          artwork: t.artwork,
          streamUrl: t.audioUrl || '',
          durationSeconds: t.durationSeconds,
          initialPosition: 0,
          mediaType: 'track',
          mediaId: t.id,
          lyrics: t.lyrics,
        }));

        this.state = {
          ...this.state,
          currentSource: engineState.currentSource,
          status: engineState.status === 'error' ? 'idle' : engineState.status,
          currentTime: engineState.currentTime,
          duration: engineState.duration,
          volume: engineState.volume,
          isMuted: engineState.isMuted,
          queue: queueSources,
          queueIndex: engineState.queueIndex,
          isShuffle: engineState.isShuffle,
          isRepeat: engineState.repeatMode !== 'off',
        };
        this.notify();
      }
    });
  }

  public getState(): PlaybackState {
    return { ...this.state };
  }

  public subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public async play(source: PlaybackSource, queue: PlaybackSource[] = []): Promise<void> {
    console.log(`[PlaybackService] Playing [${source.type}]: "${source.title}" -> ${source.streamUrl}`);

    if (source.type === 'audio') {
      const newQueue = queue.length > 0 ? queue : [source];
      const index = newQueue.findIndex((item) => item.id === source.id);

      this.state = {
        ...this.state,
        currentSource: source,
        queue: newQueue,
        queueIndex: index >= 0 ? index : 0,
        currentTime: source.initialPosition || 0,
        duration: source.durationSeconds || 0,
        status: 'buffering',
      };
      this.notify();

      await musicEngine.playSource(source, newQueue);
    } else {
      // Video is playing -> stop musicEngine immediately
      musicEngine.stop();

      const newQueue = queue.length > 0 ? queue : [source];
      const index = newQueue.findIndex((item) => item.id === source.id);

      this.state = {
        ...this.state,
        currentSource: source,
        queue: newQueue,
        queueIndex: index >= 0 ? index : 0,
        currentTime: source.initialPosition || 0,
        duration: source.durationSeconds || 0,
        status: 'playing',
      };
      this.notify();
    }
  }

  public pause(): void {
    if (this.videoDelegate) {
      this.videoDelegate.pause();
    }
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.pause();
    }
    this.setStatus('paused');
  }

  public resume(): void {
    if (this.videoDelegate) {
      this.videoDelegate.play();
    }
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.resume();
    }
    this.setStatus('playing');
  }

  public togglePlayPause(): void {
    if (this.videoDelegate) {
      this.videoDelegate.togglePlayPause();
      return;
    }
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.togglePlayPause();
      return;
    }
    if (this.state.status === 'playing') {
      this.pause();
    } else {
      this.resume();
    }
  }

  public seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.state.duration || Infinity, seconds));
    if (this.videoDelegate) {
      this.videoDelegate.seek(target);
    }
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.seek(target);
    }
    this.updateTime(target, this.state.duration);
  }

  public seekRelative(deltaSeconds: number): void {
    if (this.videoDelegate) {
      this.videoDelegate.seekRelative(deltaSeconds);
      return;
    }
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.seekRelative(deltaSeconds);
      return;
    }
    this.seek(this.state.currentTime + deltaSeconds);
  }

  public next(): void {
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.next();
      return;
    }
    if (this.state.queue.length === 0) return;
    const nextIdx = (this.state.queueIndex + 1) % this.state.queue.length;
    const nextSource = this.state.queue[nextIdx];
    if (nextSource) {
      this.play(nextSource, this.state.queue);
    }
  }

  public previous(): void {
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.previous();
      return;
    }
    if (this.state.currentTime > 4) {
      this.seek(0);
      return;
    }
    if (this.state.queue.length === 0) return;
    const prevIdx = (this.state.queueIndex - 1 + this.state.queue.length) % this.state.queue.length;
    const prevSource = this.state.queue[prevIdx];
    if (prevSource) {
      this.play(prevSource, this.state.queue);
    }
  }

  public playIndex(index: number): void {
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.playIndex(index);
      return;
    }
    if (index >= 0 && index < this.state.queue.length) {
      this.play(this.state.queue[index], this.state.queue);
    }
  }

  public removeFromQueue(index: number): void {
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.removeFromQueue(index);
      return;
    }
    if (index < 0 || index >= this.state.queue.length) return;
    const newQueue = this.state.queue.filter((_, i) => i !== index);
    let newIndex = this.state.queueIndex;
    if (index < this.state.queueIndex) {
      newIndex = Math.max(0, newIndex - 1);
    } else if (newIndex >= newQueue.length) {
      newIndex = Math.max(0, newQueue.length - 1);
    }
    this.state = {
      ...this.state,
      queue: newQueue,
      queueIndex: newIndex,
    };
    this.notify();
  }

  public stop(): void {
    if (this.state.currentSource?.type === 'audio') {
      musicEngine.stop();
    }
    this.state = {
      ...this.state,
      currentSource: null,
      status: 'idle',
      currentTime: 0,
      duration: 0,
    };
    this.notify();
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    musicEngine.setVolume(clamped);
    this.notify();
  }

  public updateTime(currentTime: number, duration: number): void {
    this.state.currentTime = currentTime;
    if (duration && duration > 0 && !isNaN(duration) && isFinite(duration)) {
      this.state.duration = duration;
    }
    this.notify();
  }

  public setStatus(status: PlaybackState['status']): void {
    this.state.status = status;
    this.notify();
  }
}

export const playbackService = new PlaybackService();
