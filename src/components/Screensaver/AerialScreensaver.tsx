import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, 
  Wifi, 
  Battery, 
  SlidersHorizontal, 
  MapPin, 
  Music as MusicIcon, 
  ArrowRight, 
  Key, 
  Power 
} from 'lucide-react';
import { playbackService } from '../../services/playback/PlaybackService';
import { profileService } from '../../services/profile/ProfileService';
import { renderAvatarIcon } from '../Profile/PinModal';
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
    id: 'sonoma',
    title: 'Sonoma Rolling Hills',
    location: 'California, USA',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-green-hills-and-mountains-41508-large.mp4',
    fallbackImageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=3840&q=85',
  },
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
  const [videoFailed, setVideoFailed] = useState<boolean>(false);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState(() => profileService.getActiveProfile());

  // Push spatial navigation scope to isolate focus while screensaver is showing
  useEffect(() => {
    if (!isActive) return;
    spatialNav.pushScope('screensaver-scope');
    return () => {
      spatialNav.popScope('screensaver-scope');
    };
  }, [isActive]);

  // Sync active profile
  useEffect(() => {
    if (!isActive) return;
    const unsubProfile = profileService.subscribe(() => {
      setActiveProfile(profileService.getActiveProfile());
    });
    return unsubProfile;
  }, [isActive]);

  // Clock & Date updates (macOS Sonoma lockscreen typography)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours() % 12 || 12;
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}`);
      setDateStr(
        now.toLocaleDateString('en-US', {
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

  // Cycle aerial shots every 40 seconds
  useEffect(() => {
    if (!isActive) return;
    const cycle = setInterval(() => {
      setVideoFailed(false);
      setCurrentIndex((prev) => (prev + 1) % AERIAL_SHOTS.length);
    }, 40000);
    return () => clearInterval(cycle);
  }, [isActive]);

  // Read background audio status
  useEffect(() => {
    if (isActive) {
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
  const displayName = activeProfile?.name || 'Primary User';
  const avatarColor = activeProfile?.avatarColor || 'linear-gradient(135deg, #e50914, #ff453a)';
  const avatarIcon = activeProfile?.avatarIcon || 'user';

  return (
    <div
      className="tv-screensaver-container tv-macos-lockscreen"
      role="presentation"
      onClick={handleInteraction}
    >
      {/* 4K Aerial Video Layer or High-Res Photographic Fallback (Sonoma signature) */}
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

      {/* macOS Lockscreen Shell */}
      <div className="tv-macos-lock-content">
        {/* 1. Top Status Bar (macOS Sonoma header) */}
        <header className="tv-macos-lock-topbar">
          <div className="tv-macos-lock-topbar-left">
            <div className="tv-macos-lock-badge">
              <Lock size={13} className="tv-macos-lock-icon" />
              <span className="tv-macos-lock-badge-text">tvOS</span>
            </div>
          </div>

          <div className="tv-macos-lock-topbar-right">
            <div className="tv-macos-status-item" title="Wi-Fi Connected">
              <Wifi size={15} />
            </div>
            <div className="tv-macos-status-item" title="Control Center">
              <SlidersHorizontal size={14} />
            </div>
            <div className="tv-macos-status-item tv-macos-battery" title="Power: 100%">
              <span className="tv-macos-battery-pct">100%</span>
              <Battery size={16} />
            </div>
          </div>
        </header>

        {/* 2. Hero Clock & Date (macOS Sonoma centered layout) */}
        <main className="tv-macos-lock-center">
          <div className="tv-macos-lock-clock-box">
            <div className="tv-macos-lock-date">{dateStr}</div>
            <h1 className="tv-macos-lock-time">{timeStr}</h1>
          </div>

          {/* 3. User Login & Unlock Card (macOS avatar + frosted password pill) */}
          <div className="tv-macos-lock-auth-pod">
            <div
              className="tv-macos-lock-avatar"
              style={{ background: avatarColor }}
            >
              {renderAvatarIcon(avatarIcon, 38, '#ffffff')}
            </div>
            <div className="tv-macos-lock-username">{displayName}</div>

            {/* Frosted Password Pill */}
            <div className="tv-macos-lock-input-pill" onClick={handleInteraction}>
              <div className="tv-macos-lock-pill-icon">
                <Key size={14} />
              </div>
              <span className="tv-macos-lock-pill-placeholder">
                Touch ID or Enter Password
              </span>
              <button
                type="button"
                className="tv-macos-lock-pill-btn"
                aria-label="Unlock"
                onClick={handleInteraction}
              >
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            </div>

            <div className="tv-macos-lock-wake-hint">
              Click or press any key to unlock
            </div>
          </div>
        </main>

        {/* 4. Bottom Footer (macOS Sonoma Aerial Location + Now Playing / Sleep) */}
        <footer className="tv-macos-lock-footer">
          <div className="tv-macos-lock-footer-left">
            <div className="tv-macos-pill tv-macos-location-pill">
              <MapPin size={13} />
              <span>{currentShot.title} • {currentShot.location}</span>
            </div>
          </div>

          <div className="tv-macos-lock-footer-right">
            {nowPlayingTitle && (
              <div className="tv-macos-pill tv-macos-nowplaying-pill">
                <MusicIcon size={13} className="music-pulse" />
                <span className="tv-macos-nowplaying-title">{nowPlayingTitle}</span>
              </div>
            )}
            <div className="tv-macos-pill tv-macos-action-pill" onClick={handleInteraction}>
              <Power size={13} />
              <span>Sleep</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
