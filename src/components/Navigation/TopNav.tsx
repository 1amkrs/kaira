import React, { useState, useEffect } from 'react';
import { Search, Settings, Lock, Home, Film, Tv, Music, Bookmark, Smartphone } from 'lucide-react';
import { NavigationTab, ScreenId } from '../../types';
import { UserProfile } from '../../types/profile';
import { Focusable } from '../Focusable/Focusable';
import { renderAvatarIcon } from '../Profile/PinModal';
import { remoteService } from '../../services/remote/RemoteService';
import './TopNav.css';

interface TopNavProps {
  activeScreen: ScreenId;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onOpenRemoteModal?: () => void;
  activeProfile?: UserProfile;
  activeProfileName?: string;
}

const TABS: { id: NavigationTab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: 'for-you', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'shows', label: 'Shows', icon: Tv },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'library', label: 'Library', icon: Bookmark },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeScreen,
  onSelectTab,
  onOpenSearch,
  onOpenSettings,
  onOpenProfile,
  activeProfile,
  activeProfileName = 'Primary',
  onOpenRemoteModal,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const remoteSupported = Boolean(onOpenRemoteModal) && remoteService.isSupported();
  const [clientCount, setClientCount] = useState<number>(() => (remoteSupported ? remoteService.getConnectedClients() : 0));

  useEffect(() => {
    const unsubRemote = remoteSupported ? remoteService.subscribeClientCount(setClientCount) : () => {};
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
      unsubRemote();
    };
  }, [remoteSupported]);

  const displayName = activeProfile?.name || activeProfileName;
  const avatarColor = activeProfile?.avatarColor || 'linear-gradient(135deg, #e50914, #ff453a)';
  const avatarIcon = activeProfile?.avatarIcon || 'user';
  const hasPin = Boolean(activeProfile?.pin);

  const profileOffset = onOpenProfile ? 1 : 0;
  const searchIndex = profileOffset + TABS.length;
  const remoteIndex = searchIndex + 1;
  const settingsIndex = searchIndex + (onOpenRemoteModal ? 2 : 1);

  return (
    <>
      {/* ─── Desktop / TV Navigation Header (M3 Three-Zone Open Bar) ─── */}
      <header className="tv-topnav-container tv-desktop-nav" role="navigation" aria-label="Main Navigation">
        {/* Zone 1: Profile Selector */}
        <div className="tv-gtv-brand-zone">
          {onOpenProfile && (
            <Focusable
              id="nav-profile-btn"
              groupId="top-nav"
              indexInGroup={0}
              className="tv-gtv-profile-focusable"
              onSelect={onOpenProfile}
              scaleEffect={false}
              role="button"
              ariaLabel={`Switch profile (${displayName})`}
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
                    {renderAvatarIcon(avatarIcon, 19, '#ffffff')}
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
        </div>

        {/* Zone 2: Primary Destinations (Un-caged Single-Line M3 Tabs) */}
        <nav className="tv-gtv-nav-strip" role="tablist" aria-label="Main Navigation Destinations">
          {TABS.map((tab, idx) => {
            const isActive = activeScreen === tab.id;
            return (
              <Focusable
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                groupId="top-nav"
                indexInGroup={profileOffset + idx}
                className="tv-gtv-tab-focusable"
                onSelect={() => onSelectTab(tab.id)}
                scaleEffect={false}
                role="tab"
                ariaSelected={isActive}
                ariaLabel={tab.label}
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
        </nav>

        {/* Zone 3: Utility Controls & Clock */}
        <div className="tv-gtv-right-cluster">
          <Focusable
            id="nav-search-btn"
            groupId="top-nav"
            indexInGroup={searchIndex}
            className="tv-gtv-action-focusable"
            onSelect={onOpenSearch}
            scaleEffect={false}
            role="button"
            ariaLabel="Search"
          >
            {(isFocused) => (
              <div
                className={`tv-gtv-action-btn ${isFocused ? 'focused' : ''}`}
                title="Search (Y)"
              >
                <Search size={19} strokeWidth={2.2} />
              </div>
            )}
          </Focusable>

          {onOpenRemoteModal && (
            <Focusable
              id="nav-remote-btn"
              groupId="top-nav"
              indexInGroup={remoteIndex}
              className="tv-gtv-action-focusable"
              onSelect={onOpenRemoteModal}
              scaleEffect={false}
              role="button"
              ariaLabel={clientCount > 0 ? `Phone Remote Connected (${clientCount})` : 'Pair Phone Remote'}
            >
              {(isFocused) => (
                <div
                  className={`tv-gtv-action-btn ${clientCount > 0 ? 'connected' : ''} ${isFocused ? 'focused' : ''}`}
                  title={clientCount > 0 ? `Phone Remote Connected (${clientCount})` : 'Pair Phone Remote'}
                >
                  <Smartphone size={18} strokeWidth={2.1} />
                </div>
              )}
            </Focusable>
          )}

          <Focusable
            id="nav-settings-btn"
            groupId="top-nav"
            indexInGroup={settingsIndex}
            className="tv-gtv-action-focusable"
            onSelect={onOpenSettings}
            scaleEffect={false}
            role="button"
            ariaLabel="Settings"
          >
            {(isFocused) => (
              <div
                className={`tv-gtv-action-btn ${isFocused ? 'focused' : ''}`}
                title="Settings"
              >
                <Settings size={19} strokeWidth={2.1} />
              </div>
            )}
          </Focusable>

          {currentTime && <span className="tv-gtv-time">{currentTime}</span>}
        </div>
      </header>

      {/* ─── Mobile Header (Compact Top Bar on Screens <= 768px) ─── */}
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
                {renderAvatarIcon(avatarIcon, 17, '#ffffff')}
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
          <button
            type="button"
            className="tv-mobile-icon-btn"
            onClick={onOpenSearch}
            aria-label="Search"
            title="Search"
          >
            <Search size={19} />
          </button>

          {onOpenRemoteModal && (
            <button
              type="button"
              className={`tv-mobile-icon-btn ${clientCount > 0 ? 'connected' : ''}`}
              onClick={onOpenRemoteModal}
              aria-label={clientCount > 0 ? `Phone Remote Connected (${clientCount})` : 'Pair Phone Remote'}
              title="Pair Phone Remote"
            >
              <Smartphone size={19} />
            </button>
          )}

          <button
            type="button"
            className="tv-mobile-icon-btn"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={19} />
          </button>
        </div>
      </header>

      {/* ─── Mobile Bottom Navigation Bar (Docked M3 Bar <= 768px) ─── */}
      <nav className="tv-mobile-bottom-bar" role="tablist" aria-label="Mobile Main Destinations">
        {TABS.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeScreen === tab.id;
          return (
            <button
              key={`mobile-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              className={`tv-mobile-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <div className="tv-mobile-tab-indicator">
                <IconComponent size={20} />
              </div>
              <span className="tv-mobile-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
