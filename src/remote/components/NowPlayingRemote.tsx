import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume,
  Volume2,
  VolumeX,
  Disc3,
  Tv
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot } from '../../services/remote/remoteTypes';

interface NowPlayingRemoteProps {
  tvState: TVStateSnapshot | null;
}

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const NowPlayingRemote: React.FC<NowPlayingRemoteProps> = ({ tvState }) => {
  const media = tvState?.nowPlaying;
  const [seekPos, setSeekPos] = useState<number>(media?.positionSeconds || 0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging && media) {
      setSeekPos(media.positionSeconds || 0);
    }
  }, [media?.positionSeconds, isDragging]);

  const handlePlayPause = () => {
    remoteClient.triggerHaptic(20);
    remoteClient.sendCommand('PLAY_PAUSE');
  };

  const handleSeekRelative = (delta: number) => {
    remoteClient.triggerHaptic(12);
    remoteClient.sendCommand('SEEK_RELATIVE', { delta });
  };

  const handlePrev = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('PREV_TRACK');
  };

  const handleNext = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('NEXT_TRACK');
  };

  // Scrubber Drag Handlers
  const handleSeekStart = (clientX: number) => {
    if (!progressBarRef.current || !media || !media.durationSeconds) return;
    setIsDragging(true);
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = ratio * media.durationSeconds;
    setSeekPos(target);
  };

  const handleSeekMove = (clientX: number) => {
    if (!isDragging || !progressBarRef.current || !media || !media.durationSeconds) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = ratio * media.durationSeconds;
    setSeekPos(target);
  };

  const handleSeekEnd = () => {
    if (isDragging && media) {
      setIsDragging(false);
      remoteClient.triggerHaptic(10);
      remoteClient.sendCommand('SEEK', { position: seekPos });
    }
  };

  const duration = media?.durationSeconds || 0;
  const progressPercent = duration > 0 ? (seekPos / duration) * 100 : 0;
  const remainingSeconds = Math.max(0, duration - seekPos);
  const volumeLevel = Math.round((tvState?.volume ?? 1) * 100);
  const isMuted = tvState?.isMuted || volumeLevel === 0;

  if (!media) {
    return (
      <div className="ref-player-view">
        <div className="ref-artwork-card">
          <Tv size={48} strokeWidth={1.5} color="rgba(255,255,255,0.4)" />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 'auto' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 4px 0', color: '#1c1d21' }}>Not Playing</h3>
          <p style={{ fontSize: '13px', color: '#8e8e93', margin: 0, maxWidth: '240px' }}>
            Play a movie, show, or song on Kaira TV to control media here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ref-player-view">
      {/* Artwork Poster */}
      <div className="ref-artwork-card">
        {media.artwork ? (
          <img
            src={media.artwork}
            alt={media.title}
            className="ref-artwork-img"
          />
        ) : (
          <Disc3 size={56} color="rgba(255,255,255,0.4)" className={media.isPlaying ? 'spin-icon' : ''} />
        )}
      </div>

      {/* Media Metadata */}
      <div style={{ width: '100%', padding: '0 8px', textAlign: 'center' }}>
        <h2 className="ref-player-title">{media.title || 'Untitled Media'}</h2>
        <p className="ref-player-artist">
          {media.artist || media.subtitle || media.album || 'Kaira TV'}
        </p>
      </div>

      {/* Scrubber Progress Bar */}
      <div style={{ width: '100%', padding: '0 4px' }}>
        <div
          ref={progressBarRef}
          className="ref-scrubber-track"
          onTouchStart={(e) => handleSeekStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleSeekMove(e.touches[0].clientX)}
          onTouchEnd={handleSeekEnd}
          onMouseDown={(e) => {
            handleSeekStart(e.clientX);
            const onMove = (me: MouseEvent) => handleSeekMove(me.clientX);
            const onUp = () => {
              handleSeekEnd();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <div
            className="ref-scrubber-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="ref-timestamps">
          <span>{formatSeconds(seekPos)}</span>
          <span>{duration > 0 ? `-${formatSeconds(remainingSeconds)}` : '--:--'}</span>
        </div>
      </div>

      {/* Transport Controls */}
      <div className="ref-player-transport">
        <button
          type="button"
          className="ref-circle-btn"
          onClick={() => handleSeekRelative(-15)}
          title="Rewind 15s"
          aria-label="Rewind 15 Seconds"
        >
          <RotateCcw size={20} />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handlePrev}
          title="Previous"
          aria-label="Previous Track"
        >
          <SkipBack size={20} fill="currentColor" />
        </button>

        <button
          type="button"
          className="ref-play-btn"
          onClick={handlePlayPause}
          title={media.isPlaying ? 'Pause' : 'Play'}
          aria-label={media.isPlaying ? 'Pause' : 'Play'}
        >
          {media.isPlaying ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />
          )}
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleNext}
          title="Next"
          aria-label="Next Track"
        >
          <SkipForward size={20} fill="currentColor" />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={() => handleSeekRelative(15)}
          title="Fast Forward 15s"
          aria-label="Fast Forward 15 Seconds"
        >
          <RotateCw size={20} />
        </button>
      </div>
    </div>
  );
};
