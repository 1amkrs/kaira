import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Wifi,
  Globe,
  Network,
  Loader2,
  HelpCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { remoteService, NetworkInterfaceInfo } from '../../services/remote/RemoteService';
import { networkService } from '../../services/network/NetworkService';
import { generateQRCodeSVG } from '../../utils/qrCodeGenerator';
import './CompanionRemoteModal.css';

interface CompanionRemoteModalProps {
  onClose: () => void;
}

export const CompanionRemoteModal: React.FC<CompanionRemoteModalProps> = ({ onClose }) => {
  const [clientCount, setClientCount] = useState<number>(() => remoteService.getConnectedClients());
  const [networkState, setNetworkState] = useState(() => networkService.getState());
  const [interfaces, setInterfaces] = useState<NetworkInterfaceInfo[]>(() => remoteService.getAvailableInterfaces());
  const [selectedIp, setSelectedIp] = useState<string>(() => remoteService.getSelectedIp());
  const [copied, setCopied] = useState<boolean>(false);
  const [connectionMode, setConnectionMode] = useState<'local' | 'cloud'>('local');
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(() => remoteService.getTunnelUrl());
  const [isStartingTunnel, setIsStartingTunnel] = useState<boolean>(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  useEffect(() => {
    spatialNav.pushScope('companion-remote-modal');
    remoteService.discoverServerInfo().then(() => {
      setInterfaces(remoteService.getAvailableInterfaces());
      setSelectedIp(remoteService.getSelectedIp());
    });

    return () => {
      spatialNav.popScope('companion-remote-modal');
    };
  }, []);

  useEffect(() => {
    const unsubCount = remoteService.subscribeClientCount(setClientCount);
    const unsubNet = networkService.subscribe((s) => {
      setNetworkState(s);
      setSelectedIp(remoteService.getSelectedIp());
    });
    return () => {
      unsubCount();
      unsubNet();
    };
  }, []);

  const handleToggleCloudMode = async () => {
    if (connectionMode === 'local') {
      setConnectionMode('cloud');
      if (!tunnelUrl) {
        setIsStartingTunnel(true);
        const url = await remoteService.startTunnel();
        setTunnelUrl(url);
        setIsStartingTunnel(false);
      }
    } else {
      setConnectionMode('local');
    }
  };

  const activeUrl = useMemo(() => {
    if (connectionMode === 'cloud' && tunnelUrl) {
      return tunnelUrl;
    }
    return remoteService.getRemoteUrl(false);
  }, [connectionMode, tunnelUrl, selectedIp, networkState.ip]);

  const qrSvg = useMemo(() => {
    try {
      return generateQRCodeSVG(activeUrl, 240, '#000000', '#ffffff');
    } catch (e) {
      console.warn('[CompanionRemoteModal] QR generation notice:', e);
      return '';
    }
  }, [activeUrl]);

  const handleOpenInNewTab = () => {
    window.open(activeUrl, '_blank', 'width=420,height=840');
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSelectInterface = (ip: string) => {
    remoteService.setSelectedIp(ip);
    setSelectedIp(ip);
  };

  return (
    <div
      className="tv-remote-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Companion Phone Remote Pairing"
    >
      <div className="tv-remote-modal-card" style={{ maxWidth: '840px' }}>
        {/* Header */}
        <div className="tv-remote-modal-header">
          <div className="tv-remote-title-group">
            <div className="tv-remote-icon-badge">
              <Smartphone size={24} />
            </div>
            <div>
              <h2 className="tv-remote-title">Phone Companion Remote</h2>
              <p className="tv-remote-subtitle">Control Kaira TV, navigate, type, and control media from any phone</p>
            </div>
          </div>

          <div className="tv-remote-conn-pill">
            <span className={`tv-remote-dot ${clientCount > 0 ? 'active' : ''}`} />
            <span>{clientCount > 0 ? `${clientCount} Phone${clientCount > 1 ? 's' : ''} Connected` : 'Ready to Pair'}</span>
          </div>
        </div>

        {/* Connection Mode Toggle Pills */}
        <div style={{ display: 'flex', gap: '10px', padding: '0 24px 12px 24px' }}>
          {window.location.hostname.includes('github.io') || window.location.hostname.includes('vercel.app') || window.location.hostname.includes('netlify.app') ? (
            <div
              style={{
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(52, 199, 89, 0.15)',
                color: '#34c759',
                border: '1px solid rgba(52, 199, 89, 0.3)',
                fontWeight: 600
              }}
            >
              <Globe size={15} />
              <span>⚡ WebRTC Serverless P2P Active (Works on Any Phone / 4G / 5G / Wi-Fi)</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`tv-modal-btn ${connectionMode === 'local' ? 'primary' : 'secondary'}`}
                style={{ borderRadius: '20px', padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setConnectionMode('local')}
              >
                <Wifi size={14} />
                <span>Local Wi-Fi Mode ({selectedIp})</span>
              </button>

              <button
                type="button"
                className={`tv-modal-btn ${connectionMode === 'cloud' ? 'primary' : 'secondary'}`}
                style={{ borderRadius: '20px', padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleToggleCloudMode}
              >
                {isStartingTunnel ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                <span>Cloud / Any Network Mode (Bypass Firewall)</span>
              </button>
            </>
          )}
        </div>

        {/* Content Body */}
        <div className="tv-remote-body-grid">
          {/* QR Code Column */}
          <div className="tv-qr-card-wrap">
            <div
              className="tv-qr-svg-container"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="tv-qr-scan-label">
              {isStartingTunnel ? 'Generating Cloud Link...' : 'Scan with Phone Camera'}
            </span>
          </div>

          {/* Instructions Column */}
          <div className="tv-remote-guide-wrap">
            {/* Step 1 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">1</div>
              <div className="tv-step-info">
                <span className="tv-step-title">
                  {connectionMode === 'local' ? 'Connect to Same Wi-Fi' : 'Works on Any Network'}
                </span>
                <span className="tv-step-desc">
                  {connectionMode === 'local'
                    ? `Make sure your phone is on the same Wi-Fi (${selectedIp}).`
                    : 'Works seamlessly over Wi-Fi, 4G, 5G, or across different router bands.'}
                </span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">2</div>
              <div className="tv-step-info">
                <span className="tv-step-title">Scan QR Code with Camera</span>
                <span className="tv-step-desc">
                  Open Camera on iPhone or Android, point at the QR code, and tap the yellow link banner.
                </span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">3</div>
              <div className="tv-step-info">
                <span className="tv-step-title">Instant Control</span>
                <span className="tv-step-desc">
                  Touchpad navigation, phone keyboard typing, voice search dictation, and media playback.
                </span>
              </div>
            </div>

            {/* Direct URL Box */}
            <div className="tv-direct-url-box" onClick={handleCopyLink} title="Click to copy">
              <span className="tv-direct-url-text">{activeUrl}</span>
              <button type="button" className="tv-copy-icon-btn" aria-label="Copy Link">
                {copied ? <Check size={14} color="#81c995" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Multiple Network Adapters Switcher (Local Mode only) */}
            {connectionMode === 'local' && interfaces.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Select Network Adapter:
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {interfaces.map((iface, idx) => (
                    <button
                      key={iface.ip}
                      type="button"
                      className={`tv-modal-btn ${selectedIp === iface.ip ? 'primary' : 'secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '12px', height: '28px' }}
                      onClick={() => handleSelectInterface(iface.ip)}
                    >
                      {iface.name.toLowerCase().includes('wi-fi') || iface.name.toLowerCase().includes('wifi') ? (
                        <Wifi size={12} />
                      ) : (
                        <Network size={12} />
                      )}
                      <span>{iface.name}: {iface.ip}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Troubleshooting / Not Reachable Drawer */}
            {connectionMode === 'local' && (
              <div style={{ marginTop: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 12px' }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8ab4f8',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: 0,
                  }}
                  onClick={() => setShowTroubleshoot((prev) => !prev)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={14} />
                    Phone says "Site cannot be reached"?
                  </span>
                  {showTroubleshoot ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showTroubleshoot && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }}>
                    <p style={{ margin: '0 0 6px 0' }}>
                      <strong>1. Easiest Solution:</strong> Switch to <strong>[Cloud / Any Network Mode]</strong> above — it bypasses all Windows Firewall and router blocks.
                    </p>
                    <p style={{ margin: '0 0 6px 0' }}>
                      <strong>2. Windows Wi-Fi Profile:</strong> On Windows, if your Wi-Fi is set to <em>"Public"</em>, Windows Firewall blocks incoming connections. Open Windows <em>Settings &gt; Network &amp; Internet &gt; Wi-Fi</em> and change it to <strong>"Private network"</strong>.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>3. Router Isolation:</strong> Ensure your phone is not on Mobile Cellular Data and is connected to the same Wi-Fi router.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="tv-remote-modal-footer">
          <Focusable
            id="remote-modal-copy-btn"
            groupId="remote-modal-actions"
            indexInGroup={0}
            onSelect={handleCopyLink}
          >
            {(isFocused) => (
              <button
                type="button"
                className={`tv-modal-btn secondary ${isFocused ? 'is-focused' : ''}`}
                onClick={handleCopyLink}
              >
                {copied ? <Check size={16} color="#81c995" /> : <Copy size={16} />}
                <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            )}
          </Focusable>

          <Focusable
            id="remote-modal-preview-btn"
            groupId="remote-modal-actions"
            indexInGroup={1}
            onSelect={handleOpenInNewTab}
          >
            {(isFocused) => (
              <button
                type="button"
                className={`tv-modal-btn secondary ${isFocused ? 'is-focused' : ''}`}
                onClick={handleOpenInNewTab}
              >
                <ExternalLink size={16} />
                <span>Open in Browser Tab</span>
              </button>
            )}
          </Focusable>

          <Focusable
            id="remote-modal-close-btn"
            groupId="remote-modal-actions"
            indexInGroup={2}
            autoFocus={true}
            onSelect={onClose}
          >
            {(isFocused) => (
              <button
                type="button"
                className={`tv-modal-btn primary ${isFocused ? 'is-focused' : ''}`}
                onClick={onClose}
              >
                <ArrowLeft size={16} />
                <span>Done (B)</span>
              </button>
            )}
          </Focusable>
        </div>
      </div>
    </div>
  );
};
