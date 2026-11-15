import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Users,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  MapPin,
  Check,
} from 'lucide-react';
import { profileService } from '../../services/profile/ProfileService';
import { UserProfile } from '../../types/profile';
import { renderAvatarIcon } from '../Profile/PinModal';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { platform } from '../../platform';
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
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-green-hills-and-mountains-41508-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=85',
  },
  {
    id: 'dubai',
    title: 'Dubai Skyline & Marina',
    location: 'United Arab Emirates',
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-city-traffic-at-night-42173-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=2560&q=85',
  },
  {
    id: 'norway',
    title: 'Glacial Fjords & Aurora',
    location: 'Tromsø, Norway',
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-snow-capped-mountains-41477-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=2560&q=85',
  },
  {
    id: 'tokyo',
    title: 'Shinjuku Night Horizon',
    location: 'Tokyo, Japan',
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-night-skyline-of-a-big-city-42171-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=2560&q=85',
  },
  {
    id: 'hawaii',
    title: 'Na Pali Coastline',
    location: 'Kauai, Hawaii',
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2560&q=85',
  },
  {
    id: 'alps',
    title: 'Matterhorn Alpine Peaks',
    location: 'Zermatt, Switzerland',
    videoUrl:
      'https://assets.mixkit.co/videos/preview/mixkit-top-aerial-shot-of-snowy-mountains-41525-large.mp4',
    fallbackImageUrl:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2560&q=85',
  },
];

export const AerialScreensaver: React.FC<AerialScreensaverProps> = ({ isActive, onWake }) => {
  const isAndroid = platform.isAndroid;

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [timeStr, setTimeStr] = useState<string>('');
  const [periodStr, setPeriodStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [videoFailed, setVideoFailed] = useState<boolean>(isAndroid);

  const [profiles, setProfiles] = useState<UserProfile[]>(() => profileService.getProfiles());
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(() =>
    profileService.getActiveProfile()
  );
  const [isUserPickerOpen, setIsUserPickerOpen] = useState<boolean>(false);
  const [pickerFocusedIdx, setPickerFocusedIdx] = useState<number>(0);
  const [actionFocusedIdx, setActionFocusedIdx] = useState<number>(0);

  const [password, setPassword] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const continueBtnRef = useRef<HTMLButtonElement>(null);
  const switchBtnRef = useRef<HTMLButtonElement>(null);

  const hasPin = Boolean(selectedProfile?.pin?.trim());

  // Isolate spatial navigation while Ambient Lockscreen is active
  useEffect(() => {
    if (!isActive) return;
    spatialNav.pushScope('screensaver-scope');
    return () => {
      spatialNav.popScope('screensaver-scope');
    };
  }, [isActive]);

  // Keep profiles synced
  useEffect(() => {
    if (!isActive) return;
    return profileService.subscribe((state) => {
      setProfiles(state.profiles);
      const active = state.profiles.find((p) => p.id === state.activeProfileId);
      if (active) {
        setSelectedProfile((prev) => state.profiles.find((p) => p.id === prev.id) || active);
      }
    });
  }, [isActive]);

  // Reset state & restore initial focus on activation
  useEffect(() => {
    if (!isActive) return;
    const active = profileService.getActiveProfile();
    setSelectedProfile(active);
    setPassword('');
    setShowPin(false);
    setErrorMsg(null);
    setIsShaking(false);
    setIsUserPickerOpen(false);
    setActionFocusedIdx(0);
    setVideoFailed(isAndroid);

    const timer = setTimeout(() => {
      if (active?.pin?.trim()) {
        inputRef.current?.focus();
      } else {
        continueBtnRef.current?.focus();
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [isActive, isAndroid]);

  // Live Clock & Date updates
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const rawHours = now.getHours();
      const hours = rawHours % 12 || 12;
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}`);
      setPeriodStr(rawHours >= 12 ? 'PM' : 'AM');
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

  // Rotate Ambient scenes every 40 seconds
  useEffect(() => {
    if (!isActive) return;
    const cycle = setInterval(() => {
      setVideoFailed(isAndroid);
      setCurrentIndex((prev) => (prev + 1) % AERIAL_SHOTS.length);
    }, 40000);
    return () => clearInterval(cycle);
  }, [isActive, isAndroid]);

  const handleSelectUser = useCallback(
    (prof: UserProfile) => {
      setSelectedProfile(prof);
      setPassword('');
      setShowPin(false);
      setErrorMsg(null);
      setIsShaking(false);
      setIsUserPickerOpen(false);
      setActionFocusedIdx(0);

      if (!prof.pin?.trim()) {
        profileService.setActiveProfile(prof.id);
        onWake();
      } else {
        setTimeout(() => inputRef.current?.focus(), 90);
      }
    },
    [onWake]
  );

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
          setErrorMsg('Incorrect PIN. Please try again.');
          setPassword('');
          setTimeout(() => {
            setIsShaking(false);
            inputRef.current?.focus();
          }, 420);
        }
      } else {
        profileService.setActiveProfile(selectedProfile.id);
        onWake();
      }
    },
    [selectedProfile, password, onWake]
  );

  const openUserPicker = useCallback(() => {
    const idx = Math.max(
      0,
      profiles.findIndex((p) => p.id === selectedProfile?.id)
    );
    setPickerFocusedIdx(idx);
    setIsUserPickerOpen(true);
  }, [profiles, selectedProfile?.id]);

  // Keyboard & D-Pad Navigation inside Ambient Screen
  useEffect(() => {
    if (!isActive) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (isUserPickerOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setPickerFocusedIdx((prev) => (prev + 1) % Math.max(1, profiles.length));
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setPickerFocusedIdx((prev) => (prev - 1 + Math.max(1, profiles.length)) % Math.max(1, profiles.length));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const chosen = profiles[pickerFocusedIdx] || selectedProfile;
          if (chosen) handleSelectUser(chosen);
          return;
        }
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          setIsUserPickerOpen(false);
          setTimeout(() => {
            if (hasPin) inputRef.current?.focus();
            else continueBtnRef.current?.focus();
          }, 80);
          return;
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (profiles.length > 1 && document.activeElement !== inputRef.current) {
          e.preventDefault();
          e.stopPropagation();
          const next = actionFocusedIdx === 0 ? 1 : 0;
          setActionFocusedIdx(next);
          if (next === 0) {
            if (hasPin) inputRef.current?.focus();
            else continueBtnRef.current?.focus();
          } else {
            switchBtnRef.current?.focus();
          }
          return;
        }
      }

      if (e.key === 'Enter') {
        if (document.activeElement === switchBtnRef.current) {
          e.preventDefault();
          e.stopPropagation();
          openUserPicker();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleUnlockSubmit();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!hasPin) {
          onWake();
        } else {
          setPassword('');
          setErrorMsg(null);
        }
        return;
      }

      if (hasPin && document.activeElement !== inputRef.current) {
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    isActive,
    isUserPickerOpen,
    profiles,
    pickerFocusedIdx,
    selectedProfile,
    actionFocusedIdx,
    hasPin,
    handleSelectUser,
    handleUnlockSubmit,
    openUserPicker,
    onWake,
  ]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.tv-ambient-auth-card')) {
      return;
    }

    if (isUserPickerOpen) {
      setIsUserPickerOpen(false);
      setTimeout(() => {
        if (hasPin) inputRef.current?.focus();
        else continueBtnRef.current?.focus();
      }, 80);
      return;
    }

    if (!hasPin) {
      onWake();
    } else {
      inputRef.current?.focus();
    }
  };

  if (!isActive) return null;

  const currentShot = AERIAL_SHOTS[currentIndex];
  const displayName = selectedProfile?.name || 'Primary User';
  const avatarColor = selectedProfile?.avatarColor || 'var(--md-sys-color-primary-container)';
  const avatarIcon = selectedProfile?.avatarIcon || 'user';
  const profileBadge = selectedProfile?.badge?.trim();

  return (
    <div
      className="tv-ambient-container"
      role="dialog"
      aria-modal="true"
      aria-label="Kaira Ambient Lock Screen"
      onClick={handleBackdropClick}
    >
      {/* Full-Bleed Backdrop Layer */}
      {!videoFailed ? (
        <video
          key={currentShot.videoUrl}
          src={currentShot.videoUrl}
          poster={currentShot.fallbackImageUrl}
          autoPlay
          loop
          muted
          playsInline
          className="tv-ambient-media"
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <div
          className="tv-ambient-media tv-ambient-photo-fallback"
          style={{ backgroundImage: `url(${currentShot.fallbackImageUrl})` }}
        />
      )}

      {/* Directional M3 Scrim */}
      <div className="tv-ambient-scrim" aria-hidden="true" />

      {/* Bottom-Anchored Asymmetric Ambient Stage */}
      <div className="tv-ambient-stage">
        {/* Left: Editorial Time, Date & Scene Credit */}
        <div className="tv-ambient-clock-col">
          <div className="tv-ambient-date">{dateStr}</div>
          <h1 className="tv-ambient-time tabular-nums">
            {timeStr}
            <span className="tv-ambient-period">{periodStr}</span>
          </h1>
          <div className="tv-ambient-credit">
            <MapPin size={14} aria-hidden="true" />
            <span>{currentShot.title}</span>
            <span className="tv-meta-dot" aria-hidden="true" />
            <span>{currentShot.location}</span>
          </div>
        </div>

        {/* Right: M3 Tonal Profile & Unlock Card */}
        <div className="tv-ambient-auth-card">
          {!isUserPickerOpen ? (
            <>
              <div className="tv-ambient-profile-row">
                <div
                  className="tv-ambient-avatar"
                  style={{ background: avatarColor }}
                >
                  {renderAvatarIcon(avatarIcon, 24, '#ffffff')}
                  {hasPin && (
                    <span className="tv-ambient-avatar-lock" aria-hidden="true">
                      <Lock size={10} />
                    </span>
                  )}
                </div>

                <div className="tv-ambient-profile-info">
                  <div className="tv-ambient-profile-name">{displayName}</div>
                  <div className="tv-ambient-profile-meta">
                    {profileBadge ? (
                      <>
                        <span>{profileBadge}</span>
                        <span className="tv-meta-dot" aria-hidden="true" />
                      </>
                    ) : null}
                    <span>{hasPin ? 'PIN required to unlock' : 'Ready to resume'}</span>
                  </div>
                </div>
              </div>

              {hasPin ? (
                <form onSubmit={handleUnlockSubmit} className="tv-ambient-form">
                  <div
                    className={`tv-ambient-pin-row ${isShaking ? 'shake-anim' : ''}`}
                    onClick={() => inputRef.current?.focus()}
                  >
                    <Lock size={16} className="tv-ambient-pin-icon" aria-hidden="true" />
                    <input
                      ref={inputRef}
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="Enter profile PIN"
                      aria-label="Enter profile PIN"
                      className="tv-ambient-pin-input tabular-nums"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="tv-ambient-pin-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPin((prev) => !prev);
                        inputRef.current?.focus();
                      }}
                      aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="tv-ambient-error" role="alert">
                      {errorMsg}
                    </div>
                  )}

                  <div className="tv-ambient-actions">
                    <button
                      ref={continueBtnRef}
                      type="submit"
                      className={`tv-ambient-btn-primary ${actionFocusedIdx === 0 ? 'dpad-active' : ''}`}
                    >
                      <span>Unlock</span>
                      <ArrowRight size={17} />
                    </button>

                    {profiles.length > 1 && (
                      <button
                        ref={switchBtnRef}
                        type="button"
                        className={`tv-ambient-btn-secondary ${actionFocusedIdx === 1 ? 'dpad-active' : ''}`}
                        onClick={openUserPicker}
                      >
                        <Users size={16} />
                        <span>Switch Profile</span>
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="tv-ambient-actions">
                  <button
                    ref={continueBtnRef}
                    type="button"
                    className={`tv-ambient-btn-primary ${actionFocusedIdx === 0 ? 'dpad-active' : ''}`}
                    onClick={() => handleUnlockSubmit()}
                  >
                    <span>Continue</span>
                    <ArrowRight size={17} />
                  </button>

                  {profiles.length > 1 && (
                    <button
                      ref={switchBtnRef}
                      type="button"
                      className={`tv-ambient-btn-secondary ${actionFocusedIdx === 1 ? 'dpad-active' : ''}`}
                      onClick={openUserPicker}
                    >
                      <Users size={16} />
                      <span>Switch Profile</span>
                    </button>
                  )}
                </div>
              )}

              <div className="tv-ambient-helper">
                {hasPin
                  ? 'Enter your PIN and select Unlock'
                  : 'Tap Continue or press Enter to resume'}
              </div>
            </>
          ) : (
            <div className="tv-ambient-picker">
              <div className="tv-ambient-picker-header">
                <span className="tv-ambient-picker-title">Switch Profile</span>
                <button
                  type="button"
                  className="tv-ambient-picker-back"
                  onClick={() => {
                    setIsUserPickerOpen(false);
                    setTimeout(() => {
                      if (hasPin) inputRef.current?.focus();
                      else continueBtnRef.current?.focus();
                    }, 80);
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              </div>

              <div className="tv-ambient-picker-list" role="listbox" aria-label="User Profiles">
                {profiles.map((prof, idx) => {
                  const isCurrent = prof.id === selectedProfile?.id;
                  const isHighlighted = idx === pickerFocusedIdx;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`tv-ambient-user-item ${isCurrent ? 'selected' : ''} ${
                        isHighlighted ? 'focused' : ''
                      }`}
                      onClick={() => handleSelectUser(prof)}
                    >
                      <div
                        className="tv-ambient-user-avatar"
                        style={{ background: prof.avatarColor }}
                      >
                        {renderAvatarIcon(prof.avatarIcon || 'user', 20, '#ffffff')}
                      </div>

                      <div className="tv-ambient-user-text">
                        <span className="tv-ambient-user-name">{prof.name}</span>
                        <span className="tv-ambient-user-meta">
                          {prof.badge}
                          {prof.pin && (
                            <>
                              <span className="tv-meta-dot" aria-hidden="true" />
                              <span>PIN Protected</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="tv-ambient-user-trailing" aria-hidden="true">
                        {prof.pin ? (
                          <Lock size={15} />
                        ) : isCurrent ? (
                          <Check size={17} />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
