import { profileService } from '../profile/ProfileService';
import { PlaybackSource } from '../../types/media';

export interface ContinueWatchingEntry {
  mediaId: string;
  title: string;
  subtitle?: string;
  poster?: string;
  backdrop?: string;
  position: number;      // seconds
  duration: number;      // seconds
  mediaType: 'movie' | 'episode' | 'track';
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  completed?: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Storage helpers — ALL progress is stored under a profile-scoped key.
// Legacy unprefixed keys are migrated on first read but never written.
// ---------------------------------------------------------------------------

const COMPLETION_THRESHOLD_SEC = 15; // seconds from end → considered "complete"
const MIN_TRACKABLE_SEC = 10;        // must have watched at least this long to save

function profileKey(profileId: string, mediaId: string): string {
  return `tv_playback_progress_${profileId}_${mediaId}`;
}

function profilePrefix(profileId: string): string {
  return `tv_playback_progress_${profileId}_`;
}

// ---------------------------------------------------------------------------

class ContinueWatchingService {
  private listeners: Set<(items: ContinueWatchingEntry[]) => void> = new Set();
  private unsubProfile: (() => void) | null = null;

  constructor() {
    // Re-notify listeners whenever the active profile changes so that UI rails
    // update immediately on profile switch.
    this.unsubProfile = profileService.subscribe(() => {
      this.notify();
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Return all in-progress items for the current active profile, sorted newest first. */
  public getItems(): ContinueWatchingEntry[] {
    const profileId = profileService.getActiveProfile().id;
    const prefix = profilePrefix(profileId);
    const items: ContinueWatchingEntry[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Strictly match only the current profile's scoped keys.
        if (!key || !key.startsWith(prefix)) continue;

        const raw = localStorage.getItem(key);
        if (!raw) continue;

        try {
          const parsed: ContinueWatchingEntry = JSON.parse(raw);
          if (
            parsed &&
            !parsed.completed &&
            parsed.position >= MIN_TRACKABLE_SEC &&
            parsed.duration > 0 &&
            parsed.position < parsed.duration - COMPLETION_THRESHOLD_SEC
          ) {
            items.push(parsed);
          }
        } catch {
          // Corrupt entry — ignore
        }
      }
    } catch {
      // localStorage unavailable
    }

    // Deduplicate by mediaId (keep most-recently-updated), sort newest first
    const map = new Map<string, ContinueWatchingEntry>();
    for (const item of items) {
      const existing = map.get(item.mediaId);
      if (!existing || existing.updatedAt < item.updatedAt) {
        map.set(item.mediaId, item);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Save or update progress for the active profile. Removes the entry if completed. */
  public saveProgress(entry: Omit<ContinueWatchingEntry, 'updatedAt'>): void {
    const profileId = profileService.getActiveProfile().id;
    const key = profileKey(profileId, entry.mediaId);

    // Skip music tracks — they don't participate in continue watching
    if (entry.mediaType === 'track') return;

    try {
      const isCompleted =
        entry.completed ||
        (entry.duration > 0 && entry.position >= entry.duration - COMPLETION_THRESHOLD_SEC);

      if (isCompleted) {
        // Remove from continue watching (it's done)
        localStorage.removeItem(key);
      } else if (entry.position >= MIN_TRACKABLE_SEC) {
        const record: ContinueWatchingEntry = {
          ...entry,
          completed: false,
          updatedAt: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(record));
      }

      this.notify();
    } catch {
      // Storage quota or unavailable
    }
  }

  /**
   * Convenience method called directly by VideoPlayerScreen — maps a
   * PlaybackSource + live engine time into a ContinueWatchingEntry and saves it.
   */
  public upsertFromEngine(
    source: PlaybackSource,
    currentTime: number,
    duration: number,
    isComplete: boolean = false,
  ): void {
    if (source.type !== 'video') return;

    this.saveProgress({
      mediaId: source.mediaId,
      title: source.title,
      subtitle: source.subtitle,
      poster: source.artwork,
      backdrop: source.backdrop,
      position: Math.round(currentTime),
      duration: Math.round(duration > 0 ? duration : source.durationSeconds ?? 7200),
      mediaType: source.mediaType === 'episode' ? 'episode' : 'movie',
      showId: source.showId,
      seasonNumber: source.seasonNumber,
      episodeNumber: source.episodeNumber,
      completed: isComplete,
    });
  }

  /** Explicitly remove progress for a given media item in the active profile. */
  public removeProgress(mediaId: string): void {
    const profileId = profileService.getActiveProfile().id;
    localStorage.removeItem(profileKey(profileId, mediaId));
    this.notify();
  }

  /** Remove all progress entries for a specific profile (called on profile delete). */
  public clearProfileProgress(profileId: string): void {
    const prefix = profilePrefix(profileId);
    const keysToRemove: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {}

    this.notify();
  }

  /** Migrate any legacy un-prefixed keys into the active profile's namespace. */
  public migrateLegacyKeys(): void {
    const profileId = profileService.getActiveProfile().id;
    const legacyPrefix = 'tv_playback_progress_';
    const prefix = profilePrefix(profileId);
    const toMigrate: { old: string; mediaId: string }[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        // Only pick up keys that start with legacyPrefix but are NOT already scoped
        // (i.e. the segment after the prefix does not start with "prof-")
        if (key.startsWith(legacyPrefix) && !key.slice(legacyPrefix.length).startsWith('prof-')) {
          const mediaId = key.slice(legacyPrefix.length);
          toMigrate.push({ old: key, mediaId });
        }
      }

      for (const { old, mediaId } of toMigrate) {
        const raw = localStorage.getItem(old);
        if (raw) {
          const newKey = `${prefix}${mediaId}`;
          // Only migrate if there isn't already a profile-scoped entry
          if (!localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, raw);
          }
          localStorage.removeItem(old);
        }
      }
    } catch {}
  }

  // ─── Subscription ─────────────────────────────────────────────────────────

  public subscribe(listener: (items: ContinueWatchingEntry[]) => void): () => void {
    this.listeners.add(listener);
    // Emit current items immediately
    listener(this.getItems());
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private notify(): void {
    const items = this.getItems();
    this.listeners.forEach((fn) => fn(items));
  }
}

export const continueWatchingService = new ContinueWatchingService();
