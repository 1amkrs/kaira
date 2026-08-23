import React, { useState, useEffect } from 'react';
import { Play, Info, Sparkles, Film } from 'lucide-react';
import { Movie } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { MovieCard } from '../../components/MediaCard/MovieCard';
import { Focusable } from '../../components/Focusable/Focusable';
import './MoviesScreen.css';

interface MoviesScreenProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
}

type MovieCategoryTab = 'all' | 'hollywood' | 'malayalam' | 'hindi' | 'tamil' | 'scifi';

const CATEGORIES: { id: MovieCategoryTab; label: string }[] = [
  { id: 'all', label: 'All Movies' },
  { id: 'hollywood', label: 'Hollywood Blockbusters' },
  { id: 'malayalam', label: 'Malayalam (Mollywood)' },
  { id: 'hindi', label: 'Hindi (Bollywood)' },
  { id: 'tamil', label: 'Tamil (Kollywood)' },
  { id: 'scifi', label: 'Sci-Fi & Action' },
];

export const MoviesScreen: React.FC<MoviesScreenProps> = ({ onSelectMovie, onPlayMovie }) => {
  const [activeCategory, setActiveCategory] = useState<MovieCategoryTab>('all');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [hollywoodMovies, setHollywoodMovies] = useState<Movie[]>([]);
  const [malayalamMovies, setMalayalamMovies] = useState<Movie[]>([]);
  const [hindiMovies, setHindiMovies] = useState<Movie[]>([]);
  const [tamilMovies, setTamilMovies] = useState<Movie[]>([]);
  const [favorites, setFavorites] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allMovies, hw, mal, hin, tam, favs] = await Promise.all([
        mediaProvider.getMovies(),
        mediaProvider.getHollywoodMovies(),
        mediaProvider.getMalayalamMovies(),
        mediaProvider.getHindiMovies(),
        mediaProvider.getTamilMovies(),
        mediaProvider.getFavorites(),
      ]);
      setMovies(allMovies);
      setHollywoodMovies(hw);
      setMalayalamMovies(mal);
      setHindiMovies(hin);
      setTamilMovies(tam);
      setFavorites(favs.movies);
    } catch (e) {
      setError('Unable to load movies catalog');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const featured =
    activeCategory === 'hollywood' && hollywoodMovies.length > 0
      ? hollywoodMovies[0]
      : activeCategory === 'malayalam' && malayalamMovies.length > 0
      ? malayalamMovies[0]
      : activeCategory === 'hindi' && hindiMovies.length > 0
      ? hindiMovies[0]
      : activeCategory === 'tamil' && tamilMovies.length > 0
      ? tamilMovies[0]
      : hollywoodMovies.length > 0
      ? hollywoodMovies[0]
      : movies.length > 0
      ? movies[0]
      : null;

  const actionSciFi = movies.filter(
    (m) => m.genres.includes('Sci-Fi') || m.genres.includes('Action')
  );

  return (
    <div className="tv-movies-screen tv-scroll-container">
      {/* Featured Movie Billboard (Latest Release) */}
      {featured && (
        <section className="tv-movie-hero-billboard">
          <div
            className="tv-movie-hero-bg"
            style={{
              backgroundImage: `url(${featured.backdrop || featured.poster})`,
            }}
          >
            <div className="tv-movie-hero-scrim" />
          </div>

          <div className="tv-movie-hero-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="tv-movie-hero-badge">
                {featured.language ? `${featured.language} Cinema` : 'Blockbuster Release'}
              </span>
              {featured.rating && (
                <span className="rating-pill">
                  {featured.rating.includes('★') ? featured.rating : `${featured.rating} ★`}
                </span>
              )}
            </div>
            <h1 className="tv-movie-hero-title">{featured.title}</h1>
            <div className="tv-movie-hero-meta">
              <span>{featured.year}</span>
              <span className="tv-meta-dot" aria-hidden="true" />
              <span>{featured.runtime}</span>
              <span className="tv-meta-dot" aria-hidden="true" />
              <span>{featured.genres.join(', ')}</span>
            </div>
            <p className="tv-movie-hero-desc text-line-clamp-2">{featured.description}</p>

            <div className="tv-movie-hero-actions">
              <Focusable
                id="hero-movie-play"
                groupId="movies-hero"
                indexInGroup={0}
                className="tv-hero-btn-focusable"
                onSelect={() => onPlayMovie(featured)}
              >
                {(isFocused) => (
                  <div className={`tv-hero-play-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>Watch Now</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="hero-movie-details"
                groupId="movies-hero"
                indexInGroup={1}
                className="tv-hero-btn-focusable"
                onSelect={() => onSelectMovie(featured)}
              >
                {(isFocused) => (
                  <div className={`tv-hero-info-btn ${isFocused ? 'focused' : ''}`}>
                    <Info size={20} />
                    <span>Details</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </section>
      )}

      {/* Category Filter Pills Bar */}
      <div className="tv-movies-categories-bar" role="tablist" aria-label="Movie Categories">
        {CATEGORIES.map((cat, idx) => {
          const isActive = activeCategory === cat.id;
          return (
            <Focusable
              key={cat.id}
              id={`movie-cat-tab-${cat.id}`}
              groupId="movies-categories"
              indexInGroup={idx}
              className="tv-movie-category-focusable"
              onSelect={() => setActiveCategory(cat.id)}
            >
              {(isFocused) => (
                <div
                  className={`tv-movie-category-pill ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
                >
                  <span>{cat.label}</span>
                </div>
              )}
            </Focusable>
          );
        })}
      </div>

      {/* Rails Container */}
      <div className="tv-movies-rails-container">
        {favorites.length > 0 && activeCategory === 'all' && (
          <ContentRail id="movies-favorites" title="My Favorite Movies" aspectRatio="poster">
            {favorites.map((m, idx) => (
              <MovieCard
                key={`fav-${m.id}`}
                movie={m}
                groupId="movies-favorites"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 1. Hollywood & Global Hits */}
        {(activeCategory === 'all' || activeCategory === 'hollywood') && (
          <ContentRail
            id="movies-hollywood"
            title="🎬 Hollywood & Global Blockbusters"
            subtitle="Critically acclaimed 4K theatrical hits & box office champions"
            isLoading={isLoading}
            aspectRatio="poster"
          >
            {hollywoodMovies.map((m, idx) => (
              <MovieCard
                key={`hw-${m.id}`}
                movie={m}
                groupId="movies-hollywood"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 2. Malayalam Cinema Rail */}
        {(activeCategory === 'all' || activeCategory === 'malayalam') && (
          <ContentRail
            id="movies-malayalam"
            title="🌟 Malayalam Cinema & Hits (Mollywood)"
            subtitle="Acclaimed thrillers, dramas, and survival masterworks"
            isLoading={isLoading}
            error={error}
            onRetry={loadData}
            aspectRatio="poster"
          >
            {malayalamMovies.map((m, idx) => (
              <MovieCard
                key={`mal-${m.id}`}
                movie={m}
                groupId="movies-malayalam"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 3. Hindi Cinema Rail */}
        {(activeCategory === 'all' || activeCategory === 'hindi') && (
          <ContentRail
            id="movies-hindi"
            title="🔥 Bollywood & Hindi Blockbusters"
            subtitle="High-octane action, drama, and heartwarming cinema"
            isLoading={isLoading}
            aspectRatio="poster"
          >
            {hindiMovies.map((m, idx) => (
              <MovieCard
                key={`hin-${m.id}`}
                movie={m}
                groupId="movies-hindi"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 4. Tamil Cinema Rail */}
        {(activeCategory === 'all' || activeCategory === 'tamil') && (
          <ContentRail
            id="movies-tamil"
            title="⚡ Tamil Cinema & Action (Kollywood)"
            subtitle="Mass blockbusters, gripping neo-noirs, and period epics"
            isLoading={isLoading}
            aspectRatio="poster"
          >
            {tamilMovies.map((m, idx) => (
              <MovieCard
                key={`tam-${m.id}`}
                movie={m}
                groupId="movies-tamil"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        {/* 5. Sci-Fi & Action Universe */}
        {(activeCategory === 'all' || activeCategory === 'scifi') && (
          <ContentRail
            id="movies-scifi"
            title="🌌 Sci-Fi & Action Universe"
            subtitle="Futuristic spectacles, dystopian epics, and superhero adventures"
            isLoading={isLoading}
            aspectRatio="16:9"
          >
            {actionSciFi.map((m, idx) => (
              <MovieCard
                key={`scifi-${m.id}`}
                movie={m}
                groupId="movies-scifi"
                indexInGroup={idx}
                onSelect={onSelectMovie}
                aspectRatio="16:9"
              />
            ))}
          </ContentRail>
        )}
      </div>
      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
