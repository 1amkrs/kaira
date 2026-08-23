import React from 'react';
import { Tv } from 'lucide-react';
import { Show } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './ShowCard.css';

interface ShowCardProps {
  show: Show;
  groupId: string;
  indexInGroup: number;
  onSelect: (show: Show) => void;
  aspectRatio?: 'poster' | '16:9';
}

export const ShowCard: React.FC<ShowCardProps> = ({
  show,
  groupId,
  indexInGroup,
  onSelect,
  aspectRatio = 'poster',
}) => {
  const imageUrl = aspectRatio === 'poster' ? show.poster : show.backdrop;

  return (
    <Focusable
      id={`show-card-${show.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className={`tv-show-card-wrapper ratio-${aspectRatio}`}
      onSelect={() => onSelect(show)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-show-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-show-poster-box">
            <img
              src={imageUrl}
              alt={show.title}
              className="tv-show-img"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const imdb = show.imdbId || (show.id.startsWith('tt') ? show.id : null);
                if (imdb && !target.src.includes('metahub.space')) {
                  target.src = aspectRatio === 'poster'
                    ? `https://images.metahub.space/poster/medium/${imdb}/img`
                    : `https://images.metahub.space/background/medium/${imdb}/img`;
                } else {
                  target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%3E%F0%9F%93%BA%20Series%3C%2Ftext%3E%3C%2Fsvg%3E';
                }
              }}
            />
            <div className="tv-show-scrim" />

            {/* Rating Tag */}
            {show.rating && (
              <span className="tv-show-rating-badge">{show.rating}</span>
            )}

            {/* Network / Type badge */}
            {show.network && (
              <span className="tv-show-network-tag">{show.network}</span>
            )}
          </div>

          <div className="tv-show-meta">
            <h4 className="tv-show-title text-truncate">{show.title}</h4>
            <div className="tv-show-subrow">
              <span className="tv-show-year">{show.year}</span>
              {show.genres && show.genres.length > 0 && (
                <>
                  <span className="tv-show-dot">•</span>
                  <span className="tv-show-genre text-truncate">{show.genres[0]}</span>
                </>
              )}
              {show.seasonsCount && (
                <>
                  <span className="tv-show-dot">•</span>
                  <span className="tv-show-seasons">{show.seasonsCount} Seasons</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
