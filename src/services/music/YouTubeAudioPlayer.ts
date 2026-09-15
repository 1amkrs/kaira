// YouTube Audio & Video Player Bridge for tvOS
// Enables 100% full-length playback of official YouTube music tracks, videos, and master audio.

export type YTPlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

export const KNOWN_TRACK_VIDEO_IDS: Record<string, string> = {
  // BLACKPINK
  'how you like that': 'ioNng23DkIM',
  'ice cream': 'vRXZj0DzXIA',
  'lovesick girls': 'dyRsYk0LyA8',
  'pink venom': 'gQlMMD8auMs',
  'shut down': 'POe9SOEKotk',

  // The Weeknd
  'blinding lights': '4NRXx6U8ABQ',
  'save your tears': 'XXYlFuWEuKi',
  'in your eyes': 'dqRZDebPIGs',
  'starboy': '34Na4j8AVgA',
  'die for you': 'QLCpqdqeoII',
  'the hills': 'yzTuBuRdAyA',
  'can\'t feel my face': 'KEI4qS4P0S0',

  // Daft Punk
  'get lucky': '5NV6Rdv1a3I',
  'instant crush': 'a5uQMwRMHcs',
  'one more time': 'FGBhQbmMxzo',
  'harder, better, faster, stronger': 'gAjR4_CbPpQ',
  'harder better faster stronger': 'gAjR4_CbPpQ',
  'around the world': 'dwDns8x3Jb4',
  'lose yourself to dance': 'NF-kLy44Hls',

  // Billie Eilish
  'lunch': 'MB3VkzPdgLA',
  'birds of a feather': 'V9PVRfjEBTI',
  'bad guy': 'DyDfgMOUjCI',
  'ocean eyes': 'viimfQi_pUw',
  'everything i wanted': 'EgBJmlPo8Xw',
  'what was i made for': 'cW8VLC9nnTo',

  // Taylor Swift
  'anti-hero': 'b1kbLwvqugk',
  'karma': 'Xq1tZ9a924o',
  'cruel summer': 'ic8j13piAhQ',
  'blank space': 'e-ORhEE9VVg',
  'shake it off': 'nfWlot6h_JM',
  'cardigan': 'K-a8s8OLBSE',
  'fortnight': 'q3zqJs7JUCQ',

  // Kendrick Lamar
  'humble.': 'tvTRZJ-4EyI',
  'dna.': 'NLZRYQMLDW4',
  'not like us': 'H58vbez_m4E',
  'money trees': 'smqhSl0u_HQ',
  'alright': 'Z-48u_BlWKk',
  'swimming pools': '8-ejyHzz3XE',

  // Hans Zimmer
  'cornfield chase': '1Vko01D77Fg',
  'no time for caution': 'm3zvVGJrTP8',
  'time': 'RxabLA7UQ9k',
  'mountains': 'c3w825c0TfM',
  'stay': 'mff0z3rWlXg',

  // 2024 Hot Hits & Quick Picks
  'apt.': 'ekr2nIex040',
  'die with a smile': 'kPa7bsKwL-c',
  'espresso': 'eVli-tstM5E',
  'taste': 'dysq4jY26A0',
  'please please please': 'cF1Na4AIecM',
  'bling-bang-bang-born': 'mLW35ymz1gk',
  'too sweet': 'aezstCBHOPQ',
  'good luck, babe!': '1b_4lUeqP2o',
  'midnight city': 'dX3k_QDnzHE',
  'resonance': '8GW6sLrK40k',
};

export class YouTubeAudioPlayer {
  private iframeEl: HTMLIFrameElement | null = null;
  private currentVideoId: string = '';
  private isPlayerReady: boolean = false;
  private currentTime: number = 0;
  private duration: number = 0;
  private status: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended' = 'idle';
  private syncTimer: number | null = null;
  private isMuted: boolean = false;
  private volume: number = 100;

  private onTimeUpdateCallback?: (currentTime: number, duration: number) => void;
  private onStateChangeCallback?: (status: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended') => void;
  private onErrorCallback?: (err: any) => void;

  constructor() {
    this.initMessageListener();
  }

  public setCallbacks(
    onTimeUpdate?: (currentTime: number, duration: number) => void,
    onStateChange?: (status: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended') => void,
    onError?: (err: any) => void
  ) {
    this.onTimeUpdateCallback = onTimeUpdate;
    this.onStateChangeCallback = onStateChange;
    this.onErrorCallback = onError;
  }

  public resolveVideoId(title: string, artist: string, initialId?: string): string | null {
    if (initialId && initialId.trim()) return initialId.trim();

    const tLower = title.toLowerCase().trim();
    const aLower = artist.toLowerCase().trim();
    const combined = `${tLower} ${aLower}`;

    for (const [key, vid] of Object.entries(KNOWN_TRACK_VIDEO_IDS)) {
      if (tLower.includes(key) || key.includes(tLower) || combined.includes(key)) {
        return vid;
      }
    }

    return null;
  }

  private ensureIframe(): HTMLIFrameElement {
    if (this.iframeEl && document.body.contains(this.iframeEl)) {
      return this.iframeEl;
    }

    let existing = document.getElementById('tvos-yt-audio-player') as HTMLIFrameElement;
    if (existing) {
      this.iframeEl = existing;
      return existing;
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'tvos-yt-audio-player';
    iframe.title = 'tvOS YouTube Audio Player';
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '320px';
    iframe.style.height = '180px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';

    document.body.appendChild(iframe);
    this.iframeEl = iframe;
    return iframe;
  }

  private initMessageListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        // YouTube IFrame API onReady
        if (data.event === 'onReady') {
          this.isPlayerReady = true;
          this.sendCommand('listening');
        }

        // YouTube IFrame API State Change
        if (data.event === 'onStateChange') {
          const stateCode = data.info;
          this.handleStateCode(stateCode);
        }

        // Continuous info delivery (currentTime, duration, playerState)
        if (data.event === 'infoDelivery' && data.info) {
          const info = data.info;
          if (typeof info.currentTime === 'number') {
            this.currentTime = info.currentTime;
          }
          if (typeof info.duration === 'number' && info.duration > 0) {
            this.duration = info.duration;
          }
          if (typeof info.playerState === 'number') {
            this.handleStateCode(info.playerState);
          }

          if (this.onTimeUpdateCallback && this.currentTime >= 0) {
            this.onTimeUpdateCallback(this.currentTime, this.duration);
          }
        }
      } catch (e) {
        // Non-JSON message from other sources
      }
    });
  }

  private handleStateCode(code: number) {
    // 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING, 0 = ENDED, -1 = UNSTARTED
    let newStatus: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended' = this.status;

    switch (code) {
      case 1:
        newStatus = 'playing';
        this.startSyncTimer();
        break;
      case 2:
        newStatus = 'paused';
        this.stopSyncTimer();
        break;
      case 3:
        newStatus = 'buffering';
        break;
      case 0:
        newStatus = 'ended';
        this.stopSyncTimer();
        break;
      case -1:
        newStatus = 'buffering';
        break;
      default:
        break;
    }

    if (newStatus !== this.status) {
      this.status = newStatus;
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(newStatus);
      }
    }
  }

  private sendCommand(func: string, args: any = '') {
    if (!this.iframeEl || !this.iframeEl.contentWindow) return;
    try {
      this.iframeEl.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: func,
          args: Array.isArray(args) ? args : [args],
        }),
        '*'
      );
    } catch (e) {}
  }

  public async play(videoId: string, startSeconds: number = 0): Promise<void> {
    this.currentVideoId = videoId;
    this.currentTime = startSeconds;
    this.status = 'buffering';
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('buffering');
    }

    const iframe = this.ensureIframe();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const srcUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&start=${Math.floor(
      startSeconds
    )}&origin=${encodeURIComponent(origin)}&playsinline=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&rel=0`;

    // Always assign new src to trigger instant clean playback
    iframe.src = srcUrl;
    this.isPlayerReady = false;

    // Send command listening after load
    iframe.onload = () => {
      this.isPlayerReady = true;
      this.sendCommand('listening');
      this.sendCommand('playVideo');
      this.startSyncTimer();
    };

    this.startSyncTimer();
  }

  public pause(): void {
    this.sendCommand('pauseVideo');
    this.status = 'paused';
    this.stopSyncTimer();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('paused');
    }
  }

  public resume(): void {
    this.sendCommand('playVideo');
    this.status = 'playing';
    this.startSyncTimer();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('playing');
    }
  }

  public seekTo(seconds: number): void {
    this.currentTime = seconds;
    this.sendCommand('seekTo', [seconds, true]);
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(this.currentTime, this.duration);
    }
  }

  public setVolume(volume0to100: number): void {
    this.volume = Math.max(0, Math.min(100, volume0to100));
    this.sendCommand('setVolume', [this.volume]);
  }

  public mute(): void {
    this.isMuted = true;
    this.sendCommand('mute');
  }

  public unMute(): void {
    this.isMuted = false;
    this.sendCommand('unMute');
  }

  public stop(): void {
    this.stopSyncTimer();
    this.sendCommand('stopVideo');
    if (this.iframeEl) {
      this.iframeEl.src = 'about:blank';
    }
    this.status = 'idle';
    this.currentTime = 0;
    this.currentVideoId = '';
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('idle');
    }
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getStatus(): 'idle' | 'playing' | 'paused' | 'buffering' | 'ended' {
    return this.status;
  }

  public getCurrentVideoId(): string {
    return this.currentVideoId;
  }

  private startSyncTimer() {
    this.stopSyncTimer();
    this.syncTimer = window.setInterval(() => {
      if (this.status === 'playing') {
        this.sendCommand('listening');
        // Increment estimated time between deliveries for fluid sub-second lyric tracking
        this.currentTime += 0.25;
        if (this.duration > 0 && this.currentTime > this.duration) {
          this.currentTime = this.duration;
        }
        if (this.onTimeUpdateCallback) {
          this.onTimeUpdateCallback(this.currentTime, this.duration);
        }
      }
    }, 250);
  }

  private stopSyncTimer() {
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

export const youTubeAudioPlayer = new YouTubeAudioPlayer();
