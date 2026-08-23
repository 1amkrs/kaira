import React, { useState, useEffect } from 'react';
import { Moon, Clock, X, Check, Power } from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import { sleepTimerService, SleepTimerState } from '../../services/sleep/sleepTimerService';
import './SleepTimerModal.css';

interface SleepTimerModalProps {
  onClose: () => void;
}

const PRESETS = [
  { minutes: 15, label: '15 Minutes' },
  { minutes: 30, label: '30 Minutes' },
  { minutes: 45, label: '45 Minutes' },
  { minutes: 60, label: '1 Hour' },
  { minutes: 90, label: '1.5 Hours' },
  { minutes: 120, label: '2 Hours' },
];

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({ onClose }) => {
  const [sleepState, setSleepState] = useState<SleepTimerState>(() => sleepTimerService.getState());

  useEffect(() => {
    return sleepTimerService.subscribe(setSleepState);
  }, []);

  const formatRemaining = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="tv-sleep-modal-backdrop animate-fade-in" onClick={onClose}>
      <div
        className="tv-sleep-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Sleep Timer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="tv-sleep-modal-header">
          <div className="tv-sleep-icon-box">
            <Moon size={28} className="tv-sleep-moon-icon" />
          </div>
          <div className="tv-sleep-header-text">
            <h2>Sleep Timer</h2>
            <p>Automatically pause playback and put your TV into standby mode</p>
          </div>
          <Focusable
            id="sleep-modal-close"
            groupId="sleep-timer-actions"
            indexInGroup={0}
            className="tv-sleep-close-btn"
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-modal-close-pill ${isFocused ? 'focused' : ''}`}>
                <X size={20} />
              </div>
            )}
          </Focusable>
        </div>

        {/* Active Countdown Banner */}
        {sleepState.isActive && (
          <div className="tv-sleep-active-banner">
            <div className="tv-sleep-countdown-box">
              <Clock size={20} className="tv-sleep-clock-pulse" />
              <span>Standby in <strong>{formatRemaining(sleepState.remainingSeconds)}</strong></span>
            </div>
            <Focusable
              id="sleep-timer-cancel-btn"
              groupId="sleep-timer-actions"
              indexInGroup={1}
              className="tv-sleep-cancel-btn-focusable"
              onSelect={() => {
                sleepTimerService.cancel();
              }}
            >
              {(isFocused) => (
                <div className={`tv-sleep-cancel-pill ${isFocused ? 'focused' : ''}`}>
                  <span>Cancel Timer</span>
                </div>
              )}
            </Focusable>
          </div>
        )}

        {/* Duration Presets Grid */}
        <div className="tv-sleep-presets-grid" role="list">
          {PRESETS.map((preset, idx) => {
            const isCurrentActive = sleepState.isActive && sleepState.durationMinutes === preset.minutes;
            return (
              <Focusable
                key={preset.minutes}
                id={`sleep-preset-${preset.minutes}`}
                groupId="sleep-presets-list"
                indexInGroup={idx}
                className="tv-sleep-preset-focusable"
                onSelect={() => {
                  sleepTimerService.start(preset.minutes);
                  onClose();
                }}
              >
                {(isFocused) => (
                  <div
                    className={`tv-sleep-preset-card ${isCurrentActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
                  >
                    <div className="tv-sleep-preset-mins">{preset.minutes}m</div>
                    <div className="tv-sleep-preset-label">{preset.label}</div>
                    {isCurrentActive && <Check size={18} className="tv-sleep-active-check" />}
                  </div>
                )}
              </Focusable>
            );
          })}
        </div>

        {/* Instant Sleep Action */}
        <div className="tv-sleep-footer-actions">
          <Focusable
            id="sleep-instant-btn"
            groupId="sleep-timer-footer"
            indexInGroup={0}
            className="tv-sleep-instant-focusable"
            onSelect={() => {
              sleepTimerService.start(1); // 1 minute quick sleep
              onClose();
            }}
          >
            {(isFocused) => (
              <div className={`tv-sleep-instant-btn ${isFocused ? 'focused' : ''}`}>
                <Power size={18} />
                <span>Sleep Now (1 min)</span>
              </div>
            )}
          </Focusable>
        </div>
      </div>
    </div>
  );
};
