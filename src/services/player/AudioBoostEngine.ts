export class AudioBoostEngine {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private vocalFilter: BiquadFilterNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;
  private isEnabled: boolean = false;
  private currentVideo: HTMLVideoElement | null = null;

  public attachToVideo(video: HTMLVideoElement): void {
    if (this.currentVideo === video && this.sourceNode) return;
    this.currentVideo = video;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass();
      }

      // Resume context on user interaction
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaElementSource(video);

      // 1. Vocal Presence Peaking Filter (1.8 kHz, +6 dB boost for speech clarity)
      this.vocalFilter = this.audioCtx.createBiquadFilter();
      this.vocalFilter.type = 'peaking';
      this.vocalFilter.frequency.value = 1800;
      this.vocalFilter.Q.value = 1.2;
      this.vocalFilter.gain.value = this.isEnabled ? 7 : 0;

      // 2. Highpass filter to cut sub-bass rumble (< 80 Hz)
      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'highpass';
      this.bassFilter.frequency.value = this.isEnabled ? 90 : 20;

      // 3. Dynamic Dialogue Compressor (smooths loud gunshots/explosions vs quiet speech)
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = this.isEnabled ? -22 : 0;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = this.isEnabled ? 4 : 1;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      // 4. Output Gain Node
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect DSP chain
      this.sourceNode
        .connect(this.bassFilter)
        .connect(this.vocalFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.audioCtx.destination);

      console.log('[AudioBoostEngine] Attached Web Audio DSP chain to video element');
    } catch (e) {
      console.warn('[AudioBoostEngine] Web Audio attachment notice:', e);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    if (this.vocalFilter) {
      this.vocalFilter.gain.setTargetAtTime(enabled ? 7 : 0, this.audioCtx?.currentTime || 0, 0.05);
    }
    if (this.bassFilter) {
      this.bassFilter.frequency.setTargetAtTime(enabled ? 90 : 20, this.audioCtx?.currentTime || 0, 0.05);
    }
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(enabled ? -22 : 0, this.audioCtx?.currentTime || 0, 0.05);
      this.compressor.ratio.setTargetAtTime(enabled ? 4 : 1, this.audioCtx?.currentTime || 0, 0.05);
    }
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public destroy(): void {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {}
    }
    this.audioCtx = null;
    this.sourceNode = null;
    this.vocalFilter = null;
    this.bassFilter = null;
    this.compressor = null;
    this.gainNode = null;
    this.currentVideo = null;
  }
}
