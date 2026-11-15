export const ANDROID_ONBOARDING_STORAGE_KEY = 'kaira_android_onboarding_completed';

export type OnboardingStepId = 'welcome' | 'profile' | 'experience' | 'controls';

export interface OnboardingStepMeta {
  id: OnboardingStepId;
  stepNumber: number;
  title: string;
  subtitle: string;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    id: 'welcome',
    stepNumber: 1,
    title: 'Welcome to Kaira',
    subtitle: 'Movies, series, and music configured for your screen.',
  },
  {
    id: 'profile',
    stepNumber: 2,
    title: 'Choose Your Profile',
    subtitle: 'Separate watch history, favorites, and PIN locks.',
  },
  {
    id: 'experience',
    stepNumber: 3,
    title: 'Display & Audio Setup',
    subtitle: 'Set target resolution, UI sounds, and screensaver timeout.',
  },
  {
    id: 'controls',
    stepNumber: 4,
    title: 'Ready to Watch',
    subtitle: 'Navigation and playback controls for your device.',
  },
];

export interface OnboardingVisibilityInput {
  isAndroid: boolean;
  search?: string;
  completed?: boolean;
}

/**
 * Determines whether the initial Android onboarding flow should open.
 * - Never triggers on non-Android platforms (Linux, Windows, Web Desktop).
 * - `?onboarding=1` forces onboarding open on Android (even alongside `?autostart=1`).
 * - `?autostart=1` alone skips onboarding so automated direct-to-home navigation works cleanly.
 * - On fresh Android launches where `completed` is false, returns `true`.
 */
export function shouldShowAndroidOnboarding(input: OnboardingVisibilityInput): boolean {
  if (!input.isAndroid) {
    return false;
  }

  const rawSearch = input.search || '';
  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch);
  const onboardingParam = params.get('onboarding');

  if (onboardingParam === '1' || onboardingParam === 'true') {
    return true;
  }
  if (onboardingParam === '0' || onboardingParam === 'false') {
    return false;
  }
  if (params.get('autostart') === '1') {
    return false;
  }

  return !Boolean(input.completed);
}

/**
 * Companion Phone Remote is disabled on Android (both Android TV and Android Mobile/Tablet).
 */
export function isRemoteFeatureEnabled(isAndroid: boolean): boolean {
  return !isAndroid;
}

export function nextOnboardingStep(currentIndex: number, total: number = ONBOARDING_STEPS.length): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, currentIndex + 1));
}

export function prevOnboardingStep(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

export function isAndroidOnboardingCompleted(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    return store?.getItem(ANDROID_ONBOARDING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markAndroidOnboardingCompleted(storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.setItem(ANDROID_ONBOARDING_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function resetAndroidOnboarding(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.removeItem(ANDROID_ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
