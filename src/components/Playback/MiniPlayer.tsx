import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Disc, Maximize2, X } from 'lucide-react';
import { playbackService } from '../../services/playback/PlaybackService';
import { PlaybackState } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './MiniPlayer.css';

interface MiniPlayerProps {
  onOpenFullPlayer: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onOpenFullPlayer }) => {
  const [playback, setPlayback] = useState<PlaybackState>(playbackService.getState());

  useEffect(() => {
    const unsub = playbackService.subscribe(setPlayback);
    return unsub;
  }, []);

  const src = playback.currentSource;
  if (!src || src.type !== 'audio' || playback.status === 'idle') {
    return null;
  }

  const isPlaying = playback.status === 'playing';
  const progressPct = playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0;

  return (
    <div className="tv-mini-player-bar" role="region" aria-label="Audio Player">
      {/* Top micro progress line */}
      <div className="tv-mini-progress-track">
        <div className="tv-mini-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="tv-mini-player-content">
        {/* Track details & Click to open full player */}
        <Focusable
          id="mini-player-expand"
          groupId="mini-player"
          indexInGroup={0}
          scaleEffect={false}
          className="tv-mini-track-info-focusable"
          onSelect={onOpenFullPlayer}
        >
          {(isFocused) => (
            <div className={`tv-mini-track-info ${isFocused ? 'focused' : ''}`}>
              <div className="tv-mini-art-box">
                <img
                  src={src.artwork}
                  alt={src.title}
                  className={`tv-mini-art ${isPlaying ? 'spinning' : ''}`}
                />
              </div>
              <div className="tv-mini-text-col">
                <span className="tv-mini-title text-truncate">{src.title}</span>
                <span className="tv-mini-artist text-truncate">{src.subtitle}</span>
              </div>
              <Maximize2 size={16} className="tv-mini-expand-icon" />
            </div>
          )}
        </Focusable>

        {/* Playback Action Buttons */}
        <div className="tv-mini-controls">
          <Focusable
            id="mini-prev"
            groupId="mini-player"
            indexInGroup={1}
            scaleEffect={false}
            className="tv-mini-btn-focusable"
            onSelect={() => playbackService.previous()}
          >
            {(isFocused) => (
              <div className={`tv-mini-btn ${isFocused ? 'focused' : ''}`}>
                <SkipBack size={18} />
              </div>
            )}
          </Focusable>

          <Focusable
            id="mini-playpause"
            groupId="mini-player"
            indexInGroup={2}
            scaleEffect={false}
            className="tv-mini-btn-focusable"
            onSelect={() => playbackService.togglePlayPause()}
          >
            {(isFocused) => (
              <div className={`tv-mini-btn playpause ${isFocused ? 'focused' : ''}`}>
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </div>
            )}
          </Focusable>

          <Focusable
            id="mini-next"
            groupId="mini-player"
            indexInGroup={3}
            scaleEffect={false}
            className="tv-mini-btn-focusable"
            onSelect={() => playbackService.next()}
          >
            {(isFocused) => (
              <div className={`tv-mini-btn ${isFocused ? 'focused' : ''}`}>
                <SkipForward size={18} />
              </div>
            )}
          </Focusable>

          <Focusable
            id="mini-close"
            groupId="mini-player"
            indexInGroup={4}
            scaleEffect={false}
            className="tv-mini-btn-focusable"
            onSelect={() => playbackService.stop()}
          >
            {(isFocused) => (
              <div className={`tv-mini-btn danger ${isFocused ? 'focused' : ''}`} title="Stop Playback">
                <X size={18} />
              </div>
            )}
          </Focusable>
        </div>
      </div>
    </div>
  );
};
