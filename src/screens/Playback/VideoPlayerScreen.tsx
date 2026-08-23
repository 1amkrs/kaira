import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  AlertCircle,
  Subtitles,
  Sliders,
  Layers,
  Volume2,
  Volume1,
  VolumeX,
  Check,
  X,
  FastForward,
  Minimize2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { PlayerEngineController, PlayerEngineState } from '../../services/player/PlayerEngineController';
import { DriverType } from '../../services/player/types';
import { addonService } from '../../services/addons/AddonService';
import { introService } from '../../services/playback/IntroService';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { gamepadManager } from '../../services/controller/gamepadManager';
import { PlaybackSource } from '../../types/media';
import { AddonStream, SubtitleTrack } from '../../types/addons';
import { Focusable } from '../../components/Focusable/Focusable';
import './VideoPlayerScreen.css';

interface VideoPlayerScreenProps {
  source: PlaybackSource;
  onExit: () => void;
  onMinimizeToPiP?: () => void;
}

export const VideoPlayerScreen: React.FC<VideoPlayerScreenProps> = ({
  source,
  onExit,
  onMinimizeToPiP,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PlayerEngineController | null>(null);

  // Engine state mirror
  const [engineState, setEngineState] = useState<PlayerEngineState>({
    driverType: source.streamType === 'youtube' ? 'youtube' : source.streamType === 'embed' ? 'embed' : 'direct',
    status: 'buffering',
    currentTime: source.initialPosition || 0,
    duration: source.durationSeconds || 7200,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 0,
    currentSubtitleText: null,
    vocalBoostEnabled: false,
  });

  // HUD & UI States
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [menuTab, setMenuTab] = useState<'sources' | 'subtitles' | 'audio' | 'speed' | 'intro'>('sources');
  const [feedbackBadge, setFeedbackBadge] = useState<string | null>(null);
  const [debugOverlayOpen, setDebugOverlayOpen] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string>('Player Initialized');

  // Stream & Subtitles metadata
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(source.streamUrl);
  const [currentDriverType, setCurrentDriverType] = useState<DriverType>(
    source.streamType === 'youtube' ? 'youtube' : source.streamType === 'embed' ? 'embed' : 'direct'
  );
  const [availableStreams, setAvailableStreams] = useState<AddonStream[]>([]);
  const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>(source.subtitles || []);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Intro Skip State
  const [introSegment, setIntroSegment] = useState<{ start: number; end: number; type?: string } | null>(
    source.intro || null
  );
  const [autoSkipIntro, setAutoSkipIntro] = useState<boolean>(() => introService.isAutoSkipEnabled());
  const [hasAutoSkipped, setHasAutoSkipped] = useState<boolean>(false);

  // Scrubbing & Tooltip State
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  // Volume OSD state
  const [volumeToast, setVolumeToast] = useState<{ level: number; muted: boolean } | null>(null);
  const volumeToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: Trigger visual feedback badge
  const triggerFeedback = useCallback((text: string) => {
    setFeedbackBadge(text);
    setLastAction(text);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedbackBadge(null), 1200);
  }, []);

  // Helper: Reset HUD auto-hide timer
  const pingHud = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    if (engineRef.current?.getState().status === 'playing' && !isMenuOpen && !isScrubbing) {
      hudTimerRef.current = setTimeout(() => {
        setIsHudVisible(false);
      }, 3500);
    }
  }, [isMenuOpen, isScrubbing]);

  // 1. Initialize Player Engine Controller
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new PlayerEngineController();
    engine.initialize(containerRef.current);
    engineRef.current = engine;

    const unsub = engine.subscribe((s) => {
      setEngineState(s);
    });

    spatialNav.pushScope('video-player-screen');

    return () => {
      spatialNav.popScope('video-player-screen');
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // 1b. React to source stream URL changes (async resolution from App.tsx)
  useEffect(() => {
    if (!engineRef.current || !source.streamUrl) return;

    const driverType: DriverType =
      source.streamType === 'youtube' ? 'youtube'
      : source.streamType === 'embed' ? 'embed'
      : 'direct';

    setCurrentStreamUrl(source.streamUrl);
    setCurrentDriverType(driverType);

    const initialExpectedDur = source.durationSeconds || (source.mediaType === 'episode' ? 2700 : 7200);
    engineRef.current.loadMedia(
      source.streamUrl,
      driverType,
      source.initialPosition || 0,
      source.subtitles && source.subtitles.length > 0 ? source.subtitles[0].url : undefined,
      initialExpectedDur,
    );

    if (source.subtitles && source.subtitles.length > 0) {
      setSelectedSubId(source.subtitles[0].id);
    }
  }, [source.streamUrl, source.streamType]);

  // 2. Fetch Alternate Mirrors & Intro Timestamps in background
  useEffect(() => {
    const fetchExtraData = async () => {
      try {
        const imdb = source.imdbId || (source.mediaId?.startsWith('tt') ? source.mediaId : undefined);
        if (imdb) {
          const streams = await addonService.fetchStreams(
            source.mediaType === 'episode' ? 'series' : 'movie',
            imdb,
            source.seasonNumber,
            source.episodeNumber,
            source.title,
            source.ytTrailerId
          );
          if (streams && streams.length > 0) {
            setAvailableStreams(streams);
          }

          if (!source.subtitles || source.subtitles.length === 0) {
            const subs = await addonService.fetchSubtitles(
              source.mediaType === 'episode' ? 'series' : 'movie',
              imdb
            );
            if (subs && subs.length > 0) {
              setAvailableSubtitles(subs);
            }
          }
        }
      } catch (e) {
        console.warn('[VideoPlayerScreen] Background stream query notice:', e);
      }

      // Check intro timestamps
      if (!source.intro && source.mediaType === 'episode') {
        const intro = await introService.getIntroTimestamps(source);
        if (intro) {
          setIntroSegment(intro);
        }
      }
    };

    fetchExtraData();
  }, [source.id]);

  // 3. Transport Handlers
  const handleTogglePlayPause = useCallback(() => {
    if (!engineRef.current) return;
    // Read LIVE driver state to avoid React stale closure desync
    const liveStatus = engineRef.current.getState().status;
    engineRef.current.togglePlayPause();
    triggerFeedback(liveStatus === 'playing' ? 'Paused ⏸' : 'Play ▶');
    pingHud();
  }, [triggerFeedback, pingHud]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      if (!engineRef.current) return;
      engineRef.current.seekBy(deltaSeconds);
      triggerFeedback(deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`);
      pingHud();
    },
    [triggerFeedback, pingHud]
  );

  const seekTo = useCallback(
    (seconds: number) => {
      if (!engineRef.current) return;
      engineRef.current.seekTo(seconds);
      pingHud();
    },
    [pingHud]
  );

  const handleSkipIntro = useCallback(() => {
    if (!introSegment || !engineRef.current) return;
    seekTo(introSegment.end);
    triggerFeedback('Intro Skipped');
  }, [introSegment, seekTo, triggerFeedback]);

  // 4. Intro Auto-Skip Monitor
  useEffect(() => {
    if (!introSegment || hasAutoSkipped || !autoSkipIntro) return;
    const { start, end } = introSegment;
    if (engineState.currentTime >= start && engineState.currentTime < end - 1) {
      setHasAutoSkipped(true);
      handleSkipIntro();
    }
  }, [engineState.currentTime, introSegment, hasAutoSkipped, autoSkipIntro, handleSkipIntro]);

  // 5. Remote Controller & Physical Keyboard Mapping
  useEffect(() => {
    // Focus play/pause button on mount
    spatialNav.setFocus('player-playpause-main-btn');

    const handleKeyDown = (e: KeyboardEvent) => {
      pingHud();

      // Escape / B button
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') {
        e.preventDefault();
        if (isMenuOpen) {
          setIsMenuOpen(false);
          spatialNav.setFocus('player-playpause-main-btn');
        } else {
          onExit();
        }
        return;
      }

      // Space / PlayPause key / Key K
      if (e.key === ' ' || e.key === 'MediaPlayPause' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handleTogglePlayPause();
        return;
      }

      // Dedicated Seek keys: [ / J (-10s) and ] / L (+10s)
      if (e.key === '[' || e.key === 'j' || e.key === 'J' || (e.shiftKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        seekBy(-10);
        return;
      }
      if (e.key === ']' || e.key === 'l' || e.key === 'L' || (e.shiftKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        seekBy(10);
        return;
      }

      // Left / Right Arrow: If HUD is hidden, seek 10s. If HUD is visible or menu open, let SpatialNav move focus!
      if (e.key === 'ArrowLeft' && !isHudVisible && !isMenuOpen) {
        e.preventDefault();
        seekBy(-10);
        return;
      }
      if (e.key === 'ArrowRight' && !isHudVisible && !isMenuOpen) {
        e.preventDefault();
        seekBy(10);
        return;
      }

      // 'I' key: Skip intro immediately
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        if (introSegment) {
          handleSkipIntro();
        }
        return;
      }

      // 'Y' key: Open quick menu / mirrors
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        setIsMenuOpen((prev) => !prev);
        return;
      }

      // 'X' / 'S' key: Quick subtitles
      if (e.key === 'x' || e.key === 'X' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setMenuTab('subtitles');
        setIsMenuOpen(true);
        return;
      }

      // Volume Keys: + / - / VolumeUp / VolumeDown / M / ArrowUp / ArrowDown (when not in modal)
      if (e.key === '+' || e.key === '=' || e.key === 'VolumeUp' || (e.key === 'ArrowUp' && !isMenuOpen)) {
        e.preventDefault();
        const next = engineRef.current ? engineRef.current.adjustVolume(0.05) : 1;
        setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
        triggerFeedback(`Volume: ${Math.round(next * 100)}%`);
        return;
      }
      if (e.key === '-' || e.key === '_' || e.key === 'VolumeDown' || (e.key === 'ArrowDown' && !isMenuOpen)) {
        e.preventDefault();
        const next = engineRef.current ? engineRef.current.adjustVolume(-0.05) : 0;
        setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
        triggerFeedback(`Volume: ${Math.round(next * 100)}%`);
        return;
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'VolumeMute') {
        e.preventDefault();
        const muted = engineRef.current ? engineRef.current.toggleMute() : false;
        const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
        setVolumeToast({ level: muted ? 0 : Math.round(curVol * 100), muted });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
        triggerFeedback(muted ? 'Muted 🔇' : `Volume: ${Math.round(curVol * 100)}% 🔊`);
        return;
      }

      // 'D' key: Diagnostics overlay
      if (e.key === 'd' || e.key === 'D') {
        setDebugOverlayOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pingHud, isHudVisible, isMenuOpen, onExit, handleTogglePlayPause, seekBy, introSegment, handleSkipIntro, triggerFeedback]);

  // 5b. Gamepad Action Handling
  useEffect(() => {
    const unsubGamepad = gamepadManager.subscribeAction((diag) => {
      pingHud();
      const action = diag.normalized;

      switch (action) {
        case 'BACK':
          if (isMenuOpen) {
            setIsMenuOpen(false);
            spatialNav.setFocus('player-playpause-main-btn');
          } else {
            onExit();
          }
          break;
        case 'PLAY_PAUSE':
          handleTogglePlayPause();
          break;
        case 'SUBTITLES':
          setMenuTab('subtitles');
          setIsMenuOpen(true);
          break;
        case 'MENU':
          setIsMenuOpen((prev) => !prev);
          break;
        case 'SEEK_BACKWARD':
        case 'TAB_PREV':
          seekBy(-10);
          break;
        case 'SEEK_FORWARD':
        case 'TAB_NEXT':
          seekBy(10);
          break;
        case 'VOLUME_UP': {
          const next = engineRef.current ? engineRef.current.adjustVolume(0.05) : 1;
          setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
          if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
          volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
          triggerFeedback(`Volume: ${Math.round(next * 100)}%`);
          break;
        }
        case 'VOLUME_DOWN': {
          const next = engineRef.current ? engineRef.current.adjustVolume(-0.05) : 0;
          setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
          if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
          volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
          triggerFeedback(`Volume: ${Math.round(next * 100)}%`);
          break;
        }
        case 'MUTE': {
          const muted = engineRef.current ? engineRef.current.toggleMute() : false;
          const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
          setVolumeToast({ level: muted ? 0 : Math.round(curVol * 100), muted });
          if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
          volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
          triggerFeedback(muted ? 'Muted 🔇' : `Volume: ${Math.round(curVol * 100)}% 🔊`);
          break;
        }
        default:
          break;
      }
    });

    return () => {
      unsubGamepad();
    };
  }, [pingHud, isMenuOpen, onExit, handleTogglePlayPause, seekBy, triggerFeedback]);

  // 6. Scrubber Drag & Pointer Handlers
  const handleScrubberPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = engineState.duration > 0 ? engineState.duration : source.durationSeconds || 7200;
    seekTo(pos * dur);
  };

  // Helper: Format Time string HH:MM:SS / MM:SS
  const formatTime = (secs: number): string => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const total = Math.floor(secs);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPct =
    engineState.duration > 0 ? Math.min(100, (engineState.currentTime / engineState.duration) * 100) : 0;

  const isInsideIntro =
    introSegment && engineState.currentTime >= introSegment.start && engineState.currentTime <= introSegment.end;

  return (
    <div
      className="tv-video-player-container"
      onPointerMove={pingHud}
      onClick={pingHud}
      role="region"
      aria-label="Video Player"
    >
      {/* 1. Underlying Playback Viewport Container (Driver attaches here) */}
      <div ref={containerRef} className="tv-player-viewport-wrapper" />

      {/* 2. Live Subtitle Rendering Layer */}
      {engineState.currentSubtitleText && (
        <div className="tv-player-live-subtitles-container">
          <div className="tv-player-live-subtitles-text">{engineState.currentSubtitleText}</div>
        </div>
      )}

      {/* 3. Center Gesture Feedback Badge ("+10s", "-10s", "Paused") */}
      {feedbackBadge && (
        <div className="tv-player-feedback-badge animate-pop" aria-live="assertive">
          <span>{feedbackBadge}</span>
        </div>
      )}

      {/* 4. Volume OSD Toast Indicator */}
      {volumeToast && (
        <div className="tv-player-volume-osd animate-pop" role="status" aria-live="polite">
          {volumeToast.muted || volumeToast.level === 0 ? (
            <VolumeX size={24} className="tv-volume-osd-icon muted" />
          ) : (
            <Volume2 size={24} className="tv-volume-osd-icon" />
          )}
          <div className="tv-volume-osd-bar">
            <div
              className="tv-volume-osd-fill"
              style={{ width: `${volumeToast.muted ? 0 : volumeToast.level}%` }}
            />
          </div>
          <span className="tv-volume-osd-text">
            {volumeToast.muted ? 'MUTED' : `${volumeToast.level}%`}
          </span>
        </div>
      )}

      {/* 5. Buffering Overlay */}
      {engineState.status === 'buffering' && (
        <div className="tv-player-buffering-overlay" aria-label="Buffering Media">
          <div className="tv-spinner-circle" />
          <span className="tv-buffering-label">Loading stream...</span>
        </div>
      )}

      {/* 5. Error Recovery Modal */}
      {engineState.status === 'error' && (
        <div className="tv-player-error-modal animate-scale-up" role="alertdialog">
          <AlertCircle size={48} className="error-icon" />
          <h2 className="error-title">Stream Unavailable</h2>
          <p className="error-desc">{engineState.error || 'We could not connect to this video source. Please try switching to a backup mirror.'}</p>
          <div className="error-actions">
            <Focusable
              id="btn-retry-stream"
              groupId="player-error-group"
              indexInGroup={0}
              autoFocus={true}
              className="tv-action-pill"
              onSelect={() => {
                if (engineRef.current) {
                  engineRef.current.loadMedia(currentStreamUrl, currentDriverType, engineState.currentTime);
                }
              }}
            >
              {(isFocused) => (
                <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                  <RefreshCw size={18} />
                  <span>Try Again</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="btn-switch-mirror"
              groupId="player-error-group"
              indexInGroup={1}
              className="tv-action-pill"
              onSelect={() => {
                setMenuTab('sources');
                setIsMenuOpen(true);
              }}
            >
              {(isFocused) => (
                <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                  <Layers size={18} />
                  <span>Choose Backup Mirror</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      )}

      {/* 6. 10-Foot TV HUD Overlay (Auto-hiding) */}
      <div className={`tv-player-hud ${isHudVisible || isMenuOpen ? 'visible' : 'hidden'}`}>
        {/* Top Header Row */}
        <div className="tv-hud-top">
          <Focusable
            id="player-hud-back-btn"
            groupId="player-hud-top"
            indexInGroup={0}
            className="tv-hud-btn-focusable"
            onSelect={onExit}
          >
            {(isFocused) => (
              <div className={`tv-hud-back-btn ${isFocused ? 'focused' : ''}`}>
                <ArrowLeft size={20} />
                <span>Back</span>
              </div>
            )}
          </Focusable>

          <div className="tv-hud-title-col">
            <h1 className="tv-hud-title">{source.title}</h1>
            <div className="tv-hud-meta-row">
              {source.subtitle && <span className="tv-hud-subtitle">{source.subtitle}</span>}
              <span className="tv-hud-stream-badge">
                <Zap size={12} />
                {currentDriverType === 'direct'
                  ? 'Direct Hardware Stream'
                  : currentDriverType === 'youtube'
                  ? 'YouTube Studio'
                  : 'Fast CDN Mirror'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {onMinimizeToPiP && (
              <Focusable
                id="player-hud-pip-btn"
                groupId="player-hud-top"
                indexInGroup={1}
                className="tv-hud-btn-focusable"
                onSelect={onMinimizeToPiP}
              >
                {(isFocused) => (
                  <div className={`tv-hud-menu-pill ${isFocused ? 'focused' : ''}`} title="Picture in Picture">
                    <Minimize2 size={18} />
                  </div>
                )}
              </Focusable>
            )}

            <Focusable
              id="player-hud-menu-btn"
              groupId="player-hud-top"
              indexInGroup={2}
              className="tv-hud-btn-focusable"
              onSelect={() => setIsMenuOpen((prev) => !prev)}
            >
              {(isFocused) => (
                <div className={`tv-hud-menu-pill ${isFocused ? 'focused' : ''}`}>
                  <Sliders size={18} />
                  <span>Settings</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>

        {/* Bottom Transport Controls */}
        <div className="tv-hud-bottom">
          {/* Timeline Row */}
          <div className="tv-hud-timeline-row">
            <span className="tv-hud-time">{formatTime(engineState.currentTime)}</span>

            <Focusable
              id="player-scrubber-bar"
              groupId="player-hud-timeline"
              indexInGroup={0}
              className="tv-hud-scrubber-focusable"
              scaleEffect={false}
              onSelect={handleTogglePlayPause}
            >
              {(isFocused) => (
                <div
                  className={`tv-hud-progress-bar-container ${isFocused ? 'focused' : ''} ${
                    isScrubbing ? 'scrubbing' : ''
                  }`}
                  onPointerDown={(e) => {
                    setIsScrubbing(true);
                    handleScrubberPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isScrubbing) handleScrubberPointer(e);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPosition(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
                  }}
                  onPointerUp={() => setIsScrubbing(false)}
                  onPointerLeave={() => {
                    setIsScrubbing(false);
                    setHoverPosition(null);
                  }}
                >
                  <div className="tv-hud-progress-track">
                    <div className="tv-hud-chapter-tick" style={{ left: '20%' }} />
                    <div className="tv-hud-chapter-tick" style={{ left: '50%' }} />
                    <div className="tv-hud-chapter-tick" style={{ left: '80%' }} />

                    <div className="tv-hud-progress-fill" style={{ width: `${progressPct}%` }} />
                    <div className="tv-hud-scrubber-head" style={{ left: `${progressPct}%` }} />

                    {(isFocused || isScrubbing || hoverPosition !== null) && (
                      <div
                        className="tv-hud-scrubber-tooltip"
                        style={{ left: `${hoverPosition !== null ? hoverPosition * 100 : progressPct}%` }}
                      >
                        {formatTime(
                          (hoverPosition !== null ? hoverPosition : progressPct / 100) *
                            (engineState.duration > 0 ? engineState.duration : source.durationSeconds || 7200)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Focusable>

            <span className="tv-hud-time">
              {formatTime(engineState.duration || source.durationSeconds || (source.mediaType === 'episode' ? 2700 : 7200))}
            </span>
          </div>

          {/* Transport Buttons Bar */}
          <div className="tv-hud-controls-row">
            {/* Seek Back 10s */}
            <Focusable
              id="player-seek-back-btn"
              groupId="player-hud-transport"
              indexInGroup={0}
              className="tv-hud-ctrl-btn-wrapper"
              onSelect={() => seekBy(-10)}
            >
              {(isFocused) => (
                <div
                  className={`tv-hud-ctrl-btn ${isFocused ? 'focused' : ''}`}
                  onClick={(e) => { e.stopPropagation(); seekBy(-10); }}
                >
                  <RotateCcw size={22} />
                  <span className="tv-hud-badge-10">10s</span>
                </div>
              )}
            </Focusable>

            {/* Primary Play / Pause Button */}
            <Focusable
              id="player-playpause-main-btn"
              groupId="player-hud-transport"
              indexInGroup={1}
              autoFocus={true}
              className="tv-hud-ctrl-btn-wrapper"
              onSelect={handleTogglePlayPause}
            >
              {(isFocused) => (
                <div
                  className={`tv-hud-ctrl-btn primary ${isFocused ? 'focused' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlayPause();
                  }}
                >
                  {engineState.status === 'playing' ? (
                    <Pause size={32} fill="currentColor" />
                  ) : (
                    <Play size={32} fill="currentColor" />
                  )}
                </div>
              )}
            </Focusable>

            {/* Seek Forward 10s */}
            <Focusable
              id="player-seek-fwd-btn"
              groupId="player-hud-transport"
              indexInGroup={2}
              className="tv-hud-ctrl-btn-wrapper"
              onSelect={() => seekBy(10)}
            >
              {(isFocused) => (
                <div
                  className={`tv-hud-ctrl-btn ${isFocused ? 'focused' : ''}`}
                  onClick={(e) => { e.stopPropagation(); seekBy(10); }}
                >
                  <RotateCw size={22} />
                  <span className="tv-hud-badge-10">10s</span>
                </div>
              )}
            </Focusable>

            {/* Volume Control Button & Slider */}
            <div className="tv-hud-volume-cluster">
              <Focusable
                id="player-volume-btn"
                groupId="player-hud-transport"
                indexInGroup={3}
                className="tv-hud-ctrl-btn-wrapper"
                onSelect={() => {
                  const muted = engineRef.current ? engineRef.current.toggleMute() : false;
                  const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
                  setVolumeToast({ level: muted ? 0 : Math.round(curVol * 100), muted });
                  if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
                  volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
                  triggerFeedback(muted ? 'Muted 🔇' : `Volume: ${Math.round(curVol * 100)}%`);
                }}
              >
                {(isFocused) => (
                  <div
                    className={`tv-hud-ctrl-btn ${isFocused ? 'focused' : ''}`}
                    title="Volume / Mute (M)"
                    onClick={(e) => {
                      e.stopPropagation();
                      const muted = engineRef.current ? engineRef.current.toggleMute() : false;
                      const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
                      setVolumeToast({ level: muted ? 0 : Math.round(curVol * 100), muted });
                      if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
                      volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
                      triggerFeedback(muted ? 'Muted 🔇' : `Volume: ${Math.round(curVol * 100)}%`);
                    }}
                  >
                    {engineState.isMuted || engineState.volume === 0 ? (
                      <VolumeX size={22} />
                    ) : engineState.volume < 0.5 ? (
                      <Volume1 size={22} />
                    ) : (
                      <Volume2 size={22} />
                    )}
                  </div>
                )}
              </Focusable>

              <div
                className="tv-hud-volume-slider-track"
                title="Adjust Volume (Click or drag)"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  engineRef.current?.setVolume(pos);
                  setVolumeToast({ level: Math.round(pos * 100), muted: pos === 0 });
                  if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
                  volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
                  triggerFeedback(`Volume: ${Math.round(pos * 100)}%`);
                }}
              >
                <div
                  className="tv-hud-volume-slider-fill"
                  style={{ width: `${engineState.isMuted ? 0 : Math.round(engineState.volume * 100)}%` }}
                />
              </div>
            </div>

            {/* Subtitles Menu */}
            <Focusable
              id="player-subtitles-btn"
              groupId="player-hud-transport"
              indexInGroup={4}
              className="tv-hud-ctrl-btn-wrapper"
              onSelect={() => {
                setMenuTab('subtitles');
                setIsMenuOpen(true);
              }}
            >
              {(isFocused) => (
                <div className={`tv-hud-ctrl-btn ${isFocused ? 'focused' : ''}`}>
                  <Subtitles size={22} />
                </div>
              )}
            </Focusable>

            {/* Mirrors / Quality Selector */}
            <Focusable
              id="player-mirrors-btn"
              groupId="player-hud-transport"
              indexInGroup={5}
              className="tv-hud-ctrl-btn-wrapper"
              onSelect={() => {
                setMenuTab('sources');
                setIsMenuOpen(true);
              }}
            >
              {(isFocused) => (
                <div className={`tv-hud-ctrl-btn ${isFocused ? 'focused' : ''}`}>
                  <Layers size={22} />
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>

      {/* 7. Floating Skip Intro Button (Appears during intro window) */}
      {isInsideIntro && !isMenuOpen && (
        <div className="tv-player-floating-skip-intro animate-pop">
          <Focusable
            id="player-floating-skip-intro-btn"
            groupId="player-skip-intro"
            indexInGroup={0}
            autoFocus={true}
            className="tv-skip-intro-focusable"
            onSelect={handleSkipIntro}
          >
            {(isFocused) => (
              <div className={`tv-skip-intro-btn ${isFocused ? 'focused' : ''}`}>
                <FastForward size={20} className="tv-skip-intro-icon" />
                <div className="tv-skip-intro-text-col">
                  <span className="tv-skip-intro-title">Skip Intro</span>
                  <span className="tv-skip-intro-sub">
                    {Math.max(0, Math.ceil((introSegment?.end || 0) - engineState.currentTime))}s (Press I or Enter)
                  </span>
                </div>
              </div>
            )}
          </Focusable>
        </div>
      )}

      {/* 8. In-Player Quick Settings & Stream Switcher Modal (Press Y) */}
      {isMenuOpen && (
        <div className="tv-player-menu-backdrop" role="dialog" aria-label="Player Settings Modal">
          <div className="tv-player-menu-card animate-scale-up">
            {/* Modal Header Tabs */}
            <div className="tv-player-menu-header">
              <div className="tv-player-menu-tabs" role="tablist">
                <Focusable
                  id="tab-opt-sources"
                  groupId="player-modal-tabs"
                  indexInGroup={0}
                  className="tv-menu-tab-btn"
                  onSelect={() => setMenuTab('sources')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-menu-tab-pill ${menuTab === 'sources' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <Layers size={16} />
                      <span>Stream Mirrors ({availableStreams.length})</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="tab-opt-subtitles"
                  groupId="player-modal-tabs"
                  indexInGroup={1}
                  className="tv-menu-tab-btn"
                  onSelect={() => setMenuTab('subtitles')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-menu-tab-pill ${menuTab === 'subtitles' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <Subtitles size={16} />
                      <span>Subtitles</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="tab-opt-audio"
                  groupId="player-modal-tabs"
                  indexInGroup={2}
                  className="tv-menu-tab-btn"
                  onSelect={() => setMenuTab('audio')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-menu-tab-pill ${menuTab === 'audio' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <Volume2 size={16} />
                      <span>Vocal Boost EQ</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="tab-opt-speed"
                  groupId="player-modal-tabs"
                  indexInGroup={3}
                  className="tv-menu-tab-btn"
                  onSelect={() => setMenuTab('speed')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-menu-tab-pill ${menuTab === 'speed' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <Sliders size={16} />
                      <span>Speed</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="tab-opt-intro"
                  groupId="player-modal-tabs"
                  indexInGroup={4}
                  className="tv-menu-tab-btn"
                  onSelect={() => setMenuTab('intro')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-menu-tab-pill ${menuTab === 'intro' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <FastForward size={16} />
                      <span>Intro Skip</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <Focusable
                id="btn-close-player-menu"
                groupId="player-modal-tabs"
                indexInGroup={5}
                className="tv-menu-close-focusable"
                onSelect={() => setIsMenuOpen(false)}
              >
                {(isFocused) => (
                  <div className={`tv-menu-close-btn ${isFocused ? 'focused' : ''}`}>
                    <X size={18} />
                    <span>Close</span>
                  </div>
                )}
              </Focusable>
            </div>

            {/* Modal Body Content */}
            <div className="tv-player-menu-content">
              {/* Tab 1: Stream Mirrors */}
              {menuTab === 'sources' && (
                <div className="tv-menu-sources-list">
                  {availableStreams.map((st, idx) => (
                    <Focusable
                      key={st.url}
                      id={`opt-stream-${idx}`}
                      groupId="menu-sources-list"
                      indexInGroup={idx}
                      className="tv-menu-source-card-focusable"
                      onSelect={() => {
                        setCurrentStreamUrl(st.url);
                        const driver: DriverType =
                          st.streamType === 'youtube' ? 'youtube' : st.streamType === 'embed' ? 'embed' : 'direct';
                        setCurrentDriverType(driver);
                        engineRef.current?.loadMedia(
                          st.url,
                          driver,
                          engineState.currentTime,
                          undefined,
                          engineState.duration || source.durationSeconds || 7200
                        );
                        triggerFeedback(`Switched to: ${st.name}`);
                        setIsMenuOpen(false);
                      }}
                    >
                      {(isFocused) => (
                        <div
                          className={`tv-menu-source-card ${currentStreamUrl === st.url ? 'active' : ''} ${
                            isFocused ? 'focused' : ''
                          }`}
                        >
                          <div className="tv-source-info-left">
                            <span
                              className={`tv-source-quality-badge ${
                                st.quality === '4K' ? 'q-4k' : st.quality === '720p' ? 'q-720p' : 'q-1080p'
                              }`}
                            >
                              {st.quality || '1080p'}
                            </span>
                            <div className="tv-source-titles">
                              <span className="tv-source-name">{st.name}</span>
                              <span className="tv-source-desc">{st.description || st.title}</span>
                            </div>
                          </div>

                          <div className="tv-source-info-right">
                            {currentStreamUrl === st.url && (
                              <span className="tv-source-active-tag">
                                <Check size={16} /> Active Mirror
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              )}

              {/* Tab 2: Subtitle Selection */}
              {menuTab === 'subtitles' && (
                <div className="tv-menu-items-grid">
                  <Focusable
                    id="sub-opt-off"
                    groupId="menu-subs-list"
                    indexInGroup={0}
                    className="tv-menu-option-btn-focusable"
                    onSelect={() => {
                      setSelectedSubId(null);
                      engineRef.current?.clearSubtitles();
                      triggerFeedback('Subtitles: Off');
                    }}
                  >
                    {(isFocused) => (
                      <div className={`tv-menu-option-card ${selectedSubId === null ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                        <span>Subtitles Off</span>
                        {selectedSubId === null && <Check size={18} />}
                      </div>
                    )}
                  </Focusable>

                  {availableSubtitles.map((sub, idx) => (
                    <Focusable
                      key={sub.id}
                      id={`sub-opt-${sub.id}`}
                      groupId="menu-subs-list"
                      indexInGroup={idx + 1}
                      className="tv-menu-option-btn-focusable"
                      onSelect={() => {
                        setSelectedSubId(sub.id);
                        engineRef.current?.loadSubtitleTrack(sub.url);
                        triggerFeedback(`Subtitles: ${sub.label || sub.lang}`);
                      }}
                    >
                      {(isFocused) => (
                        <div className={`tv-menu-option-card ${selectedSubId === sub.id ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                          <span>{sub.label || sub.lang.toUpperCase()}</span>
                          {selectedSubId === sub.id && <Check size={18} />}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              )}

              {/* Tab 3: Vocal Boost EQ */}
              {menuTab === 'audio' && (
                <div className="tv-menu-items-grid">
                  <Focusable
                    id="audio-boost-toggle"
                    groupId="menu-audio-list"
                    indexInGroup={0}
                    className="tv-menu-option-btn-focusable"
                    onSelect={() => {
                      const next = !engineState.vocalBoostEnabled;
                      engineRef.current?.setVocalBoost(next);
                      triggerFeedback(next ? 'Vocal Boost: On' : 'Standard Audio');
                    }}
                  >
                    {(isFocused) => (
                      <div
                        className={`tv-menu-option-card ${engineState.vocalBoostEnabled ? 'active' : ''} ${
                          isFocused ? 'focused' : ''
                        }`}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>Dialogue Clarity Boost</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Enhances quiet speech and whispered dialogue for easier listening
                          </div>
                        </div>
                        {engineState.vocalBoostEnabled && <Check size={18} />}
                      </div>
                    )}
                  </Focusable>
                </div>
              )}

              {/* Tab 4: Playback Speed */}
              {menuTab === 'speed' && (
                <div className="tv-menu-items-grid">
                  {[0.75, 1.0, 1.25, 1.5, 2.0].map((spd, idx) => (
                    <Focusable
                      key={spd}
                      id={`speed-opt-${spd}`}
                      groupId="menu-speed-list"
                      indexInGroup={idx}
                      className="tv-menu-option-btn-focusable"
                      onSelect={() => {
                        engineRef.current?.setSpeed(spd);
                        triggerFeedback(`${spd}x Speed`);
                      }}
                    >
                      {(isFocused) => (
                        <div
                          className={`tv-menu-option-card ${engineState.playbackSpeed === spd ? 'active' : ''} ${
                            isFocused ? 'focused' : ''
                          }`}
                        >
                          <span>{spd === 1 ? '1.0x Normal Speed' : `${spd}x Speed`}</span>
                          {engineState.playbackSpeed === spd && <Check size={18} />}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              )}

              {/* Tab 5: Intro Settings */}
              {menuTab === 'intro' && (
                <div className="tv-menu-items-grid">
                  <Focusable
                    id="intro-auto-toggle"
                    groupId="menu-intro-list"
                    indexInGroup={0}
                    className="tv-menu-option-btn-focusable"
                    onSelect={() => {
                      const next = !autoSkipIntro;
                      setAutoSkipIntro(next);
                      introService.setAutoSkipEnabled(next);
                      triggerFeedback(next ? 'Auto-Skip: On' : 'Auto-Skip: Off');
                    }}
                  >
                    {(isFocused) => (
                      <div className={`tv-menu-option-card ${autoSkipIntro ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                        <div>
                          <div style={{ fontWeight: 700 }}>Auto-Skip TV Show Intros</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Automatically skip opening theme songs and title cards on episodes
                          </div>
                        </div>
                        {autoSkipIntro && <Check size={18} />}
                      </div>
                    )}
                  </Focusable>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. Diagnostics Overlay (Press D to Toggle) */}
      {debugOverlayOpen && (
        <div
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '16px 20px',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ color: '#8ab4f8', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            🛠️ PLAYER ENGINE RUNTIME DIAGNOSTICS (D to toggle)
          </div>
          <div><strong>Active Driver:</strong> {engineState.driverType.toUpperCase()}</div>
          <div><strong>Status:</strong> {engineState.status.toUpperCase()}</div>
          <div><strong>Paused:</strong> {engineState.status === 'paused' ? 'TRUE (video.paused = true)' : 'FALSE (video.paused = false)'}</div>
          <div><strong>Time:</strong> {formatTime(engineState.currentTime)} ({Math.round(engineState.currentTime)}s) / {formatTime(engineState.duration)} ({Math.round(engineState.duration)}s)</div>
          <div><strong>Volume / Mute:</strong> {Math.round(engineState.volume * 100)}% {engineState.isMuted ? '🔇 MUTED' : '🔊 UNMUTED'}</div>
          <div><strong>Subtitles:</strong> {availableSubtitles.length} tracks | {engineState.currentSubtitleText ? `"${engineState.currentSubtitleText.slice(0, 30)}..."` : 'None active'}</div>
          <div><strong>Intro Window:</strong> {introSegment ? `${formatTime(introSegment.start)} → ${formatTime(introSegment.end)}` : 'None detected'}</div>
          <div><strong>Auto-Skip Intro:</strong> {autoSkipIntro ? 'ENABLED' : 'DISABLED'}</div>
          <div><strong>Last Triggered Action:</strong> <span style={{ color: '#4ade80' }}>{lastAction || 'None'}</span></div>
          <div style={{ maxWidth: '440px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
            <strong>Source URL:</strong> {currentStreamUrl}
          </div>
        </div>
      )}
    </div>
  );
};
