import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Movie, Show } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';

interface FlicxSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
}

export const FlicxSearchModal: React.FC<FlicxSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectMovie,
  onSelectShow,
}) => {
  const [query, setQuery] = useState<string>('');
  const [allMedia, setAllMedia] = useState<(Movie | Show)[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([mediaProvider.getMovies(), mediaProvider.getShows()]).then(
        ([movies, shows]) => {
          setAllMedia([...movies, ...shows]);
        }
      );
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const results = query.trim()
    ? allMedia.filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.genres?.some((g: string) => g.toLowerCase().includes(query.toLowerCase())) ||
        (item.cast && item.cast.some((c: string) => c.toLowerCase().includes(query.toLowerCase())))
      )
    : [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(28px)',
        zIndex: 5000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '60px 24px 40px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={22}
            style={{
              position: 'absolute',
              left: 20,
              color: 'var(--color-fg-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search films, series, genres, actors..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              height: 56,
              padding: '0 52px 0 56px',
              borderRadius: 'var(--pill-radius)',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--color-line-strong)',
              color: '#ffffff',
              fontSize: '1.1rem',
              outline: 'none',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                right: 20,
                color: 'var(--color-fg-muted)',
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Results Count */}
        {query && (
          <div style={{ fontSize: '0.9rem', color: 'var(--color-fg-muted)' }}>
            Found {results.length} titles for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Results Grid */}
        <div className="flicx-grid">
          {results.map((item) => {
            const isMovie = !('seasonsCount' in item);
            return (
              <div
                key={item.id}
                className="flicx-card"
                onClick={() => {
                  onClose();
                  if (isMovie) onSelectMovie(item as Movie);
                  else onSelectShow(item as Show);
                }}
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
    </div>
  );
};
