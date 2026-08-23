import React from 'react';
import { Play } from 'lucide-react';
import { Episode } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './EpisodeCard.css';

interface EpisodeCardProps {
  episode: Episode;
  groupId: string;
  indexInGroup: number;
  onSelect: (episode: Episode) => void;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = ({
  episode,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  const epCode = `S${episode.seasonNumber < 10 ? '0' : ''}${episode.seasonNumber}E${episode.number < 10 ? '0' : ''}${episode.number}`;

  return (
    <Focusable
      id={`ep-card-${episode.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-episode-card-wrapper"
      onSelect={() => onSelect(episode)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-episode-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-episode-thumb-box">
            <img
              src={episode.thumbnail}
              alt={episode.title}
              className="tv-episode-img"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const cleanShow = episode.showId ? episode.showId.replace(/^show-/, '') : null;
                if (cleanShow && cleanShow.startsWith('tt') && !target.src.includes('metahub.space')) {
                  target.src = `https://images.metahub.space/background/medium/${cleanShow}/img`;
                } else {
                  target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22225%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%3E%E2%96%B6%20Episode%3C%2Ftext%3E%3C%2Fsvg%3E';
                }
              }}
            />
            <div className="tv-episode-scrim" />

            <span className="tv-episode-code-badge">{epCode}</span>
            <span className="tv-episode-runtime-tag">{episode.runtime}</span>

            {isFocused && (
              <div className="tv-card-play-overlay">
                <Play size={20} fill="currentColor" />
              </div>
            )}

            {typeof episode.progress === 'number' && episode.progress > 0 && (
              <div className="tv-card-progress-bar">
                <div
                  className="tv-card-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(5, episode.progress))}%` }}
                />
              </div>
            )}
          </div>

          <div className="tv-episode-meta">
            <div className="tv-episode-header-row">
              <span className="tv-episode-code">{epCode}</span>
              <span className="tv-episode-title text-truncate">{episode.title}</span>
            </div>
            <p className="tv-episode-desc text-line-clamp-2">{episode.description}</p>
          </div>
        </div>
      )}
    </Focusable>
  );
};
