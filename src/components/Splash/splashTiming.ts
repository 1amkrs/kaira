export interface SplashTimingConfig {
  holdMs: number;
  fadeOutMs: number;
  skipFadeOutMs: number;
  hintRevealMs: number;
  shouldSkipImmediately: boolean;
}

/**
 * Computes deterministic Apple TV-inspired splash screen timings across
 * desktop/TV, Android, reduced-motion, and ?autostart=1 launch modes.
 */
export function getSplashTimingConfig(params: {
  search: string;
  isAndroid: boolean;
  prefersReducedMotion: boolean;
}): SplashTimingConfig {
  const query = new URLSearchParams(params.search || '');
  if (query.get('autostart') === '1') {
    return {
      holdMs: 0,
      fadeOutMs: 0,
      skipFadeOutMs: 0,
      hintRevealMs: 0,
      shouldSkipImmediately: true,
    };
  }

  if (params.prefersReducedMotion) {
    return {
      holdMs: 900,
      fadeOutMs: 220,
      skipFadeOutMs: 120,
      hintRevealMs: 250,
      shouldSkipImmediately: false,
    };
  }

  if (params.isAndroid) {
    return {
      holdMs: 1450,
      fadeOutMs: 320,
      skipFadeOutMs: 140,
      hintRevealMs: 600,
      shouldSkipImmediately: false,
    };
  }

  return {
    holdMs: 2750,
    fadeOutMs: 680,
    skipFadeOutMs: 280,
    hintRevealMs: 1250,
    shouldSkipImmediately: false,
  };
}
