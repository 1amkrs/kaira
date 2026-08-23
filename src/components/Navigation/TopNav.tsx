import React, { useState, useEffect } from 'react';
import { Search, Settings, Lock, Moon } from 'lucide-react';
import { NavigationTab, ScreenId } from '../../types';
import { UserProfile } from '../../types/profile';
import { Focusable } from '../Focusable/Focusable';
import { renderAvatarIcon } from '../Profile/PinModal';
import { sleepTimerService, SleepTimerState } from '../../services/sleep/sleepTimerService';
import './TopNav.css';

interface TopNavProps {
  activeScreen: ScreenId;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onOpenSleepTimer?: () => void;
  activeProfile?: UserProfile;
  activeProfileName?: string;
}

const TABS: { id: NavigationTab; label: string }[] = [
  { id: 'for-you', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'shows', label: 'Shows' },
  { id: 'music', label: 'Music' },
  { id: 'games', label: 'Games' },
  { id: 'library', label: 'My Library' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeScreen,
  onSelectTab,
  onOpenSearch,
  onOpenSettings,
  onOpenProfile,
  onOpenSleepTimer,
  activeProfile,
  activeProfileName = 'Primary',
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [sleepState, setSleepState] = useState<SleepTimerState>(() => sleepTimerService.getState());

  useEffect(() => {
    const unsub = sleepTimerService.subscribe(setSleepState);
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 10000);
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);

  const displayName = activeProfile?.name || activeProfileName;
  const avatarColor = activeProfile?.avatarColor || 'linear-gradient(135deg, #1a73e8, #4285f4)';
  const avatarIcon = activeProfile?.avatarIcon || 'user';
  const hasPin = Boolean(activeProfile?.pin);

  return (
    <header className="tv-topnav-container" role="navigation" aria-label="Main Navigation">
      {/* Left Cluster: Profile + Nav Capsule + Actions Capsule */}
      <div className="tv-gtv-left-cluster">
        {/* 1. Profile Avatar */}
        {onOpenProfile && (
          <Focusable
            id="nav-profile-btn"
            groupId="top-nav"
            indexInGroup={0}
            className="tv-gtv-profile-focusable"
            onSelect={onOpenProfile}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div
                className={`tv-gtv-avatar-btn ${isFocused ? 'focused' : ''}`}
                title={`Profile: ${displayName}`}
              >
                <div
                  className="tv-gtv-avatar-fallback"
                  style={{ background: avatarColor }}
                >
                  {renderAvatarIcon(avatarIcon, 20, '#ffffff')}
                </div>
                {hasPin && (
                  <div className="tv-gtv-avatar-lock" title="PIN Protected">
                    <Lock size={8} color="#ffffff" />
                  </div>
                )}
              </div>
            )}
          </Focusable>
        )}

        {/* 2. Main Navigation Capsule (Search + Tabs) */}
        <div className="tv-gtv-nav-capsule" role="tablist">
          {/* Search Icon */}
          <Focusable
            id="nav-search-btn"
            groupId="top-nav"
            indexInGroup={1}
            className="tv-gtv-search-focusable"
            onSelect={onOpenSearch}
            scaleEffect={false}
          >
            {(isFocused) => (
              <div
                className={`tv-gtv-search-btn ${isFocused ? 'focused' : ''}`}
                title="Search (Y)"
              >
                <Search size={19} strokeWidth={2.4} />
              </div>
            )}
          </Focusable>

          {/* Navigation Tabs */}
          {TABS.map((tab, idx) => {
            const isActive = activeScreen === tab.id;
            return (
              <Focusable
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                groupId="top-nav"
                indexInGroup={2 + idx}
                className="tv-gtv-tab-focusable"
                onSelect={() => onSelectTab(tab.id)}
                scaleEffect={false}
              >
                {(isFocused) => (
                  <div
                    className={`tv-gtv-tab-pill ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
                  >
                    <span>{tab.label}</span>
                  </div>
                )}
              </Focusable>
            );
          })}
        </div>

        {/* 3. Action Controls Capsule (Settings & Sleep Timer) */}
        <div className="tv-gtv-actions-capsule">
          {/* Sleep Timer (if active or provided) */}
          {onOpenSleepTimer && (
            <Focusable
              id="nav-sleep-btn"
              groupId="top-nav"
              indexInGroup={2 + TABS.length}
              className="tv-gtv-action-focusable"
              onSelect={onOpenSleepTimer}
              scaleEffect={false}
            >
              {(isFocused) => (
                <div
                  className={`tv-gtv-action-btn ${sleepState.isActive ? 'active-sleep' : ''} ${isFocused ? 'focused' : ''}`}
                  title="Sleep Timer"
                >
                  <Moon size={18} color={sleepState.isActive ? '#8ab4f8' : 'currentColor'} />
                  {sleepState.isActive && (
                    <span className="tv-gtv-sleep-badge">
                      {Math.ceil(sleepState.remainingSeconds / 60)}
                    </span>
                  )}
                </div>
              )}
            </Focusable>
          )}

          {/* Settings */}
          <Focusable
            id="nav-settings-btn"
            groupId="top-nav"
            indexInGroup={2 + TABS.length + (onOpenSleepTimer ? 1 : 0)}
            className="tv-gtv-action-focusable"
            onSelect={onOpenSettings}
            scaleEffect={false}
          >
            {(isFocused) => (
              <div
                className={`tv-gtv-action-btn ${isFocused ? 'focused' : ''}`}
                title="Settings"
              >
                <Settings size={19} strokeWidth={2.2} />
              </div>
            )}
          </Focusable>
        </div>
      </div>

      {/* Right Cluster: Time only (Clean, minimal, no Google TV text) */}
      <div className="tv-gtv-right-cluster">
        {currentTime && <span className="tv-gtv-time">{currentTime}</span>}
      </div>
    </header>
  );
};
