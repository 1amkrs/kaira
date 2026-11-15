import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  Plus,
  Edit3,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import { UserProfile, CreateProfileDTO, UpdateProfileDTO } from '../../types/profile';
import { profileService } from '../../services/profile/ProfileService';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { PinModal, renderAvatarIcon } from './PinModal';
import { ProfileEditorModal } from './ProfileEditorModal';
import './ProfileModal.css';

export { DEFAULT_PROFILES as PROFILES } from '../../services/profile/ProfileService';
export type { UserProfile };

interface ProfileModalProps {
  currentProfileId?: string;
  onSelectProfile?: (profile: UserProfile) => void;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  currentProfileId,
  onSelectProfile,
  onClose,
}) => {
  const [profiles, setProfiles] = useState<UserProfile[]>(() => profileService.getProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(
    currentProfileId || profileService.getActiveProfile().id
  );
  const [isManageMode, setIsManageMode] = useState<boolean>(false);
  const [pinTargetProfile, setPinTargetProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null | 'create'>(null);

  useEffect(() => {
    spatialNav.pushScope('profile-select-screen');
    return () => {
      spatialNav.popScope('profile-select-screen');
    };
  }, []);

  useEffect(() => {
    const unsub = profileService.subscribe((state) => {
      setProfiles(state.profiles);
      setActiveProfileId(state.activeProfileId);
    });
    return unsub;
  }, []);

  const handleProfileClick = (prof: UserProfile) => {
    if (isManageMode) {
      setEditingProfile(prof);
      return;
    }

    const isUnlocked = profileService.isProfileUnlocked(prof.id);

    if (prof.pin && !isUnlocked) {
      setPinTargetProfile(prof);
    } else {
      profileService.setActiveProfile(prof.id);
      if (onSelectProfile) onSelectProfile(prof);
      onClose();
    }
  };

  const handlePinSuccess = (enteredPin: string, rememberOnDevice?: boolean) => {
    if (!pinTargetProfile) return;
    const res = profileService.setActiveProfile(pinTargetProfile.id, enteredPin, rememberOnDevice);
    if (res.success) {
      if (onSelectProfile) onSelectProfile(pinTargetProfile);
      setPinTargetProfile(null);
      onClose();
    }
  };

  const handleSaveProfile = (data: CreateProfileDTO | UpdateProfileDTO) => {
    if (editingProfile === 'create') {
      profileService.createProfile(data as CreateProfileDTO);
    } else if (editingProfile) {
      profileService.updateProfile(editingProfile.id, data as UpdateProfileDTO);
    }
    setEditingProfile(null);
  };

  const handleDeleteProfile = (id: string) => {
    profileService.deleteProfile(id);
    setEditingProfile(null);
  };

  return (
    <>
      <div
        className="tv-profile-screen-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={isManageMode ? 'Manage profiles' : "Who's watching?"}
      >
        <div className="tv-profile-minimal-stage">
          <h1 className="tv-profile-minimal-title">
            {isManageMode ? 'Manage profiles' : "Who's watching?"}
          </h1>

          {/* Simplified Netflix-style Rounded Avatars (No Cards) */}
          <div className="tv-profile-minimal-row" role="list">
            {profiles.map((prof, idx) => {
              const isSelected = prof.id === activeProfileId;
              const hasPin = Boolean(prof.pin);
              const isUnlocked = profileService.isProfileUnlocked(prof.id);

              return (
                <Focusable
                  key={prof.id}
                  id={`profile-card-${prof.id}`}
                  groupId="profile-minimal-row"
                  indexInGroup={idx}
                  autoFocus={idx === 0}
                  className="tv-profile-avatar-focusable"
                  onSelect={() => handleProfileClick(prof)}
                  scaleEffect={false}
                  role="listitem"
                  ariaLabel={`${prof.name}${isSelected ? ' (Active)' : ''}`}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-profile-avatar-item ${isSelected ? 'active-user' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      <div
                        className="tv-profile-avatar-tile"
                        style={{ background: prof.avatarColor }}
                      >
                        {renderAvatarIcon(prof.avatarIcon, 42, '#ffffff')}

                        {hasPin && (
                          <div
                            className={`tv-profile-avatar-lock-tag ${isUnlocked ? 'unlocked' : 'locked'}`}
                            title={isUnlocked ? 'Unlocked' : 'PIN Required'}
                          >
                            {isUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                          </div>
                        )}

                        {isManageMode && (
                          <div className="tv-profile-avatar-edit-overlay">
                            <Edit3 size={22} color="#ffffff" />
                          </div>
                        )}
                      </div>

                      <span className="tv-profile-avatar-label">{prof.name}</span>
                    </div>
                  )}
                </Focusable>
              );
            })}

            {/* Add Profile Tile */}
            <Focusable
              id="profile-add-card"
              groupId="profile-minimal-row"
              indexInGroup={profiles.length}
              className="tv-profile-avatar-focusable"
              onSelect={() => setEditingProfile('create')}
              scaleEffect={false}
              role="listitem"
              ariaLabel="Add Profile"
            >
              {(isFocused) => (
                <div className={`tv-profile-avatar-item add-user ${isFocused ? 'focused' : ''}`}>
                  <div className="tv-profile-avatar-tile add-tile">
                    <Plus size={36} />
                  </div>
                  <span className="tv-profile-avatar-label">Add Profile</span>
                </div>
              )}
            </Focusable>
          </div>

          {/* Minimal Actions */}
          <div className="tv-profile-minimal-footer">
            <Focusable
              id="profile-manage-toggle"
              groupId="profile-minimal-footer"
              indexInGroup={0}
              className="tv-profile-footer-btn-focusable"
              onSelect={() => setIsManageMode(!isManageMode)}
              scaleEffect={false}
              role="button"
              ariaLabel={isManageMode ? 'Done managing profiles' : 'Manage profiles'}
            >
              {(isFocused) => (
                <div className={`tv-profile-pill-btn ${isManageMode ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                  {isManageMode ? <Check size={16} /> : <Edit3 size={15} />}
                  <span>{isManageMode ? 'Done' : 'Manage Profiles'}</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="profile-modal-close"
              groupId="profile-minimal-footer"
              indexInGroup={1}
              className="tv-profile-footer-btn-focusable"
              onSelect={onClose}
              scaleEffect={false}
              role="button"
              ariaLabel="Close profile switcher"
            >
              {(isFocused) => (
                <div className={`tv-profile-pill-btn secondary ${isFocused ? 'focused' : ''}`}>
                  <ArrowLeft size={15} />
                  <span>Back</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>

      {/* PIN Verification Modal */}
      {pinTargetProfile && (
        <PinModal
          profile={pinTargetProfile}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinTargetProfile(null)}
        />
      )}

      {/* Profile Create / Edit Modal */}
      {editingProfile && (
        <ProfileEditorModal
          profile={editingProfile === 'create' ? null : editingProfile}
          onSave={handleSaveProfile}
          onDelete={handleDeleteProfile}
          onClose={() => setEditingProfile(null)}
          canDelete={profiles.length > 1}
        />
      )}
    </>
  );
};
