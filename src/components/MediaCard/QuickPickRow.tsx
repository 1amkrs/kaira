import React from 'react';
import { Play, Volume2 } from 'lucide-react';
import { Track } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './QuickPickRow.css';

interface QuickPickRowProps {
  track: Track;
  groupId: string;
  indexInGroup: number;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onSelect: (track: Track) => void;
}

export const QuickPickRow: React.FC<QuickPickRowProps> = ({
  track,
  groupId,
  indexInGroup,
  isCurrent = false,
  isPlaying = false,
  onSelect,
}) => {
  return (
    <Focusable
      id={`quick-pick-${track.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-quick-pick-focusable"
      onSelect={() => onSelect(track)}
    >
      {(isFocused) => (
        <div
          className={`tv-quick-pick-row ${isFocused ? 'focused' : ''} ${isCurrent ? 'current' : ''}`}
        >
          <div className="tv-quick-pick-art-container">
            <img
              src={track.artwork}
              alt={track.title}
              className="tv-quick-pick-art"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22100%22%20height%3D%22100%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23222%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2255%25%22%20fill%3D%22%23888%22%20font-size%3D%2224%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%B5%3C%2Ftext%3E%3C%2Fsvg%3E';
              }}
            />
            {isPlaying ? (
              <div className="tv-quick-pick-playing-overlay">
                <Volume2 size={16} className="tv-playing-pulse" />
              </div>
            ) : isFocused ? (
              <div className="tv-quick-pick-play-overlay">
                <Play size={16} fill="currentColor" />
              </div>
            ) : null}
          </div>

          <div className="tv-quick-pick-info">
            <div className="tv-quick-pick-title-row">
              {track.isExplicit && <span className="tv-explicit-badge">E</span>}
              <span className="tv-quick-pick-title text-truncate">{track.title}</span>
            </div>
            <div className="tv-quick-pick-subrow text-truncate">
              <span className="tv-quick-pick-artist">{track.artist}</span>
              {track.playsCount && <span className="tv-quick-pick-dot">•</span>}
              {track.playsCount && <span className="tv-quick-pick-plays">{track.playsCount}</span>}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
