import React, { useState, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronLeft as BackIcon,
  Tv,
  Play,
  Pause,
  SlidersHorizontal,
  Plus,
  Minus,
  VolumeX,
  Volume2,
  Maximize2
} from 'lucide-react';
import { remoteClient } from '../remoteClient';
import { TVStateSnapshot } from '../../services/remote/remoteTypes';

interface TouchpadRemoteProps {
  tvState: TVStateSnapshot | null;
}

export const TouchpadRemote: React.FC<TouchpadRemoteProps> = ({ tvState }) => {
  const [controlMode, setControlMode] = useState<'clickpad' | 'touchpad'>('clickpad');
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);

  // Touch Surface Tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastSwipeTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);

  // D-Pad / Clickpad Actions
  const handleNav = (direction: 'up' | 'down' | 'left' | 'right') => {
    remoteClient.triggerHaptic(12);
    const cmdMap = {
      up: 'NAV_UP' as const,
      down: 'NAV_DOWN' as const,
      left: 'NAV_LEFT' as const,
      right: 'NAV_RIGHT' as const,
    };
    remoteClient.sendCommand(cmdMap[direction]);
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

  const handlePlayPause = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('PLAY_PAUSE');
  };

  const handleQuickSettings = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('QUICK_SETTINGS');
  };

  const handleVolumeDelta = (delta: number) => {
    remoteClient.triggerHaptic(10);
    remoteClient.sendCommand('VOLUME_DELTA', { delta });
  };

  const handleToggleMute = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand('MUTE_TOGGLE');
  };

  // Glass Touch Surface Events
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

    const SWIPE_THRESHOLD = 32;
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

  const isMediaPlaying = tvState?.nowPlaying?.isPlaying;
  const isMuted = tvState?.isMuted || tvState?.volume === 0;

  return (
    <div className="touchpad-view-container">
      {/* Apple Segmented Control */}
      <div className="apple-segmented-control" role="tablist">
        <button
          type="button"
          className={`apple-segment-btn ${controlMode === 'clickpad' ? 'active' : ''}`}
          onClick={() => {
            setControlMode('clickpad');
            remoteClient.triggerHaptic(10);
          }}
        >
          Clickpad
        </button>
        <button
          type="button"
          className={`apple-segment-btn ${controlMode === 'touchpad' ? 'active' : ''}`}
          onClick={() => {
            setControlMode('touchpad');
            remoteClient.triggerHaptic(10);
          }}
        >
          Touch Surface
        </button>
      </div>

      {/* Main Interaction Area */}
      {controlMode === 'clickpad' ? (
        <div className="apple-clickpad-frame">
          <div className="apple-clickpad-outer-ring">
            {/* Top Quadrant */}
            <button
              type="button"
              className="clickpad-sector up"
              onClick={() => handleNav('up')}
              aria-label="Navigate Up"
            >
              <ChevronUp size={24} strokeWidth={2.5} className="clickpad-arrow-glyph" />
            </button>

            {/* Bottom Quadrant */}
            <button
              type="button"
              className="clickpad-sector down"
              onClick={() => handleNav('down')}
              aria-label="Navigate Down"
            >
              <ChevronDown size={24} strokeWidth={2.5} className="clickpad-arrow-glyph" />
            </button>

            {/* Left Quadrant */}
            <button
              type="button"
              className="clickpad-sector left"
              onClick={() => handleNav('left')}
              aria-label="Navigate Left"
            >
              <ChevronLeft size={24} strokeWidth={2.5} className="clickpad-arrow-glyph" />
            </button>

            {/* Right Quadrant */}
            <button
              type="button"
              className="clickpad-sector right"
              onClick={() => handleNav('right')}
              aria-label="Navigate Right"
            >
              <ChevronRight size={24} strokeWidth={2.5} className="clickpad-arrow-glyph" />
            </button>

            {/* Center Concave Clickpad Button */}
            <button
              type="button"
              className="apple-clickpad-center"
              onClick={handleSelect}
              aria-label="Select / OK"
            >
              <span>select</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="apple-touch-surface"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="region"
          aria-label="Apple Glass Touch Surface"
        >
          {ripples.map((r) => (
            <div
              key={r.id}
              className="apple-touch-ripple"
              style={{ left: r.x, top: r.y }}
            />
          ))}
          <div className="apple-touch-crosshair">
            <div className="apple-touch-dot" />
          </div>
          <span className="apple-touch-caption">Swipe to Navigate • Tap to Select</span>
        </div>
      )}

      {/* Apple Siri Remote Tactile Button Cluster & Volume Rocker */}
      <div className="apple-remote-cluster">
        {/* Row 1: Back, TV/Home, Play/Pause */}
        <button
          type="button"
          className="apple-key-btn"
          onClick={handleBack}
          title="Back"
          aria-label="Back"
        >
          <BackIcon size={20} strokeWidth={2.5} />
          <span className="apple-key-label">Back</span>
        </button>

        <button
          type="button"
          className="apple-key-btn"
          onClick={handleHome}
          title="TV / Home"
          aria-label="Home"
        >
          <Tv size={18} />
          <span className="apple-key-label">TV</span>
        </button>

        <button
          type="button"
          className="apple-key-btn"
          onClick={handlePlayPause}
          title="Play / Pause"
          aria-label="Play / Pause"
        >
          {isMediaPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          <span className="apple-key-label">{isMediaPlaying ? 'Pause' : 'Play'}</span>
        </button>

        {/* Right Column: Siri Remote Physical Volume Rocker Pill */}
        <div className="apple-volume-rocker" style={{ gridRow: 'span 2' }}>
          <button
            type="button"
            className="apple-rocker-half"
            onClick={() => handleVolumeDelta(0.05)}
            title="Volume Up"
            aria-label="Volume Up"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <div className="apple-rocker-divider" />
          <button
            type="button"
            className="apple-rocker-half"
            onClick={() => handleVolumeDelta(-0.05)}
            title="Volume Down"
            aria-label="Volume Down"
          >
            <Minus size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Row 2: Control Center / Quick Settings, Mute Toggle */}
        <button
          type="button"
          className="apple-key-btn"
          onClick={handleQuickSettings}
          title="Control Center / Quick Settings"
          aria-label="Control Center"
        >
          <SlidersHorizontal size={18} />
          <span className="apple-key-label">Control</span>
        </button>

        <button
          type="button"
          className="apple-key-btn"
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          aria-label="Toggle Mute"
          style={isMuted ? { color: '#ff453a' } : undefined}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span className="apple-key-label">{isMuted ? 'Muted' : 'Mute'}</span>
        </button>
      </div>
    </div>
  );
};
