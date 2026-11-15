import React, { useState, useEffect } from 'react';
import {
  Tv,
  Gamepad,
  Lightbulb,
  Monitor,
  Power,
  Check,
  X,
  Volume2,
  ShieldCheck,
  Blocks,
  Plus,
  Trash2,
  ExternalLink,
  ArrowLeft,
  RotateCcw,
  Users,
  Lock,
  Unlock,
  Edit3,
  Moon,
  Zap,
  Smartphone,
} from 'lucide-react';
import { Focusable } from '../../components/Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { ambientService } from '../../services/ambient/ambientService';
import { displayService } from '../../services/display/displayService';
import { addonService } from '../../services/addons/AddonService';
import { ublockService, UBlockState } from '../../services/adblock/adblockService';
import { profileService } from '../../services/profile/ProfileService';
import { screensaverService, ScreensaverState } from '../../services/screensaver/screensaverService';
import { sleepTimerService } from '../../services/sleep/sleepTimerService';
import { UserProfile, CreateProfileDTO, UpdateProfileDTO, ProfileServiceState } from '../../types/profile';
import { PinModal, renderAvatarIcon } from '../../components/Profile/PinModal';
import { ProfileEditorModal } from '../../components/Profile/ProfileEditorModal';
import { soundEffectsService } from '../../services/audio/soundEffectsService';
import { systemService } from '../../services/system/SystemService';
import { remoteService } from '../../services/remote/RemoteService';
import { generateQRCodeSVG } from '../../utils/qrCodeGenerator';
import { gamepadManager, GamepadActionDiagnostic } from '../../services/controller/gamepadManager';
import { SystemDiagnostics } from '../../platform/types';
import { platform } from '../../platform';
import { PWAInstallButton } from '../../components/PWA/PWAInstallBanner';
import { isRemoteFeatureEnabled, resetAndroidOnboarding } from '../../components/Onboarding/onboardingState';
import { AmbientState, DisplaySettings } from '../../types';
import { InstalledAddon, DebridConfig } from '../../types/addons';
import './SettingsScreen.css';

interface SettingsScreenProps {
  onClose: () => void;
}

type SettingsCategory =
  | 'profiles'
  | 'addons'
  | 'ublock'
  | 'display'
  | 'controller'
  | 'remote'
  | 'ambient'
  | 'tv-mode'
  | 'system';

interface M3SwitchProps {
  id: string;
  groupId: string;
  indexInGroup: number;
  checked: boolean;
  label: string;
  onToggle: () => void;
}

const M3Switch: React.FC<M3SwitchProps> = ({
  id,
  groupId,
  indexInGroup,
  checked,
  label,
  onToggle,
}) => (
  <Focusable
    id={id}
    groupId={groupId}
    indexInGroup={indexInGroup}
    className="tv-switch-focusable"
    scaleEffect={false}
    role="switch"
    ariaLabel={label}
    ariaSelected={checked}
    onSelect={onToggle}
  >
    {(isFocused) => (
      <div
        className={`tv-m3-switch ${checked ? 'checked' : ''} ${isFocused ? 'focused' : ''}`}
        aria-checked={checked}
      >
        <span className="tv-m3-switch-thumb" />
      </div>
    )}
  </Focusable>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('profiles');
  const [ambientState, setAmbientState] = useState<AmbientState>(() => ambientService.getState());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => displayService.getSettings());
  const [ublockState, setUblockState] = useState<UBlockState>(() => ublockService.getState());
  const [activeGamepads, setActiveGamepads] = useState<string[]>([]);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => soundEffectsService.getEnabled());
  const isRemoteEnabled = isRemoteFeatureEnabled(platform.isAndroid);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(() => systemService.getCachedDiagnostics());
  const [clientCount, setClientCount] = useState<number>(() => (isRemoteEnabled ? remoteService.getConnectedClients() : 0));
  const [lastAction, setLastAction] = useState<GamepadActionDiagnostic | null>(null);
  const [actionLog, setActionLog] = useState<GamepadActionDiagnostic[]>([]);
  const [screensaverState, setScreensaverState] = useState<ScreensaverState>(() => screensaverService.getState());

  // Profile Management state
  const [profileState, setProfileState] = useState<ProfileServiceState>(() => profileService.getState());
  const [pinTargetProfile, setPinTargetProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null | 'create'>(null);

  // Addon & Debrid state
  const [addons, setAddons] = useState<InstalledAddon[]>(() => addonService.getInstalledAddons());
  const [debridConfig, setDebridConfig] = useState<DebridConfig>(() => addonService.getDebridConfig());
  const [newAddonUrl, setNewAddonUrl] = useState<string>('');
  const [installStatus, setInstallStatus] = useState<string | null>(null);

  const [debridEndpoint, setDebridEndpoint] = useState<string>(() => debridConfig.endpointUrl || 'http://localhost:8081');
  const [debridApiKey, setDebridApiKey] = useState<string>(() => debridConfig.apiKey || '');
  const [debridAudioMode, setDebridAudioMode] = useState<DebridConfig['audioMode']>(() => debridConfig.audioMode || 'auto');
  const [debridTestResult, setDebridTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingDebrid, setIsTestingDebrid] = useState<boolean>(false);

  useEffect(() => {
    spatialNav.pushScope('settings-screen');
    if (isRemoteEnabled) {
      remoteService.discoverServerInfo();
    }
    return () => {
      spatialNav.popScope('settings-screen');
    };
  }, [isRemoteEnabled]);

  useEffect(() => {
    const unsub = ambientService.subscribe(setAmbientState);
    const unsubUblock = ublockService.subscribe(setUblockState);
    const unsubProfile = profileService.subscribe(setProfileState);
    const unsubDiag = systemService.subscribe(setDiagnostics);
    const unsubRemote = isRemoteEnabled ? remoteService.subscribeClientCount(setClientCount) : () => {};
    const unsubScreensaver = screensaverService.subscribe(setScreensaverState);
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
      unsubScreensaver();
      unsubGamepad();
    };
  }, [isRemoteEnabled]);

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

  const navItems: Array<{
    id: string;
    key: SettingsCategory;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'cat-profiles', key: 'profiles', label: 'Profiles & Accounts', icon: <Users size={20} className="cat-icon" /> },
    { id: 'cat-addons', key: 'addons', label: 'Addons & Streams', icon: <Blocks size={20} className="cat-icon" /> },
    { id: 'cat-ublock', key: 'ublock', label: 'uBlock Origin Shield', icon: <ShieldCheck size={20} className="cat-icon" /> },
    { id: 'cat-display', key: 'display', label: 'Display & Sound', icon: <Tv size={20} className="cat-icon" /> },
    { id: 'cat-controller', key: 'controller', label: 'Gamepads & Input', icon: <Gamepad size={20} className="cat-icon" /> },
    ...(isRemoteEnabled
      ? [
          {
            id: 'cat-remote',
            key: 'remote' as const,
            label: clientCount > 0 ? `Phone Remote (${clientCount})` : 'Companion Remote',
            icon: <Smartphone size={20} className="cat-icon" />,
          },
        ]
      : []),
    { id: 'cat-ambient', key: 'ambient', label: 'Ambient Lighting', icon: <Lightbulb size={20} className="cat-icon" /> },
    {
      id: 'cat-tv-mode',
      key: 'tv-mode',
      label: platform.isAndroid ? 'Display Mode' : 'TV Mode & HDMI',
      icon: <Monitor size={20} className="cat-icon" />,
    },
    { id: 'cat-system', key: 'system', label: 'System & Power', icon: <Power size={20} className="cat-icon" /> },
  ];

  return (
    <div className="tv-settings-screen" role="dialog" aria-label="Settings Screen">
      <div className="tv-settings-header">
        <div className="tv-settings-title-group">
          <h2 className="tv-settings-title">Settings</h2>
          <span className="tv-settings-subtitle">
            {platform.isAndroidTV
              ? 'Kaira Android TV Configuration'
              : platform.isAndroid
              ? 'Kaira Android Mobile Configuration'
              : 'Kaira TV & Media Configuration'}
          </span>
        </div>

        <Focusable
          id="settings-close-btn"
          groupId="settings-nav"
          className="tv-back-focusable"
          scaleEffect={false}
          ariaLabel="Back to previous screen"
          onSelect={onClose}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={18} />
              <span>{platform.isAndroid && !platform.isAndroidTV ? 'Back' : 'Back (B)'}</span>
            </div>
          )}
        </Focusable>
      </div>

      <div className="tv-settings-layout">
        {/* Left Navigation Rail (M3 Two-Pane Navigation) */}
        <nav className="tv-settings-categories-list tv-scroll-container" aria-label="Settings Categories">
          {navItems.map((item, idx) => (
            <Focusable
              key={item.id}
              id={item.id}
              groupId="settings-categories"
              indexInGroup={idx}
              className={`tv-setting-cat-item ${activeCategory === item.key ? 'selected' : ''}`}
              scaleEffect={false}
              ariaLabel={item.label}
              ariaSelected={activeCategory === item.key}
              onSelect={() => setActiveCategory(item.key)}
            >
              {(isFocused) => (
                <div className={`tv-cat-row ${isFocused ? 'focused' : ''}`}>
                  {item.icon}
                  <span className="cat-title">{item.label}</span>
                </div>
              )}
            </Focusable>
          ))}
        </nav>

        {/* Right Preference Details Pane */}
        <div className="tv-settings-details-panel tv-scroll-container">
          {activeCategory === 'profiles' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Profiles & Security</h3>
                  <p className="tv-settings-section-desc">
                    Manage household accounts, 4-digit PIN lock memory, and personalized tab restoration.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Ask Who&apos;s Watching on Startup</span>
                    <span className="tv-row-desc">
                      Show profile chooser each time Kaira launches
                    </span>
                  </div>
                  <M3Switch
                    id="setting-prompt-on-launch-toggle"
                    groupId="settings-profiles-main"
                    indexInGroup={0}
                    checked={profileState.promptOnLaunch}
                    label="Ask Who's Watching on Startup"
                    onToggle={() => profileService.setPromptOnLaunch(!profileState.promptOnLaunch)}
                  />
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Remember Last Active Tab per Profile</span>
                    <span className="tv-row-desc">
                      Restore previous Movies, Shows, or Music tab when switching users
                    </span>
                  </div>
                  <M3Switch
                    id="setting-remember-tab-toggle"
                    groupId="settings-profiles-main"
                    indexInGroup={1}
                    checked={profileState.rememberLastTab}
                    label="Remember Last Active Tab per Profile"
                    onToggle={() => profileService.setRememberLastTab(!profileState.rememberLastTab)}
                  />
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">PIN Memory Policy</span>
                    <span className="tv-row-desc">
                      Controls how long unlocked PINs stay remembered before re-authentication
                    </span>
                  </div>
                  <div className="tv-pill-options">
                    {(
                      [
                        { id: 'session', label: 'Session' },
                        { id: 'device', label: 'This Device' },
                        { id: 'always', label: 'Always Ask' },
                      ] as const
                    ).map((item, idx) => (
                      <Focusable
                        key={item.id}
                        id={`opt-pin-policy-${item.id}`}
                        groupId="settings-pin-policy"
                        indexInGroup={idx}
                        className="tv-option-chip"
                        scaleEffect={false}
                        ariaLabel={`PIN policy: ${item.label}`}
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
              </div>

              <div className="tv-actions-row">
                <Focusable
                  id="setting-lock-all-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={2}
                  scaleEffect={false}
                  ariaLabel="Lock All Profiles Now"
                  onSelect={() => profileService.lockAllProfiles()}
                >
                  {(isFocused) => (
                    <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                      <Lock size={15} />
                      <span>Lock All Profiles</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="setting-clear-mem-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={3}
                  scaleEffect={false}
                  ariaLabel="Clear All Memory and History"
                  onSelect={() => profileService.clearAllMemoryData()}
                >
                  {(isFocused) => (
                    <div className={`tv-tonal-btn danger ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={15} />
                      <span>Clear Memory &amp; History</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">
                  Registered Profiles ({profileState.profiles.length})
                </h4>
                <Focusable
                  id="setting-add-profile-btn"
                  groupId="settings-profiles-main"
                  indexInGroup={4}
                  scaleEffect={false}
                  ariaLabel="Add Profile"
                  onSelect={() => setEditingProfile('create')}
                >
                  {(isFocused) => (
                    <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                      <Plus size={15} />
                      <span>Add Profile</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-pref-group">
                {profileState.profiles.map((prof, idx) => {
                  const isActive = prof.id === profileState.activeProfileId;
                  const hasPin = Boolean(prof.pin);
                  const isUnlocked = profileService.isProfileUnlocked(prof.id);
                  const historyCount = profileService.getWatchHistory(prof.id).length;

                  return (
                    <div key={prof.id} className="tv-pref-row">
                      <div className="tv-profile-row-left">
                        <div className="tv-profile-item-avatar" style={{ background: prof.avatarColor }}>
                          {renderAvatarIcon(prof.avatarIcon, 22, '#ffffff')}
                          {hasPin && (
                            <div className="tv-profile-item-lock">
                              {isUnlocked ? <Unlock size={10} color="#ffffff" /> : <Lock size={10} color="#ffffff" />}
                            </div>
                          )}
                        </div>
                        <div className="tv-profile-item-info">
                          <div className="tv-profile-item-name-row">
                            <span className="tv-profile-item-name">{prof.name}</span>
                            {isActive && <span className="tv-profile-active-label">Active now</span>}
                          </div>
                          <div className="tv-profile-item-sub">
                            <span>{prof.badge}</span>
                            <span>·</span>
                            <span className={hasPin ? (isUnlocked ? 'unlocked-pin-text' : 'has-pin-text') : 'no-pin-text'}>
                              {hasPin
                                ? isUnlocked
                                  ? 'Unlocked'
                                  : 'PIN Required'
                                : 'No PIN'}
                            </span>
                            <span>·</span>
                            <span>{historyCount} watched</span>
                          </div>
                        </div>
                      </div>

                      <div className="tv-profile-item-actions">
                        {!isActive && (
                          <Focusable
                            id={`profile-switch-${prof.id}`}
                            groupId="settings-profile-items"
                            indexInGroup={idx * 4}
                            scaleEffect={false}
                            ariaLabel={`Switch to ${prof.name}`}
                            onSelect={() => {
                              if (prof.pin && !isUnlocked) {
                                setPinTargetProfile(prof);
                              } else {
                                profileService.setActiveProfile(prof.id);
                              }
                            }}
                          >
                            {(isFocused) => (
                              <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
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
                            scaleEffect={false}
                            ariaLabel={`Lock ${prof.name}`}
                            onSelect={() => profileService.lockProfile(prof.id)}
                          >
                            {(isFocused) => (
                              <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
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
                          scaleEffect={false}
                          ariaLabel={`Edit ${prof.name}`}
                          onSelect={() => setEditingProfile(prof)}
                        >
                          {(isFocused) => (
                            <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                              <Edit3 size={14} />
                              <span>Edit</span>
                            </div>
                          )}
                        </Focusable>

                        {profileState.profiles.length > 1 && (
                          <Focusable
                            id={`profile-delete-${prof.id}`}
                            groupId="settings-profile-items"
                            indexInGroup={idx * 4 + 3}
                            scaleEffect={false}
                            ariaLabel={`Delete ${prof.name}`}
                            onSelect={() => profileService.deleteProfile(prof.id)}
                          >
                            {(isFocused) => (
                              <div className={`tv-tonal-btn danger icon-only ${isFocused ? 'focused' : ''}`}>
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
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Addons & Stream Providers</h3>
                  <p className="tv-settings-section-desc">
                    Configure Stremio &amp; Nuvio manifest addons and high-bitrate Debrid resolvers.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Stream Accelerator (Debrid)</span>
                    <span className="tv-row-desc">
                      Connect Self-Debrid or a cached Debrid provider for direct 4K HDR playback
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
                        scaleEffect={false}
                        ariaLabel={`Debrid provider: ${prov}`}
                        onSelect={() => {
                          handleDebridProviderChange(prov);
                          handleSaveDebridSettings(prov);
                        }}
                      >
                        {(isFocused) => (
                          <div className={`tv-chip-inner ${debridConfig.provider === prov ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                            {prov === 'selfdebrid'
                              ? 'Self-Debrid'
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

                {debridConfig.provider === 'selfdebrid' && (
                  <div className="tv-pref-row tv-pref-row-stacked">
                    <div className="tv-row-text">
                      <span className="tv-row-title">
                        <Zap size={15} />
                        <span>Self-Debrid Server Endpoint</span>
                      </span>
                      <span className="tv-row-desc">
                        Streams local qBittorrent tasks via HTTP on port 8081
                      </span>
                    </div>

                    <div className="tv-settings-input-row">
                      <input
                        type="text"
                        className="tv-settings-text-input"
                        placeholder="http://localhost:8081"
                        value={debridEndpoint}
                        onChange={(e) => setDebridEndpoint(e.target.value)}
                        onBlur={() => handleSaveDebridSettings()}
                      />
                      <Focusable
                        id="btn-save-self-debrid"
                        groupId="settings-self-debrid"
                        indexInGroup={0}
                        scaleEffect={false}
                        ariaLabel="Save and test Self-Debrid endpoint"
                        onSelect={() => {
                          handleSaveDebridSettings();
                          handleTestSelfDebrid();
                        }}
                      >
                        {(isFocused) => (
                          <div className={`tv-tonal-btn primary ${isFocused ? 'focused' : ''}`}>
                            <Check size={15} />
                            <span>{isTestingDebrid ? 'Testing...' : 'Save & Test'}</span>
                          </div>
                        )}
                      </Focusable>
                    </div>

                    {debridTestResult && (
                      <div className={`tv-inline-status ${debridTestResult.success ? 'active' : ''}`}>
                        {debridTestResult.message}
                      </div>
                    )}

                    <div className="tv-row-text">
                      <span className="tv-row-title">
                        <Volume2 size={15} />
                        <span>Audio Transcode Mode</span>
                      </span>
                      <div className="tv-pill-options" style={{ marginTop: 6 }}>
                        {[
                          { id: 'auto', label: 'Auto' },
                          { id: 'aac_transcode', label: 'Stereo AAC' },
                          { id: 'stereo_downmix', label: 'Downmix' },
                          { id: 'direct', label: 'Direct Bitstream' },
                        ].map((item, optIdx) => (
                          <Focusable
                            key={item.id}
                            id={`opt-debrid-audio-${item.id}`}
                            groupId="settings-self-debrid-audio"
                            indexInGroup={optIdx}
                            className="tv-option-chip"
                            scaleEffect={false}
                            ariaLabel={`Audio mode: ${item.label}`}
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
                    </div>

                    <div className="tv-debrid-guide-note">
                      Ensure qBittorrent Web UI is enabled on port 8080 and self-debrid is running on port 8081.
                    </div>
                  </div>
                )}

                {(debridConfig.provider === 'realdebrid' ||
                  debridConfig.provider === 'alldebrid' ||
                  debridConfig.provider === 'torbox') && (
                  <div className="tv-pref-row tv-pref-row-stacked">
                    <div className="tv-row-text">
                      <span className="tv-row-title">API Token / Secret Key</span>
                      <span className="tv-row-desc">
                        Enter your {debridConfig.provider.toUpperCase()} token for cached streams
                      </span>
                    </div>
                    <div className="tv-settings-input-row">
                      <input
                        type="password"
                        className="tv-settings-text-input"
                        placeholder="Paste your API key..."
                        value={debridApiKey}
                        onChange={(e) => setDebridApiKey(e.target.value)}
                        onBlur={() => handleSaveDebridSettings()}
                      />
                      <Focusable
                        id="btn-save-cloud-debrid"
                        groupId="settings-cloud-debrid"
                        indexInGroup={0}
                        scaleEffect={false}
                        ariaLabel="Save API Key"
                        onSelect={() => handleSaveDebridSettings()}
                      >
                        {(isFocused) => (
                          <div className={`tv-tonal-btn primary ${isFocused ? 'focused' : ''}`}>
                            <Check size={15} />
                            <span>Save Key</span>
                          </div>
                        )}
                      </Focusable>
                    </div>
                  </div>
                )}
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">Installed Addons ({addons.length})</h4>
              </div>

              <div className="tv-pref-group">
                {addons.map((addon, idx) => (
                  <div key={addon.manifest.id} className="tv-pref-row">
                    <div className="tv-row-text">
                      <span className="tv-addon-item-name">
                        {addon.manifest.name}
                        <small>v{addon.manifest.version}</small>
                      </span>
                      <span className="tv-row-desc">{addon.manifest.description}</span>
                    </div>

                    <div className="tv-addon-item-actions">
                      <M3Switch
                        id={`addon-toggle-${addon.manifest.id}`}
                        groupId="settings-addons-list"
                        indexInGroup={idx * 2}
                        checked={addon.enabled}
                        label={`Toggle ${addon.manifest.name}`}
                        onToggle={() => handleToggleAddon(addon.manifest.id, addon.enabled)}
                      />

                      {addon.manifest.id !== 'org.stremio.cinemeta' && (
                        <Focusable
                          id={`addon-del-${addon.manifest.id}`}
                          groupId="settings-addons-list"
                          indexInGroup={idx * 2 + 1}
                          scaleEffect={false}
                          ariaLabel={`Uninstall ${addon.manifest.name}`}
                          onSelect={() => handleUninstallAddon(addon.manifest.id)}
                        >
                          {(isFocused) => (
                            <div className={`tv-tonal-btn danger icon-only ${isFocused ? 'focused' : ''}`}>
                              <Trash2 size={15} />
                            </div>
                          )}
                        </Focusable>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">Official &amp; Community Presets</h4>
              </div>

              <div className="tv-community-presets-row">
                {[
                  { id: 'preset-torrentio', label: 'Torrentio (4K / HDR)', url: 'https://torrentio.strem.fun/manifest.json' },
                  { id: 'preset-cinemeta', label: 'Cinemeta Catalogs', url: 'https://v3-cinemeta.strem.io/manifest.json' },
                  { id: 'preset-opensubtitles', label: 'OpenSubtitles v3', url: 'https://opensubtitles-v3.strem.io/manifest.json' },
                  { id: 'preset-aiostreams', label: 'AIOStreams Aggregator', url: 'https://aiostreams.am/manifest.json' },
                ].map((preset, idx) => (
                  <Focusable
                    key={preset.id}
                    id={preset.id}
                    groupId="settings-addon-presets"
                    indexInGroup={idx}
                    scaleEffect={false}
                    ariaLabel={`Install ${preset.label}`}
                    onSelect={() => handleInstallAddon(preset.url)}
                  >
                    {(isFocused) => (
                      <div className={`tv-preset-card ${isFocused ? 'focused' : ''}`}>
                        <Plus size={15} />
                        <span>{preset.label}</span>
                      </div>
                    )}
                  </Focusable>
                ))}
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row tv-pref-row-stacked">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Install Custom Addon Manifest</span>
                    <span className="tv-row-desc">
                      Paste any valid Stremio or Nuvio manifest URL
                    </span>
                  </div>
                  <div className="tv-settings-input-row">
                    <Focusable
                      id="addon-custom-input-box"
                      groupId="settings-addon-presets"
                      indexInGroup={4}
                      scaleEffect={false}
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
                            if (e.key === 'Enter' && newAddonUrl) {
                              handleInstallAddon(newAddonUrl);
                              setNewAddonUrl('');
                            } else if (e.key === 'ArrowRight') {
                              spatialNav.setFocus('addon-custom-install-btn');
                            } else if (e.key === 'ArrowUp') {
                              spatialNav.setFocus('preset-torrentio');
                            }
                          }}
                          placeholder="https://.../manifest.json"
                          className={`tv-settings-text-input ${isFocused ? 'focused' : ''}`}
                        />
                      )}
                    </Focusable>

                    <Focusable
                      id="addon-custom-install-btn"
                      groupId="settings-addon-presets"
                      indexInGroup={5}
                      scaleEffect={false}
                      ariaLabel="Install custom manifest"
                      onSelect={() => {
                        if (newAddonUrl) {
                          handleInstallAddon(newAddonUrl);
                          setNewAddonUrl('');
                        }
                      }}
                    >
                      {(isFocused) => (
                        <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                          <Plus size={15} />
                          <span>Install</span>
                        </div>
                      )}
                    </Focusable>
                  </div>
                </div>
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">Music Streaming &amp; Lyrics Plugins</h4>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Audius Open Music Protocol</span>
                    <span className="tv-row-desc">320kbps full-length music streaming &amp; charts</span>
                  </div>
                  <span className="tv-inline-status active">Active · 320kbps</span>
                </div>
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">LRCLIB Synced Karaoke Lyrics</span>
                    <span className="tv-row-desc">Line-by-line synchronized lyrics during music playback</span>
                  </div>
                  <span className="tv-inline-status active">Active</span>
                </div>
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Piped Audio Extractor</span>
                    <span className="tv-row-desc">Opus &amp; AAC audio extraction for catalog tracks</span>
                  </div>
                  <span className="tv-inline-status active">Active</span>
                </div>
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
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">uBlock Origin AdBlock &amp; Anti-Popup Shield</h3>
                  <p className="tv-settings-section-desc">
                    EasyList-powered blocker removing video ads, trackers, and rogue stream redirects.
                  </p>
                </div>
              </div>

              <div className="tv-ublock-summary-card">
                <div className="tv-ublock-hero-info">
                  <div className={`tv-ublock-shield-icon-box ${ublockState.enabled ? '' : 'paused'}`}>
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <div className="tv-ublock-hero-title">
                      {ublockState.enabled ? 'uBlock Origin Shield Active' : 'uBlock Origin Shield Paused'}
                    </div>
                    <div className="tv-ublock-hero-stats">
                      <span className="tv-ublock-stat-badge">
                        {ublockState.blockedCount.toLocaleString()} blocked
                      </span>
                      <span>·</span>
                      <span>{ublockService.getTotalRulesCount().toLocaleString()} rules</span>
                      <span>·</span>
                      <span>Anti-popup enforced</span>
                    </div>
                  </div>
                </div>

                <M3Switch
                  id="ublock-master-toggle"
                  groupId="settings-ublock-main"
                  indexInGroup={0}
                  checked={ublockState.enabled}
                  label="Master uBlock Origin Shield"
                  onToggle={() => ublockService.setEnabled(!ublockState.enabled)}
                />
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Popup &amp; Redirect Neutralizer</span>
                    <span className="tv-row-desc">
                      Blocks new tab and window.open redirects spawned by embedded stream mirrors
                    </span>
                  </div>
                  <M3Switch
                    id="ublock-popup-toggle"
                    groupId="settings-ublock-main"
                    indexInGroup={1}
                    checked={ublockState.antiPopup}
                    label="Popup and Redirect Neutralizer"
                    onToggle={() => ublockService.setAntiPopup(!ublockState.antiPopup)}
                  />
                </div>
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">
                  Filter Rule Subscriptions ({ublockState.filterLists.filter((f) => f.enabled).length})
                </h4>
                <Focusable
                  id="ublock-reset-stats"
                  groupId="settings-ublock-main"
                  indexInGroup={2}
                  scaleEffect={false}
                  ariaLabel="Reset block statistics"
                  onSelect={() => ublockService.resetStats()}
                >
                  {(isFocused) => (
                    <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={14} />
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
                    scaleEffect={false}
                    ariaLabel={`Toggle ${filter.name}`}
                    onSelect={() => ublockService.toggleFilterList(filter.id)}
                  >
                    {(isFocused) => (
                      <div className={`tv-ublock-filter-card ${filter.enabled ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                        <div className="tv-ublock-filter-info">
                          <span className="tv-ublock-filter-name">{filter.name}</span>
                          <span className="tv-ublock-filter-rules">{filter.rulesCount.toLocaleString()} rules</span>
                        </div>
                        {filter.enabled ? <Check size={17} color="#81c995" /> : <X size={17} color="#9aa0a6" />}
                      </div>
                    )}
                  </Focusable>
                ))}
              </div>
            </div>
          )}

          {activeCategory === 'display' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Display &amp; Sound</h3>
                  <p className="tv-settings-section-desc">
                    Configure render resolution and color pass-through output.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Display Resolution</span>
                    <span className="tv-row-desc">
                      {platform.isAndroid
                        ? 'Target render scaling for this Android screen'
                        : 'Target render scaling for primary TV display'}
                    </span>
                  </div>
                  <div className="tv-pill-options">
                    {(['1080p', '1440p', '4k'] as const).map((res, idx) => (
                      <Focusable
                        key={res}
                        id={`opt-res-${res}`}
                        groupId="settings-res-options"
                        indexInGroup={idx}
                        className="tv-option-chip"
                        scaleEffect={false}
                        ariaLabel={`Resolution ${res.toUpperCase()}`}
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

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">High Dynamic Range (HDR)</span>
                    <span className="tv-row-desc">HDR10 pass-through on supported displays</span>
                  </div>
                  <span className="tv-inline-status active">Enabled</span>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'controller' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Gamepads &amp; Input</h3>
                  <p className="tv-settings-section-desc">
                    Gamepad normalization pipeline, deadzone tuning, and navigation audio feedback.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Active Input Device</span>
                    <span className="tv-row-desc">
                      {activeGamepads.length > 0
                        ? activeGamepads[0]
                        : platform.isAndroid
                        ? 'Android TV Remote / Bluetooth Controller'
                        : 'Bluetooth or USB Controller / D-Pad'}
                    </span>
                  </div>
                  <span className="tv-inline-status active">Connected</span>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Navigation Analog Deadzone</span>
                    <span className="tv-row-desc">Tuned threshold for left analog stick 10-foot navigation</span>
                  </div>
                  <span className="tv-inline-status">0.42 (Tuned)</span>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">UI Navigation Sound Effects</span>
                    <span className="tv-row-desc">Subtle clicks and confirmation chimes on focus transitions</span>
                  </div>
                  <M3Switch
                    id="settings-sfx-toggle"
                    groupId="settings-controller-group"
                    indexInGroup={0}
                    checked={sfxEnabled}
                    label="UI Navigation Sound Effects"
                    onToggle={() => {
                      const next = !sfxEnabled;
                      soundEffectsService.setEnabled(next);
                      setSfxEnabled(next);
                    }}
                  />
                </div>
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">Input Normalization Inspector</h4>
              </div>

              <div className="tv-controller-pipeline-card">
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">1. RAW INPUT</span>
                  <span className="tv-pipeline-stage-value highlight">
                    {lastAction ? lastAction.raw : 'Press any button...'}
                  </span>
                </div>
                <div className="tv-pipeline-arrow">→</div>
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">2. SEMANTIC ACTION</span>
                  <span className="tv-pipeline-stage-value green">
                    {lastAction ? lastAction.normalized : 'Awaiting input'}
                  </span>
                </div>
                <div className="tv-pipeline-arrow">→</div>
                <div className="tv-pipeline-stage">
                  <span className="tv-pipeline-stage-title">3. SPATIAL NAV</span>
                  <span className="tv-pipeline-stage-value">
                    {lastAction ? lastAction.uiAction : 'Awaiting input'}
                  </span>
                </div>
              </div>

              <div className="tv-controller-events-log">
                {actionLog.length === 0 ? (
                  <div className="tv-log-empty">No input events captured yet. Press D-pad or gamepad buttons to inspect events.</div>
                ) : (
                  actionLog.map((act, idx) => (
                    <div key={`${act.timestamp}-${idx}`} className="tv-log-row">
                      <span className="tv-log-time">
                        {new Date(act.timestamp).toLocaleTimeString([], {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      <span className="tv-log-raw">{act.raw}</span>
                      <span className="tv-log-arrow">→</span>
                      <span className="tv-log-normalized">{act.normalized}</span>
                      <span className="tv-log-arrow">→</span>
                      <span className="tv-log-ui">{act.uiAction}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {isRemoteEnabled && activeCategory === 'remote' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Companion Phone Remote</h3>
                  <p className="tv-settings-section-desc">
                    Scan with any phone on the same local Wi-Fi for touchpad D-pad, media scrubber, and text input.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row tv-pref-row-stacked">
                  <div className="tv-remote-pair-layout">
                    <div className="tv-remote-qr-box">
                      <div
                        style={{ width: '148px', height: '148px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(remoteService.getRemoteUrl(), 148, '#000000', '#ffffff') }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Smartphone size={18} color="#81c995" />
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {clientCount > 0 ? `${clientCount} Phone${clientCount > 1 ? 's' : ''} Connected` : 'Ready to Pair'}
                        </span>
                      </div>

                      <div className="tv-remote-url-box">{remoteService.getRemoteUrl()}</div>

                      <div className="tv-actions-row">
                        <Focusable
                          id="settings-remote-open-preview"
                          groupId="settings-remote-group"
                          indexInGroup={0}
                          scaleEffect={false}
                          ariaLabel="Copy remote pairing URL"
                          onSelect={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(remoteService.getRemoteUrl()).catch(() => {});
                            }
                          }}
                        >
                          {(isFocused) => (
                            <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                              <ExternalLink size={15} />
                              <span>Copy Remote URL</span>
                            </div>
                          )}
                        </Focusable>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Remote Bridge Diagnostics</span>
                    <span className="tv-row-desc">
                      Port {window.location.port || '3000'} / 3001 · WebSocket, SSE &amp; BroadcastChannel
                    </span>
                  </div>
                  <span className="tv-inline-status active">Listening</span>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'ambient' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">Ambient Smart Lighting</h3>
                  <p className="tv-settings-section-desc">
                    Synchronize Tuya smart lights with active video artwork and dominant colors.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Sync Mode</span>
                    <span className="tv-row-desc">Color extraction and lighting behavior</span>
                  </div>
                  <div className="tv-pill-options">
                    {(['ambient', 'cycle', 'test', 'off'] as const).map((m, idx) => (
                      <Focusable
                        key={m}
                        id={`opt-amb-mode-${m}`}
                        groupId="settings-amb-mode"
                        indexInGroup={idx}
                        className="tv-option-chip"
                        scaleEffect={false}
                        ariaLabel={`Ambient mode ${m.toUpperCase()}`}
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

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Lighting Intensity ({ambientState.intensity}%)</span>
                    <span className="tv-row-desc">Adjust peak smart bulb brightness</span>
                  </div>
                  <div className="tv-intensity-stepper">
                    <Focusable
                      id="amb-dec-intensity"
                      groupId="settings-intensity-stepper"
                      indexInGroup={0}
                      scaleEffect={false}
                      ariaLabel="Decrease intensity by 10%"
                      onSelect={() => handleIntensityChange(-10)}
                    >
                      {(isFocused) => <div className={`tv-step-inner ${isFocused ? 'focused' : ''}`}>- 10%</div>}
                    </Focusable>
                    <Focusable
                      id="amb-inc-intensity"
                      groupId="settings-intensity-stepper"
                      indexInGroup={1}
                      scaleEffect={false}
                      ariaLabel="Increase intensity by 10%"
                      onSelect={() => handleIntensityChange(10)}
                    >
                      {(isFocused) => <div className={`tv-step-inner ${isFocused ? 'focused' : ''}`}>+ 10%</div>}
                    </Focusable>
                  </div>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Paired Tuya Smart Bulbs</span>
                    <span className="tv-row-desc">Local LAN color sync ready across 3 room bulbs</span>
                  </div>
                  <span className="tv-inline-status active">3 Bulbs Paired</span>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'tv-mode' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">{platform.isAndroid ? 'Display Mode' : 'TV Mode & Display Link'}</h3>
                  <p className="tv-settings-section-desc">
                    Manage fullscreen viewport, HDMI output status, and pointer behavior.
                  </p>
                </div>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Fullscreen Mode</span>
                    <span className="tv-row-desc">
                      Hide system bars and window chrome for distraction-free viewing
                    </span>
                  </div>
                  <Focusable
                    id="tv-mode-fullscreen-toggle"
                    groupId="tv-mode-actions"
                    indexInGroup={0}
                    scaleEffect={false}
                    ariaLabel="Toggle Fullscreen"
                    onSelect={handleToggleFullscreen}
                  >
                    {(isFocused) => (
                      <div className={`tv-toggle-btn ${isFocused ? 'focused' : ''}`}>
                        <span>Toggle Fullscreen</span>
                      </div>
                    )}
                  </Focusable>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">
                      {platform.isAndroid ? 'Android Display Output' : 'Primary TV / HDMI Display'}
                    </span>
                    <span className="tv-row-desc">Active primary presentation surface</span>
                  </div>
                  <span className="tv-inline-status active">
                    {platform.isAndroid ? 'Active' : 'HDMI Active'}
                  </span>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Auto-Hide Mouse Cursor</span>
                    <span className="tv-row-desc">Hide pointer after 3 seconds during gamepad or D-pad control</span>
                  </div>
                  <span className="tv-inline-status active">Enabled</span>
                </div>
              </div>
            </div>
          )}

          {activeCategory === 'system' && (
            <div className="tv-settings-group">
              <div className="tv-settings-section-head">
                <div>
                  <h3 className="tv-group-title">System &amp; Power</h3>
                  <p className="tv-settings-section-desc">
                    App installation, ambient screensaver timeout, and hardware diagnostics.
                  </p>
                </div>
                <Focusable
                  id="diag-refresh-btn"
                  groupId="system-diag-actions"
                  indexInGroup={0}
                  scaleEffect={false}
                  ariaLabel="Refresh System Diagnostics"
                  onSelect={() => systemService.refreshDiagnostics()}
                >
                  {(isFocused) => (
                    <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                      <RotateCcw size={14} />
                      <span>Refresh Diagnostics</span>
                    </div>
                  )}
                </Focusable>
              </div>

              <div className="tv-pref-group">
                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Android App &amp; Standalone Install</span>
                    <span className="tv-row-desc">
                      Install Kaira on Android / Chrome or build native APK from android/
                    </span>
                  </div>
                  <PWAInstallButton />
                </div>

                {platform.isAndroid && (
                  <div className="tv-pref-row">
                    <div className="tv-row-text">
                      <span className="tv-row-title">Welcome &amp; Setup Guide</span>
                      <span className="tv-row-desc">
                        Replay initial profile setup, display preferences, and navigation tips
                      </span>
                    </div>
                    <Focusable
                      id="settings-replay-onboarding-btn"
                      groupId="system-diag-actions"
                      indexInGroup={1}
                      scaleEffect={false}
                      ariaLabel="Replay Setup Guide"
                      onSelect={() => {
                        resetAndroidOnboarding();
                        onClose();
                        window.dispatchEvent(new CustomEvent('kaira:open-onboarding'));
                      }}
                    >
                      {(isFocused) => (
                        <div className={`tv-tonal-btn ${isFocused ? 'focused' : ''}`}>
                          <RotateCcw size={14} />
                          <span>Replay Setup Guide</span>
                        </div>
                      )}
                    </Focusable>
                  </div>
                )}

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Screensaver Idle Timeout</span>
                    <span className="tv-row-desc">Launch 4K aerial screensaver after inactivity</span>
                  </div>
                  <div className="tv-row-stepper">
                    {[
                      { label: '2m', value: 2 },
                      { label: '5m', value: 5 },
                      { label: '10m', value: 10 },
                      { label: '15m', value: 15 },
                      { label: 'Never', value: 0 },
                    ].map((opt, optIdx) => {
                      const isSelected = screensaverState.timeoutMinutes === opt.value;
                      return (
                        <Focusable
                          key={opt.value}
                          id={`screensaver-timeout-${opt.value}`}
                          groupId="screensaver-timeout-group"
                          indexInGroup={optIdx}
                          scaleEffect={false}
                          ariaLabel={`Screensaver timeout: ${opt.label}`}
                          onSelect={() => screensaverService.setTimeoutMinutes(opt.value)}
                        >
                          {(isFocused) => (
                            <div className={`tv-stepper-btn ${isSelected ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                              <span>{opt.label}</span>
                            </div>
                          )}
                        </Focusable>
                      );
                    })}
                  </div>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Preview 4K Screensaver</span>
                    <span className="tv-row-desc">Test aerial lock screen with clock and weather</span>
                  </div>
                  <Focusable
                    id="screensaver-preview-btn"
                    groupId="system-power-actions"
                    indexInGroup={0}
                    scaleEffect={false}
                    ariaLabel="Preview Screensaver"
                    onSelect={() => screensaverService.trigger()}
                  >
                    {(isFocused) => (
                      <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                        <Monitor size={15} />
                        <span>Preview</span>
                      </div>
                    )}
                  </Focusable>
                </div>

                <div className="tv-pref-row">
                  <div className="tv-row-text">
                    <span className="tv-row-title">Power Actions</span>
                    <span className="tv-row-desc">Standby, relaunch, or power down Kaira</span>
                  </div>
                  <div className="tv-actions-row">
                    <Focusable
                      id="power-sleep-btn"
                      groupId="system-power-actions"
                      indexInGroup={1}
                      scaleEffect={false}
                      ariaLabel="Sleep Device"
                      onSelect={() => sleepTimerService.sleepNow()}
                    >
                      {(isFocused) => (
                        <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                          <Moon size={15} />
                          <span>Sleep</span>
                        </div>
                      )}
                    </Focusable>

                    <Focusable
                      id="power-restart-btn"
                      groupId="system-power-actions"
                      indexInGroup={2}
                      scaleEffect={false}
                      ariaLabel="Restart System"
                      onSelect={() => displayService.triggerPowerAction('restart')}
                    >
                      {(isFocused) => (
                        <div className={`tv-power-btn ${isFocused ? 'focused' : ''}`}>
                          <RotateCcw size={15} />
                          <span>Restart</span>
                        </div>
                      )}
                    </Focusable>

                    <Focusable
                      id="power-shutdown-btn"
                      groupId="system-power-actions"
                      indexInGroup={3}
                      scaleEffect={false}
                      ariaLabel="Shut Down System"
                      onSelect={() => displayService.triggerPowerAction('shutdown')}
                    >
                      {(isFocused) => (
                        <div className={`tv-power-btn danger ${isFocused ? 'focused' : ''}`}>
                          <Power size={15} />
                          <span>Shut Down</span>
                        </div>
                      )}
                    </Focusable>
                  </div>
                </div>
              </div>

              <div className="tv-subgroup-header">
                <h4 className="tv-subgroup-title">Hardware Diagnostics</h4>
              </div>

              <div className="tv-diagnostics-grid">
                <div className="tv-diag-card">
                  <span className="tv-diag-label">Operating System</span>
                  <span className="tv-diag-value highlight">{diagnostics?.os || 'Kaira Media Runtime'}</span>
                  <span className="tv-diag-sub">{diagnostics?.kernel || 'Standard Web / Native'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Architecture</span>
                  <span className="tv-diag-value">{diagnostics?.arch.toUpperCase() || 'X86_64'}</span>
                  <span className="tv-diag-sub">{diagnostics?.deviceModel || 'Media Device'}</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Processor &amp; Cores</span>
                  <span className="tv-diag-value">{diagnostics?.cpuModel || 'Multi-Core CPU'}</span>
                  <span className="tv-diag-sub">{diagnostics?.cpuCores || 4} Threads Active</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Memory (RAM)</span>
                  <span className="tv-diag-value">
                    {diagnostics
                      ? `${(diagnostics.ramUsedBytes / 1024 ** 3).toFixed(1)} GB / ${(diagnostics.ramTotalBytes / 1024 ** 3).toFixed(1)} GB`
                      : '8.0 GB Total'}
                  </span>
                  <span className="tv-diag-sub">
                    {diagnostics ? `${(diagnostics.ramFreeBytes / 1024 ** 3).toFixed(1)} GB Free` : 'Available'}
                  </span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Video Hardware Decode</span>
                  <span className="tv-diag-value green">{diagnostics?.hardwareVideoDecode || 'Hardware Decode Ready'}</span>
                  <span className="tv-diag-sub">H.264 · HEVC · AV1 · VP9</span>
                </div>

                <div className="tv-diag-card">
                  <span className="tv-diag-label">Display &amp; Audio</span>
                  <span className="tv-diag-value">
                    {diagnostics?.activeDisplay.width}×{diagnostics?.activeDisplay.height} @ {diagnostics?.activeDisplay.refreshRate}Hz
                  </span>
                  <span className="tv-diag-sub">
                    {diagnostics?.audioServer.toUpperCase() || 'AUDIO'} · {diagnostics?.activeAudioDevice.name || 'Primary Output'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
