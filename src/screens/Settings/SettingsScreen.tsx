import React, { useState, useEffect } from 'react';
import { 
  Tv, 
  Gamepad, 
  Grid, 
  Lightbulb, 
  Monitor, 
  Power, 
  ChevronRight, 
  Check, 
  X, 
  Volume2, 
  Sliders, 
  ShieldCheck,
  Shield,
  ShieldAlert,
  Blocks,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Users,
  Lock,
  Unlock,
  Edit3,
  Moon,
  Zap,
  Smartphone,
  QrCode
} from 'lucide-react';
import { Focusable } from '../../components/Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { ambientService } from '../../services/ambient/ambientService';
import { displayService } from '../../services/display/displayService';
import { addonService } from '../../services/addons/AddonService';
import { ublockService, UBlockState } from '../../services/adblock/adblockService';
import { profileService } from '../../services/profile/ProfileService';
import { UserProfile, CreateProfileDTO, UpdateProfileDTO, ProfileServiceState } from '../../types/profile';
import { PinModal, renderAvatarIcon } from '../../components/Profile/PinModal';
import { ProfileEditorModal } from '../../components/Profile/ProfileEditorModal';
import { soundEffectsService } from '../../services/audio/soundEffectsService';
import { systemService } from '../../services/system/SystemService';
import { remoteService } from '../../services/remote/RemoteService';
import { generateQRCodeSVG } from '../../utils/qrCodeGenerator';
import { gamepadManager, GamepadActionDiagnostic } from '../../services/controller/gamepadManager';
import { SystemDiagnostics } from '../../platform/types';
import { AmbientState, DisplaySettings } from '../../types';
import { InstalledAddon, DebridConfig } from '../../types/addons';
import './SettingsScreen.css';

interface SettingsScreenProps {
  onClose: () => void;
}

type SettingsCategory = 'profiles' | 'addons' | 'ublock' | 'display' | 'controller' | 'remote' | 'ambient' | 'tv-mode' | 'system';

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('profiles');
  const [ambientState, setAmbientState] = useState<AmbientState>(() => ambientService.getState());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => displayService.getSettings());
  const [ublockState, setUblockState] = useState<UBlockState>(() => ublockService.getState());
  const [activeGamepads, setActiveGamepads] = useState<string[]>([]);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => soundEffectsService.getEnabled());
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(() => systemService.getCachedDiagnostics());
  const [clientCount, setClientCount] = useState<number>(() => remoteService.getConnectedClients());
  const [lastAction, setLastAction] = useState<GamepadActionDiagnostic | null>(null);
  const [actionLog, setActionLog] = useState<GamepadActionDiagnostic[]>([]);

  // Profile Management state
  const [profileState, setProfileState] = useState<ProfileServiceState>(() => profileService.getState());
  const [pinTargetProfile, setPinTargetProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null | 'create'>(null);

  // Addon & Debrid state
  const [addons, setAddons] = useState<InstalledAddon[]>(() => addonService.getInstalledAddons());
  const [debridConfig, setDebridConfig] = useState<DebridConfig>(() => addonService.getDebridConfig());
  const [newAddonUrl, setNewAddonUrl] = useState<string>('');
  const [installStatus, setInstallStatus] = useState<string | null>(null);

  useEffect(() => {
    spatialNav.pushScope('settings-screen');
    remoteService.discoverServerInfo();
    return () => {
      spatialNav.popScope('settings-screen');
    };
  }, []);

  useEffect(() => {
    const unsub = ambientService.subscribe(setAmbientState);
    const unsubUblock = ublockService.subscribe(setUblockState);
    const unsubProfile = profileService.subscribe(setProfileState);
    const unsubDiag = systemService.subscribe(setDiagnostics);
    const unsubRemote = remoteService.subscribeClientCount(setClientCount);
    const unsubGamepad = gamepadManager.subscribeAction((diag) => {
      setLastAction(diag);
      setActionLog((prev) => [diag, ...prev].slice(0, 6));
    });

    return () => {
      unsub();
      unsubUblock();
      unsubProfile();
      unsubDiag();
      unsubRemote();
      unsubGamepad();
    };
  }, []);


  useEffect(() => {
    const checkGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const list: string[] = [];
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i]!.connected) {
          list.push(pads[i]!.id);
        }
      }
      setActiveGamepads(list);
    };

    checkGamepads();
    window.addEventListener('gamepadconnected', checkGamepads);
    window.addEventListener('gamepaddisconnected', checkGamepads);
    return () => {
      window.removeEventListener('gamepadconnected', checkGamepads);
      window.removeEventListener('gamepaddisconnected', checkGamepads);
    };
  }, []);

  const handleResolutionChange = (res: '1080p' | '1440p' | '4k') => {
    displayService.setResolution(res);
    setDisplaySettings((prev) => ({ ...prev, resolution: res }));
  };

  const handleToggleFullscreen = async () => {
    const isFull = await displayService.toggleFullscreen();
    setDisplaySettings((prev) => ({ ...prev, tvMode: isFull }));
  };

  const handleAmbientModeChange = (mode: 'ambient' | 'static' | 'test' | 'cycle' | 'off') => {
    ambientService.setMode(mode);
  };

  const handleIntensityChange = (delta: number) => {
    const newInt = Math.max(10, Math.min(100, ambientState.intensity + delta));
    ambientService.setIntensity(newInt);
  };

  // Addon Actions
  const handleToggleAddon = (addonId: string, current: boolean) => {
    addonService.toggleAddon(addonId, !current);
    setAddons(addonService.getInstalledAddons());
  };

  const handleUninstallAddon = (addonId: string) => {
    addonService.uninstallAddon(addonId);
    setAddons(addonService.getInstalledAddons());
  };

  const handleInstallAddon = async (url: string) => {
    if (!url) return;
    try {
      setInstallStatus('Installing manifest...');
      await addonService.installAddon(url);
      setAddons(addonService.getInstalledAddons());
      setInstallStatus('Installed successfully!');
      setTimeout(() => setInstallStatus(null), 3000);
    } catch (e: any) {
      setInstallStatus(`Installation failed: ${e.message}`);
    }
  };

  const [debridEndpoint, setDebridEndpoint] = useState<string>(() => debridConfig.endpointUrl || 'http://localhost:8081');
  const [debridApiKey, setDebridApiKey] = useState<string>(() => debridConfig.apiKey || '');
  const [debridAudioMode, setDebridAudioMode] = useState<DebridConfig['audioMode']>(() => debridConfig.audioMode || 'auto');
  const [debridTestResult, setDebridTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingDebrid, setIsTestingDebrid] = useState<boolean>(false);

  const handleDebridProviderChange = (provider: DebridConfig['provider']) => {
    const updated: DebridConfig = {
      ...debridConfig,
      provider,
      endpointUrl: debridEndpoint.trim(),
      apiKey: debridApiKey.trim(),
      audioMode: debridAudioMode,
      enabled: provider !== 'none',
    };
    addonService.setDebridConfig(updated);
    setDebridConfig(updated);
  };

  const handleSaveDebridSettings = (prov?: DebridConfig['provider'], audioMode?: DebridConfig['audioMode']) => {
    const updated: DebridConfig = {
      provider: prov || debridConfig.provider,
      apiKey: debridApiKey.trim(),
      endpointUrl: debridEndpoint.trim(),
      audioMode: audioMode !== undefined ? audioMode : debridAudioMode,
      enabled: (prov || debridConfig.provider) !== 'none',
    };
    addonService.setDebridConfig(updated);
    setDebridConfig(updated);
  };

  const handleTestSelfDebrid = async () => {
    setIsTestingDebrid(true);
    setDebridTestResult(null);
    const res = await addonService.testSelfDebrid(debridEndpoint);
    setDebridTestResult(res);
    setIsTestingDebrid(false);
  };

  return (
    <div className="tv-settings-screen" role="dialog" aria-label="Settings Screen">
      {/* Settings Header */}
      <div className="tv-settings-header">
        <div className="tv-settings-title-group">
          <h2 className="tv-settings-title">Settings</h2>
          <span className="tv-settings-subtitle">Google TV Windows Shell System Configuration</span>
        </div>

        <Focusable
          id="settings-close-btn"
          groupId="settings-nav"
          className="tv-back-focusable"
          scaleEffect={false}
          onSelect={onClose}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={20} />
              <span>Back (B)</span>
            </div>
          )}
        </Focusable>
      </div>

      {/* Main Settings Split View */}
      <div className="tv-settings-layout">
        {/* Left Column: Categories List */}
        <div className="tv-settings-categories-list tv-scroll-container">
          <Focusable
            id="cat-profiles"
            groupId="settings-categories"
            indexInGroup={0}
            className={`tv-setting-cat-item ${activeCategory === 'profiles' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('profiles')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Users size={22} className="cat-icon" color="var(--google-blue-light, #8ab4f8)" />
                <div className="cat-text">
                  <span className="cat-title">Profiles & Accounts</span>
                  <span className="cat-desc">User accounts, avatars, and 4-digit PIN locks</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-addons"
            groupId="settings-categories"
            indexInGroup={1}
            className={`tv-setting-cat-item ${activeCategory === 'addons' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('addons')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Blocks size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">Addons & Streams</span>
                  <span className="cat-desc">Streaming addons, resolvers, and Debrid configuration</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-ublock"
            groupId="settings-categories"
            indexInGroup={2}
            className={`tv-setting-cat-item ${activeCategory === 'ublock' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('ublock')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <ShieldCheck size={22} className="cat-icon" color="var(--google-blue-light, #8ab4f8)" />
                <div className="cat-text">
                  <span className="cat-title">uBlock Origin Shield</span>
                  <span className="cat-desc">Ad blocking, anti-popup filters, and privacy protection</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-display"
            groupId="settings-categories"
            indexInGroup={3}
            className={`tv-setting-cat-item ${activeCategory === 'display' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('display')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Tv size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">Display & Sound</span>
                  <span className="cat-desc">Resolution, refresh rate, HDR, and audio boost</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-controller"
            groupId="settings-categories"
            indexInGroup={4}
            className={`tv-setting-cat-item ${activeCategory === 'controller' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('controller')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Gamepad size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">Gamepads & Input</span>
                  <span className="cat-desc">Xbox controllers, button mapping, and deadzone tuning</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-remote"
            groupId="settings-categories"
            indexInGroup={5}
            className={`tv-setting-cat-item ${activeCategory === 'remote' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('remote')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Smartphone size={22} className="cat-icon" color="#81c995" />
                <div className="cat-text">
                  <span className="cat-title">Companion Phone Remote</span>
                  <span className="cat-desc">
                    {clientCount > 0 ? `🟢 ${clientCount} phone${clientCount > 1 ? 's' : ''} connected` : 'Scan QR code to control TV with phone'}
                  </span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-ambient"
            groupId="settings-categories"
            indexInGroup={6}
            className={`tv-setting-cat-item ${activeCategory === 'ambient' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('ambient')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Lightbulb size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">Ambient Lighting</span>
                  <span className="cat-desc">Tuya smart bulbs and real-time screen color sync</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-tv-mode"
            groupId="settings-categories"
            indexInGroup={7}
            className={`tv-setting-cat-item ${activeCategory === 'tv-mode' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('tv-mode')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Monitor size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">TV Mode & Display Link</span>
                  <span className="cat-desc">Sanyo TV HDMI configuration and borderless fullscreen</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>

          <Focusable
            id="cat-system"
            groupId="settings-categories"
            indexInGroup={7}
            className={`tv-setting-cat-item ${activeCategory === 'system' ? 'selected' : ''}`}
            onSelect={() => setActiveCategory('system')}
            scaleEffect={true}
          >
            {(isFocused) => (
              <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                <Power size={22} className="cat-icon" />
                <div className="cat-text">
                  <span className="cat-title">System & Power</span>
                  <span className="cat-desc">Sleep timer, restart shell, or power down</span>
                </div>
                <ChevronRight size={18} className="cat-chevron" />
              </div>
            )}
          </Focusable>
        </div>

        {/* Right Column: Category Details Panel */}
        <div className="tv-settings-details-panel tv-scroll-container">
          {activeCategory === 'profiles' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Profiles & Security Memory</h3>
              <p className="tv-settings-section-desc">
                Manage user accounts, configure 4-digit PIN lock memory, isolate watch history, and restore personalized tabs.
              </p>

              {/* 1. Startup Profile Prompt Toggle */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Ask Who's Watching on Startup</span>
                  <span className="tv-row-desc">Display profile selection modal every time Google TV Shell launches</span>
                </div>
                <Focusable
                  id="setting-prompt-on-launch-toggle"
                  groupId="settings-profiles-main"
                  indexInGroup={0}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => profileService.setPromptOnLaunch(!profileState.promptOnLaunch)}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${profileState.promptOnLaunch ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {profileState.promptOnLaunch ? <ToggleRight size={26} color="#81c995" /> : <ToggleLeft size={26} color="#9aa0a6" />}
                      <span>{profileState.promptOnLaunch ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* 2. PIN Memory Function Policy */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">PIN Security & Memory Policy</span>
                  <span className="tv-row-desc">Controls how long unlocked PINs remain remembered before requiring re-authentication</span>
                </div>
                <div className="tv-pill-options">
                  {(
                    [
                      { id: 'session', label: 'Remember for Session' },
                      { id: 'device', label: 'Remember on this TV' },
                      { id: 'always', label: 'Always Ask PIN' },
                    ] as const
                  ).map((item, idx) => (
                    <Focusable
                      key={item.id}
                      id={`opt-pin-policy-${item.id}`}
                      groupId="settings-pin-policy"
                      indexInGroup={idx}
                      className="tv-option-chip"
                      onSelect={() => profileService.setPinMemoryPolicy(item.id)}
                    >
                      {(isFocused) => (
                        <div
                          className={`tv-chip-inner ${
                            profileState.pinMemoryPolicy === item.id ? 'active' : ''
                          } ${isFocused ? 'focused' : ''}`}
                        >
                          {item.label}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>

              {/* 3. Remember Last Tab & Screen */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Remember Last Active Tab per Profile</span>
                  <span className="tv-row-desc">Automatically restore the previous Movies, Shows, or Music tab when switching users</span>
                </div>
                <Focusable
                  id="setting-remember-tab-toggle"
                  groupId="settings-profiles-main"
                  indexInGroup={1}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => profileService.setRememberLastTab(!profileState.rememberLastTab)}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${profileState.rememberLastTab ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {profileState.rememberLastTab ? <ToggleRight size={26} color="#81c995" /> : <ToggleLeft size={26} color="#9aa0a6" />}
                      <span>{profileState.rememberLastTab ? 'Active' : 'Disabled'}</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* 4. Lock & Memory Reset Actions */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                <Focusable
                  id="setting-lock-all-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={2}
                  className="tv-addon-btn-focusable"
                  onSelect={() => profileService.lockAllProfiles()}
                >
                  {(isFocused) => (
                    <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                      <Lock size={15} />
                      <span>Lock All Profiles Now</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="setting-clear-mem-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={3}
                  className="tv-addon-btn-focusable danger"
                  onSelect={() => profileService.clearAllMemoryData()}
                >
                  {(isFocused) => (
                    <div className={`tv-addon-action-pill danger ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={15} />
                      <span>Clear All Memory & History</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Registered Profiles List Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px' }}>
                <h4 className="tv-subgroup-title" style={{ margin: 0 }}>
                  Registered Profiles ({profileState.profiles.length})
                </h4>
                <Focusable
                  id="setting-add-profile-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={4}
                  className="tv-addon-btn-focusable"
                  onSelect={() => setEditingProfile('create')}
                >
                  {(isFocused) => (
                    <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                      <Plus size={16} />
                      <span>Add Profile</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Profile List */}
              <div className="tv-settings-profiles-list">
                {profileState.profiles.map((prof, idx) => {
                  const isActive = prof.id === profileState.activeProfileId;
                  const hasPin = Boolean(prof.pin);
                  const isUnlocked = profileService.isProfileUnlocked(prof.id);
                  const historyCount = profileService.getWatchHistory(prof.id).length;

                  return (
                    <div key={prof.id} className={`tv-settings-profile-card ${isActive ? 'active-profile' : ''}`}>
                      <div className="tv-profile-item-left">
                        <div className="tv-profile-item-avatar" style={{ background: prof.avatarColor }}>
                          {renderAvatarIcon(prof.avatarIcon, 26, '#ffffff')}
                          {hasPin && (
                            <div className="tv-profile-item-lock">
                              {isUnlocked ? <Unlock size={11} color="#ffffff" /> : <Lock size={11} color="#ffffff" />}
                            </div>
                          )}
                        </div>
                        <div className="tv-profile-item-info">
                          <div className="tv-profile-item-name-row">
                            <span className="tv-profile-item-name">{prof.name}</span>
                            {isActive && <span className="tv-status-badge active">Active Now</span>}
                          </div>
                          <div className="tv-profile-item-sub">
                            <span>{prof.badge}</span>
                            <span>•</span>
                            <span className={hasPin ? (isUnlocked ? 'unlocked-pin-text' : 'has-pin-text') : 'no-pin-text'}>
                              {hasPin
                                ? isUnlocked
                                  ? 'Unlocked (Memory)'
                                  : 'Locked (PIN Required)'
                                : 'No PIN'}
                            </span>
                            <span>•</span>
                            <span>{historyCount} watch history items</span>
                          </div>
                        </div>
                      </div>

                      <div className="tv-profile-item-actions">
                        {!isActive && (
                          <Focusable
                            id={`profile-switch-${prof.id}`}
                            groupId="settings-profile-items"
                            indexInGroup={idx * 4}
                            className="tv-addon-btn-focusable"
                            onSelect={() => {
                              if (prof.pin && !isUnlocked) {
                                setPinTargetProfile(prof);
                              } else {
                                profileService.setActiveProfile(prof.id);
                              }
                            }}
                          >
                            {(isFocused) => (
                              <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                                <span>Switch</span>
                              </div>
                            )}
                          </Focusable>
                        )}

                        {hasPin && isUnlocked && (
                          <Focusable
                            id={`profile-lock-${prof.id}`}
                            groupId="settings-profile-items"
                            indexInGroup={idx * 4 + 1}
                            className="tv-addon-btn-focusable"
                            onSelect={() => profileService.lockProfile(prof.id)}
                          >
                            {(isFocused) => (
                              <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                                <Lock size={14} />
                                <span>Lock</span>
                              </div>
                            )}
                          </Focusable>
                        )}

                        <Focusable
                          id={`profile-edit-${prof.id}`}
                          groupId="settings-profile-items"
                          indexInGroup={idx * 4 + 2}
                          className="tv-addon-btn-focusable"
                          onSelect={() => setEditingProfile(prof)}
                        >
                          {(isFocused) => (
                            <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                              <Edit3 size={15} />
                              <span>Edit</span>
                            </div>
                          )}
                        </Focusable>

                        {profileState.profiles.length > 1 && (
                          <Focusable
                            id={`profile-delete-${prof.id}`}
                            groupId="settings-profile-items"
                            indexInGroup={idx * 4 + 3}
                            className="tv-addon-btn-focusable danger"
                            onSelect={() => profileService.deleteProfile(prof.id)}
                          >
                            {(isFocused) => (
                              <div className={`tv-addon-action-pill danger ${isFocused ? 'focused' : ''}`}>
                                <Trash2 size={15} />
                              </div>
                            )}
                          </Focusable>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {activeCategory === 'addons' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Addons & Stream Providers</h3>
              <p className="tv-settings-section-desc">
                Supports the open Stremio & Nuvio Community Addon Protocol. Query high-speed 4K HDR & 1080p HTTPS video streams.
              </p>

              {/* Debrid & Self-Hosted Stream Accelerator */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Debrid & Self-Hosted Stream Accelerator</span>
                  <span className="tv-row-desc">
                    Connect an0mal1a/self-debrid (local qBittorrent) or Real-Debrid for uncompressed 4K HDR playback
                  </span>
                </div>
                <div className="tv-pill-options">
                  {(['selfdebrid', 'realdebrid', 'alldebrid', 'torbox', 'none'] as const).map((prov, idx) => (
                    <Focusable
                      key={prov}
                      id={`opt-debrid-${prov}`}
                      groupId="settings-debrid-options"
                      indexInGroup={idx}
                      className="tv-option-chip"
                      onSelect={() => {
                        handleDebridProviderChange(prov);
                        handleSaveDebridSettings(prov);
                      }}
                    >
                      {(isFocused) => (
                        <div className={`tv-chip-inner ${debridConfig.provider === prov ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                          {prov === 'selfdebrid'
                            ? 'Self-Debrid (Local / Free)'
                            : prov === 'realdebrid'
                            ? 'Real-Debrid'
                            : prov === 'alldebrid'
                            ? 'AllDebrid'
                            : prov === 'torbox'
                            ? 'TorBox'
                            : 'Disabled'}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>

              {/* Self-Debrid Configuration Card */}
              {debridConfig.provider === 'selfdebrid' && (
                <div className="tv-setting-row-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '14px', background: 'rgba(66, 133, 244, 0.08)', borderColor: 'rgba(66, 133, 244, 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="tv-row-text">
                      <span className="tv-row-title" style={{ color: 'var(--google-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} /> Self-Debrid Server Configuration (an0mal1a/self-debrid)
                      </span>
                      <span className="tv-row-desc">
                        Streams torrents through your local qBittorrent on port 8080 & streams live HTTP video on port 8081.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="tv-settings-text-input"
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid var(--border-subtle)' }}
                      placeholder="http://localhost:8081 or http://192.168.x.x:8081"
                      value={debridEndpoint}
                      onChange={(e) => setDebridEndpoint(e.target.value)}
                      onBlur={() => handleSaveDebridSettings()}
                    />

                    <Focusable
                      id="btn-save-self-debrid"
                      groupId="settings-self-debrid"
                      indexInGroup={0}
                      className="tv-addon-btn-focusable"
                      onSelect={() => {
                        handleSaveDebridSettings();
                        handleTestSelfDebrid();
                      }}
                    >
                      {(isFocused) => (
                        <div className={`tv-addon-action-pill active ${isFocused ? 'focused' : ''}`}>
                          <Check size={16} />
                          <span>{isTestingDebrid ? 'Testing...' : 'Save & Test'}</span>
                        </div>
                      )}
                    </Focusable>
                  </div>

                  {debridTestResult && (
                    <div style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: debridTestResult.success ? 'rgba(52, 168, 83, 0.15)' : 'rgba(234, 67, 53, 0.15)', color: debridTestResult.success ? '#34a853' : '#ea4335' }}>
                      {debridTestResult.message}
                    </div>
                  )}

                  {/* Audio Mode Compatibility Selector */}
                  <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Volume2 size={14} color="var(--google-blue)" /> Audio Output & Transcoding Mode (No Sound Fix)
                      </span>
                    </div>
                    <div className="tv-pill-options" style={{ marginBottom: '8px' }}>
                      {[
                        { id: 'auto', label: 'Auto (Recommended)' },
                        { id: 'aac_transcode', label: 'Stereo AAC Transcode (Fix Silence)' },
                        { id: 'stereo_downmix', label: 'Stereo Downmix' },
                        { id: 'direct', label: 'Direct Bitstream Passthrough' },
                      ].map((item, optIdx) => (
                        <Focusable
                          key={item.id}
                          id={`opt-debrid-audio-${item.id}`}
                          groupId="settings-self-debrid-audio"
                          indexInGroup={optIdx}
                          className="tv-option-chip"
                          onSelect={() => {
                            setDebridAudioMode(item.id as any);
                            handleSaveDebridSettings(undefined, item.id as any);
                          }}
                        >
                          {(isFocused) => (
                            <div className={`tv-chip-inner ${debridAudioMode === item.id ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                              {item.label}
                            </div>
                          )}
                        </Focusable>
                      ))}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      If torrent movies play video with no sound (due to AC3/EAC3/DTS codecs in web browsers), select <strong>Stereo AAC Transcode</strong>.
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
                    <strong>Quick Start with an0mal1a/self-debrid:</strong><br />
                    1. Ensure qBittorrent is running with Web UI enabled on port <code>8080</code> (Tools → Options → Web UI).<br />
                    2. In terminal, run <code>python main.py</code> inside your <code>self-debrid</code> folder.<br />
                    3. Kaira will automatically stream 4K movies with full native hardware transport controls!
                  </div>
                </div>
              )}

              {/* Cloud Debrid API Key Card */}
              {(debridConfig.provider === 'realdebrid' || debridConfig.provider === 'alldebrid' || debridConfig.provider === 'torbox') && (
                <div className="tv-setting-row-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
                  <div className="tv-row-text">
                    <span className="tv-row-title">API Token / Secret Key</span>
                    <span className="tv-row-desc">Enter your {debridConfig.provider.toUpperCase()} API key to unlock cached 4K torrents</span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="password"
                      className="tv-settings-text-input"
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid var(--border-subtle)' }}
                      placeholder="Paste your API key here..."
                      value={debridApiKey}
                      onChange={(e) => setDebridApiKey(e.target.value)}
                      onBlur={() => handleSaveDebridSettings()}
                    />

                    <Focusable
                      id="btn-save-cloud-debrid"
                      groupId="settings-cloud-debrid"
                      indexInGroup={0}
                      className="tv-addon-btn-focusable"
                      onSelect={() => handleSaveDebridSettings()}
                    >
                      {(isFocused) => (
                        <div className={`tv-addon-action-pill active ${isFocused ? 'focused' : ''}`}>
                          <Check size={16} />
                          <span>Save Key</span>
                        </div>
                      )}
                    </Focusable>
                  </div>
                </div>
              )}

              {/* Installed Addons List */}
              <h4 className="tv-subgroup-title">Installed Addons ({addons.length})</h4>
              <div className="tv-addons-installed-list">
                {addons.map((addon, idx) => (
                  <div key={addon.manifest.id} className="tv-addon-item-card">
                    <div className="tv-addon-item-info">
                      <span className="tv-addon-item-name">{addon.manifest.name} <small>v{addon.manifest.version}</small></span>
                      <span className="tv-addon-item-desc">{addon.manifest.description}</span>
                    </div>

                    <div className="tv-addon-item-actions">
                      <Focusable
                        id={`addon-toggle-${addon.manifest.id}`}
                        groupId="settings-addons-list"
                        indexInGroup={idx * 2}
                        className="tv-addon-btn-focusable"
                        onSelect={() => handleToggleAddon(addon.manifest.id, addon.enabled)}
                      >
                        {(isFocused) => (
                          <div className={`tv-addon-action-pill ${addon.enabled ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                            <span>{addon.enabled ? 'Enabled' : 'Disabled'}</span>
                          </div>
                        )}
                      </Focusable>

                      {addon.manifest.id !== 'org.stremio.cinemeta' && (
                        <Focusable
                          id={`addon-del-${addon.manifest.id}`}
                          groupId="settings-addons-list"
                          indexInGroup={idx * 2 + 1}
                          className="tv-addon-btn-focusable danger"
                          onSelect={() => handleUninstallAddon(addon.manifest.id)}
                        >
                          {(isFocused) => (
                            <div className={`tv-addon-action-pill danger ${isFocused ? 'focused' : ''}`}>
                              <Trash2 size={16} />
                            </div>
                          )}
                        </Focusable>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Community Presets */}
              <h4 className="tv-subgroup-title">Official & Community Addons</h4>
              <div className="tv-community-presets-row">
                <Focusable
                  id="preset-torrentio"
                  groupId="settings-addon-presets"
                  indexInGroup={0}
                  className="tv-preset-btn-focusable"
                  onSelect={() => handleInstallAddon('https://torrentio.strem.fun/manifest.json')}
                >
                  {(isFocused) => (
                    <div className={`tv-preset-card ${isFocused ? 'focused' : ''}`}>
                      <Plus size={16} />
                      <span>Torrentio (4K / HDR Streams)</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="preset-cinemeta"
                  groupId="settings-addon-presets"
                  indexInGroup={1}
                  className="tv-preset-btn-focusable"
                  onSelect={() => handleInstallAddon('https://v3-cinemeta.strem.io/manifest.json')}
                >
                  {(isFocused) => (
                    <div className={`tv-preset-card ${isFocused ? 'focused' : ''}`}>
                      <Plus size={16} />
                      <span>Cinemeta (Streaming Catalogs)</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="preset-opensubtitles"
                  groupId="settings-addon-presets"
                  indexInGroup={2}
                  className="tv-preset-btn-focusable"
                  onSelect={() => handleInstallAddon('https://opensubtitles-v3.strem.io/manifest.json')}
                >
                  {(isFocused) => (
                    <div className={`tv-preset-card ${isFocused ? 'focused' : ''}`}>
                      <Plus size={16} />
                      <span>OpenSubtitles v3 (Subtitles)</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="preset-aiostreams"
                  groupId="settings-addon-presets"
                  indexInGroup={3}
                  className="tv-preset-btn-focusable"
                  onSelect={() => handleInstallAddon('https://aiostreams.am/manifest.json')}
                >
                  {(isFocused) => (
                    <div className={`tv-preset-card ${isFocused ? 'focused' : ''}`}>
                      <Plus size={16} />
                      <span>AIOStreams (All-In-One Aggregator)</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Custom Addon URL Input */}
              <div className="tv-setting-row-card" style={{ marginTop: '16px' }}>
                <div className="tv-row-text">
                  <span className="tv-row-title">Install Custom Addon Manifest URL</span>
                  <span className="tv-row-desc">Enter any valid Stremio/Nuvio addon manifest link (e.g. self-hosted AIOStreams or ElfHosted)</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Focusable
                    id="addon-custom-input-box"
                    groupId="settings-addon-presets"
                    indexInGroup={3}
                    scaleEffect={false}
                    className="tv-settings-input-focusable"
                    onSelect={() => {
                      const input = document.getElementById('addon-custom-manifest-input');
                      input?.focus();
                    }}
                  >
                    {(isFocused) => (
                      <input
                        id="addon-custom-manifest-input"
                        type="text"
                        value={newAddonUrl}
                        onChange={(e) => setNewAddonUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (newAddonUrl) {
                              handleInstallAddon(newAddonUrl);
                              setNewAddonUrl('');
                            }
                          } else if (e.key === 'ArrowRight') {
                            spatialNav.setFocus('addon-custom-install-btn');
                          } else if (e.key === 'ArrowUp') {
                            spatialNav.setFocus('preset-torrentio');
                          }
                        }}
                        placeholder="https://.../manifest.json"
                        className={`tv-settings-input ${isFocused ? 'focused' : ''}`}
                        style={{
                          background: isFocused ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
                          border: isFocused ? '1px solid var(--google-blue, #1a73e8)' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '8px',
                          color: '#fff',
                          padding: '8px 12px',
                          fontSize: '14px',
                          width: '280px',
                          outline: 'none',
                        }}
                      />
                    )}
                  </Focusable>
                  <Focusable
                    id="addon-custom-install-btn"
                    groupId="settings-addon-presets"
                    indexInGroup={4}
                    className="tv-addon-btn-focusable"
                    onSelect={() => {
                      if (newAddonUrl) {
                        handleInstallAddon(newAddonUrl);
                        setNewAddonUrl('');
                      }
                    }}
                  >
                    {(isFocused) => (
                      <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                        <Plus size={16} />
                        <span>Install</span>
                      </div>
                    )}
                  </Focusable>
                </div>
              </div>

              {/* Music Streaming Plugins Section */}
              <h4 className="tv-subgroup-title" style={{ marginTop: '24px' }}>Music Streaming Plugins & Lyrics</h4>
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Audius Open Music Protocol</span>
                  <span className="tv-row-desc">Decentralized 320kbps full-length music streaming & live charts</span>
                </div>
                <span className="tv-status-badge active">Active (320kbps)</span>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">LRCLIB Synced Karaoke Lyrics</span>
                  <span className="tv-row-desc">Line-by-line synchronized karaoke lyrics display during music playback</span>
                </div>
                <span className="tv-status-badge active">Active</span>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Piped Audio Extractor</span>
                  <span className="tv-row-desc">High-bitrate Opus/AAC audio stream extraction for catalog music</span>
                </div>
                <span className="tv-status-badge active">Piped Resolver Active</span>
              </div>

              {installStatus && (
                <div className="tv-addon-install-banner">
                  <span>{installStatus}</span>
                </div>
              )}
            </div>
          )}

          {activeCategory === 'ublock' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">uBlock Origin AdBlock & Anti-Popup Shield</h3>
              <p className="tv-settings-section-desc">
                High-performance content filtering engine powered by uBlock Origin and EasyList standards. Eliminates video ads, trackers, malware, and rogue stream embed popups.
              </p>

              {/* Master Shield Hero Status Card */}
              <div className="tv-ublock-hero-card">
                <div className="tv-ublock-hero-info">
                  <div className="tv-ublock-shield-icon-box">
                    <ShieldCheck size={32} />
                  </div>
                  <div>
                    <div className="tv-ublock-hero-title">
                      {ublockState.enabled ? 'uBlock Origin Shield: ACTIVE' : 'uBlock Origin Shield: PAUSED'}
                    </div>
                    <div className="tv-ublock-hero-stats">
                      <span className="tv-ublock-stat-badge">
                        {ublockState.blockedCount.toLocaleString()} Blocked
                      </span>
                      <span>•</span>
                      <span>{ublockService.getTotalRulesCount().toLocaleString()} Active Rules</span>
                      <span>•</span>
                      <span>Zero Popups Enforced</span>
                    </div>
                  </div>
                </div>

                <Focusable
                  id="ublock-master-toggle"
                  groupId="settings-ublock-main"
                  indexInGroup={0}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => ublockService.setEnabled(!ublockState.enabled)}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${ublockState.enabled ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {ublockState.enabled ? <ToggleRight size={26} color="#81c995" /> : <ToggleLeft size={26} color="#9aa0a6" />}
                      <span>{ublockState.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Anti-Popup Protection */}
              <h4 className="tv-subgroup-title">Anti-Popup & Stream Embed Sandbox</h4>
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Aggressive Popup Window Neutralizer</span>
                  <span className="tv-row-desc">Interceptors deny new tab and window.open redirects spawned by third-party stream mirrors</span>
                </div>
                <Focusable
                  id="ublock-popup-toggle"
                  groupId="settings-ublock-main"
                  indexInGroup={1}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => ublockService.setAntiPopup(!ublockState.antiPopup)}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${ublockState.antiPopup ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {ublockState.antiPopup ? <ToggleRight size={26} color="#81c995" /> : <ToggleLeft size={26} color="#9aa0a6" />}
                      <span>{ublockState.antiPopup ? 'Active' : 'Bypass'}</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Filter Lists */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px' }}>
                <h4 className="tv-subgroup-title" style={{ margin: 0 }}>Active Filter Rule Subscriptions ({ublockState.filterLists.filter(f => f.enabled).length})</h4>
                
                <Focusable
                  id="ublock-reset-stats"
                  groupId="settings-ublock-main"
                  indexInGroup={2}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => ublockService.resetStats()}
                >
                  {(isFocused) => (
                    <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={16} />
                      <span>Reset Block Count</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-ublock-filter-grid">
                {ublockState.filterLists.map((filter, idx) => (
                  <Focusable
                    key={filter.id}
                    id={`ublock-filter-${filter.id}`}
                    groupId="settings-ublock-filters"
                    indexInGroup={idx}
                    className="tv-option-chip"
                    onSelect={() => ublockService.toggleFilterList(filter.id)}
                  >
                    {(isFocused) => (
                      <div className={`tv-ublock-filter-card ${filter.enabled ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                        <div className="tv-ublock-filter-info">
                          <span className="tv-ublock-filter-name">{filter.name}</span>
                          <span className="tv-ublock-filter-rules">{filter.rulesCount.toLocaleString()} rules</span>
                        </div>
                        {filter.enabled ? <Check size={18} color="#81c995" /> : <X size={18} color="#9aa0a6" />}
                      </div>
                    )}
                  </Focusable>
                ))}
              </div>
            </div>
          )}

          {activeCategory === 'display' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Display Settings</h3>
              
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Display Resolution</span>
                  <span className="tv-row-desc">Current output rendered for Sanyo TV</span>
                </div>
                <div className="tv-pill-options">
                  {(['1080p', '1440p', '4k'] as const).map((res, idx) => (
                    <Focusable
                      key={res}
                      id={`opt-res-${res}`}
                      groupId="settings-res-options"
                      indexInGroup={idx}
                      className="tv-option-chip"
                      onSelect={() => handleResolutionChange(res)}
                    >
                      {(isFocused) => (
                        <div className={`tv-chip-inner ${displaySettings.resolution === res ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                          {res.toUpperCase()}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">High Dynamic Range (HDR)</span>
                  <span className="tv-row-desc">HDR10 color pass-through on HDMI output</span>
                </div>
                <span className="tv-status-badge active">Enabled</span>
              </div>
            </div>
          )}

          {activeCategory === 'controller' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Remotes & Controller Validation</h3>
              <p className="tv-settings-section-desc">
                Live gamepad hardware validation, semantic action normalization pipeline, and real-time input event inspector.
              </p>
              
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Active Gamepad Hardware</span>
                  <span className="tv-row-desc">
                    {activeGamepads.length > 0
                      ? activeGamepads[0]
                      : 'Xbox Wireless Controller (Standard Gamepad / evdev XInput)'}
                  </span>
                </div>
                <span className="tv-status-badge active">Connected</span>
              </div>

              {/* Real-time Semantic Normalization Pipeline Card */}
              <h4 className="tv-subgroup-title" style={{ marginTop: '20px' }}>Input Normalization Pipeline</h4>
              <div className="tv-controller-pipeline-card">
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">1. RAW HARDWARE INPUT</span>
                  <span className="tv-pipeline-stage-value highlight">
                    {lastAction ? lastAction.raw : 'Press any button / move stick...'}
                  </span>
                </div>
                <div className="tv-pipeline-arrow">↓</div>
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">2. NORMALIZED SEMANTIC ACTION</span>
                  <span className="tv-pipeline-stage-value green">
                    {lastAction ? lastAction.normalized : 'Awaiting input'}
                  </span>
                </div>
                <div className="tv-pipeline-arrow">↓</div>
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">3. UI SPATIAL ENGINE ACTION</span>
                  <span className="tv-pipeline-stage-value">
                    {lastAction ? lastAction.uiAction : 'Awaiting input'}
                  </span>
                </div>
              </div>

              {/* Live Event Stream Log */}
              <h4 className="tv-subgroup-title" style={{ marginTop: '20px' }}>Live Controller Event Stream</h4>
              <div className="tv-controller-events-log">
                {actionLog.length === 0 ? (
                  <div className="tv-log-empty">No input events captured yet. Press buttons on your controller or keyboard.</div>
                ) : (
                  actionLog.map((act, idx) => (
                    <div key={`${act.timestamp}-${idx}`} className="tv-log-row">
                      <span className="tv-log-time">{new Date(act.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="tv-log-raw">{act.raw}</span>
                      <span className="tv-log-arrow">→</span>
                      <span className="tv-log-normalized">{act.normalized}</span>
                      <span className="tv-log-arrow">→</span>
                      <span className="tv-log-ui">{act.uiAction}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Controller Tuning Settings */}
              <h4 className="tv-subgroup-title" style={{ marginTop: '24px' }}>Controller Settings</h4>
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Navigation Analog Deadzone</span>
                  <span className="tv-row-desc">Left analog stick deadzone tuned for 10-foot TV navigation</span>
                </div>
                <span className="tv-status-badge">0.42 (Optimized)</span>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">UI Navigation Sound Effects</span>
                  <span className="tv-row-desc">Synthesized spatial audio clicks and selection chimes for controller movement</span>
                </div>
                <Focusable
                  id="settings-sfx-toggle"
                  groupId="settings-controller-group"
                  indexInGroup={0}
                  className="tv-toggle-btn-focusable"
                  onSelect={() => {
                    const next = !sfxEnabled;
                    soundEffectsService.setEnabled(next);
                    setSfxEnabled(next);
                  }}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${sfxEnabled ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {sfxEnabled ? <ToggleRight size={26} color="#81c995" /> : <ToggleLeft size={26} color="#9aa0a6" />}
                      <span>{sfxEnabled ? 'Enabled' : 'Muted'}</span>
                    </div>
                  )}
                </Focusable>
              </div>
            </div>
          )}

          {activeCategory === 'remote' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Companion Phone Remote</h3>

              {/* QR Code & Pairing Card */}
              <div className="tv-setting-row-card" style={{ padding: '24px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '28px', alignItems: 'center', width: '100%' }}>
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      padding: '12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(remoteService.getRemoteUrl(), 160, '#000000', '#ffffff') }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Smartphone size={20} color="#81c995" />
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                        {clientCount > 0 ? `🟢 ${clientCount} Phone${clientCount > 1 ? 's' : ''} Connected` : 'Ready to Pair'}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
                      Scan this QR code with any smartphone camera on your local Wi-Fi to instantly control Kaira TV with a glass touchpad, media scrubber, phone keyboard typing, and voice search.
                    </p>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '13px', color: '#8ab4f8' }}>
                      {remoteService.getRemoteUrl()}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                      <Focusable
                        id="settings-remote-open-preview"
                        groupId="settings-remote-group"
                        indexInGroup={0}
                        className="tv-action-btn-focusable"
                        onSelect={() => window.open(remoteService.getRemoteUrl(), '_blank', 'width=420,height=840')}
                      >
                        {(isFocused) => (
                          <div className={`tv-action-btn ${isFocused ? 'focused' : ''}`}>
                            <ExternalLink size={16} />
                            <span>Open in Browser Tab</span>
                          </div>
                        )}
                      </Focusable>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnostics Card */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Remote Bridge Diagnostics</span>
                  <span className="tv-row-desc">
                    WebSocket Port: {window.location.port || '3000'} / 3001 • Protocols: WebSocket, SSE, HTTP REST, BroadcastChannel
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#81c995', fontWeight: 600 }}>
                  Active & Listening
                </div>
              </div>

              {/* Feature Highlights Card */}
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Features Available on Phone</span>
                  <span className="tv-row-desc">
                    4-Way D-Pad & Touchpad Swipe • Live Media Scrubber • Speech-to-Text Voice Dictation • Ambient Lights Control • Quick App Launcher
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#8ab4f8', fontWeight: 500 }}>
                  Ready
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'ambient' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">Ambient Smart Lighting</h3>
              
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Operating Mode</span>
                  <span className="tv-row-desc">Real-time GPU DXGI Desktop Duplication color extraction</span>
                </div>
                <div className="tv-pill-options">
                  {(['ambient', 'cycle', 'test', 'off'] as const).map((m, idx) => (
                    <Focusable
                      key={m}
                      id={`opt-amb-mode-${m}`}
                      groupId="settings-amb-mode"
                      indexInGroup={idx}
                      className="tv-option-chip"
                      onSelect={() => handleAmbientModeChange(m)}
                    >
                      {(isFocused) => (
                        <div className={`tv-chip-inner ${ambientState.mode === m ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                          {m.toUpperCase()}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Lighting Intensity ({ambientState.intensity}%)</span>
                  <span className="tv-row-desc">Adjust global smart bulb peak brightness</span>
                </div>
                <div className="tv-intensity-stepper">
                  <Focusable
                    id="amb-dec-intensity"
                    groupId="settings-intensity-stepper"
                    indexInGroup={0}
                    className="tv-stepper-btn"
                    onSelect={() => handleIntensityChange(-10)}
                  >
                    {(isFocused) => <div className={`tv-step-inner ${isFocused ? 'focused' : ''}`}>- 10%</div>}
                  </Focusable>
                  <Focusable
                    id="amb-inc-intensity"
                    groupId="settings-intensity-stepper"
                    indexInGroup={1}
                    className="tv-stepper-btn"
                    onSelect={() => handleIntensityChange(10)}
                  >
                    {(isFocused) => <div className={`tv-step-inner ${isFocused ? 'focused' : ''}`}>+ 10%</div>}
                  </Focusable>
                </div>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Configured Tuya Smart Bulbs</span>
                  <span className="tv-row-desc">Syska 1 (192.168.29.203) • Wipro (192.168.29.109) • Syska 2 (192.168.29.216)</span>
                </div>
                <span className="tv-status-badge active">3 Bulbs Paired</span>
              </div>
            </div>
          )}

          {activeCategory === 'tv-mode' && (
            <div className="tv-settings-group">
              <h3 className="tv-group-title">TV Mode & Display Experience</h3>
              
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Fullscreen TV Shell</span>
                  <span className="tv-row-desc">Hide Windows desktop chrome and taskbar</span>
                </div>
                <Focusable
                  id="tv-mode-fullscreen-toggle"
                  groupId="tv-mode-actions"
                  indexInGroup={0}
                  className="tv-toggle-btn-focusable"
                  onSelect={handleToggleFullscreen}
                >
                  {(isFocused) => (
                    <div className={`tv-toggle-btn ${isFocused ? 'focused' : ''}`}>
                      <span>Toggle Fullscreen</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Sanyo Android TV Connection</span>
                  <span className="tv-row-desc">Connected via HDMI as Primary TV Shell Display</span>
                </div>
                <span className="tv-status-badge active">HDMI Active</span>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Controller-First Cursor Hiding</span>
                  <span className="tv-row-desc">Automatically hide mouse pointer after 3 seconds of controller use</span>
                </div>
                <span className="tv-status-badge active">Enabled</span>
              </div>
            </div>
          )}

          {activeCategory === 'system' && (
            <div className="tv-settings-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 className="tv-group-title" style={{ margin: 0 }}>System Information & Hardware Diagnostics</h3>
                <Focusable
                  id="diag-refresh-btn"
                  groupId="system-diag-actions"
                  indexInGroup={0}
                  className="tv-addon-btn-focusable"
                  onSelect={() => systemService.refreshDiagnostics()}
                >
                  {(isFocused) => (
                    <div className={`tv-addon-action-pill ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={14} />
                      <span>Refresh Diagnostics</span>
                    </div>
                  )}
                </Focusable>
              </div>
              <p className="tv-settings-section-desc">
                Live operating system telemetry, hardware video decoding pipelines, display modes, and audio subsystem status.
              </p>

              {/* Live Diagnostics Card Grid */}
              <div className="tv-diagnostics-grid">
                <div className="tv-diag-card">
                  <span className="tv-diag-label">Operating System</span>
                  <span className="tv-diag-value highlight">{diagnostics?.os || 'Linux Appliance (TV OS)'}</span>
                  <span className="tv-diag-sub">{diagnostics?.kernel || 'Linux 6.8.0 / Wayland'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Architecture & Hardware</span>
                  <span className="tv-diag-value">{diagnostics?.arch.toUpperCase() || 'X86_64'}</span>
                  <span className="tv-diag-sub">{diagnostics?.deviceModel || 'Personal TV Appliance'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">CPU Processor</span>
                  <span className="tv-diag-value">{diagnostics?.cpuModel || 'Multi-Core Processor'}</span>
                  <span className="tv-diag-sub">{diagnostics?.cpuCores} CPU Threads / Cores Active</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">System Memory (RAM)</span>
                  <span className="tv-diag-value">
                    {diagnostics ? `${(diagnostics.ramUsedBytes / (1024 ** 3)).toFixed(1)} GB / ${(diagnostics.ramTotalBytes / (1024 ** 3)).toFixed(1)} GB` : '16 GB Total'}
                  </span>
                  <span className="tv-diag-sub">
                    {diagnostics ? `${(diagnostics.ramFreeBytes / (1024 ** 3)).toFixed(1)} GB Available` : 'Available'}
                  </span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Graphics Processing Unit (GPU)</span>
                  <span className="tv-diag-value">{diagnostics?.gpuModel || 'Mesa DRM / Intel Iris / AMD Radeon'}</span>
                  <span className="tv-diag-sub">{diagnostics?.gpuDriver || 'Mesa 24.1 / DRM KMS'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Hardware Video Acceleration</span>
                  <span className="tv-diag-value green">{diagnostics?.hardwareVideoDecode || 'VA-API Hardware Decode Active'}</span>
                  <span className="tv-diag-sub">H.264 • HEVC (4K) • AV1 • VP9 Decoders</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">TV Display Output</span>
                  <span className="tv-diag-value">
                    {diagnostics?.activeDisplay.width}×{diagnostics?.activeDisplay.height} @ {diagnostics?.activeDisplay.refreshRate}Hz
                  </span>
                  <span className="tv-diag-sub">
                    {diagnostics?.displayServer.toUpperCase()} • HDR10 Color Gamut Pass-Through
                  </span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Audio Server & Output</span>
                  <span className="tv-diag-value">{diagnostics?.audioServer.toUpperCase() || 'PIPEWIRE'}</span>
                  <span className="tv-diag-sub">{diagnostics?.activeAudioDevice.name || 'HDMI Audio Output'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Network Connection</span>
                  <span className="tv-diag-value">{diagnostics?.networkType.toUpperCase() || 'ETHERNET'}</span>
                  <span className="tv-diag-sub">IP: {diagnostics?.ipAddress || '192.168.29.120'} • Internet Connected</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Active Controller</span>
                  <span className="tv-diag-value">{diagnostics?.controllerName || 'Xbox Wireless Controller'}</span>
                  <span className="tv-diag-sub">USB / Bluetooth XInput & evdev Normalized</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Storage (Appliance Disk)</span>
                  <span className="tv-diag-value">
                    {diagnostics ? `${(diagnostics.storageFreeBytes / (1024 ** 3)).toFixed(0)} GB Free / ${(diagnostics.storageTotalBytes / (1024 ** 3)).toFixed(0)} GB` : '380 GB Free'}
                  </span>
                  <span className="tv-diag-sub">Read-Only System Root • Ext4 User Data</span>
                </div>
              </div>

              {/* Power & System Actions */}
              <h4 className="tv-subgroup-title" style={{ marginTop: '28px' }}>Power & Appliance Controls</h4>
              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Sleep TV Appliance</span>
                  <span className="tv-row-desc">Enter low-power standby mode and signal TV HDMI standby</span>
                </div>
                <Focusable
                  id="power-sleep-btn"
                  groupId="system-power-actions"
                  indexInGroup={0}
                  className="tv-power-btn-focusable"
                  onSelect={() => displayService.triggerPowerAction('sleep')}
                >
                  {(isFocused) => (
                    <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                      <Moon size={16} />
                      <span>Sleep</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Restart System</span>
                  <span className="tv-row-desc">Reboot operating system and relaunch TV shell</span>
                </div>
                <Focusable
                  id="power-restart-btn"
                  groupId="system-power-actions"
                  indexInGroup={1}
                  className="tv-power-btn-focusable"
                  onSelect={() => displayService.triggerPowerAction('restart')}
                >
                  {(isFocused) => (
                    <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={16} />
                      <span>Restart</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-setting-row-card">
                <div className="tv-row-text">
                  <span className="tv-row-title">Shut Down</span>
                  <span className="tv-row-desc">Safely unmount user storage and power off appliance</span>
                </div>
                <Focusable
                  id="power-shutdown-btn"
                  groupId="system-power-actions"
                  indexInGroup={2}
                  className="tv-power-btn-focusable danger"
                  onSelect={() => displayService.triggerPowerAction('shutdown')}
                >
                  {(isFocused) => (
                    <div className={`tv-power-btn danger ${isFocused ? 'focused' : ''}`}>
                      <Power size={16} />
                      <span>Shut Down</span>
                    </div>
                  )}
                </Focusable>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4-Digit PIN Security Modal */}
      {pinTargetProfile && (
        <PinModal
          profile={pinTargetProfile}
          title={`Enter PIN for ${pinTargetProfile.name}`}
          subtitle="4-digit PIN required to switch to this profile"
          onSuccess={(enteredPin) => {
            profileService.setActiveProfile(pinTargetProfile.id, enteredPin);
            setPinTargetProfile(null);
          }}
          onCancel={() => setPinTargetProfile(null)}
        />
      )}

      {/* Create / Edit Profile Modal */}
      {editingProfile && (
        <ProfileEditorModal
          profile={editingProfile === 'create' ? null : editingProfile}
          canDelete={profileState.profiles.length > 1}
          onSave={(data) => {
            if (editingProfile === 'create') {
              profileService.createProfile(data as CreateProfileDTO);
            } else if (editingProfile) {
              profileService.updateProfile(editingProfile.id, data as UpdateProfileDTO);
            }
            setEditingProfile(null);
          }}
          onDelete={(id) => {
            profileService.deleteProfile(id);
            setEditingProfile(null);
          }}
          onClose={() => setEditingProfile(null)}
        />
      )}
    </div>
  );
};

