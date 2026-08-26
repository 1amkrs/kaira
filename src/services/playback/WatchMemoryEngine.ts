import { profileService } from '../profile/ProfileService';
import { ContinueWatchingItem } from '../media/LiveMediaProvider';
import { Movie, Show, Episode, Track } from '../../types';

export interface WatchSession {
  id: string;
  profileId: string;
  mediaId: string;
  title: string;
  subtitle?: string;
  type: 'movie' | 'show' | 'episode' | 'track';
  poster?: string;
  backdrop?: string;
  positionSeconds: number;
  durationSeconds: number;
  progress: number; // 0 to 100
  lastWatchedAt: number; // epoch ms
  completed: boolean;
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  streamUrl?: string;
  imdbId?: string;
  year?: number | string;
  genres?: string[];
  rating?: string;
}

export interface RecordProgressInput {
  profileId?: string;
  mediaId: string;
  title: string;
  subtitle?: string;
  type: 'movie' | 'show' | 'episode' | 'track';
  poster?: string;
  backdrop?: string;
  positionSeconds: number;
  durationSeconds: number;
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  streamUrl?: string;
  imdbId?: string;
  year?: number | string;
  genres?: string[];
  rating?: string;
  forceCompleted?: boolean;
}

const STORAGE_PREFIX = 'tv_watch_memory_v2_';

class WatchMemoryEngine {
  private cache: Map<string, WatchSession[]> = new Map();
  private listeners: Set<(profileId: string) => void> = new Set();
  private lastSaveTimes: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('tv:profile-changed', (e: any) => {
        const profId = e?.detail?.profile?.id || profileService.getActiveProfile().id;
        this.notify(profId);
      });
    }
  }

  private getStorageKey(profileId: string): string {
    return `${STORAGE_PREFIX}${profileId}`;
  }

  /**
   * Load stored sessions for a profile from localStorage
   */
  public getSessions(profileId?: string): WatchSession[] {
    const pId = profileId || profileService.getActiveProfile().id;
    if (this.cache.has(pId)) {
      return this.cache.get(pId)!;
    }

    try {
      const raw = localStorage.getItem(this.getStorageKey(pId));
      if (raw) {
        const parsed: WatchSession[] = JSON.parse(raw);
        this.cache.set(pId, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('[WatchMemoryEngine] Failed to load sessions for profile:', pId, e);
    }

    // Try migration from older keys if any
    const legacyHistory = this.migrateFromLegacy(pId);
    this.cache.set(pId, legacyHistory);
    return legacyHistory;
  }

  private migrateFromLegacy(profileId: string): WatchSession[] {
    try {
      const legacyRaw = localStorage.getItem(`tv_watch_history_${profileId}`);
      if (legacyRaw) {
        const list = JSON.parse(legacyRaw);
        if (Array.isArray(list)) {
          const converted: WatchSession[] = list.map((item: any) => ({
            id: item.id || `ws-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            profileId,
            mediaId: item.mediaId || item.id,
            title: item.title || 'Untitled',
            type: item.type || 'movie',
            poster: item.poster,
            backdrop: item.backdrop,
            positionSeconds: item.positionSeconds || 0,
            durationSeconds: item.durationSeconds || 7200,
            progress: item.progress || 0,
            lastWatchedAt: item.timestamp || Date.now(),
            completed: (item.progress || 0) >= 90,
            showId: item.episodeInfo ? item.mediaId : undefined,
            seasonNumber: item.episodeInfo?.seasonNumber,
            episodeNumber: item.episodeInfo?.episodeNumber,
            episodeTitle: item.episodeInfo?.episodeTitle,
          }));
          return converted;
        }
      }
    } catch (e) {}
    return [];
  }

  private saveSessions(profileId: string, sessions: WatchSession[]) {
    try {
      this.cache.set(profileId, sessions);
      localStorage.setItem(this.getStorageKey(profileId), JSON.stringify(sessions));

      // Synchronize with profileService watch history & individual progress keys for backward compatibility
      localStorage.setItem(`tv_watch_history_${profileId}`, JSON.stringify(sessions));
    } catch (e) {
      console.warn('[WatchMemoryEngine] Failed to save sessions:', e);
    }
  }

  /**
   * Save / Update active playback progress for a user profile
   */
  public recordProgress(input: RecordProgressInput): WatchSession {
    const profileId = input.profileId || profileService.getActiveProfile().id;
    const mediaId = input.mediaId;
    const duration = Math.max(1, input.durationSeconds || 7200);
    const position = Math.max(0, Math.min(duration, input.positionSeconds));
    const progress = Math.min(100, Math.round((position / duration) * 100));

    // Determine completion threshold: >= 90% or within last 60 seconds
    const isCompleted = input.forceCompleted || progress >= 90 || (duration - position) <= 60;

    const sessions = [...this.getSessions(profileId)];
    const existingIndex = sessions.findIndex((s) => s.mediaId === mediaId);

    const now = Date.now();
    let session: WatchSession;

    if (existingIndex >= 0) {
      const existing = sessions[existingIndex];
      session = {
        ...existing,
        title: input.title || existing.title,
        subtitle: input.subtitle !== undefined ? input.subtitle : existing.subtitle,
        type: input.type || existing.type,
        poster: input.poster || existing.poster,
        backdrop: input.backdrop || existing.backdrop,
        positionSeconds: isCompleted ? 0 : position,
        durationSeconds: duration,
        progress: isCompleted ? 100 : progress,
        lastWatchedAt: now,
        completed: isCompleted,
        showId: input.showId || existing.showId,
        seasonNumber: input.seasonNumber !== undefined ? input.seasonNumber : existing.seasonNumber,
        episodeNumber: input.episodeNumber !== undefined ? input.episodeNumber : existing.episodeNumber,
        episodeTitle: input.episodeTitle || existing.episodeTitle,
        streamUrl: input.streamUrl || existing.streamUrl,
        imdbId: input.imdbId || existing.imdbId,
        year: input.year || existing.year,
        genres: input.genres || existing.genres,
        rating: input.rating || existing.rating,
      };

      // Move to top of sessions list
      sessions.splice(existingIndex, 1);
      sessions.unshift(session);
    } else {
      session = {
        id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        profileId,
        mediaId,
        title: input.title,
        subtitle: input.subtitle,
        type: input.type,
        poster: input.poster,
        backdrop: input.backdrop,
        positionSeconds: isCompleted ? 0 : position,
        durationSeconds: duration,
        progress: isCompleted ? 100 : progress,
        lastWatchedAt: now,
        completed: isCompleted,
        showId: input.showId,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
        episodeTitle: input.episodeTitle,
        streamUrl: input.streamUrl,
        imdbId: input.imdbId,
        year: input.year,
        genres: input.genres,
        rating: input.rating,
      };
      sessions.unshift(session);
    }

    // Limit sessions memory per profile to 80 items
    const trimmed = sessions.slice(0, 80);
    this.saveSessions(profileId, trimmed);

    // Save individual quick-lookup key for fast player startup
    try {
      localStorage.setItem(
        `tv_playback_progress_${profileId}_${mediaId}`,
        JSON.stringify({
          position: isCompleted ? 0 : position,
          duration,
          updatedAt: now,
          mediaType: input.type,
          title: input.title,
          subtitle: input.subtitle,
          artwork: input.poster,
          backdrop: input.backdrop,
          showId: input.showId,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
        })
      );
    } catch (e) {}

    // Throttle notifications to max once every 1.5s unless completed/paused
    const lastNotif = this.lastSaveTimes.get(`${profileId}_${mediaId}`) || 0;
    if (isCompleted || now - lastNotif > 1500) {
      this.lastSaveTimes.set(`${profileId}_${mediaId}`, now);
      this.notify(profileId, session);
    }

    return session;
  }

  /**
   * Get formatted Continue Watching items for the active or given user profile
   */
  public getContinueWatching(profileId?: string): ContinueWatchingItem[] {
    const pId = profileId || profileService.getActiveProfile().id;
    const sessions = this.getSessions(pId);

    // Filter: must not be completed, and must have valid progress > 3% or played > 8s
    const active = sessions.filter(
      (s) => !s.completed && s.positionSeconds >= 5 && s.progress >= 2 && s.progress < 92
    );

    return active.map((s) => {
      const remainingSecs = Math.max(0, s.durationSeconds - s.positionSeconds);
      const remainingFormatted = this.formatDurationLeft(remainingSecs);

      let seasonSubtitle = '';
      if (s.type === 'episode' || s.seasonNumber) {
        seasonSubtitle = `S${s.seasonNumber || 1} E${s.episodeNumber || 1}${s.episodeTitle ? ` • ${s.episodeTitle}` : ''}`;
      } else if (s.subtitle) {
        seasonSubtitle = s.subtitle;
      } else {
        seasonSubtitle = `${remainingFormatted} left`;
      }

      // Build underlying media representation
      let mediaItem: Movie | Episode | Track;
      if (s.type === 'episode' || s.seasonNumber) {
        mediaItem = {
          id: s.mediaId,
          showId: s.showId || 'show-unknown',
          seasonId: `season-${s.seasonNumber || 1}`,
          number: s.episodeNumber || 1,
          seasonNumber: s.seasonNumber || 1,
          title: s.episodeTitle || s.title,
          description: '',
          thumbnail: s.poster || s.backdrop || '',
          runtime: `${Math.round(s.durationSeconds / 60)} min`,
          runtimeMinutes: Math.round(s.durationSeconds / 60),
          streamUrl: s.streamUrl,
        } as Episode;
      } else {
        mediaItem = {
          id: s.mediaId,
          title: s.title,
          description: '',
          poster: s.poster || '',
          backdrop: s.backdrop || s.poster || '',
          year: parseInt(String(s.year || 2024), 10),
          runtime: `${Math.round(s.durationSeconds / 60)} min`,
          runtimeMinutes: Math.round(s.durationSeconds / 60),
          rating: s.rating || '8.5',
          genres: s.genres || ['Drama'],
          streamUrl: s.streamUrl,
          imdbId: s.imdbId,
        } as Movie;
      }

      return {
        id: s.mediaId,
        type: s.type === 'episode' ? 'episode' : s.type === 'track' ? 'track' : 'movie',
        title: s.title,
        subtitle: seasonSubtitle,
        poster: s.poster || s.backdrop || '',
        backdrop: s.backdrop || s.poster || '',
        progress: s.progress,
        duration: remainingFormatted,
        lastPlayedPosition: s.positionSeconds,
        media: mediaItem,
      };
    });
  }

  /**
   * Get exact saved playback position for a media item
   */
  public getSavedPosition(profileId: string | undefined, mediaId: string): number {
    const pId = profileId || profileService.getActiveProfile().id;
    
    // Check in-memory sessions first
    const sessions = this.getSessions(pId);
    const session = sessions.find((s) => s.mediaId === mediaId);
    if (session) {
      if (session.completed) return 0;
      return session.positionSeconds || 0;
    }

    // Check individual progress key fallback
    try {
      const stored = localStorage.getItem(`tv_playback_progress_${pId}_${mediaId}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.position && isFinite(data.position)) {
          return data.position;
        }
      }
    } catch (e) {}

    return 0;
  }

  /**
   * Remove an item from Continue Watching list
   */
  public removeFromContinueWatching(profileId: string | undefined, mediaId: string): void {
    const pId = profileId || profileService.getActiveProfile().id;
    const sessions = this.getSessions(pId);
    const updated = sessions.filter((s) => s.mediaId !== mediaId);
    this.saveSessions(pId, updated);

    try {
      localStorage.removeItem(`tv_playback_progress_${pId}_${mediaId}`);
    } catch (e) {}

    this.notify(pId);
  }

  /**
   * Mark a media session as completed
   */
  public markAsCompleted(profileId: string | undefined, mediaId: string): void {
    const pId = profileId || profileService.getActiveProfile().id;
    const sessions = this.getSessions(pId);
    const item = sessions.find((s) => s.mediaId === mediaId);
    if (item) {
      item.completed = true;
      item.progress = 100;
      item.positionSeconds = 0;
      this.saveSessions(pId, [...sessions]);
      this.notify(pId, item);
    }
  }

  /**
   * Clear all watch memory & history for a user profile
   */
  public clearWatchHistory(profileId?: string): void {
    const pId = profileId || profileService.getActiveProfile().id;
    this.cache.delete(pId);
    try {
      localStorage.removeItem(this.getStorageKey(pId));
      localStorage.removeItem(`tv_watch_history_${pId}`);
      
      // Clean up individual progress keys for this profile
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`tv_playback_progress_${pId}_`)) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}

    this.notify(pId);
  }

  /**
   * Format remaining duration in clean human text (e.g., "45m", "1h 12m")
   */
  private formatDurationLeft(seconds: number): string {
    if (!seconds || seconds <= 0) return '0m';
    const totalMinutes = Math.ceil(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  public subscribe(listener: (profileId: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(profileId: string, session?: WatchSession): void {
    this.listeners.forEach((fn) => fn(profileId));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tv:watch-memory-updated', {
          detail: { profileId, session },
        })
      );
    }
  }
}

export const watchMemoryEngine = new WatchMemoryEngine();
