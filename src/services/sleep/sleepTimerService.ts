import { playbackService } from '../playback/PlaybackService';

export interface SleepTimerState {
  isActive: boolean;
  durationMinutes: number;
  endsAt: number | null;
  remainingSeconds: number;
}

class SleepTimerService {
  private timerId: NodeJS.Timeout | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private state: SleepTimerState = {
    isActive: false,
    durationMinutes: 0,
    endsAt: null,
    remainingSeconds: 0,
  };
  private listeners: Set<(state: SleepTimerState) => void> = new Set();
  private onSleepCallback: (() => void) | null = null;

  public subscribe(listener: (state: SleepTimerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setOnSleepCallback(cb: () => void): void {
    this.onSleepCallback = cb;
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }

  public start(minutes: number): void {
    this.cancel();

    if (minutes <= 0) return;

    const durationMs = minutes * 60 * 1000;
    const endsAt = Date.now() + durationMs;

    this.state = {
      isActive: true,
      durationMinutes: minutes,
      endsAt,
      remainingSeconds: minutes * 60,
    };
    this.notify();

    // 1-second interval to update remaining time
    this.intervalId = setInterval(() => {
      if (!this.state.endsAt) return;
      const remaining = Math.max(0, Math.ceil((this.state.endsAt - Date.now()) / 1000));
      this.state.remainingSeconds = remaining;
      this.notify();

      if (remaining <= 0) {
        this.triggerSleep();
      }
    }, 1000);
  }

  public cancel(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.state = {
      isActive: false,
      durationMinutes: 0,
      endsAt: null,
      remainingSeconds: 0,
    };
    this.notify();
  }

  public getState(): SleepTimerState {
    return { ...this.state };
  }

  private triggerSleep(): void {
    this.cancel();

    // Pause audio/video playback
    try {
      playbackService.pause();
    } catch (e) {}

    if (this.onSleepCallback) {
      this.onSleepCallback();
    }
  }
}

export const sleepTimerService = new SleepTimerService();
