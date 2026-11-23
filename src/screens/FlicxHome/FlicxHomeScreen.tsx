import React, { useState, useEffect } from 'react';
import { Play, Star } from 'lucide-react';
import { Movie, Show } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import './FlicxHomeScreen.css';

interface FlicxHomeScreenProps {
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
  onPlay: (item: Movie | Show) => void;
}

export const FlicxHomeScreen: React.FC<FlicxHomeScreenProps> = ({
  onSelectMovie,
  onSelectShow,
  onPlay,
}) => {
  const [heroMovie, setHeroMovie] = useState<Movie | null>(null);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [popularShows, setPopularShows] = useState<Show[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);

  useEffect(() => {
    // Load movies and shows from provider
    mediaProvider.getMovies().then((movies) => {
      if (movies.length > 0) {
        setHeroMovie(movies[0]);
        setTrendingMovies(movies);
      }
    });

    mediaProvider.getShows().then((shows) => {
      setPopularShows(shows);
    });

    // Load progress
    try {
      const raw = localStorage.getItem('flicx:player:progress');
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Object.entries(parsed).map(([key, val]: any) => ({
          key,
          ...val,
        }));
        setContinueWatching(list.slice(0, 8));
      }
    } catch {
      // Ignored
    }
  }, []);

  return (
    <div className="flicx-home-wrap">
      {/* ─── Hero Feature (Exact Kaira Signature Hero) ─── */}
      {heroMovie && (
        <section className="flicx-home-hero" aria-label="Featured Title">
          <img
            src={heroMovie.backdrop || heroMovie.poster}
            alt={heroMovie.title}
            className="flicx-home-hero-bg"
          />
          <div className="flicx-home-hero-gradient" />

          <div className="flicx-home-hero-content">
            <div className="fx-tag fx-tag-brand">Featured Tonight</div>
            <h1 className="flicx-title-name">{heroMovie.title}</h1>

            <div className="flicx-title-meta-row">
              {heroMovie.rating && (
                <span className="rating-badge">
                  <Star size={16} fill="currentColor" />
                  <span>{heroMovie.rating} / 10</span>
                </span>
              )}
              {heroMovie.year && <span>{heroMovie.year}</span>}
              {heroMovie.runtime && <span>{heroMovie.runtime}</span>}
              <span className="fx-tag">4K UHD</span>
              {heroMovie.genres && <span>{heroMovie.genres.slice(0, 3).join(' · ')}</span>}
            </div>

            <p style={{ maxWidth: 640, color: 'var(--color-fg-muted)', fontSize: '0.96rem', lineHeight: 1.6 }}>
              {heroMovie.description?.slice(0, 180)}...
            </p>

            <div className="flicx-action-row">
              <button
                className="capsule-btn capsule-btn-play capsule-btn-lit"
                onClick={() => onPlay(heroMovie)}
              >
                <Play size={18} fill="currentColor" />
                <span>Play Now</span>
              </button>

              <button
                className="capsule-btn capsule-btn-text"
                onClick={() => onSelectMovie(heroMovie)}
              >
                <span>Details &amp; Downloads</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ─── Content Rows ─── */}
      <div className="flicx-home-body">
        {/* Continue Watching Row */}
        {continueWatching.length > 0 && (
          <section className="flicx-row-section">
            <div className="flicx-row-header">
              <h2 className="flicx-row-title">Continue Watching</h2>
            </div>
            <div className="flicx-row-scroll">
              {continueWatching.map((item, idx) => (
                <div
                  key={`cw-${idx}`}
                  className="flicx-row-card flicx-card"
                  style={{ width: 220 }}
                  onClick={() => {
                    const match = trendingMovies.find((m) => m.title === item.title);
                    if (match) onSelectMovie(match);
                  }}
                >
                  <div className="flicx-card-poster" style={{ aspectRatio: '16/9' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Play size={28} color="#ffffff" />
                    </div>
                    {/* Progress bar */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: 4,
                        width: `${item.duration > 0 ? (item.time / item.duration) * 100 : 30}%`,
                        background: 'var(--brand)',
                      }}
                    />
                  </div>
                  <span className="flicx-card-title">{item.title}</span>
                  <span className="flicx-card-meta">
                    {Math.floor(item.time / 60)}m watched
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trending Movies Row */}
        <section className="flicx-row-section">
          <div className="flicx-row-header">
            <h2 className="flicx-row-title">Trending Movies</h2>
          </div>
          <div className="flicx-row-scroll">
            {trendingMovies.map((movie) => (
              <div
                key={movie.id}
                className="flicx-row-card flicx-card"
                onClick={() => onSelectMovie(movie)}
              >
                <div className="flicx-card-poster">
                  <img src={movie.poster} alt={movie.title} loading="lazy" />
                </div>
                <span className="flicx-card-title">{movie.title}</span>
                <span className="flicx-card-meta">
                  {movie.rating && (
                    <span style={{ color: '#f5c518', fontWeight: 600 }}>★ {movie.rating}</span>
                  )}
                  {movie.year && <span>{movie.year}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Popular TV Shows Row */}
        <section className="flicx-row-section">
          <div className="flicx-row-header">
            <h2 className="flicx-row-title">Popular TV Series</h2>
          </div>
          <div className="flicx-row-scroll">
            {popularShows.map((show) => (
              <div
                key={show.id}
                className="flicx-row-card flicx-card"
                onClick={() => onSelectShow(show)}
              >
                <div className="flicx-card-poster">
                  <img src={show.poster} alt={show.title} loading="lazy" />
                </div>
                <span className="flicx-card-title">{show.title}</span>
                <span className="flicx-card-meta">
                  {show.rating && (
                    <span style={{ color: '#f5c518', fontWeight: 600 }}>★ {show.rating}</span>
                  )}
                  {show.year && <span>{show.year}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
