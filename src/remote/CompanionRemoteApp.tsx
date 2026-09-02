import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Disc3,
  Search,
  LayoutGrid,
  Power,
  VolumeX,
  Volume2,
  Tv
} from 'lucide-react';
import { remoteClient, ConnectionStatus } from './remoteClient';
import { TVStateSnapshot } from '../services/remote/remoteTypes';
import { TouchpadRemote } from './components/TouchpadRemote';
import { NowPlayingRemote } from './components/NowPlayingRemote';
import { KeyboardVoiceRemote } from './components/KeyboardVoiceRemote';
import { QuickLauncherRemote } from './components/QuickLauncherRemote';
import './CompanionRemote.css';

type RemoteView = 'touchpad' | 'now-playing' | 'keyboard' | 'launch';

export const CompanionRemoteApp: React.FC = () => {
  const [activeView, setActiveView] = useState<RemoteView>('touchpad');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [tvState, setTvState] = useState<TVStateSnapshot | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Set page title & mobile viewport
    document.title = 'Kaira Companion Remote';

    // Connect remote client
    remoteClient.connect();

    const unsubscribe = remoteClient.subscribe({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === 'connected') {
          showToast('🟢 Connected to Kaira TV');
        } else if (status === 'disconnected') {
          showToast('🔴 Disconnected from TV');
        }
      },
      onStateUpdate: (state) => {
        setTvState(state);
      },
      onToast: (msg) => {
        showToast(msg);
      },
    });

    return () => {
      unsubscribe();
      remoteClient.disconnect();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const isMediaPlaying = tvState?.nowPlaying?.isPlaying;
  const isMuted = tvState?.isMuted || tvState?.volume === 0;

  const handlePowerAction = () => {
    if (confirm('Put Kaira TV to sleep / start screensaver?')) {
      remoteClient.sendCommand('TRIGGER_SCREENSAVER');
    }
  };

  const handleToggleMute = () => {
    remoteClient.sendCommand('MUTE_TOGGLE');
  };

  return (
    <div className="kaira-remote-container">
      {/* ─── Top Header ─── */}
      <header className="remote-header">
        <div className="remote-brand">
          <div className="remote-logo-icon">
            <Tv size={16} color="#fff" />
          </div>
          <div className="remote-title-wrap">
            <span className="remote-app-title">Kaira Remote</span>
            <div className="remote-status-pill">
              <span className={`status-dot ${connectionStatus}`} />
              <span>
                {connectionStatus === 'connected'
                  ? `${tvState?.tvName || 'Connected'}`
                  : connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : connectionStatus === 'reconnecting'
                  ? 'Reconnecting...'
                  : 'Offline (Check Wi-Fi)'}
              </span>
            </div>
          </div>
        </div>

        <div className="remote-header-actions">
          <button
            type="button"
            className="remote-header-btn"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label="Toggle Mute"
            style={isMuted ? { color: '#f28b82' } : undefined}
          >
            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          <button
            type="button"
            className="remote-header-btn power-btn"
            onClick={handlePowerAction}
            title="Screensaver / Power"
            aria-label="Power"
          >
            <Power size={17} />
          </button>
        </div>
      </header>

      {/* ─── Main Viewport ─── */}
      <main className="remote-body">
        {activeView === 'touchpad' && (
          <TouchpadRemote
            tvState={tvState}
            onOpenKeyboard={() => setActiveView('keyboard')}
          />
        )}

        {activeView === 'now-playing' && (
          <NowPlayingRemote tvState={tvState} />
        )}

        {activeView === 'keyboard' && (
          <KeyboardVoiceRemote />
        )}

        {activeView === 'launch' && (
          <QuickLauncherRemote tvState={tvState} />
        )}
      </main>

      {/* ─── Bottom Navigation Bar ─── */}
      <nav className="remote-bottom-nav" role="navigation" aria-label="Remote Navigation">
        <button
          type="button"
          className={`remote-nav-item ${activeView === 'touchpad' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('touchpad');
            remoteClient.triggerHaptic(10);
          }}
        >
          <Gamepad2 size={20} />
          <span>Remote</span>
        </button>

        <button
          type="button"
          className={`remote-nav-item ${activeView === 'now-playing' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('now-playing');
            remoteClient.triggerHaptic(10);
          }}
          style={isMediaPlaying ? { color: '#81c995' } : undefined}
        >
          <Disc3 size={20} className={isMediaPlaying ? 'spin-icon' : ''} />
          <span>Now Playing</span>
        </button>

        <button
          type="button"
          className={`remote-nav-item ${activeView === 'keyboard' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('keyboard');
            remoteClient.triggerHaptic(10);
          }}
        >
          <Search size={20} />
          <span>Search & Mic</span>
        </button>

        <button
          type="button"
          className={`remote-nav-item ${activeView === 'launch' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('launch');
            remoteClient.triggerHaptic(10);
          }}
        >
          <LayoutGrid size={20} />
          <span>Apps & Lights</span>
        </button>
      </nav>

      {/* HUD Toast Message */}
      {toastMessage && (
        <div className="remote-toast-pill" role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default CompanionRemoteApp;
