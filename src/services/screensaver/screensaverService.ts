import { playbackService } from '../playback/PlaybackService';

export interface ScreensaverState {
  isActive: boolean;
  timeoutMinutes: number; // 0 means 'Never'
}

const STORAGE_KEY = 'tv_screensaver_timeout_minutes';
const DEFAULT_TIMEOUT_MINUTES = 5;

class ScreensaverService {
  private isActive: boolean = false;
  private timeoutMinutes: number = DEFAULT_TIMEOUT_MINUTES;
  private timerId: NodeJS.Timeout | null = null;
  private listeners: Set<(state: ScreensaverState) => void> = new Set();
  private isMonitoring: boolean = false;
  private lastActivityTime: number = Date.now();
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private isMediaPlayingCheck: (() => boolean) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          this.timeoutMinutes = parsed;
        }
      }
    }
  }

  public subscribe(listener: (state: ScreensaverState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ScreensaverState {
    return {
      isActive: this.isActive,
      timeoutMinutes: this.timeoutMinutes,
    };
  }

  public setTimeoutMinutes(minutes: number): void {
    this.timeoutMinutes = Math.max(0, minutes);
    try {
      localStorage.setItem(STORAGE_KEY, String(this.timeoutMinutes));
    } catch (e) {}
    this.resetIdleTimer();
    this.notify();
  }

  public setMediaPlayingChecker(checker: () => boolean): void {
    this.isMediaPlayingCheck = checker;
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  public startMonitoring(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleUserInput, { passive: true });
      window.addEventListener('pointerdown', this.handleUserInput, { passive: true });
      window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
      window.addEventListener('gamepadconnected', this.handleUserInput, { passive: true });
    }

    this.resetIdleTimer();
  }

  public stopMonitoring(): void {
    this.isMonitoring = false;
    this.clearTimer();

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleUserInput);
      window.removeEventListener('pointerdown', this.handleUserInput);
      window.removeEventListener('mousemove', this.handleMouseMove);
      window.removeEventListener('gamepadconnected', this.handleUserInput);
    }
  }

  private handleUserInput = (): void => {
    if (this.isActive) {
      // While screensaver lockscreen is active, keystrokes and pointer interaction
      // are directed to the lockscreen password field instead of auto-waking.
      return;
    }
    this.reportActivity();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.isActive) return;
    // Filter tiny mouse sensor jitter (< 8px movement)
    const dx = Math.abs(e.clientX - this.lastMouseX);
    const dy = Math.abs(e.clientY - this.lastMouseY);
    if (dx > 8 || dy > 8) {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.reportActivity();
    }
  };

  public reportActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.isActive) {
      this.wake();
    } else {
      this.resetIdleTimer();
    }
  }

  public resetIdleTimer(): void {
    this.clearTimer();

    // 0 minutes means 'Never' activate screensaver automatically
    if (this.timeoutMinutes <= 0 || !this.isMonitoring) {
      return;
    }

    const delayMs = this.timeoutMinutes * 60 * 1000;
    this.timerId = setTimeout(() => {
      this.evaluateIdleTimeout();
    }, delayMs);
  }

  private evaluateIdleTimeout(): void {
    // Check if media is currently playing fullscreen
    let isPlaying = false;
    if (this.isMediaPlayingCheck) {
      isPlaying = this.isMediaPlayingCheck();
    } else {
      const state = playbackService.getState();
      isPlaying = state.status === 'playing';
    }

    // Do not activate screensaver if media is playing
    if (isPlaying) {
      this.resetIdleTimer();
      return;
    }

    this.trigger();
  }

  public trigger(): void {
    if (this.isActive) return;
    this.clearTimer();
    this.isActive = true;
    this.notify();
  }

  public wake(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.notify();
    this.resetIdleTimer();
  }

  private clearTimer(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

export const screensaverService = new ScreensaverService();
