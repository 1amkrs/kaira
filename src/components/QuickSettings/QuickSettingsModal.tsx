import React, { useState, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Tv, 
  Lightbulb, 
  Gamepad, 
  Wifi, 
  Power, 
  RotateCcw, 
  Sliders, 
  ArrowLeft,
  Check,
  Moon,
  Smartphone,
  QrCode
} from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { audioService } from '../../services/audio/AudioService';
import { displayService } from '../../services/display/displayService';
import { ambientService } from '../../services/ambient/ambientService';
import { networkService } from '../../services/network/NetworkService';
import { systemService } from '../../services/system/SystemService';
import { remoteService } from '../../services/remote/RemoteService';
import { AmbientState, DisplaySettings } from '../../types';
import './QuickSettingsModal.css';

interface QuickSettingsModalProps {
  onClose: () => void;
  onOpenRemoteModal?: () => void;
}

export const QuickSettingsModal: React.FC<QuickSettingsModalProps> = ({ onClose, onOpenRemoteModal }) => {
  const [volume, setVolume] = useState<number>(() => Math.round(audioService.getVolume() * 100));
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [ambientState, setAmbientState] = useState<AmbientState>(() => ambientService.getState());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => displayService.getSettings());
  const [networkState, setNetworkState] = useState(() => networkService.getState());
  const [diagnostics, setDiagnostics] = useState(() => systemService.getCachedDiagnostics());
  const [clientCount, setClientCount] = useState<number>(() => remoteService.getConnectedClients());

  useEffect(() => {
    spatialNav.pushScope('quick-settings-modal');
    return () => {
      spatialNav.popScope('quick-settings-modal');
    };
  }, []);

  useEffect(() => {
    const unsubAmbient = ambientService.subscribe(setAmbientState);
    const unsubNetwork = networkService.subscribe(setNetworkState);
    const unsubDiag = systemService.subscribe(setDiagnostics);
    const unsubRemote = remoteService.subscribeClientCount(setClientCount);
    return () => {
      unsubAmbient();
      unsubNetwork();
      unsubDiag();
      unsubRemote();
    };
  }, []);

  const handleVolumeChange = (delta: number) => {
    const next = Math.max(0, Math.min(100, volume + delta));
    setVolume(next);
    audioService.setVolume(next / 100);
    setIsMuted(next === 0);
  };

  const handleToggleMute = async () => {
    const muted = await audioService.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleFullscreen = async () => {
    const isFull = await displayService.toggleFullscreen();
    setDisplaySettings((prev) => ({ ...prev, tvMode: isFull }));
  };

  const handleAmbientModeChange = (mode: 'ambient' | 'cycle' | 'test' | 'off') => {
    ambientService.setMode(mode);
  };

  return (
    <div className="tv-quick-settings-backdrop" role="dialog" aria-modal="true" aria-label="Quick Settings">
      <div className="tv-quick-settings-drawer">
        {/* Header */}
        <div className="tv-qs-header">
          <div className="tv-qs-title-row">
            <Sliders size={22} color="#ff453a" />
            <h2 className="tv-qs-title">Quick Settings</h2>
          </div>

          <Focusable
            id="qs-close-btn"
            groupId="qs-nav"
            className="tv-qs-close-focusable"
            scaleEffect={false}
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-qs-back-btn ${isFocused ? 'focused' : ''}`}>
                <ArrowLeft size={18} />
                <span>Close (B)</span>
              </div>
            )}
          </Focusable>
        </div>

        {/* Settings Body */}
        <div className="tv-qs-body tv-scroll-container">
          {/* 1. Volume & Audio Card */}
          <div className="tv-qs-card">
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                {isMuted || volume === 0 ? <VolumeX size={20} color="#ff453a" /> : <Volume2 size={20} color="#ff453a" />}
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">Audio Volume</span>
                <span className="tv-qs-card-sub">{diagnostics?.activeAudioDevice.name || 'HDMI Audio'} • {isMuted ? 'Muted' : `${volume}%`}</span>
              </div>
            </div>

            <div className="tv-qs-stepper-row">
              <Focusable
                id="qs-vol-dec"
                groupId="qs-audio"
                indexInGroup={0}
                className="tv-qs-step-btn"
                onSelect={() => handleVolumeChange(-5)}
              >
                {(isFocused) => <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`}>- 5%</div>}
              </Focusable>

              <Focusable
                id="qs-vol-inc"
                groupId="qs-audio"
                indexInGroup={1}
                className="tv-qs-step-btn"
                onSelect={() => handleVolumeChange(5)}
              >
                {(isFocused) => <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`}>+ 5%</div>}
              </Focusable>

              <Focusable
                id="qs-vol-mute"
                groupId="qs-audio"
                indexInGroup={2}
                className="tv-qs-step-btn"
                onSelect={handleToggleMute}
              >
                {(isFocused) => (
                  <div className={`tv-qs-btn-inner ${isMuted ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </div>
                )}
              </Focusable>
            </div>
          </div>

          {/* 2. Display & TV Mode Card */}
          <div className="tv-qs-card">
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                <Tv size={20} color="#81c995" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">TV Display Output</span>
                <span className="tv-qs-card-sub">
                  {diagnostics?.activeDisplay.width}×{diagnostics?.activeDisplay.height} @ {diagnostics?.activeDisplay.refreshRate}Hz • HDR10
                </span>
              </div>
            </div>

            <div className="tv-qs-stepper-row">
              <Focusable
                id="qs-display-fullscreen"
                groupId="qs-display"
                indexInGroup={0}
                className="tv-qs-step-btn"
                onSelect={handleToggleFullscreen}
              >
                {(isFocused) => (
                  <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`}>
                    Toggle Fullscreen
                  </div>
                )}
              </Focusable>
            </div>
          </div>

          {/* 3. Ambient Lighting Card */}
          <div className="tv-qs-card">
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                <Lightbulb size={20} color="#fbbc04" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">Ambient Lighting</span>
                <span className="tv-qs-card-sub">
                  {ambientState.enabled ? `Screen Sync Active (${ambientState.intensity}%)` : 'Off'} • 3 Smart Bulbs
                </span>
              </div>
            </div>

            <div className="tv-qs-pills-row">
              {(['ambient', 'cycle', 'test', 'off'] as const).map((mode, idx) => (
                <Focusable
                  key={mode}
                  id={`qs-amb-mode-${mode}`}
                  groupId="qs-ambient"
                  indexInGroup={idx}
                  className="tv-qs-pill-focusable"
                  onSelect={() => handleAmbientModeChange(mode)}
                >
                  {(isFocused) => (
                    <div className={`tv-qs-pill-inner ${ambientState.mode === mode ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                      {mode.toUpperCase()}
                    </div>
                  )}
                </Focusable>
              ))}
            </div>
          </div>

          {/* 4. Phone Companion Remote Card */}
          <div className="tv-qs-card">
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                <Smartphone size={20} color="#81c995" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">Companion Remote</span>
                <span className="tv-qs-card-sub">
                  {clientCount > 0 ? `🟢 ${clientCount} Phone${clientCount > 1 ? 's' : ''} Connected` : 'Pair phone to control TV'}
                </span>
              </div>
            </div>

            {onOpenRemoteModal && (
              <div className="tv-qs-stepper-row" style={{ marginTop: '10px' }}>
                <Focusable
                  id="qs-open-remote-modal"
                  groupId="qs-remote"
                  indexInGroup={0}
                  className="tv-qs-step-btn"
                  onSelect={() => {
                    onClose();
                    onOpenRemoteModal();
                  }}
                >
                  {(isFocused) => (
                    <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`} style={{ width: '100%', justifyContent: 'center' }}>
                      <QrCode size={15} />
                      <span>Show Pairing QR Code</span>
                    </div>
                  )}
                </Focusable>
              </div>
            )}
          </div>

          {/* 5. Controller & Network Card */}
          <div className="tv-qs-card">
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                <Gamepad size={20} color="#c58af9" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">Xbox Controller</span>
                <span className="tv-qs-card-sub">{diagnostics?.controllerName || 'Xbox Wireless Controller (Connected)'}</span>
              </div>
            </div>

            <div className="tv-qs-card-header" style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
              <div className="tv-qs-card-icon">
                <Wifi size={20} color="#ff453a" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">Network Connection</span>
                <span className="tv-qs-card-sub">{networkState.type.toUpperCase()} • IP: {networkState.ip}</span>
              </div>
            </div>
          </div>

          {/* 5. System Power Commands */}
          <div className="tv-qs-card" style={{ marginBottom: '24px' }}>
            <div className="tv-qs-card-header">
              <div className="tv-qs-card-icon">
                <Power size={20} color="#f28b82" />
              </div>
              <div className="tv-qs-card-info">
                <span className="tv-qs-card-title">System Power</span>
                <span className="tv-qs-card-sub">Appliance Power & Standby</span>
              </div>
            </div>

            <div className="tv-qs-stepper-row">
              <Focusable
                id="qs-power-sleep"
                groupId="qs-power"
                indexInGroup={0}
                className="tv-qs-step-btn"
                onSelect={() => displayService.triggerPowerAction('sleep')}
              >
                {(isFocused) => (
                  <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`}>
                    <Moon size={15} />
                    <span>Sleep</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="qs-power-restart"
                groupId="qs-power"
                indexInGroup={1}
                className="tv-qs-step-btn"
                onSelect={() => displayService.triggerPowerAction('restart')}
              >
                {(isFocused) => (
                  <div className={`tv-qs-btn-inner ${isFocused ? 'focused' : ''}`}>
                    <RotateCcw size={15} />
                    <span>Restart</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="qs-power-shutdown"
                groupId="qs-power"
                indexInGroup={2}
                className="tv-qs-step-btn danger"
                onSelect={() => displayService.triggerPowerAction('shutdown')}
              >
                {(isFocused) => (
                  <div className={`tv-qs-btn-inner danger ${isFocused ? 'focused' : ''}`}>
                    <Power size={15} />
                    <span>Shut Down</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
