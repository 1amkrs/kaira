import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Home,
  LogOut,
  Plus,
  Minus,
  VolumeX,
  Settings,
  Keyboard,
  Mic,
  Play,
  Pause,
  Rewind,
  FastForward
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot } from '../../services/remote/remoteTypes';

interface TouchpadRemoteProps {
  tvState: TVStateSnapshot | null;
}

export const TouchpadRemote: React.FC<TouchpadRemoteProps> = ({ tvState }) => {
  const [activeDir, setActiveDir] = useState<'up' | 'down' | 'left' | 'right' | null>(null);

  // Directional Navigation
  const handleNav = (dir: 'up' | 'down' | 'left' | 'right') => {
    remoteClient.triggerHaptic(12);
    const map = {
      up: 'NAV_UP' as const,
      down: 'NAV_DOWN' as const,
      left: 'NAV_LEFT' as const,
      right: 'NAV_RIGHT' as const,
    };
    remoteClient.sendCommand(map[dir]);
  };

  const handleSelect = () => {
    remoteClient.triggerHaptic(20);
    remoteClient.sendCommand('SELECT');
  };

  const handleBack = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('BACK');
  };

  const handleHome = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('HOME');
  };

  const handleInput = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('QUICK_SETTINGS');
  };

  const handleVolumeDelta = (delta: number) => {
    remoteClient.triggerHaptic(10);
    remoteClient.sendCommand('VOLUME_DELTA', { delta });
  };

  const handleTabDelta = (dir: 'prev' | 'next') => {
    remoteClient.triggerHaptic(10);
    remoteClient.sendCommand(dir === 'prev' ? 'TAB_PREV' : 'TAB_NEXT');
  };

  const handleToggleMute = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('MUTE_TOGGLE');
  };

  const handleSettings = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('QUICK_SETTINGS');
  };

  const handleKeyboard = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('SEARCH');
  };

  const handleNumericQuick = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('OPEN_SLEEP_TIMER');
  };

  const handleVoice = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('SEARCH');
  };

  const handlePlay = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('PLAY');
  };

  const handlePause = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('PAUSE');
  };

  const handleRewind = () => {
    remoteClient.triggerHaptic(12);
    remoteClient.sendCommand('SEEK_RELATIVE', { delta: -15 });
  };

  const handleFastForward = () => {
    remoteClient.triggerHaptic(12);
    remoteClient.sendCommand('SEEK_RELATIVE', { delta: 15 });
  };

  return (
    <div className="ref-remote-view">
      {/* ─── 1. Main Circular D-Pad Clickpad Wheel ─── */}
      <div className="ref-clickpad-wheel">
        {/* Up Sector */}
        <button
          type="button"
          className={`ref-sector up ${activeDir === 'up' ? 'is-active' : ''}`}
          onClick={() => handleNav('up')}
          onPointerDown={() => setActiveDir('up')}
          onPointerUp={() => setActiveDir(null)}
          onPointerLeave={() => setActiveDir(null)}
          onPointerCancel={() => setActiveDir(null)}
          aria-label="Up"
        >
          <ChevronUp size={22} strokeWidth={2.5} className="ref-sector-glyph" />
        </button>

        {/* Down Sector */}
        <button
          type="button"
          className={`ref-sector down ${activeDir === 'down' ? 'is-active' : ''}`}
          onClick={() => handleNav('down')}
          onPointerDown={() => setActiveDir('down')}
          onPointerUp={() => setActiveDir(null)}
          onPointerLeave={() => setActiveDir(null)}
          onPointerCancel={() => setActiveDir(null)}
          aria-label="Down"
        >
          <ChevronDown size={22} strokeWidth={2.5} className="ref-sector-glyph" />
        </button>

        {/* Left Sector */}
        <button
          type="button"
          className={`ref-sector left ${activeDir === 'left' ? 'is-active' : ''}`}
          onClick={() => handleNav('left')}
          onPointerDown={() => setActiveDir('left')}
          onPointerUp={() => setActiveDir(null)}
          onPointerLeave={() => setActiveDir(null)}
          onPointerCancel={() => setActiveDir(null)}
          aria-label="Left"
        >
          <ChevronLeft size={22} strokeWidth={2.5} className="ref-sector-glyph" />
        </button>

        {/* Right Sector */}
        <button
          type="button"
          className={`ref-sector right ${activeDir === 'right' ? 'is-active' : ''}`}
          onClick={() => handleNav('right')}
          onPointerDown={() => setActiveDir('right')}
          onPointerUp={() => setActiveDir(null)}
          onPointerLeave={() => setActiveDir(null)}
          onPointerCancel={() => setActiveDir(null)}
          aria-label="Right"
        >
          <ChevronRight size={22} strokeWidth={2.5} className="ref-sector-glyph" />
        </button>

        {/* Center Select Button */}
        <button
          type="button"
          className="ref-center-btn"
          onClick={handleSelect}
          aria-label="Select"
        >
          Select
        </button>
      </div>

      {/* ─── 2. Middle Row: Back, Home, Source/Input ─── */}
      <div className="ref-mid-row">
        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleBack}
          title="Back"
          aria-label="Back"
        >
          <Undo2 size={20} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleHome}
          title="Home"
          aria-label="Home"
        >
          <Home size={21} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleInput}
          title="Input / Menu"
          aria-label="Input / Menu"
        >
          <LogOut size={20} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>

      {/* ─── 3. Rockers & Center Mute Cluster ─── */}
      <div className="ref-rocker-row">
        {/* Left Volume Rocker */}
        <div className="ref-rocker-pill">
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleVolumeDelta(0.05)}
            title="Volume Up"
            aria-label="Volume Up"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleVolumeDelta(-0.05)}
            title="Volume Down"
            aria-label="Volume Down"
          >
            <Minus size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Center Mute Button */}
        <button
          type="button"
          className="ref-mute-btn"
          onClick={handleToggleMute}
          title="Mute Toggle"
          aria-label="Mute"
        >
          <VolumeX size={22} strokeWidth={2} />
        </button>

        {/* Right Channel / Tab Rocker */}
        <div className="ref-rocker-pill">
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleTabDelta('next')}
            title="Channel / Tab Up"
            aria-label="Channel Up"
          >
            <ChevronUp size={22} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleTabDelta('prev')}
            title="Channel / Tab Down"
            aria-label="Channel Down"
          >
            <ChevronDown size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ─── 4. Bottom Function Rows ─── */}
      <div className="ref-func-grid">
        {/* Utility Row: Settings, Keyboard, 123, Mic */}
        <div className="ref-func-row">
          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleSettings}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleKeyboard}
            title="Keyboard / Search"
            aria-label="Keyboard"
          >
            <Keyboard size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleNumericQuick}
            title="Quick 123"
            aria-label="123"
          >
            123
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleVoice}
            title="Voice Search"
            aria-label="Voice Search"
          >
            <Mic size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Media Row: Play, Pause, Rewind, Fast Forward */}
        <div className="ref-func-row">
          <button
            type="button"
            className="ref-pill-btn"
            onClick={handlePlay}
            title="Play"
            aria-label="Play"
          >
            <Play size={16} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handlePause}
            title="Pause"
            aria-label="Pause"
          >
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleRewind}
            title="Rewind 15s"
            aria-label="Rewind"
          >
            <Rewind size={18} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleFastForward}
            title="Fast Forward 15s"
            aria-label="Fast Forward"
          >
            <FastForward size={18} fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    </div>
  );
};
