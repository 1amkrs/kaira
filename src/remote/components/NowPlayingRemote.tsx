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

  // Volume Slider Handlers
  const handleVolumeSlide = (clientX: number) => {
    if (!volumeSliderRef.current) return;
    const rect = volumeSliderRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    remoteClient.triggerHaptic(8);
    remoteClient.sendCommand('SET_VOLUME', { level: ratio });
  };

  const duration = media?.durationSeconds || 0;
  const progressPercent = duration > 0 ? (seekPos / duration) * 100 : 0;
  const remainingSeconds = Math.max(0, duration - seekPos);
  const volumeLevel = Math.round((tvState?.volume ?? 1) * 100);
  const isMuted = tvState?.isMuted || volumeLevel === 0;

  if (!media) {
    return (
      <div className="now-playing-apple-container">
        <div className="now-playing-idle-card">
          <div className="idle-artwork-placeholder">
            <Tv size={48} strokeWidth={1.5} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>Not Playing</span>
            <span style={{ fontSize: '13px', color: 'rgba(235, 235, 245, 0.5)', maxWidth: '220px' }}>
              Play any video, show, or music track on Kaira TV to control it here.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="now-playing-apple-container">
      {/* Apple Album Artwork Card */}
      <div className="apple-artwork-container">
        {media.artwork && (
          <div
            className="apple-artwork-ambient-blur"
            style={{ backgroundImage: `url(${media.artwork})` }}
          />
        )}
        {media.artwork ? (
          <img
            src={media.artwork}
            alt={media.title}
            className="apple-artwork-img"
          />
        ) : (
          <div className="idle-artwork-placeholder" style={{ width: '100%', height: '100%' }}>
            <Disc3 size={56} className={media.isPlaying ? 'spin-icon' : ''} />
          </div>
        )}
      </div>

      {/* Media Metadata */}
      <div className="apple-media-meta">
        <h2 className="apple-media-title">{media.title || 'Untitled Media'}</h2>
        <span className="apple-media-artist">
          {media.artist || media.subtitle || media.album || 'Kaira TV'}
        </span>
      </div>

      {/* Apple Liquid Scrubber */}
      <div className="apple-scrubber-wrap">
        <div
          ref={progressBarRef}
          className={`apple-scrubber-track ${isDragging ? 'dragging' : ''}`}
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
            className="apple-scrubber-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="apple-scrubber-knob"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        <div className="apple-scrubber-timestamps">
          <span>{formatSeconds(seekPos)}</span>
          <span>{duration > 0 ? `-${formatSeconds(remainingSeconds)}` : '--:--'}</span>
        </div>
      </div>

      {/* Apple Transport Row */}
      <div className="apple-transport-row">
        {/* Rewind 15s */}
        <button
          type="button"
          className="apple-transport-btn"
          onClick={() => handleSeekRelative(-15)}
          title="Rewind 15s"
          aria-label="Rewind 15 Seconds"
        >
          <RotateCcw size={24} />
        </button>

        {/* Previous Track */}
        <button
          type="button"
          className="apple-transport-btn"
          onClick={handlePrev}
          title="Previous Track"
          aria-label="Previous Track"
        >
          <SkipBack size={26} fill="currentColor" />
        </button>

        {/* Play / Pause Main Circle */}
        <button
          type="button"
          className="apple-play-pause-circle"
          onClick={handlePlayPause}
          title={media.isPlaying ? 'Pause' : 'Play'}
          aria-label={media.isPlaying ? 'Pause' : 'Play'}
        >
          {media.isPlaying ? (
            <Pause size={28} fill="currentColor" />
          ) : (
            <Play size={28} fill="currentColor" style={{ marginLeft: '3px' }} />
          )}
        </button>

        {/* Next Track */}
        <button
          type="button"
          className="apple-transport-btn"
          onClick={handleNext}
          title="Next Track"
          aria-label="Next Track"
        >
          <SkipForward size={26} fill="currentColor" />
        </button>

        {/* Fast Forward 15s */}
        <button
          type="button"
          className="apple-transport-btn"
          onClick={() => handleSeekRelative(15)}
          title="Fast Forward 15s"
          aria-label="Fast Forward 15 Seconds"
        >
          <RotateCw size={24} />
        </button>
      </div>

      {/* Apple Volume Slider Row */}
      <div className="apple-volume-slider-row">
        <button
          type="button"
          style={{ background: 'transparent', border: 'none', color: 'rgba(235,235,245,0.6)', cursor: 'pointer', padding: 0 }}
          onClick={() => remoteClient.sendCommand('MUTE_TOGGLE')}
          aria-label="Mute"
        >
          {isMuted ? <VolumeX size={18} color="#ff453a" /> : <Volume size={18} />}
        </button>

        <div
          ref={volumeSliderRef}
          className="apple-volume-slider-track"
          onClick={(e) => handleVolumeSlide(e.clientX)}
          onTouchMove={(e) => handleVolumeSlide(e.touches[0].clientX)}
        >
          <div
            className="apple-volume-slider-fill"
            style={{ width: `${isMuted ? 0 : volumeLevel}%` }}
          />
        </div>

        <button
          type="button"
          style={{ background: 'transparent', border: 'none', color: 'rgba(235,235,245,0.6)', cursor: 'pointer', padding: 0 }}
          onClick={() => remoteClient.sendCommand('SET_VOLUME', { level: 1 })}
          aria-label="Max Volume"
        >
          <Volume2 size={18} />
        </button>
      </div>
    </div>
  );
};
