import { SyncedLyricLine, Track, PlaybackSource } from '../../types/media';
import {
  MusicEngineState,
  RepeatMode,
  SoundPresetName,
  SOUND_PRESETS,
  EQ_FREQUENCIES,
} from './types';
import { streamResolverService } from './StreamResolverService';
import { lyricsService } from './LyricsService';
import { torrentFlacStreamService } from './TorrentFlacStreamService';
import { youTubeAudioPlayer } from './YouTubeAudioPlayer';

class MusicEngine {
  private audioEl: HTMLAudioElement | null = null;
  private prefetchAudioEl: HTMLAudioElement | null = null;
  private isYouTubeMode: boolean = false;

  // Web Audio API Graph
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private isWebAudioConnected: boolean = false;

  private freqDataBuffer: Uint8Array<ArrayBuffer> | null = null;
  private timeDataBuffer: Uint8Array<ArrayBuffer> | null = null;

  private state: MusicEngineState = {
    currentTrack: null,
    currentSource: null,
    status: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    queue: [],
    queueIndex: 0,
    originalQueue: [],
    isShuffle: false,
    repeatMode: 'off',
    activePreset: 'flat',
    eqGains: [...SOUND_PRESETS.flat.gains],
    audioBoostEnabled: false,
    lyrics: [],
    error: null,
    isWebAudioActive: false,
  };

  private listeners: Set<(state: MusicEngineState) => void> = new Set();
  private preloadedTrackId: string | null = null;
  private preloadedStreamUrl: string | null = null;
  private lastEndedTime: number = 0;
  private streamCandidates: string[] = [];
  private currentCandidateIndex: number = 0;

  constructor() {
    this.loadPersistedSettings();
    this.initAudioElement();
    this.initYouTubeBridge();
  }

  private initYouTubeBridge() {
    youTubeAudioPlayer.setCallbacks(
      (currentTime, duration) => {
        if (this.isYouTubeMode) {
          this.state.currentTime = currentTime;
          if (duration > 0 && !isNaN(duration) && isFinite(duration)) {
            this.state.duration = duration;
          }
          this.updateMediaSessionPosition();
          this.notify();
        }
      },
      (status) => {
        if (this.isYouTubeMode) {
          if (status === 'ended') {
            this.handleTrackEnded();
          } else {
            this.state.status = status;
            this.updateMediaSessionPlaybackState(status === 'playing' ? 'playing' : 'paused');
            this.notify();
          }
        }
      },
      () => {
        if (this.isYouTubeMode) {
          this.handleStreamError();
        }
      }
    );
  }

  private loadPersistedSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedPreset = localStorage.getItem('kaira_music_eq_preset') as SoundPresetName;
      if (savedPreset && SOUND_PRESETS[savedPreset]) {
        this.state.activePreset = savedPreset;
        this.state.eqGains = [...SOUND_PRESETS[savedPreset].gains];
      }
      const savedRepeat = localStorage.getItem('kaira_music_repeat_mode') as RepeatMode;
      if (savedRepeat && ['off', 'all', 'one'].includes(savedRepeat)) {
        this.state.repeatMode = savedRepeat;
      }
      const savedShuffle = localStorage.getItem('kaira_music_shuffle');
      if (savedShuffle !== null) {
        this.state.isShuffle = savedShuffle === 'true';
      }
      const savedVol = localStorage.getItem('kaira_music_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v)) {
          this.state.volume = Math.max(0, Math.min(1, v));
        }
      }
    } catch (e) {}
  }

  private initAudioElement() {
    if (typeof window === 'undefined') return;

    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.preload = 'auto';
    this.audioEl.volume = this.state.volume;

    this.prefetchAudioEl = new Audio();
    this.prefetchAudioEl.crossOrigin = 'anonymous';
    this.prefetchAudioEl.preload = 'auto';
    this.prefetchAudioEl.volume = 0;

    // Time update listener
    this.audioEl.addEventListener('timeupdate', () => {
      if (!this.audioEl) return;
      const cur = this.audioEl.currentTime;
      const dur = this.audioEl.duration;
      this.state.currentTime = cur;
      if (dur && dur > 0 && !isNaN(dur) && isFinite(dur)) {
        this.state.duration = dur;
      }

      // Preload next song 15 seconds before completion for gapless transition
      if (dur > 0 && cur >= dur - 15) {
        this.preloadNextTrack();
      }

      this.updateMediaSessionPosition();
      this.notify();
    });

    this.audioEl.addEventListener('playing', () => {
      this.state.status = 'playing';
      this.updateMediaSessionPlaybackState('playing');
      this.notify();
    });

    this.audioEl.addEventListener('pause', () => {
      if (this.state.status !== 'idle' && this.state.status !== 'buffering') {
        this.state.status = 'paused';
        this.updateMediaSessionPlaybackState('paused');
        this.notify();
      }
    });

    this.audioEl.addEventListener('waiting', () => {
      this.state.status = 'buffering';
      this.notify();
    });

    this.audioEl.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audioEl.addEventListener('error', (e) => {
      console.warn('[MusicEngine] Audio element stream error:', e);
      this.handleStreamError();
    });

    this.setupMediaSessionHandlers();
  }

  // ─── WEB AUDIO API GRAPH INITIALIZATION ─────────────────────────────────────

  private initWebAudio(): boolean {
    if (this.isWebAudioConnected) return true;
    if (typeof window === 'undefined') return false;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx || !this.audioEl) return false;

      this.audioContext = new AudioCtx();
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioEl);

      // 1. Bass Boost Low-Shelf Filter
      this.bassFilter = this.audioContext.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 80;
      this.bassFilter.gain.value = this.state.audioBoostEnabled ? 6 : 0;

      // 2. 10-Band Peaking Equalizer Filters
      this.eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = this.audioContext!.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = this.state.eqGains[idx] || 0;
        return filter;
      });

      // 3. Analyser Node for Real-Time Visualizer
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.82;
      this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.timeDataBuffer = new Uint8Array(this.analyserNode.fftSize);

      // 4. Master Output Gain
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect Web Audio Graph:
      // source -> bassFilter -> eq[0] -> eq[1] ... -> eq[9] -> analyser -> gain -> destination
      let prevNode: AudioNode = this.sourceNode;
      prevNode.connect(this.bassFilter);
      prevNode = this.bassFilter;

      for (const eqFilter of this.eqFilters) {
        prevNode.connect(eqFilter);
        prevNode = eqFilter;
      }

      prevNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isWebAudioConnected = true;
      this.state.isWebAudioActive = true;
      return true;
    } catch (e) {
      console.warn('[MusicEngine] Web Audio API graph initialization notice:', e);
      this.isWebAudioConnected = false;
      this.state.isWebAudioActive = false;
      return false;
    }
  }

  private resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  // ─── VISUALIZER AUDIO SPECTRUM EXPORT ───────────────────────────────────────

  public getFrequencyData(): Uint8Array | null {
    if (this.analyserNode && this.freqDataBuffer && !this.isYouTubeMode) {
      this.analyserNode.getByteFrequencyData(this.freqDataBuffer);
      return this.freqDataBuffer;
    }
    if (this.isYouTubeMode && this.state.status === 'playing') {
      if (!this.freqDataBuffer) {
        this.freqDataBuffer = new Uint8Array(128);
      }
      const t = performance.now() / 150;
      for (let i = 0; i < this.freqDataBuffer.length; i++) {
        const wave1 = Math.sin(t + i * 0.25) * 0.5 + 0.5;
        const wave2 = Math.cos(t * 1.5 + i * 0.4) * 0.3 + 0.5;
        const decay = Math.exp(-i / 40);
        this.freqDataBuffer[i] = Math.floor((wave1 * 0.6 + wave2 * 0.4) * decay * 220 * (this.state.volume || 1));
      }
      return this.freqDataBuffer;
    }
    return null;
  }

  public getTimeDomainData(): Uint8Array | null {
    if (this.analyserNode && this.timeDataBuffer && !this.isYouTubeMode) {
      this.analyserNode.getByteTimeDomainData(this.timeDataBuffer);
      return this.timeDataBuffer;
    }
    if (this.isYouTubeMode && this.state.status === 'playing') {
      if (!this.timeDataBuffer) {
        this.timeDataBuffer = new Uint8Array(256);
      }
      const t = performance.now() / 120;
      for (let i = 0; i < this.timeDataBuffer.length; i++) {
        const val = Math.sin(t + i * 0.1) * 40 + 128;
        this.timeDataBuffer[i] = Math.floor(val);
      }
      return this.timeDataBuffer;
    }
    return null;
  }

  public getBassEnergy(): number {
    const data = this.getFrequencyData();
    if (!data || data.length === 0) return 0;
    let sum = 0;
    const count = Math.min(6, data.length);
    for (let i = 0; i < count; i++) {
      sum += data[i];
    }
    return sum / (count * 255);
  }

  public isWebAudioActive(): boolean {
    return (this.isWebAudioConnected || this.isYouTubeMode) && this.state.status === 'playing';
  }

  // ─── EQUALIZER & SOUND PRESETS ─────────────────────────────────────────────

  public setPreset(presetName: SoundPresetName): void {
    const preset = SOUND_PRESETS[presetName];
    if (!preset) return;

    this.state.activePreset = presetName;
    this.state.eqGains = [...preset.gains];

    this.eqFilters.forEach((filter, idx) => {
      if (filter && typeof preset.gains[idx] === 'number') {
        filter.gain.setTargetAtTime(preset.gains[idx], this.audioContext?.currentTime || 0, 0.05);
      }
    });

    if (this.bassFilter) {
      const boostVal = preset.bassBoost || (this.state.audioBoostEnabled ? 6 : 0);
      this.bassFilter.gain.setTargetAtTime(boostVal, this.audioContext?.currentTime || 0, 0.05);
    }

    try {
      localStorage.setItem('kaira_music_eq_preset', presetName);
    } catch (e) {}

    this.notify();
  }

  public setBandGain(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= this.eqFilters.length) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this.state.eqGains[bandIndex] = clamped;

    const filter = this.eqFilters[bandIndex];
    if (filter) {
      filter.gain.setTargetAtTime(clamped, this.audioContext?.currentTime || 0, 0.05);
    }
    this.notify();
  }

  public toggleAudioBoost(): boolean {
    this.state.audioBoostEnabled = !this.state.audioBoostEnabled;
    if (this.bassFilter) {
      const targetGain = this.state.audioBoostEnabled ? 7.0 : 0;
      this.bassFilter.gain.setTargetAtTime(targetGain, this.audioContext?.currentTime || 0, 0.05);
    }
    this.notify();
    return this.state.audioBoostEnabled;
  }

  // ─── PLAYBACK CONTROL & QUEUE MANAGEMENT ───────────────────────────────────

  public async playTrack(track: Track, queue: Track[] = [], startIndex?: number): Promise<void> {
    if (!this.audioEl) return;

    this.initWebAudio();
    this.resumeAudioContext();

    const fullQueue = queue.length > 0 ? [...queue] : [track];
    const initialIndex =
      typeof startIndex === 'number' && startIndex >= 0
        ? startIndex
        : fullQueue.findIndex((t) => t.id === track.id);

    this.state.originalQueue = [...fullQueue];
    this.state.queue = this.state.isShuffle
      ? this.generateShuffledQueue(fullQueue, track.id)
      : [...fullQueue];

    const actualIdx = this.state.queue.findIndex((t) => t.id === track.id);
    this.state.queueIndex = actualIdx >= 0 ? actualIdx : 0;
    this.state.currentTrack = track;
    this.state.currentTime = 0;
    this.state.duration = track.durationSeconds || 210;
    this.state.status = 'buffering';
    this.state.error = null;

    const source: PlaybackSource = {
      id: `source-${track.id}`,
      type: 'audio',
      title: track.title,
      subtitle: `${track.artist} — ${track.album}`,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      streamUrl: track.audioUrl || '',
      durationSeconds: track.durationSeconds,
      initialPosition: 0,
      mediaType: 'track',
      mediaId: track.id,
      lyrics: track.lyrics,
    };
    this.state.currentSource = source;

    this.updateMediaSessionMetadata(track);
    this.notify();

    // 1. Check if track can be played via official YouTube Audio/Video Engine
    let ytId = track.ytVideoId || youTubeAudioPlayer.resolveVideoId(track.title, track.artist, track.ytVideoId);
    if (!ytId && track.title) {
      try {
        ytId = await youTubeAudioPlayer.resolveVideoIdAsync(track.title, track.artist, track.ytVideoId);
      } catch (e) {
        ytId = `${track.title} ${track.artist}`.trim();
      }
    }

    if (ytId) {
      this.isYouTubeMode = true;
      if (this.audioEl) {
        this.audioEl.pause();
      }
      source.ytVideoId = ytId;
      source.streamUrl = `https://www.youtube.com/watch?v=${ytId}`;
      this.state.currentSource = source;
      try {
        await youTubeAudioPlayer.play(ytId, 0);
        this.state.status = 'playing';
      } catch (err) {
        console.warn('[MusicEngine] YouTube player start notice:', err);
      }
    } else {
      this.isYouTubeMode = false;
      youTubeAudioPlayer.stop();

      // Resolve multi-candidate stream URLs (Torrent FLAC, Self-Debrid, Studio CDNs)
      try {
        this.streamCandidates = await torrentFlacStreamService.getStreamCandidates(
          track.title,
          track.artist,
          track.audioUrl
        );
        this.currentCandidateIndex = 0;
      } catch (e) {
        this.streamCandidates = [track.audioUrl || ''];
        this.currentCandidateIndex = 0;
      }

      const streamUrl = this.streamCandidates[0] || track.audioUrl;

      if (streamUrl) {
        source.streamUrl = streamUrl;
        this.state.currentSource = source;
        this.audioEl.src = streamUrl;
        this.audioEl.currentTime = 0;

        try {
          await this.audioEl.play();
          this.state.status = 'playing';
        } catch (err) {
          console.warn('[MusicEngine] Audio play call prevented by browser policy, waiting for user trigger:', err);
          this.state.status = 'paused';
        }
      } else {
        this.state.status = 'error';
        this.state.error = 'Unable to resolve audio stream';
      }
    }

    // 2. Fetch synced lyrics asynchronously in background
    if (track.lyrics && track.lyrics.length > 0) {
      this.state.lyrics = track.lyrics;
      this.state.plainLyrics = track.plainLyrics;
    } else {
      lyricsService.fetchLyrics(track.title, track.artist).then((res) => {
        if (this.state.currentTrack?.id === track.id) {
          this.state.lyrics = res.synced;
          this.state.plainLyrics = res.plain;
          if (this.state.currentSource) {
            this.state.currentSource.lyrics = res.synced;
          }
          this.notify();
        }
      });
    }

    this.notify();
  }

  public async playSource(source: PlaybackSource, queueSources: PlaybackSource[] = []): Promise<void> {
    const track: Track = {
      id: source.mediaId || source.id.replace('source-', ''),
      title: source.title,
      artist: source.artist || source.subtitle?.split('—')[0]?.trim() || 'Unknown Artist',
      album: source.album || source.subtitle?.split('—')[1]?.trim() || 'Music',
      duration: this.formatTime(source.durationSeconds || 210),
      durationSeconds: source.durationSeconds || 210,
      trackNumber: 1,
      artwork: source.artwork || '',
      audioUrl: source.streamUrl,
      ytVideoId: source.ytVideoId,
      lyrics: source.lyrics,
    };

    const queueTracks: Track[] =
      queueSources.length > 0
        ? queueSources.map((s, idx) => ({
            id: s.mediaId || s.id.replace('source-', ''),
            title: s.title,
            artist: s.artist || s.subtitle?.split('—')[0]?.trim() || 'Unknown Artist',
            album: s.album || s.subtitle?.split('—')[1]?.trim() || 'Music',
            duration: this.formatTime(s.durationSeconds || 210),
            durationSeconds: s.durationSeconds || 210,
            trackNumber: idx + 1,
            artwork: s.artwork || '',
            audioUrl: s.streamUrl,
            ytVideoId: s.ytVideoId,
            lyrics: s.lyrics,
          }))
        : [track];

    const idx = queueTracks.findIndex((t) => t.id === track.id);
    await this.playTrack(track, queueTracks, idx >= 0 ? idx : 0);
  }

  public pause(): void {
    if (this.isYouTubeMode) {
      youTubeAudioPlayer.pause();
    }
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.state.status = 'paused';
    this.updateMediaSessionPlaybackState('paused');
    this.notify();
  }

  public resume(): void {
    this.resumeAudioContext();
    if (this.isYouTubeMode) {
      youTubeAudioPlayer.resume();
    } else if (this.audioEl && this.state.currentTrack) {
      this.audioEl.play().catch(() => {});
    }
    this.state.status = 'playing';
    this.updateMediaSessionPlaybackState('playing');
    this.notify();
  }

  public togglePlayPause(): void {
    if (this.state.status === 'playing') {
      this.pause();
    } else {
      this.resume();
    }
  }

  public stop(): void {
    if (this.isYouTubeMode) {
      youTubeAudioPlayer.stop();
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
    }
    this.state.status = 'idle';
    this.state.currentTrack = null;
    this.state.currentSource = null;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.state.lyrics = [];
    this.updateMediaSessionPlaybackState('none');
    this.notify();
  }

  public seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.state.duration || Infinity, seconds));
    if (this.isYouTubeMode) {
      youTubeAudioPlayer.seekTo(target);
    } else if (this.audioEl && !isNaN(target) && isFinite(target)) {
      this.audioEl.currentTime = target;
    }
    this.state.currentTime = target;
    this.updateMediaSessionPosition();
    this.notify();
  }

  public seekRelative(deltaSeconds: number): void {
    this.seek(this.state.currentTime + deltaSeconds);
  }

  public next(): void {
    if (this.state.queue.length === 0) return;

    // In 'one' repeat mode, next() manually moves to the next song
    const nextIdx = (this.state.queueIndex + 1) % this.state.queue.length;
    const nextTrack = this.state.queue[nextIdx];
    if (nextTrack) {
      this.playTrack(nextTrack, this.state.queue, nextIdx);
    }
  }

  public previous(): void {
    // If more than 3 seconds into track, seek back to beginning
    if (this.state.currentTime > 3) {
      this.seek(0);
      return;
    }
    if (this.state.queue.length === 0) return;
    const prevIdx = (this.state.queueIndex - 1 + this.state.queue.length) % this.state.queue.length;
    const prevTrack = this.state.queue[prevIdx];
    if (prevTrack) {
      this.playTrack(prevTrack, this.state.queue, prevIdx);
    }
  }

  public playIndex(index: number): void {
    if (index >= 0 && index < this.state.queue.length) {
      this.playTrack(this.state.queue[index], this.state.queue, index);
    }
  }

  // ─── SHUFFLE & REPEAT STATE ────────────────────────────────────────────────

  public toggleShuffle(): boolean {
    const nextShuffle = !this.state.isShuffle;
    this.state.isShuffle = nextShuffle;

    if (nextShuffle && this.state.currentTrack) {
      this.state.queue = this.generateShuffledQueue(this.state.originalQueue, this.state.currentTrack.id);
      this.state.queueIndex = 0;
    } else {
      this.state.queue = [...this.state.originalQueue];
      if (this.state.currentTrack) {
        const idx = this.state.queue.findIndex((t) => t.id === this.state.currentTrack?.id);
        this.state.queueIndex = idx >= 0 ? idx : 0;
      }
    }

    try {
      localStorage.setItem('kaira_music_shuffle', String(nextShuffle));
    } catch (e) {}

    this.notify();
    return nextShuffle;
  }

  public toggleRepeatMode(): RepeatMode {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const curIdx = modes.indexOf(this.state.repeatMode);
    const nextMode = modes[(curIdx + 1) % modes.length];
    this.setRepeatMode(nextMode);
    return nextMode;
  }

  public setRepeatMode(mode: RepeatMode): void {
    this.state.repeatMode = mode;
    try {
      localStorage.setItem('kaira_music_repeat_mode', mode);
    } catch (e) {}
    this.notify();
  }

  private generateShuffledQueue(list: Track[], currentTrackId: string): Track[] {
    const current = list.find((t) => t.id === currentTrackId);
    const rest = list.filter((t) => t.id !== currentTrackId);

    // Fisher-Yates shuffle
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    return current ? [current, ...rest] : rest;
  }

  // ─── QUEUE MANIPULATION ───────────────────────────────────────────────────

  public addToQueue(track: Track): void {
    this.state.originalQueue.push(track);
    this.state.queue.push(track);
    this.notify();
  }

  public playNext(track: Track): void {
    const insertIdx = this.state.queueIndex + 1;
    this.state.queue.splice(insertIdx, 0, track);
    this.state.originalQueue.push(track);
    this.notify();
  }

  public removeFromQueue(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return;
    const removedTrack = this.state.queue[index];
    this.state.queue.splice(index, 1);
    this.state.originalQueue = this.state.originalQueue.filter((t) => t.id !== removedTrack.id);

    if (index < this.state.queueIndex) {
      this.state.queueIndex = Math.max(0, this.state.queueIndex - 1);
    } else if (this.state.queueIndex >= this.state.queue.length) {
      this.state.queueIndex = Math.max(0, this.state.queue.length - 1);
    }
    this.notify();
  }

  public moveQueueItem(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.state.queue.length ||
      toIndex < 0 ||
      toIndex >= this.state.queue.length
    )
      return;

    const [moved] = this.state.queue.splice(fromIndex, 1);
    this.state.queue.splice(toIndex, 0, moved);

    if (this.state.currentTrack) {
      const newCurrentIdx = this.state.queue.findIndex((t) => t.id === this.state.currentTrack?.id);
      if (newCurrentIdx >= 0) {
        this.state.queueIndex = newCurrentIdx;
      }
    }
    this.notify();
  }

  public clearQueue(): void {
    if (this.state.currentTrack) {
      this.state.queue = [this.state.currentTrack];
      this.state.originalQueue = [this.state.currentTrack];
      this.state.queueIndex = 0;
    } else {
      this.state.queue = [];
      this.state.originalQueue = [];
      this.state.queueIndex = 0;
    }
    this.notify();
  }

  // ─── VOLUME & MUTE ────────────────────────────────────────────────────────

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    this.state.isMuted = clamped === 0;
    if (this.isYouTubeMode) {
      youTubeAudioPlayer.setVolume(clamped * 100);
    }
    if (this.audioEl) {
      this.audioEl.volume = clamped;
    }
    try {
      localStorage.setItem('kaira_music_volume', String(clamped));
    } catch (e) {}
    this.notify();
  }

  public toggleMute(): boolean {
    this.state.isMuted = !this.state.isMuted;
    if (this.isYouTubeMode) {
      if (this.state.isMuted) {
        youTubeAudioPlayer.mute();
      } else {
        youTubeAudioPlayer.unMute();
      }
    }
    if (this.audioEl) {
      this.audioEl.muted = this.state.isMuted;
    }
    this.notify();
    return this.state.isMuted;
  }

  // ─── GAPLESS PRELOADER & TRACK ENDED HANDLER ──────────────────────────────

  private preloadNextTrack(): void {
    if (this.state.queue.length <= 1) return;
    const nextIdx = (this.state.queueIndex + 1) % this.state.queue.length;
    const nextTrack = this.state.queue[nextIdx];
    if (!nextTrack || nextTrack.id === this.preloadedTrackId) return;

    this.preloadedTrackId = nextTrack.id;

    streamResolverService
      .resolveFullAudioStream(nextTrack.title, nextTrack.artist, nextTrack.audioUrl)
      .then((url) => {
        if (url && this.prefetchAudioEl) {
          this.preloadedStreamUrl = url;
          this.prefetchAudioEl.src = url;
          this.prefetchAudioEl.load();
        }
      })
      .catch(() => {});
  }

  private handleTrackEnded(): void {
    const now = Date.now();
    if (now - this.lastEndedTime < 1500) return;
    this.lastEndedTime = now;

    // Repeat One Mode
    if (this.state.repeatMode === 'one' && this.state.currentTrack) {
      this.seek(0);
      this.audioEl?.play().catch(() => {});
      return;
    }

    // Queue has more songs
    if (this.state.queueIndex < this.state.queue.length - 1) {
      this.next();
    } else if (this.state.repeatMode === 'all' && this.state.queue.length > 0) {
      // Loop back to start in Repeat All mode
      this.playIndex(0);
    } else {
      this.state.status = 'ended';
      this.updateMediaSessionPlaybackState('none');
      this.notify();
    }
  }

  private handleStreamError(): void {
    if (this.currentCandidateIndex < this.streamCandidates.length - 1) {
      this.currentCandidateIndex++;
      const nextCandidate = this.streamCandidates[this.currentCandidateIndex];
      console.log(
        `[MusicEngine] 🔄 Switching to next stream candidate (${this.currentCandidateIndex + 1}/${
          this.streamCandidates.length
        }):`,
        nextCandidate
      );
      if (this.audioEl && nextCandidate) {
        if (this.state.currentSource) {
          this.state.currentSource.streamUrl = nextCandidate;
        }
        this.audioEl.src = nextCandidate;
        this.audioEl.currentTime = 0;
        this.audioEl
          .play()
          .then(() => {
            this.state.status = 'playing';
            this.notify();
          })
          .catch((err) => {
            console.warn('[MusicEngine] Candidate play retry notice:', err);
          });
        return;
      }
    }

    if (this.state.queue.length > 1 && this.state.queueIndex < this.state.queue.length - 1) {
      console.log('[MusicEngine] All candidates exhausted for track, moving to next in queue...');
      this.next();
    } else {
      this.state.status = 'error';
      this.state.error = 'Audio stream failed to load';
      this.notify();
    }
  }

  // ─── MEDIA SESSION API ────────────────────────────────────────────────────

  private setupMediaSessionHandlers(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        this.seekRelative(-(details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        this.seekRelative(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
    } catch (e) {}
  }

  private updateMediaSessionMetadata(track: Track): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: track.artwork, sizes: '96x96', type: 'image/jpeg' },
          { src: track.artwork, sizes: '128x128', type: 'image/jpeg' },
          { src: track.artwork, sizes: '256x256', type: 'image/jpeg' },
          { src: track.artwork, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    } catch (e) {}
  }

  private updateMediaSessionPlaybackState(state: 'none' | 'paused' | 'playing'): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch (e) {}
  }

  private updateMediaSessionPosition(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!navigator.mediaSession.setPositionState || !this.state.duration) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: this.state.duration,
        playbackRate: 1.0,
        position: Math.min(this.state.currentTime, this.state.duration),
      });
    } catch (e) {}
  }

  // ─── HELPERS & SUBSCRIPTIONS ──────────────────────────────────────────────

  public getState(): MusicEngineState {
    return { ...this.state };
  }

  public subscribe(listener: (state: MusicEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  private formatTime(sec: number): string {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

export const musicEngine = new MusicEngine();
