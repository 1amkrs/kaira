import React, { useState, useEffect } from 'react';
import {
  Power,
  Tv,
  LogOut,
  Home,
  Layers,
  MessageSquareQuote
} from 'lucide-react';
import { remoteClient, ConnectionStatus } from './remoteClient';
import { TVStateSnapshot } from '../services/remote/remoteTypes';
import { TouchpadRemote } from './components/TouchpadRemote';
import { NowPlayingRemote } from './components/NowPlayingRemote';
import './CompanionRemote.css';

type RemoteView = 'touchpad' | 'now-playing';

export const CompanionRemoteApp: React.FC = () => {
  const [activeView, setActiveView] = useState<RemoteView>('touchpad');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [tvState, setTvState] = useState<TVStateSnapshot | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Kaira Remote';
    remoteClient.connect();

    const unsubscribe = remoteClient.subscribe({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === 'connected') {
          showToast('🟢 Connected to Kaira TV');
        } else if (status === 'disconnected') {
          showToast('🔴 Disconnected');
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

  const handlePower = () => {
    remoteClient.triggerHaptic(20);
    if (confirm('Put Kaira TV to sleep / start screensaver?')) {
      remoteClient.sendCommand('TRIGGER_SCREENSAVER');
    }
  };

  const handleSource = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('QUICK_SETTINGS');
  };

  const tvDisplayName = tvState?.tvName || 'Bedroom TV';

  return (
    <div className="kaira-remote-container">
      {/* ─── 1. Reference Top Header ─── */}
      <header className="ref-header">
        <button
          type="button"
          className="ref-power-btn"
          onClick={handlePower}
          title="Power / Sleep"
          aria-label="Power"
        >
          <Power size={20} strokeWidth={2.3} />
        </button>

        <div className="ref-device-pill">
          <Tv size={16} strokeWidth={2.2} />
          <span>{tvDisplayName}</span>
          <span className={`ref-conn-dot ${connectionStatus === 'connected' ? 'connected' : 'connecting'}`} />
        </div>

        <button
          type="button"
          className="ref-header-action-btn"
          onClick={handleSource}
          title="Inputs / Source"
          aria-label="Inputs"
        >
          <LogOut size={20} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </header>

      {/* ─── 2. Main Viewport Body ─── */}
      <main className="ref-body">
        {activeView === 'touchpad' ? (
          <TouchpadRemote tvState={tvState} />
        ) : (
          <NowPlayingRemote tvState={tvState} />
        )}
      </main>

      {/* ─── 3. Floating Apple Glass Dock ─── */}
      <nav className="ref-dock" role="navigation" aria-label="Dock Navigation">
        <button
          type="button"
          className={`ref-dock-tab ${activeView === 'touchpad' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('touchpad');
            remoteClient.triggerHaptic(10);
          }}
          title="Remote"
          aria-label="Remote"
        >
          <Home size={18} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          className={`ref-dock-tab ${activeView === 'now-playing' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('now-playing');
            remoteClient.triggerHaptic(10);
          }}
          title="Media / Now Playing"
          aria-label="Now Playing"
        >
          <Layers size={18} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          className="ref-dock-tab"
          onClick={handleSource}
          title="Quick Menu"
          aria-label="Quick Menu"
        >
          <MessageSquareQuote size={18} strokeWidth={2.2} />
        </button>
      </nav>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="remote-toast-pill" role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default CompanionRemoteApp;
