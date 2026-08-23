import { PlaybackSource, PlaybackState } from '../../types/media';
import { musicPluginService } from '../music/MusicPluginService';
import { profileService } from '../profile/ProfileService';

class PlaybackService {
  private audioElement: HTMLAudioElement | null = null;
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
  private progressSaveInterval: NodeJS.Timeout | null = null;
  private lastEndedTime: number = 0;

  constructor() {
    this.initAudio();
  }

  private initAudio() {
    if (typeof window === 'undefined') return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement) {
        this.updateTime(this.audioElement.currentTime, this.audioElement.duration);
      }
    });

    this.audioElement.addEventListener('playing', () => {
      this.setStatus('playing');
    });

    this.audioElement.addEventListener('pause', () => {
      if (this.state.status !== 'idle' && this.state.status !== 'buffering') {
        this.setStatus('paused');
      }
    });

    this.audioElement.addEventListener('ended', () => {
      this.handleEnded();
    });

    this.audioElement.addEventListener('waiting', () => {
      this.setStatus('buffering');
    });

    this.audioElement.addEventListener('error', (e) => {
      console.warn('[PlaybackService] Audio stream error:', e);
      this.setStatus('paused');
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

    if (source.type === 'audio' && this.audioElement) {
      let activeUrl = source.streamUrl;

      // If streamUrl is missing or is an iTunes preview, resolve full stream with fast timeout
      if (!activeUrl || activeUrl.includes('preview') || activeUrl.includes('itunes.apple.com')) {
        try {
          const resolvePromise = musicPluginService.resolveFullAudioStream(source.title, source.artist || '', activeUrl);
          const timeoutPromise = new Promise<string>((res) => setTimeout(() => res(source.streamUrl || ''), 2200));
          const resolved = await Promise.race([resolvePromise, timeoutPromise]);
          if (resolved) {
            activeUrl = resolved;
            source.streamUrl = resolved;
          }
        } catch (e) {
          activeUrl = source.streamUrl;
        }
      }

      if (activeUrl) {
        this.audioElement.src = activeUrl;
        this.audioElement.currentTime = source.initialPosition || 0;
        try {
          await this.audioElement.play();
          this.setStatus('playing');
        } catch (err) {
          console.warn('[PlaybackService] Autoplay or playback prevented:', err);
          this.setStatus('paused');
        }
      } else {
        this.setStatus('paused');
      }
    } else {
      // Video is playing -> pause background audio element and detach source so it cannot fire ended events
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.removeAttribute('src');
        this.audioElement.load();
      }
      this.setStatus('playing');
    }

    this.startProgressSaveLoop();
    this.notify();
  }

  public pause(): void {
    if (this.state.currentSource?.type === 'audio' && this.audioElement) {
      this.audioElement.pause();
    }
    this.setStatus('paused');
    this.saveProgressNow();
  }

  public resume(): void {
    if (this.state.currentSource?.type === 'audio' && this.audioElement) {
      this.audioElement.play().catch(() => {});
    }
    this.setStatus('playing');
  }

  public togglePlayPause(): void {
    if (this.state.status === 'playing') {
      this.pause();
    } else {
      this.resume();
    }
  }

  public seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.state.duration || Infinity, seconds));
    if (this.state.currentSource?.type === 'audio' && this.audioElement) {
      this.audioElement.currentTime = target;
    }
    this.updateTime(target, this.state.duration);
    this.saveProgressNow();
  }

  public seekRelative(deltaSeconds: number): void {
    this.seek(this.state.currentTime + deltaSeconds);
  }

  public next(): void {
    if (this.state.queue.length === 0) return;
    const nextIdx = (this.state.queueIndex + 1) % this.state.queue.length;
    const nextSource = this.state.queue[nextIdx];
    if (nextSource) {
      this.play(nextSource, this.state.queue);
    }
  }

  public previous(): void {
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
    if (index >= 0 && index < this.state.queue.length) {
      this.play(this.state.queue[index], this.state.queue);
    }
  }

  public removeFromQueue(index: number): void {
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
    this.saveProgressNow();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.state = {
      ...this.state,
      currentSource: null,
      status: 'idle',
      currentTime: 0,
      duration: 0,
    };
    this.stopProgressSaveLoop();
    this.notify();
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    if (this.audioElement) {
      this.audioElement.volume = clamped;
    }
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

  private handleEnded(): void {
    // Only handle ended for AUDIO playback! Video player manages its own lifecycle.
    if (this.state.currentSource?.type !== 'audio') {
      return;
    }
    const now = Date.now();
    // Prevent rapid cascading track skips if events fire repeatedly
    if (now - this.lastEndedTime < 2500) {
      return;
    }
    this.lastEndedTime = now;

    this.saveProgressNow(true); // Complete
    if (this.state.queue.length > 1 && this.state.queueIndex < this.state.queue.length - 1) {
      this.next();
    } else {
      this.setStatus('ended');
    }
  }

  private startProgressSaveLoop() {
    this.stopProgressSaveLoop();
    this.progressSaveInterval = setInterval(() => {
      this.saveProgressNow();
    }, 3000);
  }

  private stopProgressSaveLoop() {
    if (this.progressSaveInterval) {
      clearInterval(this.progressSaveInterval);
      this.progressSaveInterval = null;
    }
  }

  private saveProgressNow(isComplete: boolean = false) {
    const src = this.state.currentSource;
    if (!src || src.type !== 'video') return;

    try {
      const activeProfileId = profileService.getActiveProfile().id;
      const profileKey = `tv_playback_progress_${activeProfileId}_${src.mediaId}`;
      const legacyKey = `tv_playback_progress_${src.mediaId}`;

      if (isComplete || (this.state.duration > 0 && this.state.currentTime >= this.state.duration - 15)) {
        // Watched to completion -> remove progress
        localStorage.removeItem(profileKey);
        localStorage.removeItem(legacyKey);
        const payload = JSON.stringify({
          position: Math.round(this.state.currentTime),
          duration: Math.round(this.state.duration || src.durationSeconds || 7200),
          title: src.title,
          subtitle: src.subtitle,
          artwork: src.artwork,
          backdrop: src.backdrop,
          mediaType: src.mediaType,
          mediaId: src.mediaId,
          showId: src.showId,
          seasonNumber: src.seasonNumber,
          episodeNumber: src.episodeNumber,
          updatedAt: Date.now(),
        });
        localStorage.setItem(profileKey, payload);
        localStorage.setItem(legacyKey, payload);
      }
    } catch (e) {}
  }

}

export const playbackService = new PlaybackService();
