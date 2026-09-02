import React, { useState, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Home,
  Search,
  Sliders,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot } from '../../services/remote/remoteTypes';

interface TouchpadRemoteProps {
  tvState: TVStateSnapshot | null;
  onOpenKeyboard: () => void;
}

export const TouchpadRemote: React.FC<TouchpadRemoteProps> = ({ tvState, onOpenKeyboard }) => {
  const [controlMode, setControlMode] = useState<'dpad' | 'touchpad'>('dpad');
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  // Touchpad Gesture Tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastSwipeTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);

  // D-Pad Actions
  const handleNav = (direction: 'up' | 'down' | 'left' | 'right') => {
    const cmdMap = {
      up: 'NAV_UP' as const,
      down: 'NAV_DOWN' as const,
      left: 'NAV_LEFT' as const,
      right: 'NAV_RIGHT' as const,
    };
    remoteClient.sendCommand(cmdMap[direction]);
  };

  const handleSelect = () => {
    remoteClient.sendCommand('SELECT');
  };

  const handleBack = () => {
    remoteClient.sendCommand('BACK');
  };

  const handleHome = () => {
    remoteClient.sendCommand('HOME');
  };

  const handleSearch = () => {
    onOpenKeyboard();
  };

  const handleQuickSettings = () => {
    remoteClient.sendCommand('QUICK_SETTINGS');
  };

  const handleVolumeDelta = (delta: number) => {
    remoteClient.sendCommand('VOLUME_DELTA', { delta });
  };

  const handleToggleMute = () => {
    remoteClient.sendCommand('MUTE_TOGGLE');
  };

  // Touchpad Touch Events
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;

    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    hasMovedRef.current = false;
    setRipple({ x, y, id: Date.now() });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dist = Math.hypot(dx, dy);

    // Swipe Threshold: 34px
    const SWIPE_THRESHOLD = 34;
    const now = Date.now();

    if (dist >= SWIPE_THRESHOLD && now - lastSwipeTimeRef.current > 110) {
      hasMovedRef.current = true;
      lastSwipeTimeRef.current = now;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal Swipe
        if (dx > 0) handleNav('right');
        else handleNav('left');
      } else {
        // Vertical Swipe
        if (dy > 0) handleNav('down');
        else handleNav('up');
      }

      // Reset touch start point for continuous swipes
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: now };
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    const now = Date.now();
    const duration = now - touchStartRef.current.time;

    // Single Tap Detection (duration < 280ms without significant move)
    if (!hasMovedRef.current && duration < 280) {
      // Check double tap for Back
      if (now - lastTapTimeRef.current < 300) {
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

  const volumeLevel = Math.round((tvState?.volume ?? 1) * 100);
  const isMuted = tvState?.isMuted || volumeLevel === 0;

  return (
    <div className="touchpad-view-container">
      {/* Mode Switcher Pill */}
      <div className="mode-toggle-pill" role="tablist">
        <button
          type="button"
          className={`mode-toggle-btn ${controlMode === 'dpad' ? 'active' : ''}`}
          onClick={() => setControlMode('dpad')}
        >
          D-Pad
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${controlMode === 'touchpad' ? 'active' : ''}`}
          onClick={() => setControlMode('touchpad')}
        >
          Touchpad (Swipe)
        </button>
      </div>

      {/* Main Interactive Surface */}
      {controlMode === 'dpad' ? (
        <div className="dpad-container">
          <div className="dpad-wheel">
            <button
              type="button"
              className="dpad-btn up"
              onClick={() => handleNav('up')}
              aria-label="Up"
            >
              <ChevronUp size={34} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="dpad-btn down"
              onClick={() => handleNav('down')}
              aria-label="Down"
            >
              <ChevronDown size={34} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="dpad-btn left"
              onClick={() => handleNav('left')}
              aria-label="Left"
            >
              <ChevronLeft size={34} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="dpad-btn right"
              onClick={() => handleNav('right')}
              aria-label="Right"
            >
              <ChevronRight size={34} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="dpad-center-ok"
              onClick={handleSelect}
              aria-label="Select"
            >
              OK
            </button>
          </div>
        </div>
      ) : (
        <div
          className="touchpad-surface"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="region"
          aria-label="Touch Navigation Trackpad"
        >
          {ripple && (
            <div
              key={ripple.id}
              className="touchpad-ripple"
              style={{ left: ripple.x, top: ripple.y }}
            />
          )}
          <div className="touchpad-hint-content">
            <Maximize2 size={24} opacity={0.6} />
            <span className="touchpad-hint-text">Swipe to navigate • Tap to select</span>
          </div>
        </div>
      )}

      {/* TV Actions Control Row */}
      <div className="remote-actions-row">
        <button
          type="button"
          className="remote-action-btn back-btn"
          onClick={handleBack}
          title="Back (B)"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <button
          type="button"
          className="remote-action-btn home-btn"
          onClick={handleHome}
          title="Home Tab"
        >
          <Home size={20} />
          <span>Home</span>
        </button>

        <button
          type="button"
          className="remote-action-btn"
          onClick={handleSearch}
          title="Search / Keyboard"
        >
          <Search size={20} />
          <span>Search</span>
        </button>

        <button
          type="button"
          className="remote-action-btn"
          onClick={handleQuickSettings}
          title="Quick Settings"
        >
          <Sliders size={20} />
          <span>Menu</span>
        </button>
      </div>

      {/* Volume & Mute Strip */}
      <div className="remote-volume-strip">
        <div className="volume-cluster">
          <button
            type="button"
            className="volume-btn"
            onClick={() => handleVolumeDelta(-0.05)}
            title="Volume Down"
          >
            <Volume1 size={18} />
          </button>
          <button
            type="button"
            className="volume-btn"
            onClick={() => handleVolumeDelta(0.05)}
            title="Volume Up"
          >
            <Volume2 size={18} />
          </button>
        </div>

        <span className="volume-value-badge">
          {isMuted ? 'Muted' : `${volumeLevel}%`}
        </span>

        <button
          type="button"
          className="volume-btn"
          onClick={handleToggleMute}
          title="Toggle Mute"
          style={isMuted ? { color: '#f28b82' } : undefined}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
};
