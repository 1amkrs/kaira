import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  ExternalLink,
  X,
  Wifi,
  QrCode,
  Check,
  ArrowLeft,
  Tv
} from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { remoteService } from '../../services/remote/RemoteService';
import { networkService } from '../../services/network/NetworkService';
import { generateQRCodeSVG } from '../../utils/qrCodeGenerator';
import './CompanionRemoteModal.css';

interface CompanionRemoteModalProps {
  onClose: () => void;
}

export const CompanionRemoteModal: React.FC<CompanionRemoteModalProps> = ({ onClose }) => {
  const [clientCount, setClientCount] = useState<number>(() => remoteService.getConnectedClients());
  const [networkState, setNetworkState] = useState(() => networkService.getState());
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    spatialNav.pushScope('companion-remote-modal');
    return () => {
      spatialNav.popScope('companion-remote-modal');
    };
  }, []);

  useEffect(() => {
    const unsubCount = remoteService.subscribeClientCount(setClientCount);
    const unsubNet = networkService.subscribe(setNetworkState);
    return () => {
      unsubCount();
      unsubNet();
    };
  }, []);

  const remoteUrl = useMemo(() => {
    return remoteService.getRemoteUrl();
  }, [networkState.ip]);

  const qrSvg = useMemo(() => {
    try {
      return generateQRCodeSVG(remoteUrl, 240, '#0a0a0c', '#ffffff');
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
            <span className="tv-qr-scan-label">Scan with Camera</span>
          </div>

          {/* Instructions Column */}
          <div className="tv-remote-guide-wrap">
            {/* Step 1 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">1</div>
              <div className="tv-step-info">
                <span className="tv-step-title">Connect to Same Wi-Fi</span>
                <span className="tv-step-desc">
                  Make sure your phone is on the same local network ({networkState.ip || 'Local Network'}).
                </span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="tv-guide-step-row">
              <div className="tv-step-number-bubble">2</div>
              <div className="tv-step-info">
                <span className="tv-step-title">Scan QR Code with Phone</span>
                <span className="tv-step-desc">
                  Open your smartphone's Camera app (iOS / Android) and point it at the QR code.
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
            <div className="tv-direct-url-box">
              <span className="tv-direct-url-text">{remoteUrl}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="tv-remote-modal-footer">
          <Focusable
            id="remote-modal-preview-btn"
            groupId="remote-modal-actions"
            indexInGroup={0}
            onSelect={handleOpenInNewTab}
          >
            {(isFocused) => (
              <button
                type="button"
                className={`tv-modal-btn secondary ${isFocused ? 'is-focused' : ''}`}
              >
                <ExternalLink size={16} />
                <span>Open Remote in New Tab</span>
              </button>
            )}
          </Focusable>

          <Focusable
            id="remote-modal-close-btn"
            groupId="remote-modal-actions"
            indexInGroup={1}
            autoFocus={true}
            onSelect={onClose}
          >
            {(isFocused) => (
              <button
                type="button"
                className={`tv-modal-btn primary ${isFocused ? 'is-focused' : ''}`}
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
