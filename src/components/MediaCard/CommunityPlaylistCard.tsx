import React from 'react';
import { Play } from 'lucide-react';
import { CommunityPlaylist } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './CommunityPlaylistCard.css';

interface CommunityPlaylistCardProps {
  playlist: CommunityPlaylist;
  groupId: string;
  indexInGroup: number;
  onSelect: (playlist: CommunityPlaylist) => void;
}

export const CommunityPlaylistCard: React.FC<CommunityPlaylistCardProps> = ({
  playlist,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  const arts = playlist.collageArtworks && playlist.collageArtworks.length >= 4
    ? playlist.collageArtworks.slice(0, 4)
    : [
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=300&auto=format&fit=crop&q=80',
      ];

  return (
    <Focusable
      id={`comm-pl-${playlist.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-comm-pl-wrapper"
      onSelect={() => onSelect(playlist)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-comm-pl-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-comm-pl-art-box">
            <div className="tv-comm-pl-grid">
              {arts.map((art, idx) => (
                <img
                  key={idx}
                  src={art}
                  alt={`Artwork ${idx + 1}`}
                  className="tv-comm-pl-quad-img"
                  loading="lazy"
                />
              ))}
            </div>

            {playlist.creatorAvatar && (
              <div className="tv-comm-pl-avatar-badge">
                <img
                  src={playlist.creatorAvatar}
                  alt={playlist.creator}
                  className="tv-comm-pl-avatar-img"
                  loading="lazy"
                />
              </div>
            )}

            {isFocused && (
              <div className="tv-comm-pl-play-overlay">
                <Play size={22} fill="currentColor" />
              </div>
            )}
          </div>

          <div className="tv-comm-pl-meta">
            <h4 className="tv-comm-pl-title text-truncate-2">{playlist.title}</h4>
            <div className="tv-comm-pl-subrow text-truncate">
              <span className="tv-comm-pl-creator">{playlist.creator}</span>
              {playlist.viewsCount && <span className="tv-comm-pl-dot">•</span>}
              {playlist.viewsCount && <span className="tv-comm-pl-views">{playlist.viewsCount}</span>}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
