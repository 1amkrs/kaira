import React from 'react';
import { Play } from 'lucide-react';
import { MusicVideo } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './MusicVideoCard.css';

interface MusicVideoCardProps {
  video: MusicVideo;
  groupId: string;
  indexInGroup: number;
  onSelect: (video: MusicVideo) => void;
}

export const MusicVideoCard: React.FC<MusicVideoCardProps> = ({
  video,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  return (
    <Focusable
      id={`mv-card-${video.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-mv-card-wrapper"
      onSelect={() => onSelect(video)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-mv-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-mv-thumbnail-box">
            <img
              src={video.thumbnail}
              alt={video.title}
              className="tv-mv-img"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22225%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2252%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%AC%20Music%20Video%3C%2Ftext%3E%3C%2Fsvg%3E';
              }}
            />
            {video.duration && (
              <span className="tv-mv-duration-badge">{video.duration}</span>
            )}
            {isFocused && (
              <div className="tv-mv-play-overlay">
                <Play size={24} fill="currentColor" />
              </div>
            )}
          </div>

          <div className="tv-mv-meta">
            <h4 className="tv-mv-title text-truncate">{video.title}</h4>
            <div className="tv-mv-subrow text-truncate">
              <span className="tv-mv-artist">{video.artist}</span>
              {video.viewsCount && <span className="tv-mv-dot">•</span>}
              {video.viewsCount && <span className="tv-mv-views">{video.viewsCount}</span>}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
