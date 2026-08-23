class SoundEffectsService {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private volume: number = 0.35;
  private lastTickTime: number = 0;

  constructor() {
    try {
      const stored = localStorage.getItem('tv_sound_effects_enabled');
      if (stored !== null) {
        this.isEnabled = stored === 'true';
      }
      const vol = localStorage.getItem('tv_sound_effects_volume');
      if (vol !== null) {
        this.volume = parseFloat(vol);
      }
    } catch (e) {}
  }

  private getAudioContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    try {
      localStorage.setItem('tv_sound_effects_enabled', enabled ? 'true' : 'false');
    } catch (e) {}
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('tv_sound_effects_volume', this.volume.toString());
    } catch (e) {}
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Subtle 10ms micro-click when spatial focus moves to an adjacent item
   */
  public playFocusTick(): void {
    if (!this.isEnabled) return;
    const now = performance.now();
    // Throttle rapid focus ticks to 45ms to avoid sound clutter during fast stick scrolling
    if (now - this.lastTickTime < 45) return;
    this.lastTickTime = now;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, startTime);
      osc.frequency.exponentialRampToValueAtTime(280, startTime + 0.015);

      const targetGain = 0.04 * this.volume;
      gain.gain.setValueAtTime(targetGain, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.015);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.016);
    } catch (e) {}
  }

  /**
   * Pleasant ascending dual-tone chime when pressing 'A' / Select
   */
  public playSelectChime(): void {
    if (!this.isEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const startTime = ctx.currentTime;
      const targetGain = 0.08 * this.volume;

      // Note 1 (E5 - 659.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, startTime);
      gain1.gain.setValueAtTime(targetGain, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.065);

      // Note 2 (A5 - 880Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, startTime + 0.025);
      gain2.gain.setValueAtTime(targetGain * 0.9, startTime + 0.025);
      gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.09);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime + 0.025);
      osc2.stop(startTime + 0.095);
    } catch (e) {}
  }

  /**
   * Soft descending tone when pressing 'B' / Back
   */
  public playBackWhoosh(): void {
    if (!this.isEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, startTime);
      osc.frequency.exponentialRampToValueAtTime(260, startTime + 0.05);

      const targetGain = 0.06 * this.volume;
      gain.gain.setValueAtTime(targetGain, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.055);
    } catch (e) {}
  }
}

export const soundEffectsService = new SoundEffectsService();
