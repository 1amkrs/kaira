import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  Lock, 
  Unlock, 
  Plus, 
  Edit3, 
  ArrowLeft
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
        aria-label="Who's Watching?"
      >
        <div className="tv-profile-minimal-stage">
          {/* Minimalist Title */}
          <div className="tv-profile-minimal-header">
            <h1 className="tv-profile-minimal-title">
              {isManageMode ? 'Manage Profiles' : "Who's watching?"}
            </h1>
            <p className="tv-profile-minimal-hint">
              {isManageMode
                ? 'Customize your avatar, edit names, or set up a 4-digit PIN lock.'
                : 'Select your profile to jump back into your watchlist and recommendations.'}
            </p>
          </div>

          {/* Horizontal Floating Avatar Carousel */}
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
                >
                  {(isFocused) => (
                    <div
                      className={`tv-profile-avatar-card ${isSelected ? 'active-user' : ''} ${
                        isFocused ? 'focused' : ''
                      } ${isManageMode ? 'editing' : ''}`}
                    >
                      {/* Avatar Circle Disc */}
                      <div 
                        className="tv-profile-avatar-disc"
                        style={{ background: prof.avatarColor }}
                      >
                        {renderAvatarIcon(prof.avatarIcon, 44, '#ffffff')}

                        {/* Active Dot Indicator */}
                        {isSelected && !isManageMode && (
                          <div className="tv-profile-avatar-active-dot" title="Current Active Profile" />
                        )}

                        {/* Discreet Lock Badge */}
                        {hasPin && (
                          <div 
                            className={`tv-profile-avatar-lock-tag ${isUnlocked ? 'unlocked' : 'locked'}`}
                            title={isUnlocked ? 'Unlocked' : 'PIN Required'}
                          >
                            {isUnlocked ? <Unlock size={11} /> : <Lock size={11} />}
                          </div>
                        )}

                        {/* Edit Mode Pencil Overlay */}
                        {isManageMode && (
                          <div className="tv-profile-avatar-edit-overlay">
                            <Edit3 size={20} color="#ffffff" />
                          </div>
                        )}
                      </div>

                      {/* Clean Name */}
                      <span className="tv-profile-avatar-label">{prof.name}</span>
                    </div>
                  )}
                </Focusable>
              );
            })}

            {/* Add Profile Minimalist Circle */}
            <Focusable
              id="profile-add-card"
              groupId="profile-minimal-row"
              indexInGroup={profiles.length}
              className="tv-profile-avatar-focusable"
              onSelect={() => setEditingProfile('create')}
            >
              {(isFocused) => (
                <div className={`tv-profile-avatar-card add-user ${isFocused ? 'focused' : ''}`}>
                  <div className="tv-profile-avatar-disc add-disc">
                    <Plus size={36} color="rgba(255, 255, 255, 0.7)" />
                  </div>
                  <span className="tv-profile-avatar-label">Add Profile</span>
                </div>
              )}
            </Focusable>
          </div>

          {/* Minimal Floating Footer Actions */}
          <div className="tv-profile-minimal-footer">
            <Focusable
              id="profile-manage-toggle"
              groupId="profile-minimal-footer"
              indexInGroup={0}
              className="tv-profile-footer-btn-focusable"
              onSelect={() => setIsManageMode(!isManageMode)}
            >
              {(isFocused) => (
                <div className={`tv-profile-pill-btn ${isManageMode ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                  <Edit3 size={15} />
                  <span>{isManageMode ? 'Done' : 'Edit Profiles'}</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="profile-modal-close"
              groupId="profile-minimal-footer"
              indexInGroup={1}
              className="tv-profile-footer-btn-focusable"
              onSelect={onClose}
            >
              {(isFocused) => (
                <div className={`tv-profile-pill-btn secondary ${isFocused ? 'focused' : ''}`}>
                  <span>Cancel (B)</span>
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
