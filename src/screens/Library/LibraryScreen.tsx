import React, { useState, useEffect } from 'react';
import { Play, Info, Bookmark, Clock, Film, Tv } from 'lucide-react';
import { Movie, Show, MediaItem, Episode } from '../../types';
import { mediaProvider, ContinueWatchingItem } from '../../services/media/LiveMediaProvider';
import { continueWatchingService, ContinueWatchingEntry } from '../../services/playback/ContinueWatchingService';
import { Focusable } from '../../components/Focusable/Focusable';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { MovieCard } from '../../components/MediaCard/MovieCard';
import { ShowCard } from '../../components/MediaCard/ShowCard';
import { MediaCard } from '../../components/MediaCard/MediaCard';
import { Footer } from '../../components/Footer/Footer';
import './LibraryScreen.css';

interface LibraryScreenProps {
  onSelectMovie?: (movie: Movie) => void;
  onPlayMovie?: (movie: Movie) => void;
  onSelectShow?: (show: Show) => void;
  onSelectContinueItem?: (item: ContinueWatchingItem) => void;
  onSelectMedia?: (item: MediaItem) => void;
}

type LibraryCategoryTab = 'all' | 'continue' | 'movies' | 'shows';

const CATEGORIES: { id: LibraryCategoryTab; label: string }[] = [
  { id: 'all', label: 'All Library' },
  { id: 'continue', label: 'Continue Watching' },
  { id: 'movies', label: 'Watchlist: Movies' },
  { id: 'shows', label: 'Watchlist: TV Shows' },
];

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  onSelectMovie,
  onPlayMovie,
  onSelectShow,
  onSelectContinueItem,
  onSelectMedia,
}) => {
  const [activeCategory, setActiveCategory] = useState<LibraryCategoryTab>('all');
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [favoriteMovies, setFavoriteMovies] = useState<Movie[]>([]);
  const [favoriteShows, setFavoriteShows] = useState<Show[]>([]);
  const [recommendedMovies, setRecommendedMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Live-subscribe to continue watching entries with full metadata
  useEffect(() => {
    const mapEntry = (entry: ContinueWatchingEntry): ContinueWatchingItem => {
      const progress = Math.min(100, Math.round((entry.position / entry.duration) * 100));
      const isEpisode = entry.mediaType === 'episode';
      const cleanImdb = entry.mediaId.startsWith('tt') ? entry.mediaId : 'tt0816692';
      return {
        id: entry.mediaId,
        type: isEpisode ? 'episode' : 'movie',
        title: entry.title,
        subtitle: entry.subtitle || `Resume at ${Math.floor(entry.position / 60)}:${String(Math.round(entry.position % 60)).padStart(2, '0')}`,
        poster: entry.poster || `https://images.metahub.space/poster/medium/${cleanImdb}/img`,
        backdrop: entry.backdrop || `https://images.metahub.space/background/medium/${cleanImdb}/img`,
        progress,
        duration: `${Math.round(entry.duration / 60)} min`,
        lastPlayedPosition: entry.position,
        media: {
          id: entry.mediaId,
          title: entry.title,
          description: '',
          poster: entry.poster || `https://images.metahub.space/poster/medium/${cleanImdb}/img`,
          backdrop: entry.backdrop || `https://images.metahub.space/background/medium/${cleanImdb}/img`,
          year: 2024,
          runtime: `${Math.round(entry.duration / 60)} min`,
          runtimeMinutes: Math.round(entry.duration / 60),
          rating: '8.5 ★',
          genres: isEpisode ? ['Drama'] : ['Drama'],
          ...(isEpisode && {
            showId: entry.showId || 'show-unknown',
            seasonId: `season-${entry.seasonNumber || 1}`,
            seasonNumber: entry.seasonNumber || 1,
            number: entry.episodeNumber || 1,
            thumbnail: entry.poster || entry.backdrop || '',
          }),
        } as any,
      };
    };

    const unsub = continueWatchingService.subscribe((entries) => {
      setContinueWatching(entries.map(mapEntry));
    });
    return unsub;
  }, []);

  // Load favorites & recommended fallback
  const loadFavoritesAndRecs = async () => {
    setIsLoading(true);
    try {
      const [favs, recs] = await Promise.all([
        mediaProvider.getFavorites(),
        mediaProvider.getHollywoodMovies(),
      ]);
      setFavoriteMovies(favs.movies || []);
      setFavoriteShows(favs.shows || []);
      setRecommendedMovies(recs || []);
    } catch (e) {
      console.warn('[LibraryScreen] Error loading library data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFavoritesAndRecs();

    const handleUpdate = () => {
      loadFavoritesAndRecs();
    };

    window.addEventListener('tv:favorites-changed', handleUpdate);
    window.addEventListener('tv:profile-changed', handleUpdate);

    return () => {
      window.removeEventListener('tv:favorites-changed', handleUpdate);
      window.removeEventListener('tv:profile-changed', handleUpdate);
    };
  }, []);

  // Compute dynamic hero billboard item
  let featuredHero: {
    title: string;
    badge: string;
    rating?: string;
    progress?: number;
    year?: number | string;
    metaExtra?: string;
    genres?: string[];
    description: string;
    backdrop: string;
    onPlay: () => void;
    onDetails?: () => void;
  } | null = null;

  if (activeCategory === 'continue' && continueWatching.length > 0) {
    const item = continueWatching[0];
    featuredHero = {
      title: item.title,
      badge: item.type === 'episode' ? 'Continue Watching • TV Episode' : 'Continue Watching • Movie',
      progress: item.progress,
      metaExtra: item.subtitle,
      description: (item.media as any)?.description || 'Pick up right where you left off in your watch history.',
      backdrop: item.backdrop || item.poster || '',
      onPlay: () => {
        if (onSelectContinueItem) onSelectContinueItem(item);
      },
      onDetails: async () => {
        if (item.type === 'episode' || 'seasonNumber' in item.media) {
          const ep = item.media as Episode;
          const showId = ep.showId || (item as any).showId;
          if (showId && onSelectShow) {
            const sh = await mediaProvider.getShow(showId);
            if (sh) onSelectShow(sh);
          }
        } else if (onSelectMovie) {
          const mov = await mediaProvider.getMovie(item.id);
          if (mov) onSelectMovie(mov);
        }
      },
    };
  } else if (activeCategory === 'movies' && favoriteMovies.length > 0) {
    const mov = favoriteMovies[0];
    featuredHero = {
      title: mov.title,
      badge: 'Watchlist • Movie',
      rating: mov.rating,
      year: mov.year,
      metaExtra: mov.runtime,
      genres: mov.genres,
      description: mov.description,
      backdrop: mov.backdrop || mov.poster || '',
      onPlay: () => {
        if (onPlayMovie) onPlayMovie(mov);
        else if (onSelectMovie) onSelectMovie(mov);
      },
      onDetails: () => {
        if (onSelectMovie) onSelectMovie(mov);
      },
    };
  } else if (activeCategory === 'shows' && favoriteShows.length > 0) {
    const sh = favoriteShows[0];
    featuredHero = {
      title: sh.title,
      badge: 'Watchlist • TV Series',
      rating: sh.rating,
      year: sh.year,
      metaExtra: sh.network,
      genres: sh.genres,
      description: sh.description,
      backdrop: sh.backdrop || sh.poster || '',
      onPlay: () => {
        if (onSelectShow) onSelectShow(sh);
      },
      onDetails: () => {
        if (onSelectShow) onSelectShow(sh);
      },
    };
  } else {
    // 'all' category fallback prioritization
    if (continueWatching.length > 0) {
      const item = continueWatching[0];
      featuredHero = {
        title: item.title,
        badge: item.type === 'episode' ? 'Continue Watching • TV Episode' : 'Continue Watching • Movie',
        progress: item.progress,
        metaExtra: item.subtitle,
        description: (item.media as any)?.description || 'Pick up right where you left off in your watch history.',
        backdrop: item.backdrop || item.poster || '',
        onPlay: () => {
          if (onSelectContinueItem) onSelectContinueItem(item);
        },
        onDetails: async () => {
          if (item.type === 'episode' || 'seasonNumber' in item.media) {
            const ep = item.media as Episode;
            const showId = ep.showId || (item as any).showId;
            if (showId && onSelectShow) {
              const sh = await mediaProvider.getShow(showId);
              if (sh) onSelectShow(sh);
            }
          } else if (onSelectMovie) {
            const mov = await mediaProvider.getMovie(item.id);
            if (mov) onSelectMovie(mov);
          }
        },
      };
    } else if (favoriteMovies.length > 0) {
      const mov = favoriteMovies[0];
      featuredHero = {
        title: mov.title,
        badge: 'Watchlist • Movie',
        rating: mov.rating,
        year: mov.year,
        metaExtra: mov.runtime,
        genres: mov.genres,
        description: mov.description,
        backdrop: mov.backdrop || mov.poster || '',
        onPlay: () => {
          if (onPlayMovie) onPlayMovie(mov);
          else if (onSelectMovie) onSelectMovie(mov);
        },
        onDetails: () => {
          if (onSelectMovie) onSelectMovie(mov);
        },
      };
    } else if (favoriteShows.length > 0) {
      const sh = favoriteShows[0];
      featuredHero = {
        title: sh.title,
        badge: 'Watchlist • TV Series',
        rating: sh.rating,
        year: sh.year,
        metaExtra: sh.network,
        genres: sh.genres,
        description: sh.description,
        backdrop: sh.backdrop || sh.poster || '',
        onPlay: () => {
          if (onSelectShow) onSelectShow(sh);
        },
        onDetails: () => {
          if (onSelectShow) onSelectShow(sh);
        },
      };
    } else if (recommendedMovies.length > 0) {
      const rec = recommendedMovies[0];
      featuredHero = {
        title: rec.title,
        badge: 'Featured For Your Watchlist',
        rating: rec.rating,
        year: rec.year,
        metaExtra: rec.runtime,
        genres: rec.genres,
        description: rec.description,
        backdrop: rec.backdrop || rec.poster || '',
        onPlay: () => {
          if (onPlayMovie) onPlayMovie(rec);
          else if (onSelectMovie) onSelectMovie(rec);
        },
        onDetails: () => {
          if (onSelectMovie) onSelectMovie(rec);
        },
      };
    }
  }

  const showContinueRail = (activeCategory === 'all' || activeCategory === 'continue') && continueWatching.length > 0;
  const showMoviesRail = (activeCategory === 'all' || activeCategory === 'movies') && favoriteMovies.length > 0;
  const showShowsRail = (activeCategory === 'all' || activeCategory === 'shows') && favoriteShows.length > 0;
  const showRecommendedRail = favoriteMovies.length === 0 && favoriteShows.length === 0 && activeCategory !== 'continue';

  return (
    <div className="tv-scroll-container tv-library-screen" role="main" aria-label="Library Screen">
      {/* Featured Hero Billboard */}
      {featuredHero && (
        <section className="tv-library-hero-billboard">
          <div
            className="tv-library-hero-bg"
            style={{
              backgroundImage: `url(${featuredHero.backdrop})`,
            }}
          >
            <div className="tv-library-hero-scrim" />
          </div>

          <div className="tv-library-hero-content">
            <span className="tv-library-hero-badge">
              <Bookmark size={15} />
              <span>{featuredHero.badge}</span>
            </span>

            <h1 className="tv-library-hero-title">{featuredHero.title}</h1>

            <div className="tv-library-hero-meta">
              {featuredHero.rating && (
                <span className="rating-pill">
                  {featuredHero.rating.replace('★', '').trim()}
                </span>
              )}
              {featuredHero.progress !== undefined && (
                <span className="progress-pill">
                  {featuredHero.progress}% Watched
                </span>
              )}
              {featuredHero.year && <span>{featuredHero.year}</span>}
              {featuredHero.metaExtra && (
                <>
                  <span className="tv-meta-dot" aria-hidden="true" />
                  <span>{featuredHero.metaExtra}</span>
                </>
              )}
              {featuredHero.genres && featuredHero.genres.length > 0 && (
                <>
                  <span className="tv-meta-dot" aria-hidden="true" />
                  <span>{featuredHero.genres.slice(0, 3).join(', ')}</span>
                </>
              )}
            </div>

            <p className="tv-library-hero-desc text-line-clamp-2">{featuredHero.description}</p>

            <div className="tv-library-hero-actions">
              <Focusable
                id="hero-lib-play"
                groupId="library-hero"
                indexInGroup={0}
                className="tv-hero-btn-focusable"
                scaleEffect={false}
                onSelect={featuredHero.onPlay}
              >
                {(isFocused) => (
                  <div className={`tv-hero-play-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>{featuredHero.progress !== undefined ? 'Resume Watching' : 'Watch Now'}</span>
                  </div>
                )}
              </Focusable>

              {featuredHero.onDetails && (
                <Focusable
                  id="hero-lib-details"
                  groupId="library-hero"
                  indexInGroup={1}
                  className="tv-hero-btn-focusable"
                  scaleEffect={false}
                  onSelect={featuredHero.onDetails}
                >
                  {(isFocused) => (
                    <div className={`tv-hero-info-btn ${isFocused ? 'focused' : ''}`}>
                      <Info size={20} />
                      <span>Details</span>
                    </div>
                  )}
                </Focusable>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Category Filter Pills Bar */}
      <div className="tv-library-categories-bar" role="tablist" aria-label="Library Categories">
        {CATEGORIES.map((cat, idx) => {
          const isActive = activeCategory === cat.id;
          return (
            <Focusable
              key={cat.id}
              id={`lib-cat-tab-${cat.id}`}
              groupId="library-categories"
              indexInGroup={idx}
              className="tv-library-category-focusable"
              scaleEffect={false}
              onSelect={() => setActiveCategory(cat.id)}
            >
              {(isFocused) => (
                <div
                  className={`tv-library-category-pill ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
                >
                  <span>{cat.label}</span>
                </div>
              )}
            </Focusable>
          );
        })}
      </div>

      {/* Rails Container */}
      <div className="tv-library-rails-container">
        {/* 1. Continue Watching Rail */}
        {showContinueRail && (
          <ContentRail
            id="rail-lib-continue"
            title="Continue Watching"
            subtitle="Resume your active media sessions"
            aspectRatio="16:9"
          >
            {continueWatching.map((item, idx) => (
              <MediaCard
                key={item.id}
                item={{
                  id: item.id,
                  title: item.title,
                  subtitle: item.subtitle,
                  backdropUrl: item.backdrop,
                  posterUrl: item.poster,
                  progress: item.progress,
                  duration: item.duration,
                  type: 'movie',
                }}
                groupId="rail-lib-continue"
                indexInGroup={idx}
                aspectRatio="16:9"
                onSelect={() => {
                  if (onSelectContinueItem) onSelectContinueItem(item);
                  else if (onSelectMedia) {
                    onSelectMedia({
                      id: item.id,
                      title: item.title,
                      subtitle: item.subtitle,
                      backdropUrl: item.backdrop || item.poster || '',
                      posterUrl: item.poster,
                      type: item.type === 'episode' ? 'show' : 'movie',
                      progress: item.progress,
                    });
                  }
                }}
              />
            ))}
          </ContentRail>
        )}

        {/* 2. Watchlist: Favorite Movies Rail */}
        {showMoviesRail && (
          <ContentRail
            id="rail-lib-movies"
            title="Watchlist: Movies"
            subtitle="Movies saved to your personal collection"
            aspectRatio="poster"
          >
            {favoriteMovies.map((m, idx) => (
              <MovieCard
                key={`fav-mov-${m.id}`}
                movie={m}
                groupId="rail-lib-movies"
                indexInGroup={idx}
                onSelect={(mov) => {
                  if (onSelectMovie) onSelectMovie(mov);
                  else if (onSelectMedia) onSelectMedia({
                    id: mov.id,
                    title: mov.title,
                    subtitle: `${mov.year} • ${mov.genres?.[0] || 'Movie'}`,
                    backdropUrl: mov.backdrop || mov.poster || '',
                    posterUrl: mov.poster,
                    type: 'movie',
                  });
                }}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 3. Watchlist: Favorite TV Shows Rail */}
        {showShowsRail && (
          <ContentRail
            id="rail-lib-shows"
            title="Watchlist: TV Shows"
            subtitle="Series and seasons saved to your personal watchlist"
            aspectRatio="poster"
          >
            {favoriteShows.map((s, idx) => (
              <ShowCard
                key={`fav-show-${s.id}`}
                show={s}
                groupId="rail-lib-shows"
                indexInGroup={idx}
                onSelect={(sh) => {
                  if (onSelectShow) onSelectShow(sh);
                  else if (onSelectMedia) onSelectMedia({
                    id: sh.id,
                    title: sh.title,
                    subtitle: `${sh.year} • ${sh.genres?.[0] || 'Series'}`,
                    backdropUrl: sh.backdrop || sh.poster || '',
                    posterUrl: sh.poster,
                    type: 'show',
                  });
                }}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 4. Fallback Recommendations for Empty Watchlist */}
        {showRecommendedRail && (
          <ContentRail
            id="rail-lib-watchlist-fallback"
            title="Recommended For Your Watchlist"
            subtitle="Discover popular titles you can save to your library"
            aspectRatio="poster"
            isLoading={isLoading}
          >
            {recommendedMovies.slice(0, 10).map((m, idx) => (
              <MovieCard
                key={`rec-lib-${m.id}`}
                movie={m}
                groupId="rail-lib-watchlist-fallback"
                indexInGroup={idx}
                onSelect={(mov) => {
                  if (onSelectMovie) onSelectMovie(mov);
                  else if (onSelectMedia) onSelectMedia({
                    id: mov.id,
                    title: mov.title,
                    subtitle: `${mov.year} • ${mov.genres?.[0] || 'Movie'}`,
                    backdropUrl: mov.backdrop || mov.poster || '',
                    posterUrl: mov.poster,
                    type: 'movie',
                  });
                }}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* Category specific empty states */}
        {activeCategory === 'continue' && continueWatching.length === 0 && (
          <div className="tv-library-empty-state">
            <h3>No Active Watch Sessions</h3>
            <p>Start watching any movie or episode, and your progress will automatically appear here so you can easily resume.</p>
          </div>
        )}

        {activeCategory === 'movies' && favoriteMovies.length === 0 && (
          <div className="tv-library-empty-state">
            <h3>No Movies in Watchlist</h3>
            <p>Explore movies and tap "Add to Watchlist" to organize your favorite films in one place.</p>
          </div>
        )}

        {activeCategory === 'shows' && favoriteShows.length === 0 && (
          <div className="tv-library-empty-state">
            <h3>No TV Shows in Watchlist</h3>
            <p>Explore TV series and tap "Add to Watchlist" to track upcoming episodes and seasons.</p>
          </div>
        )}
      </div>

      <Footer />

      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
