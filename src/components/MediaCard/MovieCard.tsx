import React from 'react';
import { Play } from 'lucide-react';
import { Movie } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './MovieCard.css';

interface MovieCardProps {
  movie: Movie;
  groupId: string;
  indexInGroup: number;
  onSelect: (movie: Movie) => void;
  aspectRatio?: 'poster' | '16:9';
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  groupId,
  indexInGroup,
  onSelect,
  aspectRatio = 'poster',
}) => {
  const imageUrl = aspectRatio === 'poster' ? movie.poster : movie.backdrop;

  return (
    <Focusable
      id={`movie-card-${movie.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className={`tv-movie-card-wrapper ratio-${aspectRatio}`}
      onSelect={() => onSelect(movie)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-movie-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-movie-poster-box">
            <img
              src={imageUrl}
              alt={movie.title}
              className="tv-movie-img"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const altImage = aspectRatio === 'poster' ? movie.backdrop : movie.poster;
                if (altImage && target.src !== altImage) {
                  target.src = altImage;
                  return;
                }
                const imdb = movie.imdbId || (movie.id.startsWith('tt') ? movie.id : null);
                if (imdb && !target.src.includes('metahub.space')) {
                  target.src = `https://images.metahub.space/poster/small/${imdb}/img`;
                } else {
                  target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%AC%20Cinema%3C%2Ftext%3E%3C%2Fsvg%3E';
                }
              }}
            />
            <div className="tv-movie-scrim" />

            {/* Rating Tag */}
            {movie.rating && (
              <span className="tv-movie-rating-badge">{movie.rating}</span>
            )}

            {/* Play Overlay */}
            {isFocused && (
              <div className="tv-card-play-overlay">
                <Play size={20} fill="currentColor" />
              </div>
            )}

            {/* Progress bar if continuing */}
            {typeof movie.progress === 'number' && movie.progress > 0 && (
              <div className="tv-card-progress-bar">
                <div
                  className="tv-card-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(5, movie.progress))}%` }}
                />
              </div>
            )}
          </div>

          <div className="tv-movie-meta">
            <h4 className="tv-movie-title text-truncate">{movie.title}</h4>
            <div className="tv-movie-subrow">
              <span className="tv-movie-year">{movie.year}</span>
              {movie.runtime && <span className="tv-movie-dot">•</span>}
              {movie.runtime && <span className="tv-movie-runtime">{movie.runtime}</span>}
              {movie.genres && movie.genres.length > 0 && (
                <>
                  <span className="tv-movie-dot">•</span>
                  <span className="tv-movie-genre text-truncate">{movie.genres[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
