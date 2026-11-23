import React, { useState, useEffect } from 'react';
import { Movie, Show } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { NavigationTab } from '../../types';

interface FlicxCatalogScreenProps {
  tab: NavigationTab;
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
}

export const FlicxCatalogScreen: React.FC<FlicxCatalogScreenProps> = ({
  tab,
  onSelectMovie,
  onSelectShow,
}) => {
  const [items, setItems] = useState<(Movie | Show)[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'movies' | 'shows'>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([mediaProvider.getMovies(), mediaProvider.getShows()]).then(
      ([movies, shows]) => {
        if (cancelled) return;
        let pool: (Movie | Show)[] = [];

        switch (tab) {
          case 'movies':
            pool = movies;
            break;
          case 'shows':
            pool = shows;
            break;
          case 'anime':
            pool = [...movies, ...shows].filter(
              (i) => i.genres?.some((g: string) => g.toLowerCase().includes('anim'))
            );
            break;
          case '4k':
            pool = movies.filter((_, idx) => idx % 2 === 0);
            break;
          case 'awards':
            pool = [...movies, ...shows].filter((i) => (Number(i.rating) || 0) >= 8.0);
            break;
          case 'collections':
          case 'genres':
          case 'discover':
          default:
            pool = [...movies, ...shows];
            break;
        }

        setItems(pool);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const titles: Record<string, string> = {
    home: 'Home',
    discover: 'Discover Media',
    movies: 'Feature Films',
    shows: 'Television Series',
    anime: 'Anime Series & Films',
    collections: 'Featured Franchises & Collections',
    genres: 'Browse by Genre',
    '4k': '4K Ultra High-Definition Releases',
    awards: 'Award-Winning & Critical Acclaim',
    library: 'My Library',
  };

  const filteredItems = items.filter((item) => {
    const isM = !('seasonsCount' in item);
    if (filterType === 'movies' && !isM) return false;
    if (filterType === 'shows' && isM) return false;
    if (selectedGenre !== 'all' && !item.genres?.includes(selectedGenre)) return false;
    return true;
  });

  const allGenres = Array.from(new Set(items.flatMap((i) => i.genres || []))).slice(0, 10);

  return (
    <div style={{ maxWidth: 'var(--content-max-width)', margin: '0 auto', padding: '36px 40px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', fontWeight: 800, color: '#ffffff' }}>
          {titles[tab] || 'Catalog'}
        </h1>
        <p style={{ color: 'var(--color-fg-muted)', marginTop: 6, fontSize: '0.96rem' }}>
          Explore curated cinematic titles with direct playback and high-bandwidth downloads.
        </p>
      </div>

      {/* Filter Pills */}
      {tab === 'discover' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {['all', 'movies', 'shows'].map((t) => (
            <button
              key={t}
              className={`flicx-season-tab ${filterType === t ? 'active' : ''}`}
              onClick={() => setFilterType(t as any)}
              style={{ textTransform: 'capitalize' }}
            >
              {t}
            </button>
          ))}
          {allGenres.map((g) => (
            <button
              key={g}
              className={`flicx-season-tab ${selectedGenre === g ? 'active' : ''}`}
              onClick={() => setSelectedGenre(selectedGenre === g ? 'all' : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Responsive Grid */}
      <div className="flicx-grid">
        {filteredItems.map((item) => {
          const isMovie = !('seasonsCount' in item);
          return (
            <div
              key={item.id}
              className="flicx-card"
              onClick={() => (isMovie ? onSelectMovie(item as Movie) : onSelectShow(item as Show))}
            >
              <div className="flicx-card-poster">
                <img src={item.poster} alt={item.title} loading="lazy" />
              </div>
              <span className="flicx-card-title">{item.title}</span>
              <span className="flicx-card-meta">
                {item.rating && <span style={{ color: '#f5c518', fontWeight: 600 }}>★ {item.rating}</span>}
                {item.year && <span>{item.year}</span>}
                <span className="fx-tag" style={{ marginLeft: 'auto', fontSize: '0.68rem' }}>
                  {isMovie ? 'Movie' : 'Series'}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
