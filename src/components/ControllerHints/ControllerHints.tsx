import React from 'react';
import './ControllerHints.css';

interface ControllerHintsProps {
  customHints?: { button: string; label: string; color?: string }[];
}

export const ControllerHints: React.FC<ControllerHintsProps> = ({ customHints }) => {
  const defaultHints = [
    { button: 'A', label: 'Select', color: '#81c995' }, // Green
    { button: 'B', label: 'Back', color: '#f28b82' },   // Red
    { button: 'Y', label: 'Search', color: '#fdd663' }, // Yellow
    { button: 'LB/RB', label: 'Tabs', color: '#ff453a' },
    { button: 'Menu', label: 'Settings', color: 'rgba(255, 255, 255, 0.7)' },
  ];

  const hints = customHints || defaultHints;

  return (
    <footer className="tv-controller-hints-bar" aria-hidden="true">
      <div className="tv-hints-list">
        {hints.map((hint, idx) => (
          <div key={idx} className="tv-hint-item">
            <span
              className="tv-btn-badge"
              style={{
                borderColor: hint.color ? `${hint.color}88` : 'rgba(255, 255, 255, 0.3)',
                color: hint.color || 'var(--text-primary)',
              }}
            >
              {hint.button}
            </span>
            <span className="tv-hint-label">{hint.label}</span>
          </div>
        ))}
      </div>
    </footer>
  );
};
