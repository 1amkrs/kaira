import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, 
  User, 
  Sparkles, 
  Gamepad2, 
  Film, 
  Music, 
  Baby, 
  Heart, 
  Tv, 
  Star, 
  Delete, 
  X, 
  AlertCircle,
  Key,
  Check
} from 'lucide-react';
import { UserProfile, AvatarIconType } from '../../types/profile';
import { profileService } from '../../services/profile/ProfileService';
import { Focusable } from '../Focusable/Focusable';
import './PinModal.css';

export const renderAvatarIcon = (icon?: AvatarIconType, size = 32, color = '#ffffff') => {
  switch (icon) {
    case 'sparkles': return <Sparkles size={size} color={color} />;
    case 'gamepad': return <Gamepad2 size={size} color={color} />;
    case 'film': return <Film size={size} color={color} />;
    case 'music': return <Music size={size} color={color} />;
    case 'baby': return <Baby size={size} color={color} />;
    case 'heart': return <Heart size={size} color={color} />;
    case 'tv': return <Tv size={size} color={color} />;
    case 'star': return <Star size={size} color={color} />;
    case 'user':
    default:
      return <User size={size} color={color} />;
  }
};

interface PinModalProps {
  profile: UserProfile;
  title?: string;
  subtitle?: string;
  expectedPin?: string; // If provided, validates against this PIN, otherwise passes entered PIN to onSuccess
  onSuccess: (enteredPin: string, rememberOnDevice?: boolean) => void;
  onCancel: () => void;
}

const NUMPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace'],
];

export const PinModal: React.FC<PinModalProps> = ({
  profile,
  title = "Enter 4-Digit PIN",
  subtitle,
  expectedPin,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [rememberOnDevice, setRememberOnDevice] = useState<boolean>(() => {
    return profileService.getPinMemoryPolicy() !== 'always';
  });

  const targetPin = expectedPin !== undefined ? expectedPin : profile.pin;

  const handleDigit = useCallback((digit: string) => {
    setError(null);
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      return next;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
    setPin('');
  }, []);

  // Validate whenever pin reaches 4 digits
  useEffect(() => {
    if (pin.length === 4) {
      if (targetPin) {
        if (pin === targetPin) {
          onSuccess(pin, rememberOnDevice);
        } else {
          setIsShaking(true);
          setError('Incorrect PIN. Please try again.');
          const timer = setTimeout(() => {
            setPin('');
            setIsShaking(false);
          }, 450);
          return () => clearTimeout(timer);
        }
      } else {
        // No expected pin to compare (e.g. setting new pin mode)
        onSuccess(pin, rememberOnDevice);
      }
    }
  }, [pin, targetPin, rememberOnDevice, onSuccess]);

  // Physical keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, onCancel]);

  return (
    <div className="tv-pin-modal-backdrop" role="dialog" aria-label="Enter PIN">
      <div className={`tv-pin-modal-panel ${isShaking ? 'shake-anim' : ''}`}>
        {/* Top Cancel / Close Button */}
        <div className="tv-pin-header">
          <Focusable
            id="pin-modal-cancel"
            groupId="pin-nav"
            indexInGroup={0}
            className="tv-pin-cancel-focusable"
            onSelect={onCancel}
          >
            {(isFocused) => (
              <div className={`tv-pin-cancel-btn ${isFocused ? 'focused' : ''}`}>
                <X size={18} />
                <span>Cancel (B)</span>
              </div>
            )}
          </Focusable>
        </div>

        {/* Profile Avatar & Lock Info */}
        <div className="tv-pin-profile-info">
          <div className="tv-pin-avatar" style={{ background: profile.avatarColor }}>
            {renderAvatarIcon(profile.avatarIcon, 34, '#ffffff')}
            <div className="tv-pin-lock-badge">
              <Lock size={14} color="#ffffff" />
            </div>
          </div>

          <h2 className="tv-pin-title">{title}</h2>
          <p className="tv-pin-subtitle">
            {subtitle || `Enter 4-digit security PIN for ${profile.name}`}
          </p>
        </div>

        {/* 4-Digit Security Dots Indicator */}
        <div className="tv-pin-dots-container">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`tv-pin-dot ${isFilled ? 'filled' : ''} ${error ? 'error' : ''}`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="tv-pin-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 0-9 On-Screen Remote Numpad */}
        <div className="tv-pin-numpad-grid">
          {NUMPAD_KEYS.map((row, rowIdx) => (
            <div key={`row-${rowIdx}`} className="tv-pin-numpad-row">
              {row.map((keyVal, colIdx) => {
                const isClear = keyVal === 'clear';
                const isBackspace = keyVal === 'backspace';
                const btnId = `pin-key-${keyVal}`;
                const groupIdx = rowIdx * 3 + colIdx;

                return (
                  <Focusable
                    key={btnId}
                    id={btnId}
                    groupId="pin-numpad"
                    indexInGroup={groupIdx}
                    autoFocus={rowIdx === 0 && colIdx === 0}
                    className="tv-pin-key-focusable"
                    onSelect={() => {
                      if (isClear) handleClear();
                      else if (isBackspace) handleBackspace();
                      else handleDigit(keyVal);
                    }}
                  >
                    {(isFocused) => (
                      <div
                        className={`tv-pin-key-btn ${isFocused ? 'focused' : ''} ${
                          isClear || isBackspace ? 'action-key' : ''
                        }`}
                      >
                        {isClear ? (
                          <span className="key-action-text">Clear</span>
                        ) : isBackspace ? (
                          <Delete size={22} />
                        ) : (
                          <span className="key-num-text">{keyVal}</span>
                        )}
                      </div>
                    )}
                  </Focusable>
                );
              })}
            </div>
          ))}
        </div>

        {/* PIN Memory Function Toggle */}
        <div className="tv-pin-memory-footer">
          <Focusable
            id="pin-remember-toggle"
            groupId="pin-memory-nav"
            indexInGroup={0}
            className="tv-pin-memory-focusable"
            onSelect={() => setRememberOnDevice(!rememberOnDevice)}
          >
            {(isFocused) => (
              <div className={`tv-pin-memory-pill ${rememberOnDevice ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                <Key size={14} />
                <span>{rememberOnDevice ? 'Remember PIN on this TV' : 'Always ask PIN on switch'}</span>
                {rememberOnDevice && <Check size={14} />}
              </div>
            )}
          </Focusable>
        </div>
      </div>
    </div>
  );
};
