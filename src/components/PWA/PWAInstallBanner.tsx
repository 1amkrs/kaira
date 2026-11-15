import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroidBrowser, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return (
      <span className="tv-status-badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <CheckCircle2 size={14} />
        <span>Installed on Device</span>
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="tv-toggle-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--md-sys-color-primary, #a8c7fa)',
          color: 'var(--md-sys-color-on-primary, #062e6f)',
          borderColor: 'var(--md-sys-color-primary, #a8c7fa)',
        }}
      >
        <Download size={16} />
        <span>Install Android App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide((v) => !v)}
        className="tv-toggle-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      >
        <Smartphone size={16} />
        <span>{isIOS ? 'Install on iOS' : isAndroidBrowser ? 'Add to Home Screen' : 'Install Guide'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-label="Install Kaira App Guide"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              background: '#161820',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: '18px',
              padding: '24px',
              color: '#ffffff',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
              {isIOS ? 'Install Kaira on iPhone / iPad' : 'Install Kaira on Android'}
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
              {isIOS ? (
                <>
                  1. Tap the <strong>Share</strong> icon in Safari.<br />
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </>
              ) : (
                <>
                  1. Open Chrome menu (<strong>⋮</strong>) in the top-right.<br />
                  2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.<br />
                  3. Or build the native APK from the <code>android/</code> project.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="tv-toggle-btn"
              style={{ marginTop: '18px', width: '100%', justifyContent: 'center' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(14px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10040,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '12px',
        background: 'rgba(179, 38, 30, 0.96)',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <WifiOff size={14} />
      <span>Offline Mode · Using cached catalog</span>
    </div>
  );
};
