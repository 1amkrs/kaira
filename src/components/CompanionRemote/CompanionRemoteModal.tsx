import React, { useState, useEffect, useMemo } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Loader2,
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

  const isStaticHost =
    window.location.hostname.includes('github.io') ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('netlify.app');

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

  const handleSelectMode = async (mode: 'local' | 'cloud') => {
    if (mode === connectionMode) return;
    setConnectionMode(mode);
    if (mode === 'cloud' && !tunnelUrl) {
      setIsStartingTunnel(true);
      const url = await remoteService.startTunnel();
      setTunnelUrl(url);
      setIsStartingTunnel(false);
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
      return generateQRCodeSVG(activeUrl, 212, '#0e1014', '#ffffff');
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

  const statusText =
    clientCount > 0
      ? `${clientCount} phone${clientCount > 1 ? 's' : ''} connected`
      : 'Waiting for phone';

  const networkContextText = isStaticHost
    ? 'Works on Wi-Fi or cellular'
    : connectionMode === 'local'
    ? `Same Wi-Fi (${selectedIp})`
    : 'Any network';

  return (
    <div
      className="tv-remote-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Pair Phone Remote"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tv-remote-modal-card">
        <div className="tv-remote-body-grid">
          {/* Left: Clean QR Code */}
          <div className="tv-qr-card-wrap">
            {isStartingTunnel ? (
              <div className="tv-qr-loading">
                <Loader2 size={24} className="tv-remote-spinner" />
                <span>Creating link...</span>
              </div>
            ) : (
              <div
                className="tv-qr-svg-container"
                aria-label="Phone remote pairing QR code"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
          </div>

          {/* Right: Title, Mode Switch, Link & Help */}
          <div className="tv-remote-info-col">
            <div className="tv-remote-heading-block">
              <h2 className="tv-remote-title">Pair your phone</h2>
              <p className="tv-remote-subtitle">
                Scan the QR code with your phone camera to navigate, type, and control playback.
              </p>
              <div className="tv-remote-meta-line">
                <span className={clientCount > 0 ? 'tv-remote-status-connected' : 'tv-remote-status-idle'}>
                  {statusText}
                </span>
                <span className="tv-meta-dot" aria-hidden="true" />
                <span className="tabular-nums">{networkContextText}</span>
              </div>
            </div>

            {!isStaticHost && (
              <div className="tv-remote-segmented" role="tablist" aria-label="Connection mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={connectionMode === 'local'}
                  className={`tv-remote-segment ${connectionMode === 'local' ? 'active' : ''}`}
                  onClick={() => handleSelectMode('local')}
                >
                  Same Wi-Fi
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={connectionMode === 'cloud'}
                  className={`tv-remote-segment ${connectionMode === 'cloud' ? 'active' : ''}`}
                  onClick={() => handleSelectMode('cloud')}
                >
                  {isStartingTunnel && <Loader2 size={13} className="tv-remote-spinner" />}
                  <span>Any Network</span>
                </button>
              </div>
            )}

            {/* Direct Link Row */}
            <div className="tv-direct-url-box">
              <span className="tv-direct-url-text" title={activeUrl}>
                {activeUrl}
              </span>
              <Focusable
                id="remote-modal-copy-btn"
                groupId="remote-modal-actions"
                indexInGroup={0}
                role="button"
                ariaLabel={copied ? 'Link copied' : 'Copy pairing link'}
                scaleEffect={false}
                onSelect={handleCopyLink}
              >
                {(isFocused) => (
                  <div className={`tv-copy-inline-btn ${isFocused ? 'is-focused' : ''}`}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </div>
                )}
              </Focusable>
            </div>

            {/* Multiple Network Adapters Switcher (only if > 1) */}
            {connectionMode === 'local' && interfaces.length > 1 && (
              <div className="tv-remote-adapters">
                <span className="tv-remote-adapters-label">Network adapter</span>
                <div className="tv-remote-adapters-list">
                  {interfaces.map((iface) => (
                    <button
                      key={iface.ip}
                      type="button"
                      className={`tv-remote-adapter-btn ${selectedIp === iface.ip ? 'active' : ''}`}
                      onClick={() => handleSelectInterface(iface.ip)}
                    >
                      {iface.name} · <span className="tabular-nums">{iface.ip}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quiet Troubleshooting Disclosure */}
            {connectionMode === 'local' && !isStaticHost && (
              <div className="tv-remote-help-wrap">
                <button
                  type="button"
                  className="tv-remote-help-trigger"
                  aria-expanded={showTroubleshoot}
                  onClick={() => setShowTroubleshoot((prev) => !prev)}
                >
                  <span>Can&apos;t open on your phone?</span>
                  {showTroubleshoot ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>

                {showTroubleshoot && (
                  <ul className="tv-remote-help-list">
                    <li>Switch to <strong>Any Network</strong> above to bypass local firewall blocks.</li>
                    <li>Confirm both devices are on the same Wi-Fi network (not cellular data).</li>
                    <li>On Windows, set your Wi-Fi network profile to <strong>Private</strong>.</li>
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clean Footer */}
        <div className="tv-remote-modal-footer">
          <Focusable
            id="remote-modal-preview-btn"
            groupId="remote-modal-actions"
            indexInGroup={1}
            role="button"
            ariaLabel="Open in browser tab"
            onSelect={handleOpenInNewTab}
          >
            {(isFocused) => (
              <div className={`tv-modal-btn secondary ${isFocused ? 'is-focused' : ''}`}>
                <ExternalLink size={15} />
                <span>Open in Tab</span>
              </div>
            )}
          </Focusable>

          <Focusable
            id="remote-modal-close-btn"
            groupId="remote-modal-actions"
            indexInGroup={2}
            autoFocus={true}
            role="button"
            ariaLabel="Done"
            onSelect={onClose}
          >
            {(isFocused) => (
              <div className={`tv-modal-btn primary ${isFocused ? 'is-focused' : ''}`}>
                <span>Done</span>
              </div>
            )}
          </Focusable>
        </div>
      </div>
    </div>
  );
};
