import { PlaybackSource } from '../../types/media';
import { SubtitleTrack } from '../../types/addons';
import { IPlayerBackend, BackendType, BackendStatus } from './backends/IPlayerBackend';
import { HTML5VideoBackend } from './backends/HTML5VideoBackend';
import { MPVBackend } from './backends/MPVBackend';
import { YouTubeBackend } from './backends/YouTubeBackend';
import { EmbedBackend } from './backends/EmbedBackend';
import { SubtitleEngine } from './SubtitleEngine';
import { AudioBoostEngine } from './AudioBoostEngine';
import { introService } from '../playback/IntroService';
import { continueWatchingService } from '../playback/ContinueWatchingService';
import { musicPluginService } from '../music/MusicPluginService';

export interface PlayerServiceState {
  status: BackendStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  bufferedPercent: number;
  activeSource: PlaybackSource | null;
  activeBackendType: BackendType;
  availableSubtitles: SubtitleTrack[];
  activeSubtitleId: string | null;
  currentSubtitleText: string | null;
  vocalBoostEnabled: boolean;
  intro: { start: number; end: number; canSkip: boolean } | null;
  queue: PlaybackSource[];
  queueIndex: number;
  error: string | null;
}

export class PlayerService {
  private container: HTMLElement | null = null;
  private currentBackend: IPlayerBackend | null = null;
  private backgroundAudioEl: HTMLAudioElement | null = null;

  private subtitleEngine: SubtitleEngine = new SubtitleEngine();
  private audioBoostEngine: AudioBoostEngine = new AudioBoostEngine();

  private state: PlayerServiceState = {
    status: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 0,
    activeSource: null,
    activeBackendType: 'html5',
    availableSubtitles: [],
    activeSubtitleId: null,
    currentSubtitleText: null,
    vocalBoostEnabled: false,
    intro: null,
    queue: [],
    queueIndex: 0,
    error: null,
  };

  private listeners: Set<(state: PlayerServiceState) => void> = new Set();
  private isDestroyed = false;

  constructor() {
    this.initBackgroundAudio();
    this.subtitleEngine.subscribe((text) => {
      this.state.currentSubtitleText = text;
      this.notify();
    });
  }

  private initBackgroundAudio() {
    if (typeof window === 'undefined') return;
    this.backgroundAudioEl = new Audio();
    this.backgroundAudioEl.preload = 'auto';

    this.backgroundAudioEl.addEventListener('timeupdate', () => {
      if (this.backgroundAudioEl && this.state.activeSource?.type === 'audio') {
        const cur = this.backgroundAudioEl.currentTime;
        const dur = this.backgroundAudioEl.duration || this.state.duration;
        this.state.currentTime = cur;
        if (dur > 0 && isFinite(dur)) {
          this.state.duration = dur;
        }
        this.notify();
      }
    });

    this.backgroundAudioEl.addEventListener('playing', () => {
      if (this.state.activeSource?.type === 'audio') {
        this.state.status = 'playing';
        this.notify();
      }
    });

    this.backgroundAudioEl.addEventListener('pause', () => {
      if (this.state.activeSource?.type === 'audio' && this.state.status !== 'idle') {
        this.state.status = 'paused';
        this.notify();
      }
    });

    this.backgroundAudioEl.addEventListener('ended', () => {
      if (this.state.activeSource?.type === 'audio') {
        this.handleNextInQueue();
      }
    });
  }

  public registerContainer(container: HTMLElement): void {
    this.container = container;
  }

  public subscribe(listener: (state: PlayerServiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): PlayerServiceState {
    return { ...this.state };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  private createBackend(type: BackendType): IPlayerBackend {
    switch (type) {
      case 'mpv':
        return new MPVBackend();
      case 'youtube':
        return new YouTubeBackend();
      case 'embed':
        return new EmbedBackend();
      case 'html5':
      default:
        return new HTML5VideoBackend();
    }
  }

  public async play(source?: PlaybackSource, queue: PlaybackSource[] = []): Promise<void> {
    if (!source) {
      // Resume current
      if (this.state.activeSource?.type === 'audio' && this.backgroundAudioEl) {
        await this.backgroundAudioEl.play().catch(() => {});
        this.state.status = 'playing';
      } else if (this.currentBackend) {
        await this.currentBackend.play();
        this.state.status = 'playing';
      }
      this.notify();
      return;
    }

    console.log(`[PlayerService] Playing [${source.type}]: "${source.title}" -> ${source.streamUrl}`);

    const newQueue = queue.length > 0 ? queue : [source];
    const queueIdx = newQueue.findIndex((item) => item.id === source.id);

    this.state.activeSource = source;
    this.state.queue = newQueue;
    this.state.queueIndex = queueIdx >= 0 ? queueIdx : 0;
    this.state.currentTime = source.initialPosition || 0;
    this.state.duration = source.durationSeconds || 0;
    this.state.status = 'buffering';
    this.state.error = null;

    // Check for intro skip marker
    if (source.mediaId) {
      try {
        const intro = await introService.getIntroTimestamps(source);
        if (intro) {
          this.state.intro = { start: intro.start, end: intro.end, canSkip: false };
        } else {
          this.state.intro = null;
        }
      } catch (e) {
        this.state.intro = null;
      }
    }

    // Audio Playback
    if (source.type === 'audio' && this.backgroundAudioEl) {
      if (this.currentBackend) {
        this.currentBackend.destroy();
        this.currentBackend = null;
      }

      let activeUrl = source.streamUrl;
      if (!activeUrl || activeUrl.includes('preview') || activeUrl.includes('itunes.apple.com')) {
        try {
          const resolved = await musicPluginService.resolveFullAudioStream(source.title, source.artist || '', activeUrl);
          if (resolved) {
            activeUrl = resolved;
            source.streamUrl = resolved;
          }
        } catch (e) {}
      }

      if (activeUrl) {
        this.backgroundAudioEl.src = activeUrl;
        this.backgroundAudioEl.currentTime = source.initialPosition || 0;
        this.backgroundAudioEl.volume = this.state.volume;
        try {
          await this.backgroundAudioEl.play();
          this.state.status = 'playing';
        } catch (err) {
          console.warn('[PlayerService] Audio autoplay prevented:', err);
          this.state.status = 'paused';
        }
      }
      this.notify();
      return;
    }

    // Video Playback
    if (this.backgroundAudioEl) {
      this.backgroundAudioEl.pause();
    }

    let backendType: BackendType = 'html5';
    if (source.streamType === 'youtube' || (source.streamUrl && source.streamUrl.includes('youtube.com'))) {
      backendType = 'youtube';
    } else if (source.streamType === 'embed') {
      backendType = 'embed';
    } else if (source.streamType === 'torrent') {
      backendType = 'mpv';
    }

    this.state.activeBackendType = backendType;

    if (!this.container) {
      // Fallback create element or defer
      this.notify();
      return;
    }

    if (this.currentBackend) {
      this.currentBackend.destroy();
    }

    this.currentBackend = this.createBackend(backendType);
    this.currentBackend.initialize(this.container, {
      onTimeUpdate: (cur, dur) => {
        this.state.currentTime = cur;
        if (dur > 0 && isFinite(dur)) {
          this.state.duration = dur;
        }
        this.subtitleEngine.updateTime(cur);

        if (this.state.intro) {
          const inIntro = cur >= this.state.intro.start && cur < this.state.intro.end;
          this.state.intro.canSkip = inIntro;
        }

        // Persist Continue Watching
        if (this.state.activeSource && this.state.activeSource.type === 'video') {
          continueWatchingService.saveProgress({
            mediaId: this.state.activeSource.mediaId || this.state.activeSource.id,
            title: this.state.activeSource.title,
            subtitle: this.state.activeSource.subtitle,
            poster: this.state.activeSource.artwork,
            backdrop: this.state.activeSource.backdrop,
            position: Math.round(cur),
            duration: Math.round(this.state.duration || this.state.activeSource.durationSeconds || 7200),
            mediaType: (this.state.activeSource.mediaType === 'episode' ? 'show' : this.state.activeSource.mediaType) || 'movie',
            showId: this.state.activeSource.showId,
            seasonNumber: this.state.activeSource.seasonNumber,
            episodeNumber: this.state.activeSource.episodeNumber,
            completed: dur > 0 && cur >= dur - 15,
          });
        }

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

    await this.currentBackend.loadSource(source.streamUrl, source.initialPosition || 0, source.durationSeconds);
    this.currentBackend.setVolume(this.state.volume);
    this.currentBackend.setMuted(this.state.isMuted);
    this.currentBackend.setSpeed(this.state.playbackSpeed);

    this.notify();
  }

  public pause(): void {
    if (this.state.activeSource?.type === 'audio' && this.backgroundAudioEl) {
      this.backgroundAudioEl.pause();
    } else if (this.currentBackend) {
      this.currentBackend.pause();
    }
    this.state.status = 'paused';
    this.notify();
  }

  public togglePlayPause(): void {
    if (this.state.status === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  public seekTo(seconds: number): void {
    const target = Math.max(0, Math.min(this.state.duration || Infinity, seconds));
    if (this.state.activeSource?.type === 'audio' && this.backgroundAudioEl) {
      this.backgroundAudioEl.currentTime = target;
    } else if (this.currentBackend) {
      this.currentBackend.seekTo(target);
      this.subtitleEngine.updateTime(target);
    }
    this.state.currentTime = target;
    this.notify();
  }

  public seekBy(deltaSeconds: number): void {
    this.seekTo(this.state.currentTime + deltaSeconds);
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    this.state.isMuted = clamped === 0;
    if (this.backgroundAudioEl) {
      this.backgroundAudioEl.volume = clamped;
    }
    if (this.currentBackend) {
      this.currentBackend.setVolume(clamped);
      this.currentBackend.setMuted(clamped === 0);
    }
    this.notify();
  }

  public setMute(muted: boolean): void {
    this.state.isMuted = muted;
    if (this.backgroundAudioEl) {
      this.backgroundAudioEl.muted = muted;
    }
    if (this.currentBackend) {
      this.currentBackend.setMuted(muted);
    }
    this.notify();
  }

  public setSpeed(speed: number): void {
    this.state.playbackSpeed = speed;
    if (this.currentBackend) {
      this.currentBackend.setSpeed(speed);
    }
    this.notify();
  }

  public skipIntro(): void {
    if (this.state.intro) {
      console.log(`[PlayerService] Skipping intro -> jumping to ${this.state.intro.end}s`);
      this.seekTo(this.state.intro.end);
    }
  }

  public async selectSubtitle(urlOrId: string): Promise<void> {
    this.state.activeSubtitleId = urlOrId;
    if (!urlOrId || urlOrId === 'none') {
      this.subtitleEngine.clear();
    } else {
      await this.subtitleEngine.loadSubtitles(urlOrId);
    }
    this.notify();
  }

  public setVocalBoost(enabled: boolean): void {
    this.state.vocalBoostEnabled = enabled;
    if (enabled && this.currentBackend instanceof HTML5VideoBackend) {
      const vid = this.currentBackend.getVideoElement();
      if (vid) {
        this.audioBoostEngine.attachToVideo(vid);
      }
    }
    this.audioBoostEngine.setEnabled(enabled);
    this.notify();
  }

  public stop(): void {
    if (this.backgroundAudioEl) {
      this.backgroundAudioEl.pause();
      this.backgroundAudioEl.currentTime = 0;
    }
    if (this.currentBackend) {
      this.currentBackend.destroy();
      this.currentBackend = null;
    }
    this.subtitleEngine.clear();
    this.state.status = 'idle';
    this.state.activeSource = null;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.notify();
  }

  public handleNextInQueue(): void {
    if (this.state.queue.length > 1 && this.state.queueIndex < this.state.queue.length - 1) {
      const nextIdx = this.state.queueIndex + 1;
      const nextSrc = this.state.queue[nextIdx];
      if (nextSrc) {
        this.play(nextSrc, this.state.queue);
      }
    } else {
      this.state.status = 'ended';
      this.notify();
    }
  }

  public handlePrevInQueue(): void {
    if (this.state.currentTime > 4) {
      this.seekTo(0);
      return;
    }
    if (this.state.queue.length > 0 && this.state.queueIndex > 0) {
      const prevIdx = this.state.queueIndex - 1;
      const prevSrc = this.state.queue[prevIdx];
      if (prevSrc) {
        this.play(prevSrc, this.state.queue);
      }
    }
  }
}

export const playerService = new PlayerService();
