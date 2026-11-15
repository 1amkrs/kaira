import React, { useState, useEffect } from 'react';
import {
  PictureInPicture2,
  Users,
  Volume2,
  VolumeX,
  Check,
  ArrowRight,
  ArrowLeft,
  Plus,
  Play,
  Compass,
  Sliders,
} from 'lucide-react';
import { platform } from '../../platform';
import { profileService, AVATAR_COLOR_PALETTES } from '../../services/profile/ProfileService';
import { displayService } from '../../services/display/displayService';
import { soundEffectsService } from '../../services/audio/soundEffectsService';
import { screensaverService } from '../../services/screensaver/screensaverService';
import { renderAvatarIcon } from '../Profile/PinModal';
import { UserProfile } from '../../types/profile';
import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  prevOnboardingStep,
  markAndroidOnboardingCompleted,
} from './onboardingState';
import './AndroidOnboarding.css';

interface AndroidOnboardingProps {
  onComplete: () => void;
  onProfileChanged?: (profile: UserProfile) => void;
}

export const AndroidOnboarding: React.FC<AndroidOnboardingProps> = ({
  onComplete,
  onProfileChanged,
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [profiles, setProfiles] = useState<UserProfile[]>(() => profileService.getProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => profileService.getActiveProfile().id);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [selectedColorIdx, setSelectedColorIdx] = useState<number>(2);

  const [resolution, setResolution] = useState<'auto' | '1080p' | '1440p' | '4k'>(
    () => displayService.getSettings().resolution
  );
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => soundEffectsService.getEnabled());
  const [screensaverMinutes, setScreensaverMinutes] = useState<number>(() => screensaverService.getState().timeoutMinutes);

  const isTV = platform.isAndroidTV;
  const currentStep = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0];
  const isLastStep = stepIndex >= ONBOARDING_STEPS.length - 1;

  const finishOnboarding = () => {
    markAndroidOnboardingCompleted();
    onComplete();
  };

  // Handle Escape / Back keyboard key cleanly during onboarding
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (isInput) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (stepIndex > 0) {
          setStepIndex((prev) => prevOnboardingStep(prev));
        } else {
          finishOnboarding();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepIndex]);

  const handleSelectProfile = (prof: UserProfile) => {
    const res = profileService.setActiveProfile(prof.id);
    if (res.success) {
      setActiveProfileId(prof.id);
      onProfileChanged?.(prof);
    }
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    const created = profileService.createProfile({
      name: trimmed,
      avatarColor: AVATAR_COLOR_PALETTES[selectedColorIdx] || AVATAR_COLOR_PALETTES[0],
      avatarIcon: 'user',
      type: 'adult',
    });
    profileService.setActiveProfile(created.id);
    setProfiles(profileService.getProfiles());
    setActiveProfileId(created.id);
    onProfileChanged?.(created);
    setNewProfileName('');
    setShowCreateForm(false);
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  return (
    <div
      className="kaira-onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Kaira Android Initial Setup"
      data-testid="android-onboarding-dialog"
    >
      <div className="kaira-onboarding-card">
        {/* Top Bar with Step Indicator & Skip */}
        <header className="kaira-onboarding-header">
          <div className="kaira-onboarding-brand">
            <div className="kaira-onboarding-emblem" aria-hidden="true">K</div>
            <div className="kaira-onboarding-brand-meta">
              <span className="kaira-onboarding-badge">
                {isTV ? 'Kaira for Android TV' : 'Kaira for Android'}
              </span>
              <span className="kaira-onboarding-step-label">
                Step {currentStep.stepNumber} of {ONBOARDING_STEPS.length}
              </span>
            </div>
          </div>

          <div className="kaira-onboarding-progress-track" aria-hidden="true">
            {ONBOARDING_STEPS.map((s, idx) => (
              <div
                key={s.id}
                className={`kaira-onboarding-progress-seg ${idx <= stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>

          <button
            type="button"
            className="kaira-onboarding-skip-btn"
            onClick={finishOnboarding}
            data-testid="onboarding-skip-btn"
          >
            Skip
          </button>
        </header>

        {/* Scrollable Step Content */}
        <div className="kaira-onboarding-body">
          <div className="kaira-onboarding-heading">
            <h1 className="kaira-onboarding-title">
              {currentStep.id === 'welcome'
                ? isTV
                  ? 'Welcome to Kaira on Android TV'
                  : 'Welcome to Kaira for Android'
                : currentStep.title}
            </h1>
            <p className="kaira-onboarding-subtitle">{currentStep.subtitle}</p>
          </div>

          {/* STEP 1: WELCOME */}
          {currentStep.id === 'welcome' && (
            <div className="kaira-onboarding-checklist" role="list">
              <div className="kaira-onboarding-check-row" role="listitem">
                <span className="kaira-onboarding-check-num">1</span>
                <div className="kaira-onboarding-check-text">
                  <span className="kaira-onboarding-check-title">Select or create a profile</span>
                  <span className="kaira-onboarding-check-desc">
                    Keep watch history, library items, and optional PIN locks separate.
                  </span>
                </div>
              </div>

              <div className="kaira-onboarding-check-row" role="listitem">
                <span className="kaira-onboarding-check-num">2</span>
                <div className="kaira-onboarding-check-text">
                  <span className="kaira-onboarding-check-title">Set display &amp; audio defaults</span>
                  <span className="kaira-onboarding-check-desc">
                    Match stream resolution, interface sounds, and screensaver timing.
                  </span>
                </div>
              </div>

              <div className="kaira-onboarding-check-row" role="listitem">
                <span className="kaira-onboarding-check-num">3</span>
                <div className="kaira-onboarding-check-text">
                  <span className="kaira-onboarding-check-title">
                    {isTV ? 'Review TV remote & gamepad controls' : 'Review touch & playback gestures'}
                  </span>
                  <span className="kaira-onboarding-check-desc">
                    {isTV
                      ? 'Navigate rails and player overlays with your D-pad or controller.'
                      : 'Browse tabs from the bottom bar and swipe rails or hero slides.'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PROFILE */}
          {currentStep.id === 'profile' && (
            <>
              <div className="kaira-onboarding-profiles-grid">
                {profiles.map((prof) => {
                  const isSelected = prof.id === activeProfileId;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      className={`kaira-onboarding-profile-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectProfile(prof)}
                    >
                      <div
                        className="kaira-onboarding-profile-avatar"
                        style={{ background: prof.avatarColor }}
                      >
                        {renderAvatarIcon(prof.avatarIcon || 'user', 20, '#ffffff')}
                      </div>
                      <div className="kaira-onboarding-profile-info">
                        <span className="kaira-onboarding-profile-name">{prof.name}</span>
                        <span className="kaira-onboarding-profile-badge">{prof.badge}</span>
                      </div>
                      {isSelected && <Check size={18} color="#a8c7fa" />}
                    </button>
                  );
                })}

                {!showCreateForm && (
                  <button
                    type="button"
                    className="kaira-onboarding-profile-btn"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <div
                      className="kaira-onboarding-profile-avatar"
                      style={{ background: 'rgba(168, 199, 250, 0.18)', color: '#a8c7fa' }}
                    >
                      <Plus size={20} />
                    </div>
                    <div className="kaira-onboarding-profile-info">
                      <span className="kaira-onboarding-profile-name">New Profile</span>
                      <span className="kaira-onboarding-profile-badge">Personalize name & look</span>
                    </div>
                  </button>
                )}
              </div>

              {showCreateForm && (
                <form className="kaira-onboarding-create-box" onSubmit={handleCreateProfile}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Create a Profile</span>
                  <div className="kaira-onboarding-create-row">
                    <input
                      type="text"
                      className="kaira-onboarding-input"
                      placeholder="Enter profile name..."
                      maxLength={24}
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="kaira-onboarding-chip active">
                      Save
                    </button>
                    <button
                      type="button"
                      className="kaira-onboarding-chip"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="kaira-onboarding-chip-group">
                    {AVATAR_COLOR_PALETTES.slice(0, 6).map((grad, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Select color swatch ${idx + 1}`}
                        onClick={() => setSelectedColorIdx(idx)}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: grad,
                          border: selectedColorIdx === idx ? '2.5px solid #e8eefc' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </form>
              )}
            </>
          )}

          {/* STEP 3: DISPLAY & AUDIO */}
          {currentStep.id === 'experience' && (
            <div className="kaira-onboarding-settings-list">
              <div className="kaira-onboarding-setting-card">
                <div className="kaira-onboarding-setting-meta">
                  <span className="kaira-onboarding-setting-title">Target Display Resolution</span>
                  <span className="kaira-onboarding-setting-desc">Matches stream selection to your screen</span>
                </div>
                <div className="kaira-onboarding-chip-group">
                  {(['auto', '1080p', '1440p', '4k'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      className={`kaira-onboarding-chip ${resolution === res ? 'active' : ''}`}
                      onClick={() => {
                        displayService.setResolution(res);
                        setResolution(res);
                      }}
                    >
                      {res === 'auto' ? 'Auto' : res.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="kaira-onboarding-setting-card">
                <div className="kaira-onboarding-setting-meta">
                  <span className="kaira-onboarding-setting-title">Interface Navigation Chimes</span>
                  <span className="kaira-onboarding-setting-desc">Subtle audio feedback when browsing menus</span>
                </div>
                <div className="kaira-onboarding-chip-group">
                  <button
                    type="button"
                    className={`kaira-onboarding-chip ${sfxEnabled ? 'active' : ''}`}
                    onClick={() => {
                      soundEffectsService.setEnabled(true);
                      setSfxEnabled(true);
                    }}
                  >
                    <Volume2 size={15} />
                    <span>Enabled</span>
                  </button>
                  <button
                    type="button"
                    className={`kaira-onboarding-chip ${!sfxEnabled ? 'active' : ''}`}
                    onClick={() => {
                      soundEffectsService.setEnabled(false);
                      setSfxEnabled(false);
                    }}
                  >
                    <VolumeX size={15} />
                    <span>Muted</span>
                  </button>
                </div>
              </div>

              <div className="kaira-onboarding-setting-card">
                <div className="kaira-onboarding-setting-meta">
                  <span className="kaira-onboarding-setting-title">4K Aerial Screensaver</span>
                  <span className="kaira-onboarding-setting-desc">Launch ambient photography after idle period</span>
                </div>
                <div className="kaira-onboarding-chip-group">
                  {[
                    { label: '2m', value: 2 },
                    { label: '5m', value: 5 },
                    { label: '10m', value: 10 },
                    { label: 'Never', value: 0 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`kaira-onboarding-chip ${screensaverMinutes === opt.value ? 'active' : ''}`}
                      onClick={() => {
                        screensaverService.setTimeoutMinutes(opt.value);
                        setScreensaverMinutes(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: CONTROLS & SUMMARY */}
          {currentStep.id === 'controls' && (
            <>
              <div className="kaira-onboarding-controls-grid">
                {isTV ? (
                  <>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key">D-Pad</span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Browse Rails & Cards</span>
                        <span className="kaira-onboarding-setting-desc">Move focus smoothly across menus</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key">OK / B</span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Select or Go Back</span>
                        <span className="kaira-onboarding-setting-desc">Open details or step backward</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key">Y</span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Instant Search</span>
                        <span className="kaira-onboarding-setting-desc">Find movies, shows, and tracks</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key">Menu</span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Quick Settings</span>
                        <span className="kaira-onboarding-setting-desc">Adjust volume, display & sleep timer</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key"><Compass size={18} /></span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Bottom Destination Bar</span>
                        <span className="kaira-onboarding-setting-desc">Switch Home, Movies, Shows, Music & Library</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key"><Play size={18} /></span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Swipe & Tap Playback</span>
                        <span className="kaira-onboarding-setting-desc">Swipe featured hero cards & scroll horizontal rails</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key"><Sliders size={18} /></span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Addons & Preferences</span>
                        <span className="kaira-onboarding-setting-desc">Replay this setup anytime under Settings → System</span>
                      </div>
                    </div>
                    <div className="kaira-onboarding-control-item">
                      <span className="kaira-onboarding-control-key"><PictureInPicture2 size={18} /></span>
                      <div className="kaira-onboarding-setting-meta" style={{ minWidth: 0 }}>
                        <span className="kaira-onboarding-setting-title">Background Mini-Player</span>
                        <span className="kaira-onboarding-setting-desc">Keep listening or minimize video into PiP</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="kaira-onboarding-summary-banner">
                <Check size={18} color="#81c995" />
                <span>
                  Ready for <strong>{activeProfile?.name || 'Primary'}</strong> • {resolution.toUpperCase()} Output • UI Sounds {sfxEnabled ? 'On' : 'Muted'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Bottom Navigation Actions */}
        <footer className="kaira-onboarding-footer">
          {stepIndex > 0 ? (
            <button
              type="button"
              className="kaira-onboarding-btn-secondary"
              onClick={() => setStepIndex((prev) => prevOnboardingStep(prev))}
              data-testid="onboarding-back-btn"
            >
              <ArrowLeft size={17} />
              <span>Back</span>
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant, #9aa0a6)' }}>
              You can adjust these anytime in Settings.
            </span>
          )}

          {isLastStep ? (
            <button
              type="button"
              className="kaira-onboarding-btn-primary"
              onClick={finishOnboarding}
              data-testid="onboarding-finish-btn"
            >
              <Play size={16} fill="currentColor" />
              <span>Start Watching</span>
            </button>
          ) : (
            <button
              type="button"
              className="kaira-onboarding-btn-primary"
              onClick={() => setStepIndex((prev) => nextOnboardingStep(prev))}
              data-testid="onboarding-next-btn"
            >
              <span>Continue</span>
              <ArrowRight size={17} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
