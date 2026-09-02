import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Wifi,
  Network
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

  useEffect(() => {
    spatialNav.pushScope('companion-remote-modal');
    // Re-discover server details
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

  const remoteUrl = useMemo(() => {
    return remoteService.getRemoteUrl();
  }, [selectedIp, networkState.ip]);

  const qrSvg = useMemo(() => {
    try {
      return generateQRCodeSVG(remoteUrl, 240, '#000000', '#ffffff');
    } catch (e) {
      console.warn('[CompanionRemoteModal] QR generation notice:', e);
      return '';
    }
  }, [remoteUrl]);

  const handleOpenInNewTab = () => {
    window.open(remoteUrl, '_blank', 'width=420,height=840');
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(remoteUrl);
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
      <div className="tv-remote-modal-card">
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

        {/* Content Body */}
        <div className="tv-remote-body-grid">
          {/* QR Code Column */}
          <div className="tv-qr-card-wrap">
            <div
              className="tv-qr-svg-container"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="tv-qr-scan-label">Scan with Phone Camera</span>
          </div>

          {/* Instructions Column */}
          <div className="tv-remote-guide-wrap">
            {/* Step 1 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">1</div>
              <div className="tv-step-info">
                <span className="tv-step-title">Connect to Same Wi-Fi</span>
                <span className="tv-step-desc">
                  Ensure your smartphone is connected to the same Wi-Fi network ({selectedIp}).
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
                  Swipe on the glass touchpad, type with phone keyboard, speak voice searches, and control media in real time.
                </span>
              </div>
            </div>

            {/* Direct URL Box */}
            <div className="tv-direct-url-box" onClick={handleCopyLink} title="Click to copy">
              <span className="tv-direct-url-text">{remoteUrl}</span>
              <button type="button" className="tv-copy-icon-btn" aria-label="Copy Link">
                {copied ? <Check size={14} color="#81c995" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Multiple Network Adapters Switcher (if > 1 available) */}
            {interfaces.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Network Adapter
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {interfaces.map((iface, idx) => (
                    <Focusable
                      key={iface.ip}
                      id={`iface-opt-${idx}`}
                      groupId="remote-ifaces"
                      indexInGroup={idx}
                      onSelect={() => handleSelectInterface(iface.ip)}
                    >
                      {(isFocused) => (
                        <button
                          type="button"
                          className={`tv-modal-btn ${selectedIp === iface.ip ? 'primary' : 'secondary'} ${isFocused ? 'is-focused' : ''}`}
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
                      )}
                    </Focusable>
                  ))}
                </div>
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
