import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ArrowLeft,
  Mic2,
  Sparkles,
  Music,
  ListMusic,
  Waves,
  X,
  Shuffle,
  Repeat,
  Repeat1,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import { musicEngine } from '../../services/music/MusicEngine';
import {
  MusicEngineState,
  SoundPresetName,
  SOUND_PRESETS,
} from '../../services/music/types';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { Focusable } from '../../components/Focusable/Focusable';
import { AudioVisualizer } from '../../components/Playback/AudioVisualizer';
import { MusicQueueDrawer } from '../../components/Playback/MusicQueueDrawer';
import './MusicPlayerScreen.css';

interface MusicPlayerScreenProps {
  onClose: () => void;
}

export const MusicPlayerScreen: React.FC<MusicPlayerScreenProps> = ({ onClose }) => {
  const [engineState, setEngineState] = useState<MusicEngineState>(musicEngine.getState());
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [isEQOpen, setIsEQOpen] = useState<boolean>(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = musicEngine.subscribe(setEngineState);
    return unsub;
  }, []);

  const src = engineState.currentSource;
  const lyrics = engineState.lyrics;

  // Track active lyric line based on currentTime with smooth lead
  useEffect(() => {
    if (lyrics.length === 0) {
      setActiveLyricIndex(-1);
      return;
    }

    const curTime = engineState.currentTime;
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
  }, [engineState.currentTime, lyrics]);

  const lastScrubTimeRef = useRef<number>(0);

  const handleTimelineScrub = (percent: number, immediate: boolean = false) => {
    if (engineState.duration <= 0) return;
    const now = performance.now();
    if (!immediate && now - lastScrubTimeRef.current < 100) {
      return;
    }
    lastScrubTimeRef.current = now;
    const target = Math.max(0, Math.min(engineState.duration, percent * engineState.duration));
    musicEngine.seek(target);
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
          musicEngine.seekRelative(-10);
          return;
        }
      }
      if (e.key === 'ArrowRight') {
        if (currentFocused === 'music-player-timeline' || currentFocused === 'music-ctrl-playpause') {
          e.preventDefault();
          musicEngine.seekRelative(10);
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
          musicEngine.togglePlayPause();
          break;
        }
        case 'j':
        case 'J':
          e.preventDefault();
          musicEngine.seekRelative(-10);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          musicEngine.seekRelative(10);
          break;
        case 's':
        case 'S':
          e.preventDefault();
          musicEngine.toggleShuffle();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          musicEngine.toggleRepeatMode();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          if (isEQOpen) {
            setIsEQOpen(false);
          } else if (isQueueOpen) {
            setIsQueueOpen(false);
          } else {
            onClose();
          }
          break;
      }
    };

    const handleBumperLeft = () => musicEngine.previous();
    const handleBumperRight = () => musicEngine.next();
    const handleTriggerLeft = () => musicEngine.seekRelative(-15);
    const handleTriggerRight = () => musicEngine.seekRelative(15);
    const handleButtonX = () => musicEngine.togglePlayPause();
    const handleButtonY = () => musicEngine.toggleShuffle();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tv:controller-bumper-left', handleBumperLeft);
    window.addEventListener('tv:controller-bumper-right', handleBumperRight);
    window.addEventListener('tv:controller-trigger-left', handleTriggerLeft);
    window.addEventListener('tv:controller-trigger-right', handleTriggerRight);
    window.addEventListener('tv:controller-button-x', handleButtonX);
    window.addEventListener('tv:controller-button-y', handleButtonY);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tv:controller-bumper-left', handleBumperLeft);
      window.removeEventListener('tv:controller-bumper-right', handleBumperRight);
      window.removeEventListener('tv:controller-trigger-left', handleTriggerLeft);
      window.removeEventListener('tv:controller-trigger-right', handleTriggerRight);
      window.removeEventListener('tv:controller-button-x', handleButtonX);
      window.removeEventListener('tv:controller-button-y', handleButtonY);
    };
  }, [onClose, isEQOpen, isQueueOpen]);

  if (!src) return null;

  const isPlaying = engineState.status === 'playing';
  const progressPct =
    engineState.duration > 0 ? (engineState.currentTime / engineState.duration) * 100 : 0;

  const formatTime = (sec: number) => {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const presetList: SoundPresetName[] = [
    'flat',
    'bass-boost',
    'vocal-clarity',
    'electronic',
    'rock',
    'acoustic',
    'jazz',
    'night-mode',
  ];

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
            <Music size={14} /> High-Fidelity Studio Stream • {SOUND_PRESETS[engineState.activePreset]?.name || 'Studio'}
          </span>
        </div>

        <div className="tv-music-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* EQ / Sound Preset Toggle */}
          <Focusable
            id="music-eq-toggle"
            groupId="music-player-top"
            indexInGroup={1}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => setIsEQOpen(!isEQOpen)}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill ${isEQOpen ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                <SlidersHorizontal size={16} />
                <span>EQ: {SOUND_PRESETS[engineState.activePreset]?.name.split(' ')[0]}</span>
              </div>
            )}
          </Focusable>

          {/* Queue Toggle */}
          <Focusable
            id="music-queue-toggle"
            groupId="music-player-top"
            indexInGroup={2}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => setIsQueueOpen(!isQueueOpen)}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill ${isQueueOpen ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                <ListMusic size={16} />
                <span>Queue ({engineState.queue.length})</span>
              </div>
            )}
          </Focusable>

          {/* Lyrics / Visualizer View Toggle */}
          <Focusable
            id="music-lyrics-toggle"
            groupId="music-player-top"
            indexInGroup={3}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => setShowLyrics(!showLyrics)}
          >
            {(isFocused) => (
              <div className={`tv-music-lyrics-pill ${showLyrics ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                {showLyrics ? <Waves size={16} /> : <Mic2 size={16} />}
                <span>{showLyrics ? 'FFT Spectrum' : 'Live Lyrics'}</span>
              </div>
            )}
          </Focusable>

          {/* Stop & Exit */}
          <Focusable
            id="music-stop-close-btn"
            groupId="music-player-top"
            indexInGroup={4}
            className="tv-music-lyrics-toggle-btn"
            onSelect={() => {
              musicEngine.stop();
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
              onSelect={() => musicEngine.togglePlayPause()}
            >
              {(isFocused) => (
                <div
                  className={`tv-music-progress-bar-container ${isFocused ? 'focused' : ''} ${
                    isScrubbing ? 'scrubbing' : ''
                  }`}
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
                        style={{
                          left: `${hoverPosition !== null ? hoverPosition * 100 : progressPct}%`,
                        }}
                      >
                        {formatTime(
                          (hoverPosition !== null ? hoverPosition : progressPct / 100) *
                            (engineState.duration || 240)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Focusable>

            <div className="tv-music-time-row">
              <span className="tv-music-time">{formatTime(engineState.currentTime)}</span>
              <span className="tv-music-time">{formatTime(engineState.duration || 240)}</span>
            </div>
          </div>

          {/* Main Controls Row (Shuffle, Prev, Play/Pause, Next, Repeat) */}
          <div className="tv-music-controls-row">
            {/* Shuffle Button */}
            <Focusable
              id="music-ctrl-shuffle"
              groupId="music-player-ctrls"
              indexInGroup={0}
              className="tv-music-ctrl-focusable"
              onSelect={() => musicEngine.toggleShuffle()}
            >
              {(isFocused) => (
                <div
                  className={`tv-music-btn secondary ${engineState.isShuffle ? 'active-mode' : ''} ${
                    isFocused ? 'focused' : ''
                  }`}
                  title={engineState.isShuffle ? 'Shuffle On' : 'Shuffle Off'}
                >
                  <Shuffle size={20} />
                </div>
              )}
            </Focusable>

            {/* Previous Button */}
            <Focusable
              id="music-ctrl-prev"
              groupId="music-player-ctrls"
              indexInGroup={1}
              className="tv-music-ctrl-focusable"
              onSelect={() => musicEngine.previous()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn ${isFocused ? 'focused' : ''}`}>
                  <SkipBack size={24} />
                </div>
              )}
            </Focusable>

            {/* Play/Pause Button */}
            <Focusable
              id="music-ctrl-play"
              groupId="music-player-ctrls"
              indexInGroup={2}
              autoFocus={true}
              className="tv-music-ctrl-focusable"
              onSelect={() => musicEngine.togglePlayPause()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn primary ${isFocused ? 'focused' : ''}`}>
                  {isPlaying ? (
                    <Pause size={32} fill="currentColor" />
                  ) : (
                    <Play size={32} fill="currentColor" style={{ marginLeft: '2px' }} />
                  )}
                </div>
              )}
            </Focusable>

            {/* Next Button */}
            <Focusable
              id="music-ctrl-next"
              groupId="music-player-ctrls"
              indexInGroup={3}
              className="tv-music-ctrl-focusable"
              onSelect={() => musicEngine.next()}
            >
              {(isFocused) => (
                <div className={`tv-music-btn ${isFocused ? 'focused' : ''}`}>
                  <SkipForward size={24} />
                </div>
              )}
            </Focusable>

            {/* Repeat Button */}
            <Focusable
              id="music-ctrl-repeat"
              groupId="music-player-ctrls"
              indexInGroup={4}
              className="tv-music-ctrl-focusable"
              onSelect={() => musicEngine.toggleRepeatMode()}
            >
              {(isFocused) => (
                <div
                  className={`tv-music-btn secondary ${
                    engineState.repeatMode !== 'off' ? 'active-mode' : ''
                  } ${isFocused ? 'focused' : ''}`}
                  title={`Repeat: ${engineState.repeatMode.toUpperCase()}`}
                >
                  {engineState.repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                  {engineState.repeatMode === 'one' && <span className="repeat-one-dot" />}
                </div>
              )}
            </Focusable>
          </div>
        </div>

        {/* Right Column: Live Synced Lyrics OR Real-Time Audio Visualizer */}
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
                    onClick={() => musicEngine.seek(line.time)}
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

      {/* Sound Preset & Equalizer Drawer */}
      {isEQOpen && (
        <div className="tv-music-eq-modal-backdrop" onClick={() => setIsEQOpen(false)}>
          <div className="tv-music-eq-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="tv-eq-header">
              <div className="tv-eq-title-row">
                <SlidersHorizontal size={22} color="var(--google-blue)" />
                <div>
                  <h3 className="tv-eq-title">Studio Equalizer & DSP Presets</h3>
                  <p className="tv-eq-subtitle">Real-time Web Audio API 10-band hardware tuning</p>
                </div>
              </div>
              <Focusable
                id="eq-close-btn"
                groupId="eq-nav"
                indexInGroup={0}
                className="tv-queue-btn-focusable"
                onSelect={() => setIsEQOpen(false)}
              >
                {(isFocused) => (
                  <div className={`tv-queue-close-pill ${isFocused ? 'focused' : ''}`}>
                    <X size={18} />
                    <span>Close (B)</span>
                  </div>
                )}
              </Focusable>
            </div>

            {/* Presets Grid */}
            <div className="tv-eq-presets-grid">
              {presetList.map((presetKey, idx) => {
                const preset = SOUND_PRESETS[presetKey];
                const isActive = engineState.activePreset === presetKey;
                return (
                  <Focusable
                    key={presetKey}
                    id={`eq-preset-${presetKey}`}
                    groupId="eq-presets-list"
                    indexInGroup={idx}
                    className="tv-eq-preset-card-focusable"
                    onSelect={() => {
                      musicEngine.setPreset(presetKey);
                    }}
                  >
                    {(isFocused) => (
                      <div
                        className={`tv-eq-preset-card ${isActive ? 'active' : ''} ${
                          isFocused ? 'focused' : ''
                        }`}
                      >
                        <div className="tv-eq-preset-name-row">
                          <span className="tv-eq-preset-name">{preset.name}</span>
                          {isActive && <span className="tv-eq-active-pill">ACTIVE</span>}
                        </div>
                        <p className="tv-eq-preset-desc">{preset.description}</p>
                      </div>
                    )}
                  </Focusable>
                );
              })}
            </div>

            {/* Quick Bass Boost Toggle */}
            <div className="tv-eq-bass-boost-bar">
              <Focusable
                id="eq-bass-boost-btn"
                groupId="eq-footer"
                indexInGroup={0}
                className="tv-eq-bass-focusable"
                onSelect={() => musicEngine.toggleAudioBoost()}
              >
                {(isFocused) => (
                  <div
                    className={`tv-eq-bass-btn ${engineState.audioBoostEnabled ? 'active' : ''} ${
                      isFocused ? 'focused' : ''
                    }`}
                  >
                    <Zap size={18} />
                    <span>
                      Deep Bass Sub-Shelf Boost: {engineState.audioBoostEnabled ? 'ON (+7dB)' : 'OFF'}
                    </span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </div>
      )}

      {/* Up Next Song Queue Drawer */}
      <MusicQueueDrawer
        queue={engineState.queue.map((t) => ({
          id: `source-${t.id}`,
          type: 'audio',
          title: t.title,
          subtitle: `${t.artist} — ${t.album}`,
          artist: t.artist,
          album: t.album,
          artwork: t.artwork,
          streamUrl: t.audioUrl || '',
          durationSeconds: t.durationSeconds,
          initialPosition: 0,
          mediaType: 'track',
          mediaId: t.id,
        }))}
        currentIndex={engineState.queueIndex}
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        onSelectTrack={(_, idx) => {
          musicEngine.playIndex(idx);
          setIsQueueOpen(false);
        }}
        onRemoveTrack={(idx) => {
          musicEngine.removeFromQueue(idx);
        }}
      />
    </div>
  );
};
