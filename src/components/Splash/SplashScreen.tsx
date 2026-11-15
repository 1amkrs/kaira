import React, { useEffect, useState, useCallback, useRef } from 'react';
import kairaLogo from '../../assets/kaira_logo.png';
import { platform } from '../../platform';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const dismissedRef = useRef<boolean>(false);
  const isAndroid = platform.isAndroid;

  const dismiss = useCallback((delayMs: number = 400) => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setIsFadingOut(true);
    setTimeout(onFinish, isAndroid ? Math.min(delayMs, 150) : delayMs);
  }, [onFinish, isAndroid]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      onFinish();
      return;
    }

    const safetyTimer = setTimeout(() => {
      dismiss(isAndroid ? 150 : 500);
    }, isAndroid ? 1100 : 2200);

    // Skip on any key or controller button
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      dismiss(isAndroid ? 120 : 350);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(safetyTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dismiss, onFinish, isAndroid]);

  return (
    <div
      className={`tv-splash-overlay ${isFadingOut ? 'fade-out' : ''}`}
      onClick={() => dismiss(isAndroid ? 100 : 250)}
      role="button"
      tabIndex={0}
      aria-label="Skip splash screen"
    >
      {!isAndroid && <div className="tv-splash-ambient-glow" />}
      <div className="tv-splash-brand">
        <img src={kairaLogo} alt="Kaira TV" className="tv-splash-logo-img" />
        {!isAndroid && <span className="tv-splash-tagline">Experience Pure Cinema</span>}
      </div>
      <div className="tv-splash-skip-hint">Tap or press any key to continue</div>
    </div>
  );
};
