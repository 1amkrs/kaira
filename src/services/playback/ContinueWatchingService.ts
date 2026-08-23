import { profileService } from '../profile/ProfileService';

export interface ContinueWatchingEntry {
  mediaId: string;
  title: string;
  subtitle?: string;
  poster?: string;
  backdrop?: string;
  position: number;
  duration: number;
  mediaType: 'movie' | 'show' | 'track' | 'game' | 'app';
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  subtitleTrack?: string;
  audioTrack?: string;
  completed?: boolean;
  updatedAt: number;
}

class ContinueWatchingService {
  private listeners: Set<(items: ContinueWatchingEntry[]) => void> = new Set();

  public getItems(): ContinueWatchingEntry[] {
    const activeProfileId = profileService.getActiveProfile().id;
    const items: ContinueWatchingEntry[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(`tv_playback_progress_${activeProfileId}_`) || key.startsWith('tv_playback_progress_'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const parsed: ContinueWatchingEntry = JSON.parse(raw);
              if (parsed && !parsed.completed && parsed.position > 10 && parsed.position < parsed.duration - 15) {
                items.push(parsed);
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    // Deduplicate by mediaId and sort by most recently updated
    const map = new Map<string, ContinueWatchingEntry>();
    items.forEach((item) => {
      if (!map.has(item.mediaId) || (map.get(item.mediaId)!.updatedAt < item.updatedAt)) {
        map.set(item.mediaId, item);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public saveProgress(entry: Omit<ContinueWatchingEntry, 'updatedAt'>): void {
    const activeProfileId = profileService.getActiveProfile().id;
    const profileKey = `tv_playback_progress_${activeProfileId}_${entry.mediaId}`;
    const legacyKey = `tv_playback_progress_${entry.mediaId}`;

    const record: ContinueWatchingEntry = {
      ...entry,
      updatedAt: Date.now(),
    };

    try {
      if (entry.completed || (entry.duration > 0 && entry.position >= entry.duration - 15)) {
        localStorage.removeItem(profileKey);
        localStorage.removeItem(legacyKey);
      } else {
        const json = JSON.stringify(record);
        localStorage.setItem(profileKey, json);
        localStorage.setItem(legacyKey, json);
      }
      this.notify();
    } catch (e) {}
  }

  public removeProgress(mediaId: string): void {
    const activeProfileId = profileService.getActiveProfile().id;
    localStorage.removeItem(`tv_playback_progress_${activeProfileId}_${mediaId}`);
    localStorage.removeItem(`tv_playback_progress_${mediaId}`);
    this.notify();
  }

  public subscribe(listener: (items: ContinueWatchingEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const items = this.getItems();
    this.listeners.forEach((fn) => fn(items));
  }
}

export const continueWatchingService = new ContinueWatchingService();
