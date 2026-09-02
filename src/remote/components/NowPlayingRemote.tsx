import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Tv,
  Music,
  Radio,
  Subtitles
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot, NowPlayingMedia } from '../../services/remote/remoteTypes';

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

  // Sync seek position when not actively dragging
  useEffect(() => {
    if (!isDragging && media) {
      setSeekPos(media.positionSeconds || 0);
    }
  }, [media?.positionSeconds, isDragging]);

  const handlePlayPause = () => {
    remoteClient.sendCommand('PLAY_PAUSE');
  };

  const handleSeekRelative = (delta: number) => {
    remoteClient.sendCommand('SEEK_RELATIVE', { delta });
  };

  const handlePrev = () => {
    remoteClient.sendCommand('PREV_TRACK');
  };

  const handleNext = () => {
    remoteClient.sendCommand('NEXT_TRACK');
  };

  const handleSubtitles = () => {
    remoteClient.sendCommand('SUBTITLES_TOGGLE');
  };

  // Scrubber Dragging
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
      remoteClient.sendCommand('SEEK', { position: seekPos });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    handleSeekStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleSeekMove(e.touches[0].clientX);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handleSeekStart(e.clientX);
    const onMove = (me: MouseEvent) => handleSeekMove(me.clientX);
    const onUp = () => {
      handleSeekEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const duration = media?.durationSeconds || 0;
  const progressPercent = duration > 0 ? (seekPos / duration) * 100 : 0;
  const volumeLevel = Math.round((tvState?.volume ?? 1) * 100);
  const isMuted = tvState?.isMuted || volumeLevel === 0;

  if (!media) {
    return (
      <div className="now-playing-container">
        <div className="now-playing-idle">
          <div className="idle-icon-wrap">
            <Radio size={40} />
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#fff' }}>Nothing Playing</h3>
          <p style={{ margin: 0, fontSize: '13px', maxWidth: '240px', color: 'rgba(255,255,255,0.6)' }}>
            Select a movie, TV show, or music track on Kaira to control playback here in real time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="now-playing-container">
      <div className="now-playing-card">
        {/* Artwork / Poster */}
        <div className="media-artwork-wrap">
          {media.artwork ? (
            <img src={media.artwork} alt={media.title} className="media-artwork-img" />
          ) : (
            <div className="media-artwork-placeholder">
              {media.type === 'track' || media.type === 'audio' ? <Music size={56} /> : <Tv size={56} />}
            </div>
          )}
        </div>

        {/* Title & Subtitle */}
        <h2 className="media-title-text" title={media.title}>
          {media.title}
        </h2>
        <div className="media-subtitle-text" title={media.subtitle || media.artist}>
          {media.subtitle || media.artist || 'Kaira TV Stream'}
        </div>

        {/* Progress Scrubber */}
        <div className="media-scrubber-container">
          <div
            ref={progressBarRef}
            className="scrubber-track-wrap"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleSeekEnd}
            onMouseDown={handleMouseDown}
          >
            <div className="scrubber-track">
              <div className="scrubber-fill" style={{ width: `${progressPercent}%` }} />
              <div className="scrubber-thumb" style={{ left: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="scrubber-times">
            <span>{formatSeconds(seekPos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* Main Transport Controls */}
        <div className="media-transport-row">
          <button
            type="button"
            className="transport-btn"
            onClick={handlePrev}
            title="Previous Track"
            aria-label="Previous Track"
          >
            <SkipBack size={22} />
          </button>

          <button
            type="button"
            className="transport-btn"
            onClick={() => handleSeekRelative(-10)}
            title="Rewind 10 Seconds"
            aria-label="Rewind 10s"
          >
            <RotateCcw size={20} />
          </button>

          <button
            type="button"
            className="transport-btn play-pause-btn"
            onClick={handlePlayPause}
            title={media.isPlaying ? 'Pause' : 'Play'}
            aria-label={media.isPlaying ? 'Pause' : 'Play'}
          >
            {media.isPlaying ? <Pause size={30} fill="#fff" /> : <Play size={30} fill="#fff" style={{ marginLeft: 3 }} />}
          </button>

          <button
            type="button"
            className="transport-btn"
            onClick={() => handleSeekRelative(10)}
            title="Forward 10 Seconds"
            aria-label="Forward 10s"
          >
            <RotateCw size={20} />
          </button>

          <button
            type="button"
            className="transport-btn"
            onClick={handleNext}
            title="Next Track"
            aria-label="Next Track"
          >
            <SkipForward size={22} />
          </button>
        </div>
      </div>

      {/* Secondary Controls: Subtitles & Volume Slider */}
      <div className="remote-volume-strip">
        <button
          type="button"
          className="volume-btn"
          onClick={handleSubtitles}
          title="Toggle Subtitles"
        >
          <Subtitles size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, margin: '0 12px' }}>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volumeLevel}
            onChange={(e) => {
              const val = Number(e.target.value) / 100;
              remoteClient.sendCommand('SET_VOLUME', { volume: val });
            }}
            className="ambient-range-slider"
            aria-label="Volume Slider"
          />
          <span className="volume-value-badge" style={{ minWidth: 32 }}>
            {isMuted ? '0%' : `${volumeLevel}%`}
          </span>
        </div>

        <button
          type="button"
          className="volume-btn"
          onClick={() => remoteClient.sendCommand('MUTE_TOGGLE')}
          title="Toggle Mute"
          style={isMuted ? { color: '#f28b82' } : undefined}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
};
