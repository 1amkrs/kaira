import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Server,
  Sliders,
  Subtitles,
  Check,
} from 'lucide-react';
import { FlicxStreamSource, FlicxStreamService, FlicxSubtitleTrack } from '../../services/flicx/FlicxStreamService';
import './FlicxPlayer.css';

interface FlicxPlayerProps {
  title: string;
  subtitle?: string;
  imdbId?: string;
  season?: number;
  episode?: number;
  initialTime?: number;
  onExit: () => void;
}

export const FlicxPlayer: React.FC<FlicxPlayerProps> = ({
  title,
  subtitle,
  imdbId = 'tt1757678',
  season,
  episode,
  initialTime = 0,
  onExit,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [sources, setSources] = useState<FlicxStreamSource[]>([]);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number>(0);
  const [subtitles, setSubtitles] = useState<FlicxSubtitleTrack[]>([]);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(initialTime);
  const [duration, setDuration] = useState<number>(0);
  const [buffered, setBuffered] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);

  // Menus
  const [activeMenu, setActiveMenu] = useState<'servers' | 'quality' | 'subs' | null>(null);
  const [qualities, setQualities] = useState<{ id: number; label: string }[]>([]);
  const [activeQuality, setActiveQuality] = useState<number>(-1); // -1 = Auto

  const hideHudTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showHud = useCallback(() => {
    setIsHudVisible(true);
    if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    hideHudTimerRef.current = setTimeout(() => {
      if (isPlaying) setIsHudVisible(false);
    }, 3500);
  }, [isPlaying]);

  // Load stream sources on mount
  useEffect(() => {
    let cancelled = false;
    FlicxStreamService.getSources(imdbId, season, episode).then((res) => {
      if (!cancelled && res.length > 0) {
        setSources(res);
        setActiveSourceIndex(0);
      }
    });

    FlicxStreamService.getSubtitles(imdbId).then((subs) => {
      if (!cancelled) setSubtitles(subs);
    });

    // Check saved progress
    try {
      const saved = JSON.parse(localStorage.getItem('flicx:player:progress') || '{}');
      const itemKey = `${imdbId}${season ? `_s${season}e${episode}` : ''}`;
      if (saved[itemKey] && saved[itemKey].time > 10) {
        setCurrentTime(saved[itemKey].time);
      }
    } catch {
      // Ignored
    }

    return () => {
      cancelled = true;
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    };
  }, [imdbId, season, episode]);

  // Attach Stream to Video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || sources.length === 0) return;

    const source = sources[activeSourceIndex];
    if (!source) return;

    const savedPos = video.currentTime > 0 ? video.currentTime : currentTime;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (source.kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(source.src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map((lvl, index) => ({
          id: index,
          label: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
        }));
        setQualities(levels);

        if (savedPos > 0) video.currentTime = savedPos;
        video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_, err) => {
        if (err.fatal) {
          switch (err.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else {
      video.src = source.src;
      if (savedPos > 0) video.currentTime = savedPos;
      video.play().catch(() => setIsPlaying(false));
    }
  }, [activeSourceIndex, sources]);

  // Periodic watch progress saver
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.duration <= 0) return;

      try {
        const key = `${imdbId}${season ? `_s${season}e${episode}` : ''}`;
        const prev = JSON.parse(localStorage.getItem('flicx:player:progress') || '{}');
        prev[key] = {
          title,
          time: Math.floor(video.currentTime),
          duration: Math.floor(video.duration),
          updatedAt: Date.now(),
        };
        localStorage.setItem('flicx:player:progress', JSON.stringify(prev));
      } catch {
        // Ignored
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [imdbId, season, episode, title]);

  // Video Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);

    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      setBuffered(end);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    showHud();
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    showHud();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video && duration > 0) {
      video.currentTime = ratio * duration;
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seekRelative(-10);
          break;
        case 'ArrowRight':
          seekRelative(10);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (activeMenu) {
            setActiveMenu(null);
          } else {
            onExit();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const formatSec = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className={`flicx-player-wrap ${isHudVisible ? 'hud-visible' : ''}`}
      onMouseMove={showHud}
      onClick={() => {
        if (activeMenu) setActiveMenu(null);
        showHud();
      }}
    >
      <video
        ref={videoRef}
        className="flicx-video-element"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
      />

      {/* ─── HUD Layer ─── */}
      <div className="flicx-player-hud" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="flicx-player-top">
          <button className="capsule-btn capsule-btn-text" onClick={onExit}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className="flicx-player-title-info">
            <span className="flicx-player-title">{title}</span>
            {subtitle && <span className="flicx-player-subtitle">{subtitle}</span>}
          </div>

          <div style={{ width: 80 }} />
        </div>

        {/* Center Big Play/Pause */}
        <div className="flicx-player-center">
          <button className="flicx-center-btn" onClick={() => seekRelative(-10)} title="Skip 10s">
            <RotateCcw size={26} />
          </button>
          <button className="flicx-center-btn" style={{ width: 80, height: 80 }} onClick={togglePlay}>
            {isPlaying ? <Pause size={38} /> : <Play size={38} style={{ marginLeft: 4 }} />}
          </button>
          <button className="flicx-center-btn" onClick={() => seekRelative(10)} title="Skip 10s">
            <RotateCw size={26} />
          </button>
        </div>

        {/* Bottom Bar */}
        <div className="flicx-player-bottom">
          {/* Timeline Scrubber */}
          <div className="flicx-timeline-track" onClick={handleSeek}>
            <div
              className="flicx-timeline-buffered"
              style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
            />
            <div
              className="flicx-timeline-progress"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="flicx-timeline-thumb" />
            </div>
          </div>

          <div className="flicx-bottom-actions">
            <div className="flicx-bottom-left">
              <button className="capsule-btn-icon" onClick={togglePlay}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>

              <button
                className="capsule-btn-icon"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              <span className="flicx-time-display">
                {formatSec(currentTime)} / {formatSec(duration)}
              </span>
            </div>

            <div className="flicx-bottom-right">
              {/* Server Picker */}
              <button
                className={`flicx-ctrl-btn ${activeMenu === 'servers' ? 'active' : ''}`}
                onClick={() => setActiveMenu(activeMenu === 'servers' ? null : 'servers')}
              >
                <Server size={16} />
                <span>Server: {sources[activeSourceIndex]?.name || 'Auto'}</span>
              </button>

              {/* Quality Picker */}
              {qualities.length > 0 && (
                <button
                  className={`flicx-ctrl-btn ${activeMenu === 'quality' ? 'active' : ''}`}
                  onClick={() => setActiveMenu(activeMenu === 'quality' ? null : 'quality')}
                >
                  <Sliders size={16} />
                  <span>{activeQuality === -1 ? 'Auto' : qualities[activeQuality]?.label}</span>
                </button>
              )}

              {/* Fullscreen */}
              <button className="capsule-btn-icon" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Server Selector Modal ─── */}
        {activeMenu === 'servers' && (
          <div className="flicx-menu-modal">
            <div className="flicx-menu-header">Streaming Server</div>
            <div className="flicx-menu-list">
              {sources.map((s, idx) => (
                <button
                  key={`${s.name}-${idx}`}
                  className={`flicx-menu-item ${idx === activeSourceIndex ? 'active' : ''}`}
                  onClick={() => {
                    setActiveSourceIndex(idx);
                    setActiveMenu(null);
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                      {s.group === 'dedicated' ? 'Dedicated High-Speed' : 'External Cluster'} · {s.quality || 'Auto'}
                    </span>
                  </div>
                  {idx === activeSourceIndex && <Check size={16} color="var(--brand)" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Quality Selector Modal ─── */}
        {activeMenu === 'quality' && (
          <div className="flicx-menu-modal">
            <div className="flicx-menu-header">Video Quality</div>
            <div className="flicx-menu-list">
              <button
                className={`flicx-menu-item ${activeQuality === -1 ? 'active' : ''}`}
                onClick={() => {
                  if (hlsRef.current) hlsRef.current.currentLevel = -1;
                  setActiveQuality(-1);
                  setActiveMenu(null);
                }}
              >
                <span>Auto (Adaptive)</span>
                {activeQuality === -1 && <Check size={16} />}
              </button>
              {qualities.map((q) => (
                <button
                  key={q.id}
                  className={`flicx-menu-item ${activeQuality === q.id ? 'active' : ''}`}
                  onClick={() => {
                    if (hlsRef.current) hlsRef.current.currentLevel = q.id;
                    setActiveQuality(q.id);
                    setActiveMenu(null);
                  }}
                >
                  <span>{q.label}</span>
                  {activeQuality === q.id && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
