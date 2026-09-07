import React, { useState, useEffect, useCallback } from 'react';
import { Moon } from 'lucide-react';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import './StandbyScreen.css';

interface StandbyScreenProps {
  isActive: boolean;
  onWake: () => void;
}

export const StandbyScreen: React.FC<StandbyScreenProps> = ({ isActive, onWake }) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    if (!isActive) return;

    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Push spatial navigation scope to block background selection
  useEffect(() => {
    if (!isActive) return;

    spatialNav.pushScope('standby-screen-scope');
    return () => {
      spatialNav.popScope('standby-screen-scope');
    };
  }, [isActive]);

  const handleWakeEvent = useCallback(
    (e?: Event | React.SyntheticEvent) => {
      if (!isActive) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      onWake();
    },
    [isActive, onWake]
  );

  useEffect(() => {
    if (!isActive) return;

    window.addEventListener('keydown', handleWakeEvent, { capture: true });
    window.addEventListener('pointerdown', handleWakeEvent, { capture: true });
    window.addEventListener('gamepadconnected', handleWakeEvent, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleWakeEvent, { capture: true });
      window.removeEventListener('pointerdown', handleWakeEvent, { capture: true });
      window.removeEventListener('gamepadconnected', handleWakeEvent, { capture: true });
    };
  }, [isActive, handleWakeEvent]);

  if (!isActive) return null;

  return (
    <div
      className="tv-standby-container"
      role="presentation"
      onClick={handleWakeEvent}
    >
      <div className="tv-standby-content">
        <div className="tv-standby-led-box">
          <Moon size={24} className="tv-standby-icon" />
        </div>
        <div className="tv-standby-clock">{timeStr}</div>
        <div className="tv-standby-title">tvOS in Standby</div>
        <div className="tv-standby-hint">Press any button on remote or keyboard to wake</div>
      </div>
    </div>
  );
};
