import { Movie, Show, Episode, Album, Track, PlaybackSource, MediaSearchCategoryResult } from '../../types';
import { mediaProvider } from './LiveMediaProvider';
import { addonService } from '../addons/AddonService';

export class MediaService {
  public async search(query: string): Promise<MediaSearchCategoryResult> {
    return await mediaProvider.search(query);
  }

  public async getMovies(): Promise<Movie[]> {
    return await mediaProvider.getMovies();
  }

  public async getMovie(id: string): Promise<Movie | null> {
    return await mediaProvider.getMovie(id);
  }

  public async getShows(): Promise<Show[]> {
    return await mediaProvider.getShows();
  }

  public async getShow(id: string): Promise<Show | null> {
    return await mediaProvider.getShow(id);
  }

  public async getEpisodes(showId: string, seasonNumber = 1): Promise<Episode[]> {
    return await mediaProvider.getEpisodes(showId, seasonNumber);
  }

  public async getMusic(): Promise<{ recentlyPlayed: Album[]; albums: Album[]; topTracks: Track[] }> {
    return await mediaProvider.getMusic();
  }

  public async getAlbum(id: string): Promise<Album | null> {
    return await mediaProvider.getAlbum(id);
  }

  public async getPlaybackSource(item: Movie | Episode | Track): Promise<PlaybackSource> {
    return await mediaProvider.getPlaybackSource(item);
  }

  public async getStreamOptions(type: 'movie' | 'series', id: string, season?: number, episode?: number, title?: string) {
    return await addonService.fetchStreams(type, id, season, episode, title);
  }
}

export const mediaService = new MediaService();
