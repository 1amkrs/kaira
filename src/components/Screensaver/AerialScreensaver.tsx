import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Sparkles, Sun } from 'lucide-react';
import { ambientService } from '../../services/ambient/ambientService';
import './AerialScreensaver.css';

interface AerialScreensaverProps {
  isActive: boolean;
  onWake: () => void;
}

const AERIAL_VIDEOS = [
  {
    title: 'Dubai Skyline & Marina at Night',
    location: 'United Arab Emirates',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-city-traffic-at-night-42173-large.mp4',
    posterUrl: 'https://images.metahub.space/background/medium/tt0816692/img',
  },
  {
    title: 'Glacial Fjords & Northern Lights',
    location: 'Tromsø, Norway',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-snow-capped-mountains-41477-large.mp4',
    posterUrl: 'https://images.metahub.space/background/medium/tt15239678/img',
  },
  {
    title: 'Tokyo Neon Shinjuku District',
    location: 'Tokyo, Japan',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-night-skyline-of-a-big-city-42171-large.mp4',
    posterUrl: 'https://images.metahub.space/background/medium/tt1856101/img',
  },
];

export const AerialScreensaver: React.FC<AerialScreensaverProps> = ({ isActive, onWake }) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [ambientIntensity, setAmbientIntensity] = useState<number>(80);

  // Clock Timer
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

  // Cycle video every 35 seconds
  useEffect(() => {
    if (!isActive) return;
    const cycle = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % AERIAL_VIDEOS.length);
    }, 35000);
    return () => clearInterval(cycle);
  }, [isActive]);

  // Read ambient light status
  useEffect(() => {
    if (isActive) {
      setAmbientIntensity(ambientService.getState().intensity);
    }
  }, [isActive]);

  // Wake listener for any interaction
  useEffect(() => {
    if (!isActive) return;

    const handleInteraction = () => {
      onWake();
    };

    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('pointerdown', handleInteraction);
    return () => {
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('pointerdown', handleInteraction);
    };
  }, [isActive, onWake]);

  if (!isActive) return null;

  const currentShot = AERIAL_VIDEOS[currentIndex];

  return (
    <div className="tv-screensaver-container" role="presentation" onClick={onWake}>
      {/* 4K Aerial Video Layer */}
      <video
        key={currentShot.videoUrl}
        src={currentShot.videoUrl}
        poster={currentShot.posterUrl}
        autoPlay
        loop
        muted
        playsInline
        className="tv-screensaver-video"
      />

      {/* Cinematic Vignette Overlay */}
      <div className="tv-screensaver-scrim" />

      {/* Ambient Info HUD */}
      <div className="tv-screensaver-content">
        {/* Big Clock */}
        <div className="tv-screensaver-clock-box">
          <h1 className="tv-screensaver-time">{timeStr}</h1>
          <p className="tv-screensaver-date">{dateStr}</p>
        </div>

        {/* Location & Smart Bulbs Status */}
        <div className="tv-screensaver-bottom-bar">
          <div className="tv-screensaver-location-pill">
            <MapPin size={16} />
            <span>{currentShot.title} • {currentShot.location}</span>
          </div>

          <div className="tv-screensaver-ambient-pill">
            <Sun size={16} />
            <span>Ambient Smart Lighting {ambientIntensity}%</span>
          </div>

          <span className="tv-screensaver-hint">Press any button on your remote to wake</span>
        </div>
      </div>
    </div>
  );
};
