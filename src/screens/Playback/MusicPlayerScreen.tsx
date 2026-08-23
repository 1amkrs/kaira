import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ArrowLeft, Mic2, Sparkles, Music, ListMusic, Waves, X, Square } from 'lucide-react';
import { playbackService } from '../../services/playback/PlaybackService';
import { musicPluginService } from '../../services/music/MusicPluginService';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { PlaybackState, SyncedLyricLine, PlaybackSource } from '../../types/media';
import { Focusable } from '../../components/Focusable/Focusable';
import { AudioVisualizer } from '../../components/Playback/AudioVisualizer';
import { MusicQueueDrawer } from '../../components/Playback/MusicQueueDrawer';
import './MusicPlayerScreen.css';

interface MusicPlayerScreenProps {
  onClose: () => void;
}

export const MusicPlayerScreen: React.FC<MusicPlayerScreenProps> = ({ onClose }) => {
  const [playback, setPlayback] = useState<PlaybackState>(playbackService.getState());
  const [lyrics, setLyrics] = useState<SyncedLyricLine[]>([]);
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = playbackService.subscribe(setPlayback);
    return unsub;
  }, []);

  const src = playback.currentSource;

  // Load lyrics whenever current track changes
  useEffect(() => {
    if (src) {
      if (src.lyrics && src.lyrics.length > 0) {
        setLyrics(src.lyrics);
      } else {
        const trackTitle = src.title;
        const trackArtist = src.artist || src.subtitle?.split('—')[0]?.trim() || '';
        musicPluginService.fetchSyncedLyrics(trackTitle, trackArtist).then((res) => {
          setLyrics(res.synced);
        });
      }
    }
  }, [src?.id, src?.title, src?.artist]);

  // Track active lyric line based on currentTime with smooth lead
  useEffect(() => {
    if (lyrics.length === 0) {
      setActiveLyricIndex(-1);
      return;
    }

    const curTime = playback.currentTime;
    let activeIdx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (curTime >= lyrics[i].time - 0.15) {
        activeIdx = i;
      } else {
        break;
      }
    }

    setActiveLyricIndex(activeIdx);

    // Auto-scroll active lyric into view
    if (activeIdx >= 0 && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.children[activeIdx] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [playback.currentTime, lyrics]);

  const lastScrubTimeRef = useRef<number>(0);

  const handleTimelineScrub = (percent: number, immediate: boolean = false) => {
    if (playback.duration <= 0) return;
    const now = performance.now();
    if (!immediate && now - lastScrubTimeRef.current < 100) {
      return;
    }
    lastScrubTimeRef.current = now;
    const target = Math.max(0, Math.min(playback.duration, percent * playback.duration));
    playbackService.seek(target);
  };

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    setIsScrubbing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleTimelineScrub(pos, true);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos);
    if (isScrubbing) {
      handleTimelineScrub(pos, false);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setIsScrubbing(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleTimelineScrub(pos, true);
  };

  const handleScrubberPointerLeave = () => {
    if (!isScrubbing) {
      setHoverPosition(null);
    }
  };

  const lastToggleRef = useRef<number>(0);

  // Keyboard & Controller Shortcuts for Music Player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentFocused = spatialNav.getFocusedId();
      if (e.key === 'ArrowLeft') {
        if (currentFocused === 'music-player-timeline' || currentFocused === 'music-ctrl-playpause') {
          e.preventDefault();
          playbackService.seekRelative(-10);
          return;
        }
      }
      if (e.key === 'ArrowRight') {
        if (currentFocused === 'music-player-timeline' || currentFocused === 'music-ctrl-playpause') {
          e.preventDefault();
          playbackService.seekRelative(10);
          return;
        }
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K': {
          e.preventDefault();
          const now = Date.now();
          if (now - lastToggleRef.current < 260) return;
          lastToggleRef.current = now;
          playbackService.togglePlayPause();
          break;
        }
        case 'j':
        case 'J':
          e.preventDefault();
          playbackService.seekRelative(-10);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          playbackService.seekRelative(10);
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          onClose();
          break;
      }
    };

    const handleBumperLeft = () => playbackService.previous();
    const handleBumperRight = () => playbackService.next();
    const handleTriggerLeft = () => playbackService.seekRelative(-15);
    const handleTriggerRight = () => playbackService.seekRelative(15);
    const handleButtonX = () => playbackService.togglePlayPause();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tv:controller-bumper-left', handleBumperLeft);
    window.addEventListener('tv:controller-bumper-right', handleBumperRight);
    window.addEventListener('tv:controller-trigger-left', handleTriggerLeft);
    window.addEventListener('tv:controller-trigger-right', handleTriggerRight);
    window.addEventListener('tv:controller-button-x', handleButtonX);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tv:controller-bumper-left', handleBumperLeft);
      window.removeEventListener('tv:controller-bumper-right', handleBumperRight);
      window.removeEventListener('tv:controller-trigger-left', handleTriggerLeft);
      window.removeEventListener('tv:controller-trigger-right', handleTriggerRight);
      window.removeEventListener('tv:controller-button-x', handleButtonX);
    };
  }, [onClose]);

  if (!src) return null;

  const isPlaying = playback.status === 'playing';
  const progressPct = playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0;

  const formatTime = (sec: number) => {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="tv-music-player-container">
      {/* Dynamic Ambient Glow Backdrop */}
      <div
        className="tv-music-backdrop-glow"
        style={{ backgroundImage: `url(${src.artwork})` }}
      />
      <div className="tv-music-scrim-overlay" />

      {/* Top Bar Header */}
      <div className="tv-music-player-header">
        <Focusable
          id="music-player-back"
          groupId="music-player-top"
          indexInGroup={0}
          scaleEffect={false}
          className="tv-back-focusable"
          onSelect={onClose}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={20} />
              <span>Back (B)</span>
            </div>
          )}
        </Focusable>

        <div className="tv-music-header-center">
          <span className="tv-music-now-playing-tag">
            <Music size={14} /> Now Playing • Audius / Lossless Stream
          </span>
        </div>
        <div className="tv-music-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Focusable
            id="music-queue-toggle"
            groupId="music-player-top"
            indexInGroup={1}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => setIsQueueOpen(!isQueueOpen)}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill ${isQueueOpen ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                <ListMusic size={16} />
                <span>Queue ({playback.queue.length})</span>
              </div>
            )}
          </Focusable>

          <Focusable
            id="music-lyrics-toggle"
            groupId="music-player-top"
            indexInGroup={2}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => setShowLyrics(!showLyrics)}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill ${showLyrics ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                {showLyrics ? <Waves size={16} /> : <Mic2 size={16} />}
                <span>{showLyrics ? 'Aurora Spectrum' : 'Live Lyrics'}</span>
              </div>
            )}
          </Focusable>

          <Focusable
            id="music-stop-close-btn"
            groupId="music-player-top"
            indexInGroup={3}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => {
              playbackService.stop();
              onClose();
            }}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill danger ${isFocused ? 'focused' : ''}`}>
                <X size={16} />
                <span>Stop & Exit</span>
              </div>
            )}
          </Focusable>
        </div>
      </div>

      {/* Main Music Showcase & Lyrics / Visualizer Split View */}
      <div className="tv-music-showcase-split with-lyrics">
        {/* Left Column: Album Artwork & Playback Controls */}
        <div className="tv-music-left-pane">
          <div className={`tv-music-art-large ${isPlaying ? 'playing' : ''}`}>
            <img src={src.artwork} alt={src.title} className="tv-music-cover-img" />
            <div className="tv-music-vinyl-groove" />
          </div>

          <div className="tv-music-meta-block">
            <h1 className="tv-music-title text-truncate">{src.title}</h1>
            <h2 className="tv-music-artist text-truncate">{src.subtitle || src.artist}</h2>
          </div>

          {/* Interactive Timeline Scrubber */}
          <div className="tv-music-timeline-box">
            <Focusable
              id="music-player-timeline"
              groupId="music-player-timeline-grp"
              indexInGroup={0}
              className="tv-music-scrubber-focusable"
              onSelect={() => playbackService.togglePlayPause()}
            >
              {(isFocused) => (
                <div
                  className={`tv-music-progress-bar-container ${isFocused ? 'focused' : ''} ${isScrubbing ? 'scrubbing' : ''}`}
                  onPointerDown={handleScrubberPointerDown}
                  onPointerMove={handleScrubberPointerMove}
                  onPointerUp={handleScrubberPointerUp}
                  onPointerLeave={handleScrubberPointerLeave}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    handleTimelineScrub(pos);
                  }}
                >
                  <div className="tv-music-progress-track">
                    <div className="tv-music-progress-fill" style={{ width: `${progressPct}%` }} />
                    <div className="tv-music-scrubber-head" style={{ left: `${progressPct}%` }} />
                    {(isFocused || isScrubbing || hoverPosition !== null) && (
                      <div
                        className="tv-music-scrubber-tooltip"
                        style={{ left: `${hoverPosition !== null ? hoverPosition * 100 : progressPct}%` }}
                      >
                        {formatTime(
                          (hoverPosition !== null ? hoverPosition : (progressPct / 100)) * (playback.duration || 240)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Focusable>

            <div className="tv-music-time-row">
              <span className="tv-music-time">{formatTime(playback.currentTime)}</span>
              <span className="tv-music-time">{formatTime(playback.duration || 240)}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="tv-music-controls-row">
            <Focusable
              id="music-ctrl-prev"
              groupId="music-player-ctrls"
              indexInGroup={0}
              className="tv-music-ctrl-focusable"
              onSelect={() => playbackService.previous()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn ${isFocused ? 'focused' : ''}`}>
                  <SkipBack size={26} />
                </div>
              )}
            </Focusable>

            <Focusable
              id="music-ctrl-play"
              groupId="music-player-ctrls"
              indexInGroup={1}
              autoFocus={true}
              className="tv-music-ctrl-focusable"
              onSelect={() => playbackService.togglePlayPause()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn primary ${isFocused ? 'focused' : ''}`}>
                  {isPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
                </div>
              )}
            </Focusable>

            <Focusable
              id="music-ctrl-next"
              groupId="music-player-ctrls"
              indexInGroup={2}
              className="tv-music-ctrl-focusable"
              onSelect={() => playbackService.next()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn ${isFocused ? 'focused' : ''}`}>
                  <SkipForward size={26} />
                </div>
              )}
            </Focusable>
          </div>
        </div>

        {/* Right Column: Live Synced Lyrics OR Fluid Audio Visualizer */}
        <div className="tv-music-lyrics-pane">
          {showLyrics && lyrics.length > 0 ? (
            <>
              <div className="tv-lyrics-header-badge">
                <Sparkles size={14} />
                <span>LRCLIB Synced Karaoke</span>
              </div>

              <div className="tv-music-lyrics-scroller" ref={lyricsContainerRef}>
                {lyrics.map((line, idx) => (
                  <div
                    key={`${line.time}-${idx}`}
                    className={`tv-lyric-line ${idx === activeLyricIndex ? 'active' : ''} ${
                      idx < activeLyricIndex ? 'passed' : ''
                    }`}
                    onClick={() => playbackService.seek(line.time)}
                    style={{ cursor: 'pointer' }}
                    title="Jump to line"
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <AudioVisualizer isPlaying={isPlaying} />
          )}
        </div>
      </div>

      {/* Up Next Song Queue Drawer */}
      <MusicQueueDrawer
        queue={playback.queue}
        currentIndex={playback.queueIndex}
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        onSelectTrack={(_, idx) => {
          playbackService.playIndex(idx);
          setIsQueueOpen(false);
        }}
        onRemoveTrack={(idx) => {
          playbackService.removeFromQueue(idx);
        }}
      />
    </div>
  );
};
