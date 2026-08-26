import { Movie, Show } from '../../types/media';
import { MediaItem } from '../../types';
import { profileService } from '../profile/ProfileService';
import { GenreAffinity, RecommendationContext } from '../../types/profile';
import { HOLLYWOOD_MOVIES } from '../../data/media/hollywoodMedia';
import { ALL_REGIONAL_MOVIES } from '../../data/media/regionalMedia';
import {
  NETFLIX_ORIGINALS,
  APPLE_TV_ORIGINALS,
  PRIME_VIDEO_HITS,
  MAX_DISNEY_HITS,
} from '../../data/media/streamingMedia';

export interface PersonalizedRecommendationResult {
  movies: Movie[];
  topGenres: string[];
  reason: string;
  genreAffinities: GenreAffinity[];
  totalHistoryCount: number;
}

class RecommendationEngine {
  private candidatePoolCache: Movie[] = [];
  private cacheTimestamp: number = 0;

  /**
   * Builds candidate pool from all available movie sources
   */
  private async getCandidatePool(): Promise<Movie[]> {
    const now = Date.now();
    if (this.candidatePoolCache.length > 0 && now - this.cacheTimestamp < 60000) {
      return this.candidatePoolCache;
    }

    const poolMap = new Map<string, Movie>();

    // 1. Hollywood Catalog
    HOLLYWOOD_MOVIES.forEach((m) => poolMap.set(m.id, m));

    // 2. Regional Indian Blockbusters (Malayalam, Hindi, Tamil)
    ALL_REGIONAL_MOVIES.forEach((m) => {
      if (!poolMap.has(m.id)) poolMap.set(m.id, m);
    });

    // 3. Streaming Originals mapped to Movies
    const streamingList: MediaItem[] = [
      ...NETFLIX_ORIGINALS,
      ...APPLE_TV_ORIGINALS,
      ...PRIME_VIDEO_HITS,
      ...MAX_DISNEY_HITS,
    ];

    streamingList.forEach((item) => {
      if (!poolMap.has(item.id)) {
        poolMap.set(item.id, {
          id: item.id,
          title: item.title,
          description: item.description,
          poster: item.posterUrl || item.backdropUrl,
          backdrop: item.backdropUrl || item.posterUrl,
          year: typeof item.year === 'number' ? item.year : parseInt(String(item.year || 2024), 10) || 2024,
          runtime: item.duration || '2h',
          runtimeMinutes: 120,
          rating: item.rating || '8.5',
          genres: item.genre || ['Drama', 'Action'],
          streamUrl: (item as any).streamUrl,
          regionalCategory: 'english',
        } as Movie);
      }
    });

    // 4. Optionally fetch live Cinemeta top catalog
    try {
      const res = await fetch('https://v3-cinemeta.strem.io/catalog/movie/top.json');
      const data = await res.json();
      if (data && Array.isArray(data.metas)) {
        data.metas.forEach((meta: any) => {
          if (meta.id && meta.name && meta.poster && !poolMap.has(meta.id)) {
            poolMap.set(meta.id, {
              id: meta.id,
              imdbId: meta.id,
              title: meta.name,
              description: meta.description || '',
              poster: meta.poster,
              backdrop: meta.background || meta.poster,
              year: parseInt(String(meta.year || 2024), 10) || 2024,
              runtime: meta.runtime || '2h',
              rating: meta.imdbRating ? `${meta.imdbRating}` : '8.0',
              genres: Array.isArray(meta.genres) && meta.genres.length > 0 ? meta.genres : ['Drama'],
              regionalCategory: 'english',
            } as Movie);
          }
        });
      }
    } catch (e) {
      // Local fallback is already comprehensive
    }

    this.candidatePoolCache = Array.from(poolMap.values());
    this.cacheTimestamp = now;
    return this.candidatePoolCache;
  }

  /**
   * Fetches personalized movie suggestions based on most viewed genres in profileService watch history
   */
  public async getPersonalizedRecommendations(
    profileId?: string,
    limit: number = 14
  ): Promise<PersonalizedRecommendationResult> {
    const activeProfile = profileService.getActiveProfile();
    const targetProfileId = profileId || activeProfile.id;
    const isKid = activeProfile.isKid || activeProfile.type === 'kids';

    // 1. Get genre affinities from profileService watch history
    const affinities = profileService.getMostViewedGenres(targetProfileId);
    const topGenres = affinities.slice(0, 3).map((a) => a.genre);
    const history = profileService.getWatchHistory(targetProfileId);
    const watchedIds = new Set(history.map((h) => h.mediaId));
    const completedIds = new Set(history.filter((h) => (h.progress || 0) >= 85).map((h) => h.mediaId));

    // 2. Build Candidate Pool
    const candidates = await this.getCandidatePool();

    // 3. Affinity Map for fast scoring
    const affinityWeightMap = new Map<string, number>();
    affinities.forEach((aff, idx) => {
      // Scale weight: #1 genre gets highest multiplier, #2 second, etc.
      const tierBonus = idx === 0 ? 55 : idx === 1 ? 38 : idx === 2 ? 24 : 12;
      affinityWeightMap.set(aff.genre.toLowerCase(), tierBonus);
    });

    // 4. Filter & Score Candidates
    interface ScoredMovie {
      movie: Movie;
      score: number;
      matchingGenres: string[];
    }

    const scored: ScoredMovie[] = [];

    for (const movie of candidates) {
      const movieGenres = movie.genres || [];
      const movieGenresLower = movieGenres.map((g) => g.toLowerCase());

      // Filter out mature titles for kids profiles
      if (isKid) {
        const isMature = movieGenresLower.some((g) =>
          ['horror', 'crime', 'thriller', 'erotica', 'r-rated'].includes(g)
        );
        if (isMature) continue;

        const isFamilyFriendly = movieGenresLower.some((g) =>
          ['animation', 'family', 'adventure', 'comedy', 'fantasy'].includes(g)
        );
        if (!isFamilyFriendly && movieGenres.length > 0) continue;
      }

      let score = 0;
      const matchingGenres: string[] = [];

      // Genre matching score
      movieGenres.forEach((genre) => {
        const key = genre.toLowerCase();
        if (affinityWeightMap.has(key)) {
          const w = affinityWeightMap.get(key)!;
          score += w;
          matchingGenres.push(genre);
        }
      });

      // Kids profile boost for animation / family
      if (isKid && movieGenresLower.some((g) => ['animation', 'family'].includes(g))) {
        score += 45;
      }

      // Quality rating score (e.g. 8.8 -> +22)
      const numRating = parseFloat(movie.rating?.replace('★', '').trim() || '7.5') || 7.5;
      score += numRating * 2.5;

      // Year recency bonus
      if (movie.year >= 2024) score += 8;
      else if (movie.year >= 2022) score += 5;
      else if (movie.year >= 2018) score += 2;

      // Penalize already completed items so fresh recommendations are preferred
      if (completedIds.has(movie.id) || completedIds.has(movie.imdbId || '')) {
        score -= 60;
      } else if (watchedIds.has(movie.id)) {
        score -= 20;
      }

      // High-res visual polish bonus
      if (movie.backdrop && movie.poster) score += 6;

      scored.push({ movie, score, matchingGenres });
    }

    // 5. Sort candidates by total score descending
    scored.sort((a, b) => b.score - a.score);

    const selectedMovies = scored.slice(0, limit).map((s) => s.movie);

    // 6. Generate contextual recommendation reason
    let reason = 'Trending Blockbusters & Top-Rated Picks';
    if (isKid) {
      reason = `Top Family & Animation picks for ${activeProfile.name}`;
    } else if (topGenres.length >= 2) {
      reason = `Because you watch ${topGenres.slice(0, 2).join(' & ')}`;
    } else if (topGenres.length === 1) {
      reason = `Because you like ${topGenres[0]}`;
    }

    return {
      movies: selectedMovies,
      topGenres,
      reason,
      genreAffinities: affinities,
      totalHistoryCount: history.length,
    };
  }

  /**
   * Fetches movies tailored to a specific genre category
   */
  public async getMoviesByGenre(genre: string, limit: number = 10): Promise<Movie[]> {
    const candidates = await this.getCandidatePool();
    const gLower = genre.toLowerCase();
    const matched = candidates.filter((m) =>
      m.genres?.some((g) => g.toLowerCase().includes(gLower) || gLower.includes(g.toLowerCase()))
    );

    return matched
      .sort((a, b) => (parseFloat(b.rating) || 7.0) - (parseFloat(a.rating) || 7.0))
      .slice(0, limit);
  }
}

export const recommendationEngine = new RecommendationEngine();
