import { Track, SyncedLyricLine } from '../../types/media';
import { streamResolverService } from './StreamResolverService';
import { lyricsService } from './LyricsService';

export interface MusicPluginConfig {
  audiusEnabled: boolean;
  pipedEnabled: boolean;
  lrclibEnabled: boolean;
  pipedInstanceUrl: string;
}

class MusicPluginService {
  public saveConfig(_newConfig: Partial<MusicPluginConfig>) {
    // Preserved for backwards compatibility
  }

  public getConfig(): MusicPluginConfig {
    return {
      audiusEnabled: true,
      pipedEnabled: true,
      lrclibEnabled: true,
      pipedInstanceUrl: 'https://pipedapi.kavin.rocks',
    };
  }

  // --- AUDIUS OPEN MUSIC PROTOCOL ---
  public async fetchTrendingTracks(limit: number = 25): Promise<Track[]> {
    return streamResolverService.fetchTrendingTracks(limit);
  }

  public async fetchGenreTracks(genre: string, limit: number = 20): Promise<Track[]> {
    return streamResolverService.fetchGenreTracks(genre, limit);
  }

  public async searchAudius(query: string): Promise<Track[]> {
    return streamResolverService.searchAudius(query);
  }

  // --- FULL-LENGTH AUDIO RESOLVER ---
  public async resolveFullAudioStream(title: string, artist: string, fallbackUrl?: string): Promise<string> {
    return streamResolverService.resolveFullAudioStream(title, artist, fallbackUrl);
  }

  // --- LRCLIB REAL-TIME SYNCED LYRICS ---
  public async fetchSyncedLyrics(title: string, artist: string): Promise<{ synced: SyncedLyricLine[]; plain?: string }> {
    return lyricsService.fetchLyrics(title, artist);
  }

  public mapAudiusTrack(t: any, idx: number): Track {
    return streamResolverService.mapAudiusTrack(t, idx);
  }
}

export const musicPluginService = new MusicPluginService();
export { streamResolverService } from './StreamResolverService';
export { lyricsService } from './LyricsService';
export { musicEngine } from './MusicEngine';
export * from './types';
