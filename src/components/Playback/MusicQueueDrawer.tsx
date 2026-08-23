import React from 'react';
import { Play, Trash2, X, Music, Disc } from 'lucide-react';
import { PlaybackSource } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './MusicQueueDrawer.css';

interface MusicQueueDrawerProps {
  queue: PlaybackSource[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (source: PlaybackSource, index: number) => void;
  onRemoveTrack: (index: number) => void;
}

export const MusicQueueDrawer: React.FC<MusicQueueDrawerProps> = ({
  queue,
  currentIndex,
  isOpen,
  onClose,
  onSelectTrack,
  onRemoveTrack,
}) => {
  if (!isOpen) return null;

  return (
    <div className="tv-queue-drawer-backdrop" role="dialog" aria-label="Up Next Song Queue">
      <div className="tv-queue-drawer-panel tv-scroll-container">
        {/* Header */}
        <div className="tv-queue-header">
          <div className="tv-queue-title-row">
            <Music size={20} className="tv-queue-icon" />
            <h3 className="tv-queue-title">Playing Queue ({queue.length})</h3>
          </div>

          <Focusable
            id="queue-close-btn"
            groupId="queue-nav"
            indexInGroup={0}
            className="tv-queue-btn-focusable"
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-queue-close-pill ${isFocused ? 'focused' : ''}`}>
                <X size={18} />
                <span>Close (B)</span>
              </div>
            )}
          </Focusable>
        </div>

        {/* Queue List */}
        <div className="tv-queue-items-list" role="list">
          {queue.length === 0 ? (
            <div className="tv-queue-empty">
              <Disc size={36} />
              <span>Queue is empty</span>
            </div>
          ) : (
            queue.map((item, idx) => {
              const isCurrent = idx === currentIndex;
              return (
                <div key={`${item.id}-${idx}`} className={`tv-queue-item-row ${isCurrent ? 'current' : ''}`}>
                  <Focusable
                    id={`queue-item-${idx}`}
                    groupId="queue-list"
                    indexInGroup={idx * 2}
                    className="tv-queue-item-focusable"
                    onSelect={() => onSelectTrack(item, idx)}
                  >
                    {(isFocused) => (
                      <div className={`tv-queue-item-card ${isFocused ? 'focused' : ''}`}>
                        <span className="tv-queue-index">{idx + 1}</span>
                        {item.artwork && (
                          <img src={item.artwork} alt={item.title} className="tv-queue-thumb" />
                        )}
                        <div className="tv-queue-meta">
                          <span className="tv-queue-song-title text-truncate">{item.title}</span>
                          <span className="tv-queue-song-artist text-truncate">{item.artist || item.subtitle}</span>
                        </div>
                        {isCurrent && <span className="tv-queue-badge">Now Playing</span>}
                      </div>
                    )}
                  </Focusable>

                  {!isCurrent && (
                    <Focusable
                      id={`queue-del-${idx}`}
                      groupId="queue-list"
                      indexInGroup={idx * 2 + 1}
                      className="tv-queue-del-focusable"
                      onSelect={() => onRemoveTrack(idx)}
                    >
                      {(isFocused) => (
                        <div className={`tv-queue-del-btn ${isFocused ? 'focused' : ''}`}>
                          <Trash2 size={16} />
                        </div>
                      )}
                    </Focusable>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
