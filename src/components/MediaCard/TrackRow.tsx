import React from 'react';
import { Play, Volume2, Pause } from 'lucide-react';
import { Track } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './TrackRow.css';

interface TrackRowProps {
  track: Track;
  groupId: string;
  indexInGroup: number;
  isPlaying?: boolean;
  isCurrent?: boolean;
  onSelect: (track: Track) => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  groupId,
  indexInGroup,
  isPlaying = false,
  isCurrent = false,
  onSelect,
}) => {
  const numStr = track.trackNumber < 10 ? `0${track.trackNumber}` : `${track.trackNumber}`;

  return (
    <Focusable
      id={`track-row-${track.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-track-row-focusable"
      onSelect={() => onSelect(track)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-track-row ${isFocused ? 'focused' : ''} ${isCurrent ? 'current' : ''}`}>
          <div className="tv-track-number-col">
            {isCurrent ? (
              isPlaying ? (
                <Volume2 size={18} className="tv-track-playing-icon" />
              ) : (
                <Pause size={18} style={{ color: 'var(--google-blue)' }} />
              )
            ) : isFocused ? (
              <Play size={18} fill="currentColor" />
            ) : (
              <span className="tv-track-num">{numStr}</span>
            )}
          </div>

          <div className="tv-track-info-col">
            <span className="tv-track-name text-truncate">{track.title}</span>
            <span className="tv-track-artist text-truncate">{track.artist}</span>
          </div>

          <div className="tv-track-duration-col">
            <span>{track.duration}</span>
          </div>
        </div>
      )}
    </Focusable>
  );
};
