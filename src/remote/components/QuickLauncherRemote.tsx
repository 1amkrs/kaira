import React from 'react';
import {
  Home,
  Film,
  Tv,
  Music,
  Gamepad2,
  Bookmark,
  Lightbulb,
  Power,
  Moon,
  RotateCcw,
  Monitor,
  ExternalLink,
  PlaySquare
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot } from '../../services/remote/remoteTypes';
import { NavigationTab } from '../../types';

interface QuickLauncherRemoteProps {
  tvState: TVStateSnapshot | null;
}

const TABS: { id: NavigationTab; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: 'for-you', label: 'For You', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'shows', label: 'Shows', icon: Tv },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'library', label: 'Library', icon: Bookmark },
];

const AMBIENT_MODES = [
  { id: 'ambient', label: 'Reactive' },
  { id: 'cycle', label: 'Color Cycle' },
  { id: 'test', label: 'Test Glow' },
  { id: 'off', label: 'Lights Off' },
];

const APPS = [
  { name: 'YouTube', icon: '▶️', type: 'web', target: 'https://youtube.com/tv' },
  { name: 'Netflix', icon: '🎬', type: 'web', target: 'https://netflix.com' },
  { name: 'Prime Video', icon: '📦', type: 'web', target: 'https://primevideo.com' },
  { name: 'Spotify', icon: '🎧', type: 'web', target: 'https://open.spotify.com' },
  { name: 'Twitch', icon: '🎮', type: 'web', target: 'https://twitch.tv' },
  { name: 'Plex', icon: '🍿', type: 'web', target: 'https://app.plex.tv' },
];

export const QuickLauncherRemote: React.FC<QuickLauncherRemoteProps> = ({ tvState }) => {
  const activeTab = tvState?.activeTab || 'for-you';
  const ambient = tvState?.ambientState;

  const handleSelectTab = (tab: NavigationTab) => {
    remoteClient.sendCommand('SET_TAB', { tab });
  };

  const handleSetAmbientMode = (mode: string) => {
    remoteClient.sendCommand('SET_AMBIENT_MODE', { mode });
  };

  const handleSetAmbientIntensity = (intensity: number) => {
    remoteClient.sendCommand('SET_AMBIENT_INTENSITY', { intensity });
  };

  const handleLaunchApp = (app: any) => {
    remoteClient.sendCommand('LAUNCH_APP', { app });
  };

  const handleScreensaver = () => {
    remoteClient.sendCommand('TRIGGER_SCREENSAVER');
  };

  const handleOpenSleepTimer = () => {
    remoteClient.sendCommand('OPEN_SLEEP_TIMER');
  };

  const handlePowerAction = (action: 'sleep' | 'restart' | 'shutdown') => {
    if (confirm(`Are you sure you want to trigger TV ${action}?`)) {
      remoteClient.sendCommand('POWER_ACTION', { action });
    }
  };

  return (
    <div className="quick-launcher-container">
      {/* 1. TV Navigation Tabs */}
      <div>
        <div className="launcher-section-title">TV Screens & Tabs</div>
        <div className="tabs-launcher-grid">
          {TABS.map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`tab-launch-card ${isActive ? 'active-tab' : ''}`}
                onClick={() => handleSelectTab(tab.id)}
              >
                <IconComp size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Ambient Lighting Quick Controls */}
      <div>
        <div className="launcher-section-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Lightbulb size={14} color="#fdd663" />
          <span>Ambient Lights</span>
        </div>
        <div className="ambient-controls-card">
          <div className="ambient-modes-row">
            {AMBIENT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`ambient-mode-btn ${ambient?.mode === mode.id && ambient?.enabled ? 'active' : ''}`}
                onClick={() => handleSetAmbientMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="ambient-slider-wrap">
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Intensity</span>
            <input
              type="range"
              min="10"
              max="100"
              value={ambient?.intensity || 80}
              onChange={(e) => handleSetAmbientIntensity(Number(e.target.value))}
              className="ambient-range-slider"
            />
            <span style={{ fontSize: '11px', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
              {ambient?.intensity || 80}%
            </span>
          </div>
        </div>
      </div>

      {/* 3. Quick App Launchers */}
      <div>
        <div className="launcher-section-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <PlaySquare size={14} color="#8ab4f8" />
          <span>Quick App Launch</span>
        </div>
        <div className="tabs-launcher-grid">
          {APPS.map((app, idx) => (
            <button
              key={idx}
              type="button"
              className="tab-launch-card"
              onClick={() => handleLaunchApp(app)}
            >
              <span style={{ fontSize: '20px' }}>{app.icon}</span>
              <span>{app.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. TV System & Power */}
      <div>
        <div className="launcher-section-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Power size={14} color="#f28b82" />
          <span>TV System & Power</span>
        </div>
        <div className="power-actions-grid">
          <button
            type="button"
            className="power-action-btn"
            onClick={handleScreensaver}
          >
            <Monitor size={18} color="#8ab4f8" />
            <span>Screensaver</span>
          </button>

          <button
            type="button"
            className="power-action-btn"
            onClick={handleOpenSleepTimer}
          >
            <Moon size={18} color="#fdd663" />
            <span>Sleep Timer</span>
          </button>

          <button
            type="button"
            className="power-action-btn"
            onClick={() => handlePowerAction('sleep')}
            style={{ color: '#f28b82' }}
          >
            <Power size={18} />
            <span>Sleep TV</span>
          </button>
        </div>
      </div>
    </div>
  );
};
