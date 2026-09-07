import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Sun, Music as MusicIcon } from 'lucide-react';
import { ambientService } from '../../services/ambient/ambientService';
import { playbackService } from '../../services/playback/PlaybackService';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import './AerialScreensaver.css';

interface AerialScreensaverProps {
  isActive: boolean;
  onWake: () => void;
}

interface AerialShot {
  id: string;
  title: string;
  location: string;
  videoUrl: string;
  fallbackImageUrl: string;
}

const AERIAL_SHOTS: AerialShot[] = [
  {
    id: 'dubai',
    title: 'Dubai Skyline & Marina at Night',
    location: 'United Arab Emirates',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-city-traffic-at-night-42173-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=3840&q=85',
  },
  {
    id: 'norway',
    title: 'Glacial Fjords & Northern Lights',
    location: 'Tromsø, Norway',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-snow-capped-mountains-41477-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=3840&q=85',
  },
  {
    id: 'tokyo',
    title: 'Tokyo Neon Shinjuku District',
    location: 'Tokyo, Japan',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-night-skyline-of-a-big-city-42171-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=3840&q=85',
  },
  {
    id: 'hawaii',
    title: 'Na Pali Coastline & Pacific Surf',
    location: 'Kauai, Hawaii',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=3840&q=85',
  },
  {
    id: 'alps',
    title: 'Matterhorn & Swiss Alpine Peaks',
    location: 'Zermatt, Switzerland',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-top-aerial-shot-of-snowy-mountains-41525-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=3840&q=85',
  },
];

export const AerialScreensaver: React.FC<AerialScreensaverProps> = ({ isActive, onWake }) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [ambientIntensity, setAmbientIntensity] = useState<number>(80);
  const [videoFailed, setVideoFailed] = useState<boolean>(false);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);

  // Push spatial navigation scope to isolate focus while screensaver is showing
  useEffect(() => {
    if (!isActive) return;
    spatialNav.pushScope('screensaver-scope');
    return () => {
      spatialNav.popScope('screensaver-scope');
    };
  }, [isActive]);

  // Clock & Date updates
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
      setDateStr(
        now.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cycle shots every 35 seconds
  useEffect(() => {
    if (!isActive) return;
    const cycle = setInterval(() => {
      setVideoFailed(false);
      setCurrentIndex((prev) => (prev + 1) % AERIAL_SHOTS.length);
    }, 35000);
    return () => clearInterval(cycle);
  }, [isActive]);

  // Read ambient lighting and background audio status
  useEffect(() => {
    if (isActive) {
      setAmbientIntensity(ambientService.getState().intensity);
      const curSource = playbackService.getState().currentSource;
      if (curSource && playbackService.getState().status === 'playing') {
        setNowPlayingTitle(`${curSource.title}${curSource.artist ? ` • ${curSource.artist}` : ''}`);
      } else {
        setNowPlayingTitle(null);
      }
    }
  }, [isActive]);

  // Wake handler that traps keystroke/clicks so they don't trigger underlying buttons
  const handleInteraction = useCallback(
    (e?: Event | React.SyntheticEvent) => {
      if (!isActive) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      onWake();
    },
    [isActive, onWake]
  );

  useEffect(() => {
    if (!isActive) return;

    window.addEventListener('keydown', handleInteraction, { capture: true });
    window.addEventListener('pointerdown', handleInteraction, { capture: true });
    window.addEventListener('gamepadconnected', handleInteraction, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleInteraction, { capture: true });
      window.removeEventListener('pointerdown', handleInteraction, { capture: true });
      window.removeEventListener('gamepadconnected', handleInteraction, { capture: true });
    };
  }, [isActive, handleInteraction]);

  if (!isActive) return null;

  const currentShot = AERIAL_SHOTS[currentIndex];

  return (
    <div
      className="tv-screensaver-container"
      role="presentation"
      onClick={handleInteraction}
    >
      {/* 4K Aerial Video Layer or High-Res Photographic Fallback */}
      {!videoFailed ? (
        <video
          key={currentShot.videoUrl}
          src={currentShot.videoUrl}
          poster={currentShot.fallbackImageUrl}
          autoPlay
          loop
          muted
          playsInline
          className="tv-screensaver-video"
          onError={() => {
            console.warn(`[AerialScreensaver] Video playback failed for ${currentShot.id}, falling back to photographic backdrop`);
            setVideoFailed(true);
          }}
        />
      ) : (
        <div
          className="tv-screensaver-video tv-screensaver-photo-fallback"
          style={{ backgroundImage: `url(${currentShot.fallbackImageUrl})` }}
        />
      )}

      {/* Cinematic Vignette Overlay */}
      <div className="tv-screensaver-scrim" />

      {/* Ambient Info HUD */}
      <div className="tv-screensaver-content">
        {/* Big Clock */}
        <div className="tv-screensaver-clock-box">
          <h1 className="tv-screensaver-time">{timeStr}</h1>
          <p className="tv-screensaver-date">{dateStr}</p>
        </div>

        {/* Location, Ambient Lighting & Audio Info */}
        <div className="tv-screensaver-bottom-bar">
          <div className="tv-screensaver-location-pill">
            <MapPin size={16} />
            <span>{currentShot.title} • {currentShot.location}</span>
          </div>

          <div className="tv-screensaver-ambient-pill">
            <Sun size={16} />
            <span>Ambient Smart Lighting {ambientIntensity}%</span>
          </div>

          {nowPlayingTitle && (
            <div className="tv-screensaver-ambient-pill">
              <MusicIcon size={16} />
              <span>{nowPlayingTitle}</span>
            </div>
          )}

          <span className="tv-screensaver-hint">Press any button on your remote to wake</span>
        </div>
      </div>
    </div>
  );
};
