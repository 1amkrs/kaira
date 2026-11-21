import React from 'react';
import { Maximize2, X, Play, Pause } from 'lucide-react';
import { PlaybackSource } from '../../types/media';
import { playbackService } from '../../services/playback/PlaybackService';
import { Focusable } from '../Focusable/Focusable';
import './FloatingVideoPiP.css';

interface FloatingVideoPiPProps {
  source: PlaybackSource;
  isPlaying: boolean;
  onExpand: () => void;
  onClose: () => void;
  onTogglePlayPause: () => void;
}

export const FloatingVideoPiP: React.FC<FloatingVideoPiPProps> = ({
  source,
  isPlaying,
  onExpand,
  onClose,
  onTogglePlayPause,
}) => {
  const isYouTube =
    source.streamType === 'youtube' ||
    (Boolean(source.streamUrl) && (source.streamUrl.includes('youtube.com') || source.streamUrl.includes('youtu.be')));

  const isEmbed = !isYouTube && source.streamType === 'embed';

  const extractYtId = (url: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const ytId = isYouTube ? extractYtId(source.streamUrl) || source.ytTrailerId : null;

  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hasAppliedInitialSeekRef = React.useRef<string | null>(null);
  const [internalPlaying, setInternalPlaying] = React.useState<boolean>(isPlaying);

  React.useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  React.useEffect(() => {
    const unsub = playbackService.subscribe((state) => {
      setInternalPlaying(state.status === 'playing');
    });
    return () => unsub();
  }, []);

  // Apply initialPosition exactly once per source after metadata loads (avoiding infinite seek loops on re-render)
  React.useEffect(() => {
    if (isYouTube || isEmbed) return;
    const video = videoRef.current;
    if (!video || !source.initialPosition || source.initialPosition <= 0) return;

    const sourceKey = `${source.id}:${source.streamUrl}`;
    if (hasAppliedInitialSeekRef.current === sourceKey) return;

    const applySeek = () => {
      if (!videoRef.current || hasAppliedInitialSeekRef.current === sourceKey) return;
      hasAppliedInitialSeekRef.current = sourceKey;
      try {
        videoRef.current.currentTime = source.initialPosition || 0;
      } catch (e) {}
    };

    if (video.readyState >= 1) {
      applySeek();
    } else {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
      return () => {
        video.removeEventListener('loadedmetadata', applySeek);
      };
    }
  }, [source.id, source.streamUrl, source.initialPosition, isYouTube, isEmbed]);

  // Synchronize native video element state with live playing state
  React.useEffect(() => {
    if (!videoRef.current) return;
    if (internalPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!internalPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [internalPlaying]);

  const handleTogglePlay = () => {
    if (isYouTube && iframeRef.current?.contentWindow) {
      const func = internalPlaying ? 'pauseVideo' : 'playVideo';
      try {
        iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func }), '*');
      } catch (e) {}
    } else if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
    onTogglePlayPause();
  };

  return (
    <div className="tv-pip-container" role="complementary" aria-label="Picture in Picture Video">
      {/* Viewport Frame */}
      <div className="tv-pip-video-frame">
        {isYouTube && ytId ? (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&enablejsapi=1`}
            className="tv-pip-media"
            allow="autoplay; encrypted-media"
            title={source.title}
          />
        ) : isEmbed ? (
          <iframe
            ref={iframeRef}
            src={source.streamUrl}
            className="tv-pip-media"
            allow="autoplay; encrypted-media; fullscreen"
            title={source.title}
          />
        ) : (
          <video
            ref={videoRef}
            src={source.streamUrl}
            className="tv-pip-media"
            autoPlay
            playsInline
            muted={false}
            onPlay={() => {
              if (playbackService.getState().status !== 'playing') {
                playbackService.setStatus('playing');
              }
            }}
            onPause={() => {
              if (playbackService.getState().status === 'playing') {
                playbackService.setStatus('paused');
              }
            }}
            onTimeUpdate={(e) => {
              const cur = e.currentTarget.currentTime;
              const dur = e.currentTarget.duration;
              if (!isNaN(cur) && cur > 0) {
                playbackService.updateTime(cur, dur);
              }
            }}
          />
        )}

        {/* Hover / Focused Action Overlay */}
        <div className="tv-pip-overlay">
          <div className="tv-pip-header">
            <span className="tv-pip-title text-truncate">{source.title}</span>
          </div>

          <div className="tv-pip-controls">
            <Focusable
              id="pip-playpause-btn"
              groupId="pip-controls"
              indexInGroup={0}
              scaleEffect={false}
              className="tv-pip-btn-focusable"
              onSelect={handleTogglePlay}
            >
              {(isFocused) => (
                <div className={`tv-pip-btn ${isFocused ? 'focused' : ''}`}>
                  {internalPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </div>
              )}
            </Focusable>

            <Focusable
              id="pip-expand-btn"
              groupId="pip-controls"
              indexInGroup={1}
              scaleEffect={false}
              className="tv-pip-btn-focusable"
              onSelect={onExpand}
            >
              {(isFocused) => (
                <div className={`tv-pip-btn ${isFocused ? 'focused' : ''}`}>
                  <Maximize2 size={16} />
                </div>
              )}
            </Focusable>

            <Focusable
              id="pip-close-btn"
              groupId="pip-controls"
              indexInGroup={2}
              scaleEffect={false}
              className="tv-pip-btn-focusable"
              onSelect={onClose}
            >
              {(isFocused) => (
                <div className={`tv-pip-btn danger ${isFocused ? 'focused' : ''}`}>
                  <X size={16} />
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>
    </div>
  );
};
