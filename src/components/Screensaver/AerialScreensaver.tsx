import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Key, Users, ArrowLeft, Lock } from 'lucide-react';
import { profileService } from '../../services/profile/ProfileService';
import { UserProfile } from '../../types/profile';
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
  const [profiles, setProfiles] = useState<UserProfile[]>(() => profileService.getProfiles());
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(() => profileService.getActiveProfile());
  const [isUserPickerOpen, setIsUserPickerOpen] = useState<boolean>(false);
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

  // Sync profiles and active profile
  useEffect(() => {
    if (!isActive) return;
    const unsubProfile = profileService.subscribe((state) => {
      setProfiles(state.profiles);
      const active = state.profiles.find((p) => p.id === state.activeProfileId);
      if (active) {
        setSelectedProfile((prev) => state.profiles.find((p) => p.id === prev.id) || active);
      }
    });
    return unsubProfile;
  }, [isActive]);

  // Focus and clear input when screensaver becomes active
  useEffect(() => {
    if (isActive) {
      setPassword('');
      setErrorMsg(null);
      setIsShaking(false);
      setIsUserPickerOpen(false);
      setSelectedProfile(profileService.getActiveProfile());
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

  // Handle switching to a specific user profile
  const handleSelectUser = (prof: UserProfile) => {
    setSelectedProfile(prof);
    setPassword('');
    setErrorMsg(null);
    setIsShaking(false);
    setIsUserPickerOpen(false);

    if (!prof.pin) {
      // Direct login for unpinned profiles
      profileService.setActiveProfile(prof.id);
      onWake();
    } else {
      // Focus password field for PIN-protected profiles
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  // Password Unlock Submission Handler
  const handleUnlockSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const targetPin = selectedProfile?.pin?.trim();

      if (targetPin) {
        if (password.trim() === targetPin) {
          profileService.setActiveProfile(selectedProfile.id, password.trim());
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
        // No PIN configured on profile: log in directly
        profileService.setActiveProfile(selectedProfile.id);
        onWake();
      }
    },
    [selectedProfile, password, onWake]
  );

  // Global Keydown Handler: redirect keystrokes to password input & support Enter / Escape
  useEffect(() => {
    if (!isActive) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (isUserPickerOpen) {
          // If in user picker and pressing enter, select currently focused or selected profile
          handleSelectUser(selectedProfile);
        } else {
          handleUnlockSubmit();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isUserPickerOpen) {
          setIsUserPickerOpen(false);
          setTimeout(() => inputRef.current?.focus(), 80);
        } else if (profiles.length > 1) {
          setIsUserPickerOpen(true);
        } else if (!selectedProfile?.pin) {
          onWake();
        } else {
          setPassword('');
          setErrorMsg(null);
        }
        return;
      }

      // If user picker is closed and typing printable characters, focus password input
      if (!isUserPickerOpen && document.activeElement !== inputRef.current) {
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isActive, isUserPickerOpen, selectedProfile, profiles.length, handleUnlockSubmit, onWake]);

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.tv-macos-lock-input-pill') ||
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('.tv-macos-user-card')
    ) {
      return;
    }

    if (isUserPickerOpen) {
      setIsUserPickerOpen(false);
      setTimeout(() => inputRef.current?.focus(), 80);
      return;
    }

    if (!selectedProfile?.pin) {
      onWake();
    } else {
      inputRef.current?.focus();
    }
  };

  if (!isActive) return null;

  const currentShot = AERIAL_SHOTS[currentIndex];
  const displayName = selectedProfile?.name || 'Primary User';
  const avatarColor = selectedProfile?.avatarColor || 'linear-gradient(135deg, #e50914, #ff453a)';
  const avatarIcon = selectedProfile?.avatarIcon || 'user';

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
        {/* Hero Clock & Date */}
        <main className="tv-macos-lock-center">
          <div className="tv-macos-lock-clock-box">
            <div className="tv-macos-lock-date">{dateStr}</div>
            <h1 className="tv-macos-lock-time">{timeStr}</h1>
          </div>

          {!isUserPickerOpen ? (
            /* 1. Selected User Login Card */
            <div className="tv-macos-lock-auth-pod">
              <div
                className="tv-macos-lock-avatar"
                style={{ background: avatarColor }}
                onClick={() => {
                  if (profiles.length > 1) {
                    setIsUserPickerOpen(true);
                  } else if (!selectedProfile?.pin) {
                    onWake();
                  } else {
                    inputRef.current?.focus();
                  }
                }}
                title={profiles.length > 1 ? `Switch User (${displayName})` : displayName}
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
                    placeholder={selectedProfile?.pin ? 'Enter PIN or Password' : 'Enter Password'}
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
                    {selectedProfile?.pin
                      ? 'Enter password and press Return to unlock'
                      : 'Press Return or click to unlock'}
                  </div>
                )}
              </form>

              {/* Switch User Button (visible when multiple profiles exist) */}
              {profiles.length > 1 && (
                <button
                  type="button"
                  className="tv-macos-switch-user-btn"
                  onClick={() => setIsUserPickerOpen(true)}
                  title="Select user login"
                >
                  <Users size={13} />
                  <span>Switch User</span>
                </button>
              )}
            </div>
          ) : (
            /* 2. Select User Login Picker (macOS Sonoma Multi-User Grid) */
            <div className="tv-macos-lock-auth-pod tv-macos-user-picker-pod">
              <div className="tv-macos-user-picker-title">Select User to Log In</div>
              <div className="tv-macos-user-picker-grid">
                {profiles.map((prof) => {
                  const isSelected = prof.id === selectedProfile?.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      className={`tv-macos-user-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectUser(prof)}
                      title={`Log in as ${prof.name}`}
                    >
                      <div className="tv-macos-user-card-avatar-wrapper">
                        <div
                          className="tv-macos-user-card-avatar"
                          style={{ background: prof.avatarColor }}
                        >
                          {renderAvatarIcon(prof.avatarIcon || 'user', 32, '#ffffff')}
                        </div>
                        {prof.pin && (
                          <div className="tv-macos-user-card-lock-badge" title="PIN Protected">
                            <Lock size={9} />
                          </div>
                        )}
                      </div>
                      <span className="tv-macos-user-card-name">{prof.name}</span>
                      <span className="tv-macos-user-card-badge">{prof.badge}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="tv-macos-user-picker-back"
                onClick={() => {
                  setIsUserPickerOpen(false);
                  setTimeout(() => inputRef.current?.focus(), 80);
                }}
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
