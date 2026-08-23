import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Sparkles, 
  Gamepad2, 
  Film, 
  Music, 
  Baby, 
  Heart, 
  Tv, 
  Star, 
  Lock, 
  Unlock, 
  Trash2, 
  Check, 
  X, 
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Keyboard as KeyboardIcon,
  Edit2
} from 'lucide-react';
import { UserProfile, CreateProfileDTO, UpdateProfileDTO, AvatarIconType } from '../../types/profile';
import { AVATAR_COLOR_PALETTES } from '../../services/profile/ProfileService';
import { Focusable } from '../Focusable/Focusable';
import { OnScreenKeyboard } from '../OnScreenKeyboard/OnScreenKeyboard';
import { renderAvatarIcon } from './PinModal';
import './ProfileEditorModal.css';

interface ProfileEditorModalProps {
  profile?: UserProfile | null; // null for Create mode
  onSave: (data: CreateProfileDTO | UpdateProfileDTO) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  canDelete?: boolean;
}

const AVATAR_ICONS: { id: AvatarIconType; label: string }[] = [
  { id: 'user', label: 'User' },
  { id: 'sparkles', label: 'Magic' },
  { id: 'gamepad', label: 'Gaming' },
  { id: 'film', label: 'Cinema' },
  { id: 'music', label: 'Music' },
  { id: 'baby', label: 'Kids' },
  { id: 'heart', label: 'Heart' },
  { id: 'tv', label: 'Television' },
  { id: 'star', label: 'Star' },
];

const PRESET_NAMES = [
  'Personal',
  'Living Room',
  'Family',
  'Master TV',
  'Kids',
  'Guest',
  'Alex',
  'Emma',
];

export const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  profile,
  onSave,
  onDelete,
  onClose,
  canDelete = false,
}) => {
  const isEditing = Boolean(profile);

  const [name, setName] = useState<string>(profile?.name || '');
  const [type, setType] = useState<'adult' | 'kids' | 'guest'>(profile?.type || 'adult');
  const [avatarColor, setAvatarColor] = useState<string>(profile?.avatarColor || AVATAR_COLOR_PALETTES[0]);
  const [avatarIcon, setAvatarIcon] = useState<AvatarIconType>(profile?.avatarIcon || (profile?.type === 'kids' ? 'baby' : 'user'));
  
  // Virtual Keyboard toggle
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(false);

  // PIN state
  const [hasPin, setHasPin] = useState<boolean>(Boolean(profile?.pin));
  const [pin, setPin] = useState<string>(profile?.pin || '');
  const [confirmPin, setConfirmPin] = useState<string>(profile?.pin || '');
  
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on initial mount if not editing or when requested
    if (!isEditing) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isEditing]);

  const handleTypeSelect = (selectedType: 'adult' | 'kids' | 'guest') => {
    setType(selectedType);
    if (!isEditing) {
      if (selectedType === 'kids') {
        setAvatarIcon('baby');
        setAvatarColor(AVATAR_COLOR_PALETTES[1]);
      } else if (selectedType === 'guest') {
        setAvatarIcon('sparkles');
        setAvatarColor(AVATAR_COLOR_PALETTES[2]);
      } else {
        setAvatarIcon('user');
        setAvatarColor(AVATAR_COLOR_PALETTES[0]);
      }
    }
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a profile name.');
      nameInputRef.current?.focus();
      return;
    }

    if (hasPin) {
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        setError('PIN must be exactly 4 numeric digits (0-9).');
        return;
      }
      if (pin !== confirmPin) {
        setError('PIN confirmation does not match.');
        return;
      }
    }

    if (isEditing && profile) {
      const updateData: UpdateProfileDTO = {
        name: trimmedName,
        type: type,
        avatarColor: avatarColor,
        avatarIcon: avatarIcon,
        pin: hasPin ? pin : null,
        isKid: type === 'kids',
      };
      onSave(updateData);
    } else {
      const createData: CreateProfileDTO = {
        name: trimmedName,
        type: type,
        avatarColor: avatarColor,
        avatarIcon: avatarIcon,
        pin: hasPin ? pin : undefined,
        isKid: type === 'kids',
      };
      onSave(createData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (profile && onDelete) {
      onDelete(profile.id);
      onClose();
    }
  };

  return (
    <div className="tv-profile-editor-backdrop" role="dialog" aria-label="Profile Editor">
      <div className="tv-profile-editor-panel tv-scroll-container">
        {/* Header */}
        <div className="tv-editor-header">
          <div className="tv-editor-title-col">
            <h2 className="tv-editor-title">
              {isEditing ? `Edit Profile: ${profile?.name}` : 'Create New Profile'}
            </h2>
            <p className="tv-editor-subtitle">
              {isEditing
                ? 'Update display preferences, avatar appearance, and 4-digit PIN security.'
                : 'Set up an individual watching profile with personalized recommendations and PIN lock.'}
            </p>
          </div>

          <Focusable
            id="editor-close-btn"
            groupId="editor-top-nav"
            indexInGroup={0}
            className="tv-editor-close-focusable"
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-editor-close-btn ${isFocused ? 'focused' : ''}`}>
                <X size={18} />
                <span>Cancel</span>
              </div>
            )}
          </Focusable>
        </div>

        {/* Live Preview Hero Card */}
        <div className="tv-editor-preview-card">
          <div className="tv-editor-preview-avatar" style={{ background: avatarColor }}>
            {renderAvatarIcon(avatarIcon, 40, '#ffffff')}
            {hasPin && (
              <div className="tv-editor-preview-lock">
                <Lock size={15} color="#ffffff" />
              </div>
            )}
          </div>

          <div className="tv-editor-preview-meta">
            <span className="tv-editor-preview-name">{name.trim() || 'Profile Name'}</span>
            <div className="tv-editor-preview-badges">
              <span className="tv-editor-badge-pill">
                {type === 'kids' ? 'Family Friendly' : type === 'guest' ? 'Incognito' : 'Full Access'}
              </span>
              {hasPin && (
                <span className="tv-editor-badge-pill pin-active">
                  <Lock size={12} /> 4-Digit PIN
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="tv-editor-error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Form Sections */}
        <div className="tv-editor-form-group">
          {/* 1. Profile Name Field */}
          <div className="tv-editor-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="tv-editor-label">Profile Name</label>
              <Focusable
                id="editor-toggle-osk"
                groupId="editor-name-row"
                indexInGroup={1}
                className="tv-osk-toggle-focusable"
                onSelect={() => setShowVirtualKeyboard(!showVirtualKeyboard)}
              >
                {(isFocused) => (
                  <div className={`tv-editor-osk-pill ${showVirtualKeyboard ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                    <KeyboardIcon size={14} />
                    <span>{showVirtualKeyboard ? 'Hide On-Screen Keyboard' : 'On-Screen Keyboard'}</span>
                  </div>
                )}
              </Focusable>
            </div>

            <Focusable
              id="editor-name-input-box"
              groupId="editor-name-row"
              indexInGroup={0}
              className="tv-name-input-focusable"
              onSelect={() => {
                nameInputRef.current?.focus();
              }}
            >
              {(isFocused) => (
                <div className={`tv-editor-input-wrapper ${isFocused ? 'focused' : ''}`}>
                  <Edit2 size={18} className="tv-editor-input-icon" />
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter profile name (e.g. Alex, Living Room)"
                    maxLength={28}
                    className="tv-editor-input"
                    onFocus={() => setError(null)}
                  />
                  {name.length > 0 && (
                    <button
                      type="button"
                      className="tv-editor-clear-name-btn"
                      onClick={() => {
                        setName('');
                        nameInputRef.current?.focus();
                      }}
                      title="Clear Name"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}
            </Focusable>

            {/* Quick Preset Name Suggestions */}
            <div className="tv-name-presets-row">
              <span className="tv-name-presets-label">Suggestions:</span>
              {PRESET_NAMES.map((preset, idx) => (
                <Focusable
                  key={preset}
                  id={`name-preset-${idx}`}
                  groupId="editor-name-presets"
                  indexInGroup={idx}
                  className="tv-preset-chip-focusable"
                  onSelect={() => {
                    setName(preset);
                    setError(null);
                  }}
                >
                  {(isFocused) => (
                    <div className={`tv-preset-chip ${name === preset ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {preset}
                    </div>
                  )}
                </Focusable>
              ))}
            </div>

            {/* Optional On-Screen Keyboard */}
            {showVirtualKeyboard && (
              <div className="tv-editor-osk-container">
                <OnScreenKeyboard
                  onKeyPress={(char) => {
                    setName((prev) => (prev.length < 28 ? prev + char : prev));
                    setError(null);
                  }}
                  onBackspace={() => {
                    setName((prev) => prev.slice(0, -1));
                  }}
                  onClear={() => {
                    setName('');
                  }}
                  onSubmit={() => {
                    setShowVirtualKeyboard(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* 2. Profile Type */}
          <div className="tv-editor-field">
            <label className="tv-editor-label">Profile Type</label>
            <div className="tv-editor-type-grid">
              {(
                [
                  { id: 'adult', title: 'Adult / General', desc: 'Full access to movies, shows, and music' },
                  { id: 'kids', title: 'Kids & Family', desc: 'Family-friendly safe content recommendations' },
                  { id: 'guest', title: 'Guest Mode', desc: 'Temporary profile with incognito history' },
                ] as const
              ).map((t, idx) => (
                <Focusable
                  key={t.id}
                  id={`type-opt-${t.id}`}
                  groupId="editor-type-options"
                  indexInGroup={idx}
                  className="tv-type-btn-focusable"
                  onSelect={() => handleTypeSelect(t.id)}
                >
                  {(isFocused) => (
                    <div className={`tv-type-card ${type === t.id ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      <div className="tv-type-card-top">
                        <span className="tv-type-title">{t.title}</span>
                        {type === t.id && <Check size={16} color="#ff453a" />}
                      </div>
                      <span className="tv-type-desc">{t.desc}</span>
                    </div>
                  )}
                </Focusable>
              ))}
            </div>
          </div>

          {/* 3. Avatar Color Gradients */}
          <div className="tv-editor-field">
            <label className="tv-editor-label">Avatar Color Theme</label>
            <div className="tv-editor-colors-row">
              {AVATAR_COLOR_PALETTES.map((colorGrad, idx) => {
                const isSelected = avatarColor === colorGrad;
                return (
                  <Focusable
                    key={`color-${idx}`}
                    id={`color-opt-${idx}`}
                    groupId="editor-color-options"
                    indexInGroup={idx}
                    className="tv-color-chip-focusable"
                    onSelect={() => setAvatarColor(colorGrad)}
                  >
                    {(isFocused) => (
                      <div
                        className={`tv-color-chip ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                        style={{ background: colorGrad }}
                      >
                        {isSelected && <Check size={16} color="#ffffff" />}
                      </div>
                    )}
                  </Focusable>
                );
              })}
            </div>
          </div>

          {/* 4. Avatar Icon */}
          <div className="tv-editor-field">
            <label className="tv-editor-label">Avatar Icon</label>
            <div className="tv-editor-icons-row">
              {AVATAR_ICONS.map((item, idx) => {
                const isSelected = avatarIcon === item.id;
                return (
                  <Focusable
                    key={item.id}
                    id={`icon-opt-${item.id}`}
                    groupId="editor-icon-options"
                    indexInGroup={idx}
                    className="tv-icon-chip-focusable"
                    onSelect={() => setAvatarIcon(item.id)}
                  >
                    {(isFocused) => (
                      <div className={`tv-icon-chip ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}>
                        {renderAvatarIcon(item.id, 22, isSelected ? '#ff453a' : '#ffffff')}
                        <span className="tv-icon-chip-label">{item.label}</span>
                      </div>
                    )}
                  </Focusable>
                );
              })}
            </div>
          </div>

          {/* 5. 4-Digit PIN Security */}
          <div className="tv-editor-field tv-pin-settings-box">
            <div className="tv-pin-toggle-header">
              <div className="tv-pin-toggle-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {hasPin ? <ShieldAlert size={20} color="#ea4335" /> : <ShieldCheck size={20} color="#9aa0a6" />}
                  <span className="tv-pin-toggle-title">4-Digit Security PIN</span>
                </div>
                <span className="tv-pin-toggle-desc">
                  Require a 4-digit numeric PIN on the remote keypad before switching to this profile.
                </span>
              </div>

              <Focusable
                id="editor-pin-toggle"
                groupId="editor-pin-group"
                indexInGroup={0}
                className="tv-pin-toggle-focusable"
                onSelect={() => {
                  setHasPin(!hasPin);
                  if (hasPin) {
                    setPin('');
                    setConfirmPin('');
                  }
                }}
              >
                {(isFocused) => (
                  <div className={`tv-pin-toggle-btn ${hasPin ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                    {hasPin ? <Lock size={16} /> : <Unlock size={16} />}
                    <span>{hasPin ? 'PIN Enabled' : 'No PIN'}</span>
                  </div>
                )}
              </Focusable>
            </div>

            {hasPin && (
              <div className="tv-pin-inputs-row">
                <div className="tv-pin-input-group">
                  <label className="tv-sublabel">Enter 4-Digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPin(val);
                      setError(null);
                    }}
                    placeholder="••••"
                    className="tv-editor-pin-input"
                  />
                </div>

                <div className="tv-pin-input-group">
                  <label className="tv-sublabel">Confirm 4-Digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setConfirmPin(val);
                      setError(null);
                    }}
                    placeholder="••••"
                    className="tv-editor-pin-input"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Overlay */}
        {showDeleteConfirm && (
          <div className="tv-editor-delete-confirm-box">
            <AlertCircle size={24} color="#ea4335" />
            <div className="tv-delete-confirm-text">
              <span className="tv-delete-confirm-title">Are you sure you want to delete this profile?</span>
              <span className="tv-delete-confirm-desc">
                Personalized watch history and favorites for this profile will be removed.
              </span>
            </div>
            <div className="tv-delete-confirm-actions">
              <Focusable
                id="delete-confirm-yes"
                groupId="editor-delete-actions"
                indexInGroup={0}
                className="tv-btn-danger-focusable"
                onSelect={handleDelete}
              >
                {(isFocused) => (
                  <div className={`tv-btn-danger ${isFocused ? 'focused' : ''}`}>
                    <Trash2 size={16} />
                    <span>Confirm Delete</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="delete-confirm-no"
                groupId="editor-delete-actions"
                indexInGroup={1}
                className="tv-btn-cancel-focusable"
                onSelect={() => setShowDeleteConfirm(false)}
              >
                {(isFocused) => (
                  <div className={`tv-btn-secondary ${isFocused ? 'focused' : ''}`}>
                    <span>Cancel</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        )}

        {/* Footer Action Buttons */}
        <div className="tv-editor-footer">
          {isEditing && canDelete && !showDeleteConfirm && (
            <Focusable
              id="editor-btn-delete"
              groupId="editor-footer-nav"
              indexInGroup={0}
              className="tv-btn-danger-focusable"
              onSelect={() => setShowDeleteConfirm(true)}
            >
              {(isFocused) => (
                <div className={`tv-btn-danger ${isFocused ? 'focused' : ''}`}>
                  <Trash2 size={16} />
                  <span>Delete Profile</span>
                </div>
              )}
            </Focusable>
          )}

          <div className="tv-editor-footer-right">
            <Focusable
              id="editor-btn-cancel"
              groupId="editor-footer-nav"
              indexInGroup={1}
              className="tv-btn-cancel-focusable"
              onSelect={onClose}
            >
              {(isFocused) => (
                <div className={`tv-btn-secondary ${isFocused ? 'focused' : ''}`}>
                  <span>Cancel</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="editor-btn-save"
              groupId="editor-footer-nav"
              indexInGroup={2}
              className="tv-btn-primary-focusable"
              onSelect={handleSave}
            >
              {(isFocused) => (
                <div className={`tv-btn-primary ${isFocused ? 'focused' : ''}`}>
                  <Check size={18} />
                  <span>{isEditing ? 'Save Changes' : 'Create Profile'}</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>
    </div>
  );
};
