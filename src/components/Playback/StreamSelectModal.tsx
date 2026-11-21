import React, { useEffect, useMemo } from 'react';
import { Play, X, HardDrive, Volume2, Tv, Globe, Film } from 'lucide-react';
import { AddonStream } from '../../types/addons';
import { getStreamPlayerBadge, sortStreamsForDisplay } from '../../services/addons/stremioProtocol';
import { Focusable } from '../Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import './StreamSelectModal.css';

interface StreamSelectModalProps {
  mediaTitle: string;
  mediaSubtitle?: string;
  streams: AddonStream[];
  onSelectStream: (stream: AddonStream) => void;
  onClose: () => void;
}

export const StreamSelectModal: React.FC<StreamSelectModalProps> = ({
  mediaTitle,
  mediaSubtitle,
  streams,
  onSelectStream,
  onClose,
}) => {
  useEffect(() => {
    spatialNav.pushScope('stream-select-modal');
    return () => {
      spatialNav.popScope('stream-select-modal');
    };
  }, []);

  const orderedStreams = useMemo(() => sortStreamsForDisplay(streams), [streams]);
  const hasDirectStream = useMemo(
    () => orderedStreams.some((s) => s.streamType === 'direct'),
    [orderedStreams]
  );

  return (
    <div className="tv-stream-modal-backdrop" role="dialog" aria-modal="true" aria-label="Select Video Stream">
      <div className="tv-stream-modal-card">
        {/* Modal Header */}
        <div className="tv-stream-modal-header">
          <div className="tv-stream-title-col">
            <span className="tv-stream-badge-top">
              <Film size={14} /> Available Video Streams ({orderedStreams.length})
            </span>
            <h2 className="tv-stream-media-title text-truncate">{mediaTitle}</h2>
            {mediaSubtitle && <span className="tv-stream-media-sub">{mediaSubtitle}</span>}
          </div>

          <Focusable
            id="stream-modal-close"
            groupId="stream-modal-nav"
            indexInGroup={0}
            className="tv-modal-close-focusable"
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-modal-close-btn ${isFocused ? 'focused' : ''}`}>
                <X size={20} />
                <span>Cancel (B)</span>
              </div>
            )}
          </Focusable>
        </div>

        {/* Streams List */}
        <div className="tv-streams-list-container tv-scroll-container" role="list">
          {orderedStreams.map((stream, idx) => {
            const qualityClass =
              stream.quality === '4K'
                ? 'quality-4k'
                : stream.quality === '1080p'
                ? 'quality-1080p'
                : 'quality-720p';
            const playerBadge = getStreamPlayerBadge(stream.streamType);

            return (
              <Focusable
                key={`stream-${idx}`}
                id={`stream-item-${idx}`}
                groupId="stream-selection-list"
                indexInGroup={idx}
                autoFocus={idx === 0}
                className="tv-stream-item-focusable"
                onSelect={() => onSelectStream(stream)}
                scaleEffect={true}
              >
                {(isFocused) => (
                  <div className={`tv-stream-row ${isFocused ? 'focused' : ''}`}>
                    <div className="tv-stream-left-col">
                      <div className={`tv-stream-quality-tag ${qualityClass}`}>
                        {stream.quality || '1080p'}
                      </div>
                      <div className="tv-stream-info">
                        <span className="tv-stream-name text-truncate">{stream.name}</span>
                        <span className="tv-stream-desc text-truncate">{stream.description || stream.title}</span>
                      </div>
                    </div>

                    <div className="tv-stream-right-col">
                      {stream.fileSize && (
                        <div className="tv-stream-meta-pill">
                          <HardDrive size={13} />
                          <span>{stream.fileSize}</span>
                        </div>
                      )}
                      {stream.audio && (
                        <div className="tv-stream-meta-pill">
                          <Volume2 size={13} />
                          <span>{stream.audio}</span>
                        </div>
                      )}
                      <div className={`tv-stream-player-badge tone-${playerBadge.tone}`}>
                        {playerBadge.tone === 'native' ? <Tv size={13} /> : <Globe size={13} />}
                        <span>{playerBadge.label}</span>
                      </div>
                      <div className="tv-stream-play-action">
                        <Play size={18} fill="currentColor" />
                      </div>
                    </div>
                  </div>
                )}
              </Focusable>
            );
          })}

          {!hasDirectStream && (
            <div className="tv-stream-direct-tip">
              Direct HTTP / HLS streams from Stremio addons play natively in Kaira Player. Add a configured Stremio stream addon in Settings → Addons &amp; Streams.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
