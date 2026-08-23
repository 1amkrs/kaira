import React from 'react';
import { Disc, Play } from 'lucide-react';
import { Album } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './AlbumCard.css';

interface AlbumCardProps {
  album: Album;
  groupId: string;
  indexInGroup: number;
  onSelect: (album: Album) => void;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  return (
    <Focusable
      id={`album-card-${album.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-album-card-wrapper"
      onSelect={() => onSelect(album)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-album-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-album-artwork-box">
            <img
              src={album.artwork}
              alt={album.title}
              className="tv-album-img"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1e%22%2F%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%22150%22%20r%3D%2260%22%20fill%3D%22none%22%20stroke%3D%22%238ab4f8%22%20stroke-width%3D%224%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2252%25%22%20fill%3D%22%238ab4f8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%B5%20Music%3C%2Ftext%3E%3C%2Fsvg%3E';
              }}
            />
            <div className="tv-album-scrim" />

            {/* Vinyl record shadow groove effect */}
            <div className="tv-album-vinyl-accent" />

            {isFocused && (
              <div className="tv-card-play-overlay">
                <Play size={20} fill="currentColor" />
              </div>
            )}
          </div>

          <div className="tv-album-meta">
            <h4 className="tv-album-title text-truncate">{album.title}</h4>
            <div className="tv-album-subrow">
              <span className="tv-album-artist text-truncate">{album.artist}</span>
              {album.year && <span className="tv-album-dot">•</span>}
              {album.year && <span className="tv-album-year">{album.year}</span>}
            </div>
          </div>
        </div>
      )}
    </Focusable>
  );
};
