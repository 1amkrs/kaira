import React, { useEffect, useState } from 'react';
import kairaLogo from '../../assets/kaira_logo.png';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  useEffect(() => {
    // Auto-dismiss after 2.5 seconds
    const safetyTimer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(onFinish, 600);
    }, 2500);

    // Skip on any key or controller button
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setIsFadingOut(true);
      setTimeout(onFinish, 400);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(safetyTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onFinish]);

  return (
    <div className={`tv-splash-overlay ${isFadingOut ? 'fade-out' : ''}`}>
      <div className="tv-splash-ambient-glow" />
      <div className="tv-splash-brand">
        <img src={kairaLogo} alt="Kaira TV" className="tv-splash-logo-img" />
        <span className="tv-splash-tagline">Experience Pure Cinema</span>
      </div>
      <div className="tv-splash-skip-hint">Press any button to skip</div>
    </div>
  );
};
