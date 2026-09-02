import React, { useState, useEffect } from 'react';
import { Search, Settings, Lock, Moon, Home, Film, Tv, Music, Gamepad2, Bookmark, Smartphone, Library as LibraryIcon } from 'lucide-react';
import { NavigationTab, ScreenId } from '../../types';
import { UserProfile } from '../../types/profile';
import { Focusable } from '../Focusable/Focusable';
import { renderAvatarIcon } from '../Profile/PinModal';
import { sleepTimerService, SleepTimerState } from '../../services/sleep/sleepTimerService';
import { remoteService } from '../../services/remote/RemoteService';
import './TopNav.css';

interface TopNavProps {
  activeScreen: ScreenId;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onOpenSleepTimer?: () => void;
  onOpenRemoteModal?: () => void;
  activeProfile?: UserProfile;
  activeProfileName?: string;
}

const TABS: { id: NavigationTab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: 'for-you', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'shows', label: 'Shows', icon: Tv },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'library', label: 'Library', icon: Bookmark },
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
  onOpenRemoteModal,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [sleepState, setSleepState] = useState<SleepTimerState>(() => sleepTimerService.getState());
  const [clientCount, setClientCount] = useState<number>(() => remoteService.getConnectedClients());

  useEffect(() => {
    const unsub = sleepTimerService.subscribe(setSleepState);
    const unsubRemote = remoteService.subscribeClientCount(setClientCount);
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
      unsubRemote();
    };
  }, []);

  const displayName = activeProfile?.name || activeProfileName;
  const avatarColor = activeProfile?.avatarColor || 'linear-gradient(135deg, #e50914, #ff453a)';
  const avatarIcon = activeProfile?.avatarIcon || 'user';
  const hasPin = Boolean(activeProfile?.pin);

  return (
    <>
      {/* ─── Desktop / TV Navigation Header (Hidden on Mobile < 768px) ─── */}
      <header className="tv-topnav-container tv-desktop-nav" role="navigation" aria-label="Main Navigation">
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

            {/* Phone Companion Remote */}
            {onOpenRemoteModal && (
              <Focusable
                id="nav-remote-btn"
                groupId="top-nav"
                indexInGroup={2 + TABS.length + (onOpenSleepTimer ? 1 : 0)}
                className="tv-gtv-action-focusable"
                onSelect={onOpenRemoteModal}
                scaleEffect={false}
              >
                {(isFocused) => (
                  <div
                    className={`tv-gtv-action-btn ${clientCount > 0 ? 'active-sleep' : ''} ${isFocused ? 'focused' : ''}`}
                    title={clientCount > 0 ? `Phone Remote Connected (${clientCount})` : 'Pair Phone Remote'}
                  >
                    <Smartphone size={18} color={clientCount > 0 ? '#81c995' : 'currentColor'} />
                    {clientCount > 0 && (
                      <span className="tv-gtv-sleep-badge" style={{ background: '#81c995', color: '#0d0e12' }}>
                        {clientCount}
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
              indexInGroup={2 + TABS.length + (onOpenSleepTimer ? 1 : 0) + (onOpenRemoteModal ? 1 : 0)}
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

      {/* ─── Mobile Header (Subtle Floating Top on Screens <= 768px down to 350px) ─── */}
      <header className="tv-mobile-top-bar" role="navigation" aria-label="Mobile Navigation Header">
        <div className="tv-mobile-top-left">
          {onOpenProfile && (
            <button
              type="button"
              className="tv-mobile-avatar-btn"
              onClick={onOpenProfile}
              title={`Profile: ${displayName}`}
              aria-label="Open Profile"
            >
              <div
                className="tv-mobile-avatar-fallback"
                style={{ background: avatarColor }}
              >
                {renderAvatarIcon(avatarIcon, 18, '#ffffff')}
              </div>
              {hasPin && (
                <div className="tv-mobile-avatar-lock">
                  <Lock size={7} color="#ffffff" />
                </div>
              )}
            </button>
          )}
          <span className="tv-mobile-profile-name">{displayName}</span>
        </div>

        <div className="tv-mobile-top-right">
          {/* Quick Search */}
          <button
            type="button"
            className="tv-mobile-icon-btn"
            onClick={onOpenSearch}
            aria-label="Search"
            title="Search"
          >
            <Search size={18} />
          </button>

          {/* Phone Remote */}
          {onOpenRemoteModal && (
            <button
              type="button"
              className={`tv-mobile-icon-btn ${clientCount > 0 ? 'active-sleep' : ''}`}
              onClick={onOpenRemoteModal}
              aria-label="Pair Phone Remote"
              title="Pair Phone Remote"
            >
              <Smartphone size={18} color={clientCount > 0 ? '#81c995' : 'currentColor'} />
            </button>
          )}

          {/* Sleep Timer */}
          {onOpenSleepTimer && (
            <button
              type="button"
              className={`tv-mobile-icon-btn ${sleepState.isActive ? 'active-sleep' : ''}`}
              onClick={onOpenSleepTimer}
              aria-label="Sleep Timer"
              title="Sleep Timer"
            >
              <Moon size={18} color={sleepState.isActive ? '#8ab4f8' : 'currentColor'} />
              {sleepState.isActive && (
                <span className="tv-mobile-sleep-badge">
                  {Math.ceil(sleepState.remainingSeconds / 60)}
                </span>
              )}
            </button>
          )}

          {/* Settings */}
          <button
            type="button"
            className="tv-mobile-icon-btn"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* ─── Mobile Bottom Navigation Bar (Floating Glass Pill Capsule on Screens <= 768px down to 350px) ─── */}
      <nav className="tv-mobile-bottom-bar" role="tablist" aria-label="Mobile Main Destinations">
        {/* 1. Home Tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeScreen === 'for-you' || activeScreen === 'movies' || activeScreen === 'shows'}
          className={`tv-mobile-tab-btn ${activeScreen === 'for-you' ? 'active' : ''}`}
          onClick={() => onSelectTab('for-you')}
        >
          <div className="tv-mobile-tab-capsule">
            <Home size={20} strokeWidth={2.2} />
            <span className="tv-mobile-tab-label">Home</span>
          </div>
        </button>

        {/* 2. Search Tab */}
        <button
          type="button"
          role="tab"
          aria-selected={false}
          className="tv-mobile-tab-btn"
          onClick={onOpenSearch}
        >
          <div className="tv-mobile-tab-capsule">
            <Search size={20} strokeWidth={2.2} />
            <span className="tv-mobile-tab-label">Search</span>
          </div>
        </button>

        {/* 3. Library Tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeScreen === 'library'}
          className={`tv-mobile-tab-btn ${activeScreen === 'library' ? 'active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <div className="tv-mobile-tab-capsule">
            <LibraryIcon size={20} strokeWidth={2.2} />
            <span className="tv-mobile-tab-label">Library</span>
          </div>
        </button>

        {/* 4. Profile Tab */}
        {onOpenProfile && (
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="tv-mobile-tab-btn profile-tab-btn"
            onClick={onOpenProfile}
          >
            <div className="tv-mobile-tab-capsule">
              <div className="tv-mobile-profile-avatar-pill" style={{ background: avatarColor }}>
                {renderAvatarIcon(avatarIcon, 14, '#ffffff')}
              </div>
              <span className="tv-mobile-tab-label">Profile</span>
            </div>
          </button>
        )}
      </nav>
    </>
  );
};

