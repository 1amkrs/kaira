import React from 'react';
import { Play } from 'lucide-react';
import { MediaItem } from '../../types';
import { Focusable } from '../Focusable/Focusable';
import './MediaCard.css';

interface MediaCardProps {
  item: MediaItem;
  groupId: string;
  indexInGroup: number;
  onSelect: (item: MediaItem) => void;
  showDetails?: boolean;
  aspectRatio?: '16:9' | 'hero' | '16:10';
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  groupId,
  indexInGroup,
  onSelect,
  showDetails = true,
  aspectRatio = '16:9',
}) => {
  return (
    <Focusable
      id={`media-card-${item.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className={`tv-media-card-wrapper aspect-${aspectRatio}`}
      onSelect={() => onSelect(item)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-media-card ${isFocused ? 'focused' : ''}`}>
          {/* Card Artwork */}
          <div className="tv-card-poster-container">
            <img
              src={item.backdropUrl || item.posterUrl}
              alt={item.title}
              className="tv-card-image"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (item.posterUrl && target.src !== item.posterUrl && !target.dataset.triedPoster) {
                  target.dataset.triedPoster = '1';
                  target.src = item.posterUrl;
                  return;
                }
                if (!target.dataset.fallbackApplied) {
                  target.dataset.fallbackApplied = '1';
                  target.src =
                    'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22225%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23191d24%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2252%25%22%20fill%3D%22%23a8c7fa%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%3EKaira%20Media%3C%2Ftext%3E%3C%2Fsvg%3E';
                }
              }}
            />
            
            {/* Subtle Gradient Scrim */}
            <div className="tv-card-scrim" />

            {/* Provider / Source Tag */}
            {item.source && (
              <span className="tv-card-source-tag">
                {item.source}
              </span>
            )}

            {/* Play overlay icon when focused */}
            {isFocused && (
              <div className="tv-card-focus-play-btn" aria-hidden="true">
                <Play size={20} fill="currentColor" />
              </div>
            )}

            {/* Progress Bar for Continue Watching */}
            {typeof item.progress === 'number' && (
              <div className="tv-card-progress-track">
                <div
                  className="tv-card-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(5, item.progress))}%` }}
                />
              </div>
            )}
          </div>

          {/* Metadata Section */}
          {showDetails && (
            <div className="tv-card-metadata">
              <h4 className="tv-card-title text-truncate">{item.title}</h4>
              
              <div className="tv-card-subtitle-row">
                {item.subtitle ? (
                  <span className="tv-card-subtitle text-truncate">{item.subtitle}</span>
                ) : (
                  <>
                    {item.year && <span className="tv-card-meta-tag">{item.year}</span>}
                    {item.duration && <span className="tv-card-meta-tag">• {item.duration}</span>}
                    {item.rating && <span className="tv-card-badge">{item.rating}</span>}
                    {item.genre && item.genre.length > 0 && (
                      <span className="tv-card-genre text-truncate">• {item.genre[0]}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Focusable>
  );
};
