import React, { useEffect, useState, useCallback, useRef } from 'react';
import kairaLogo from '../../assets/kaira_logo.png';
import { platform } from '../../platform';
import { getSplashTimingConfig } from './splashTiming';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const dismissedRef = useRef<boolean>(false);
  const isAndroid = platform.isAndroid;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const timing = getSplashTimingConfig({
    search: typeof window !== 'undefined' ? window.location.search : '',
    isAndroid,
    prefersReducedMotion,
  });

  const dismiss = useCallback(
    (delayMs: number) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      setIsFadingOut(true);
      setTimeout(onFinish, Math.max(0, delayMs));
    },
    [onFinish]
  );

  useEffect(() => {
    if (timing.shouldSkipImmediately) {
      dismissedRef.current = true;
      onFinish();
      return;
    }

    const hintTimer = setTimeout(() => {
      setShowHint(true);
    }, timing.hintRevealMs);

    const autoFinishTimer = setTimeout(() => {
      dismiss(timing.fadeOutMs);
    }, timing.holdMs);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      dismiss(timing.skipFadeOutMs);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(hintTimer);
      clearTimeout(autoFinishTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dismiss, onFinish, timing.shouldSkipImmediately, timing.hintRevealMs, timing.holdMs, timing.fadeOutMs, timing.skipFadeOutMs]);

  return (
    <div
      className={`tv-splash-overlay ${isFadingOut ? 'fade-out' : ''} ${isAndroid ? 'is-android' : ''}`}
      onClick={() => dismiss(timing.skipFadeOutMs)}
      role="button"
      tabIndex={0}
      aria-label="Skip Kaira startup screen"
      data-testid="kaira-splash-screen"
    >
      {/* Subtle monochrome projector ambient illumination */}
      <div className="tv-splash-projector-bloom" aria-hidden="true" />

      {/* Optical horizontal light slit (Apple TV+ cinema aperture motif) */}
      <div className="tv-splash-aperture-line" aria-hidden="true" />

      {/* Center Stage Brand Lockup with Specular Glass Sheen */}
      <div className="tv-splash-stage">
        <div className="tv-splash-wordmark-wrap">
          <img
            src={kairaLogo}
            alt="Kaira"
            className="tv-splash-logo-img"
            draggable={false}
          />
          {/* Specular silver light pass clipped cleanly over the wordmark */}
          <div
            className="tv-splash-logo-sheen"
            style={{
              WebkitMaskImage: `url(${kairaLogo})`,
              maskImage: `url(${kairaLogo})`,
            }}
            aria-hidden="true"
          />
        </div>

        {/* Soft architectural floor reflection */}
        <div className="tv-splash-reflection" aria-hidden="true">
          <img src={kairaLogo} alt="" className="tv-splash-reflection-img" draggable={false} />
        </div>
      </div>

      {/* Whisper-quiet skip affordance revealed only after the ident settles */}
      <div className={`tv-splash-skip-hint ${showHint ? 'visible' : ''}`}>
        Press any key to continue
      </div>
    </div>
  );
};
