import React, { useState, useRef } from 'react';
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
  const [controlMode, setControlMode] = useState<'clickpad' | 'touchpad'>('clickpad');
  const [activeDir, setActiveDir] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);

  // Touch Surface Tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastSwipeTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);

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

  // Glass Touchpad Gestures
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;

    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    hasMovedRef.current = false;
    const rippleId = Date.now();
    setRipples((prev) => [...prev.slice(-3), { x, y, id: rippleId }]);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dist = Math.hypot(dx, dy);

    const SWIPE_THRESHOLD = 30;
    const now = Date.now();

    if (dist >= SWIPE_THRESHOLD && now - lastSwipeTimeRef.current > 100) {
      hasMovedRef.current = true;
      lastSwipeTimeRef.current = now;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) handleNav('right');
        else handleNav('left');
      } else {
        if (dy > 0) handleNav('down');
        else handleNav('up');
      }

      touchStartRef.current = { x: t.clientX, y: t.clientY, time: now };
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    const now = Date.now();
    const duration = now - touchStartRef.current.time;

    if (!hasMovedRef.current && duration < 280) {
      if (now - lastTapTimeRef.current < 280) {
        handleBack();
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
        setTimeout(() => {
          if (lastTapTimeRef.current === now) {
            handleSelect();
          }
        }, 220);
      }
    }

    touchStartRef.current = null;
    hasMovedRef.current = false;
  };

  return (
    <div className="ref-remote-view">
      {/* ─── 0. Mode Switcher (Clickpad vs Touchpad) ─── */}
      <div className="ref-mode-pill" role="tablist">
        <button
          type="button"
          className={`ref-mode-btn ${controlMode === 'clickpad' ? 'active' : ''}`}
          onClick={() => {
            setControlMode('clickpad');
            remoteClient.triggerHaptic(10);
          }}
        >
          Clickpad
        </button>
        <button
          type="button"
          className={`ref-mode-btn ${controlMode === 'touchpad' ? 'active' : ''}`}
          onClick={() => {
            setControlMode('touchpad');
            remoteClient.triggerHaptic(10);
          }}
        >
          Touch Surface
        </button>
      </div>

      {/* ─── 1. Main Interaction Surface (Clickpad OR Touchpad) ─── */}
      {controlMode === 'clickpad' ? (
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
            <ChevronUp size={26} strokeWidth={2.6} className="ref-sector-glyph" />
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
            <ChevronDown size={26} strokeWidth={2.6} className="ref-sector-glyph" />
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
            <ChevronLeft size={26} strokeWidth={2.6} className="ref-sector-glyph" />
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
            <ChevronRight size={26} strokeWidth={2.6} className="ref-sector-glyph" />
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
      ) : (
        <div
          className="ref-touchpad-surface"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="region"
          aria-label="Touchpad Surface"
        >
          {ripples.map((r) => (
            <div
              key={r.id}
              className="ref-touch-ripple"
              style={{ left: r.x, top: r.y }}
            />
          ))}
          <div className="ref-crosshair-circle">
            <div className="ref-crosshair-dot" />
          </div>
          <span className="ref-touchpad-hint">Swipe to Navigate • Tap to Select</span>
        </div>
      )}

      {/* ─── 2. Middle Row: Back, Home, Source/Input ─── */}
      <div className="ref-mid-row">
        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleBack}
          title="Back"
          aria-label="Back"
        >
          <Undo2 size={24} strokeWidth={2.4} />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleHome}
          title="Home"
          aria-label="Home"
        >
          <Home size={25} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          className="ref-circle-btn"
          onClick={handleInput}
          title="Input / Menu"
          aria-label="Input / Menu"
        >
          <LogOut size={24} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
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
            <Plus size={24} strokeWidth={2.6} />
          </button>
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleVolumeDelta(-0.05)}
            title="Volume Down"
            aria-label="Volume Down"
          >
            <Minus size={24} strokeWidth={2.6} />
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
          <VolumeX size={26} strokeWidth={2.2} />
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
            <ChevronUp size={26} strokeWidth={2.6} />
          </button>
          <button
            type="button"
            className="ref-rocker-btn"
            onClick={() => handleTabDelta('prev')}
            title="Channel / Tab Down"
            aria-label="Channel Down"
          >
            <ChevronDown size={26} strokeWidth={2.6} />
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
            <Settings size={20} strokeWidth={2.2} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleKeyboard}
            title="Keyboard / Search"
            aria-label="Keyboard"
          >
            <Keyboard size={20} strokeWidth={2.2} />
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
            <Mic size={20} strokeWidth={2.2} />
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
            <Play size={18} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handlePause}
            title="Pause"
            aria-label="Pause"
          >
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleRewind}
            title="Rewind 15s"
            aria-label="Rewind"
          >
            <Rewind size={20} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            type="button"
            className="ref-pill-btn"
            onClick={handleFastForward}
            title="Fast Forward 15s"
            aria-label="Fast Forward"
          >
            <FastForward size={20} fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    </div>
  );
};
