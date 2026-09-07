import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Key } from 'lucide-react';
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
  const [activeProfile, setActiveProfile] = useState(() => profileService.getActiveProfile());
  const [password, setPassword] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus and clear input when screensaver becomes active
  useEffect(() => {
    if (isActive) {
      setPassword('');
      setErrorMsg(null);
      setIsShaking(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
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

  // Password Unlock Submission Handler
  const handleUnlockSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const targetPin = activeProfile?.pin?.trim();

      if (targetPin) {
        if (password.trim() === targetPin) {
          profileService.unlockProfileSession(activeProfile.id);
          onWake();
        } else {
          setIsShaking(true);
          setErrorMsg('Incorrect Password');
          setPassword('');
          setTimeout(() => {
            setIsShaking(false);
            inputRef.current?.focus();
          }, 450);
        }
      } else {
        // No PIN configured on profile: unlock directly
        onWake();
      }
    },
    [activeProfile, password, onWake]
  );

  // Global Keydown Handler: redirect keystrokes to password input & support Enter / Escape
  useEffect(() => {
    if (!isActive) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleUnlockSubmit();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!activeProfile?.pin) {
          onWake();
        } else {
          setPassword('');
          setErrorMsg(null);
        }
        return;
      }

      // If typing printable characters or backspace while input is not focused, focus it
      if (document.activeElement !== inputRef.current) {
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isActive, activeProfile, handleUnlockSubmit, onWake]);

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    // If clicked on input or button, let native action proceed
    if ((e.target as HTMLElement).closest('.tv-macos-lock-input-pill') || (e.target as HTMLElement).closest('button')) {
      return;
    }

    if (!activeProfile?.pin) {
      onWake();
    } else {
      inputRef.current?.focus();
    }
  };

  if (!isActive) return null;

  const currentShot = AERIAL_SHOTS[currentIndex];
  const displayName = activeProfile?.name || 'Primary User';
  const avatarColor = activeProfile?.avatarColor || 'linear-gradient(135deg, #e50914, #ff453a)';
  const avatarIcon = activeProfile?.avatarIcon || 'user';

  return (
    <div
      className="tv-screensaver-container tv-macos-lockscreen"
      role="presentation"
      onClick={handleBackdropClick}
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

      {/* macOS Lockscreen Shell (Distraction-Free Centered Layout) */}
      <div className="tv-macos-lock-content">
        {/* Hero Clock & Date + User Auth Pod */}
        <main className="tv-macos-lock-center">
          <div className="tv-macos-lock-clock-box">
            <div className="tv-macos-lock-date">{dateStr}</div>
            <h1 className="tv-macos-lock-time">{timeStr}</h1>
          </div>

          <div className="tv-macos-lock-auth-pod">
            <div
              className="tv-macos-lock-avatar"
              style={{ background: avatarColor }}
              onClick={() => {
                if (!activeProfile?.pin) {
                  onWake();
                } else {
                  inputRef.current?.focus();
                }
              }}
              title={displayName}
            >
              {renderAvatarIcon(avatarIcon, 38, '#ffffff')}
            </div>
            <div className="tv-macos-lock-username">{displayName}</div>

            {/* Typable Frosted Password Form & Pill */}
            <form onSubmit={handleUnlockSubmit} className="tv-macos-lock-form">
              <div
                className={`tv-macos-lock-input-pill ${isShaking ? 'shake-anim' : ''}`}
                onClick={() => inputRef.current?.focus()}
              >
                <div className="tv-macos-lock-pill-icon">
                  <Key size={14} />
                </div>
                <input
                  ref={inputRef}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder={activeProfile?.pin ? 'Enter PIN or Password' : 'Enter Password'}
                  className={`tv-macos-lock-input-field ${password ? 'has-text' : ''}`}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="submit"
                  className={`tv-macos-lock-pill-btn ${password ? 'active' : ''}`}
                  aria-label="Unlock"
                >
                  <ArrowRight size={13} strokeWidth={2.5} />
                </button>
              </div>

              {errorMsg ? (
                <div className="tv-macos-lock-error-hint">{errorMsg}</div>
              ) : (
                <div className="tv-macos-lock-wake-hint">
                  {activeProfile?.pin
                    ? 'Enter password and press Return to unlock'
                    : 'Press Return or click to unlock'}
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};
