import { spatialNav } from '../spatialNav/spatialNavEngine';
import { playbackService } from '../playback/PlaybackService';
import { audioService } from '../audio/AudioService';
import { ambientService } from '../ambient/ambientService';
import { appLauncher } from '../appLauncher/appLauncher';
import { networkService } from '../network/NetworkService';
import { systemService } from '../system/SystemService';
import { soundEffectsService } from '../audio/soundEffectsService';
import {
  RemoteCommand,
  RemoteCommandType,
  TVStateSnapshot,
  NowPlayingMedia,
  RemoteServerMessage,
  RemoteClientMessage,
} from './remoteTypes';
import { NavigationTab } from '../../types';

export interface RemoteCallbacks {
  onSetTab?: (tab: NavigationTab) => void;
  onOpenSearch?: (initialQuery?: string) => void;
  onOpenSettings?: () => void;
  onOpenQuickSettings?: () => void;
  onOpenSleepTimer?: () => void;
  onOpenProfile?: () => void;
  onOpenRemoteModal?: () => void;
  onBack?: () => void;
  onTriggerScreensaver?: () => void;
}

class RemoteService {
  private connectedClients: number = 0;
  private callbacks: RemoteCallbacks = {};
  private activeTab: NavigationTab = 'for-you';
  private activeModal: 'search' | 'settings' | 'quick-settings' | 'profile' | 'sleep' | 'remote' | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private listeners: Set<(snapshot: TVStateSnapshot) => void> = new Set();
  private clientCountListeners: Set<(count: number) => void> = new Set();
  private isInitialized: boolean = false;

  constructor() {
    this.initBroadcastChannel();
  }

  public init(callbacks: RemoteCallbacks): () => void {
    this.callbacks = callbacks;
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.listenToSubsystems();
      this.listenToElectronIPC();
      this.startSyncLoop();
    }

    return () => {
      // keep alive across re-renders
    };
  }

  public setCallbacks(callbacks: RemoteCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public updateUIState(activeTab: NavigationTab, activeModal: 'search' | 'settings' | 'quick-settings' | 'profile' | 'sleep' | 'remote' | null): void {
    this.activeTab = activeTab;
    this.activeModal = activeModal;
    this.broadcastState();
  }

  public getConnectedClients(): number {
    return this.connectedClients;
  }

  public getRemoteUrl(): string {
    const netState = networkService.getState();
    const hostIp = netState.ip && netState.ip !== '127.0.0.1' ? netState.ip : window.location.hostname || 'localhost';
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${hostIp}${port}/remote`;
  }

  public getTVState(): TVStateSnapshot {
    const playState = playbackService.getState();
    const curSource = playState.currentSource;
    const amb = ambientService.getState();
    const net = networkService.getState();
    const diag = systemService.getCachedDiagnostics();

    let nowPlaying: NowPlayingMedia | null = null;
    if (curSource) {
      nowPlaying = {
        id: curSource.id,
        title: curSource.title,
        subtitle: curSource.subtitle || curSource.artist || curSource.album,
        artist: curSource.artist,
        album: curSource.album,
        artwork: curSource.artwork,
        type: curSource.mediaType || (curSource.type === 'audio' ? 'track' : 'video'),
        durationSeconds: playState.duration || curSource.durationSeconds || 0,
        positionSeconds: playState.currentTime || 0,
        isPlaying: playState.status === 'playing',
        isMuted: playState.isMuted || false,
        volume: playState.volume,
      };
    }

    const hostIp = net.ip && net.ip !== '127.0.0.1' ? net.ip : window.location.hostname || 'localhost';
    const port = window.location.port ? parseInt(window.location.port, 10) : 3000;

    return {
      activeTab: this.activeTab,
      activeModal: this.activeModal,
      nowPlaying,
      volume: playState.volume,
      isMuted: playState.isMuted || false,
      ambientState: {
        enabled: amb.enabled,
        mode: amb.mode,
        intensity: amb.intensity,
        connected: amb.connected,
      },
      connectedClients: this.connectedClients,
      serverIp: hostIp,
      serverPort: port,
      tvName: diag?.deviceModel || 'Kaira TV OS',
      uptimeSeconds: Math.floor(diag?.uptimeSeconds || performance.now() / 1000),
      timestamp: Date.now(),
    };
  }

  public subscribe(listener: (snapshot: TVStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTVState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeClientCount(listener: (count: number) => void): () => void {
    this.clientCountListeners.add(listener);
    listener(this.connectedClients);
    return () => {
      this.clientCountListeners.delete(listener);
    };
  }

  // ─── COMMAND EXECUTION ENGINE ──────────────────────────────────────────────

  public handleCommand(command: RemoteCommand): { success: boolean; error?: string } {
    console.log(`[RemoteService] 📱 Executing Command: ${command.type}`, command.payload);

    try {
      switch (command.type) {
        // --- 1. D-Pad & Navigation ---
        case 'NAV_UP':
          soundEffectsService.playFocusTick();
          spatialNav.navigate('up');
          break;
        case 'NAV_DOWN':
          soundEffectsService.playFocusTick();
          spatialNav.navigate('down');
          break;
        case 'NAV_LEFT':
          soundEffectsService.playFocusTick();
          spatialNav.navigate('left');
          break;
        case 'NAV_RIGHT':
          soundEffectsService.playFocusTick();
          spatialNav.navigate('right');
          break;
        case 'SELECT':
          spatialNav.triggerSelect();
          break;
        case 'BACK':
          soundEffectsService.playSelectChime();
          this.callbacks.onBack?.();
          break;
        case 'HOME':
          soundEffectsService.playSelectChime();
          this.callbacks.onSetTab?.('for-you');
          break;
        case 'MENU':
        case 'QUICK_SETTINGS':
          soundEffectsService.playSelectChime();
          this.callbacks.onOpenQuickSettings?.();
          break;
        case 'SEARCH':
          soundEffectsService.playSelectChime();
          this.callbacks.onOpenSearch?.(command.payload?.query);
          break;
        case 'TAB_PREV':
          soundEffectsService.playFocusTick();
          this.navigateTab(-1);
          break;
        case 'TAB_NEXT':
          soundEffectsService.playFocusTick();
          this.navigateTab(1);
          break;
        case 'SET_TAB':
          if (command.payload?.tab) {
            soundEffectsService.playSelectChime();
            this.callbacks.onSetTab?.(command.payload.tab as NavigationTab);
          }
          break;

        // --- 2. Keyboard, Voice & Text Input ---
        case 'SEARCH_QUERY':
        case 'VOICE_QUERY':
          if (command.payload?.query !== undefined) {
            this.callbacks.onOpenSearch?.(command.payload.query);
            // Also attempt to directly set into search input if present
            setTimeout(() => {
              const searchInput = document.querySelector<HTMLInputElement>('.tv-search-input');
              if (searchInput) {
                searchInput.value = command.payload.query;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }, 60);
          }
          break;
        case 'INPUT_TEXT':
          if (command.payload?.text !== undefined) {
            const activeInput = document.activeElement as HTMLInputElement | null;
            if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
              activeInput.value = command.payload.text;
              activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          break;
        case 'KEY_PRESS':
          if (command.payload?.key) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: command.payload.key, bubbles: true }));
          }
          break;

        // --- 3. Media & Playback ---
        case 'PLAY_PAUSE':
          playbackService.togglePlayPause();
          break;
        case 'PLAY':
          playbackService.resume();
          break;
        case 'PAUSE':
          playbackService.pause();
          break;
        case 'SEEK':
          if (typeof command.payload?.position === 'number') {
            playbackService.seek(command.payload.position);
          }
          break;
        case 'SEEK_RELATIVE':
          if (typeof command.payload?.delta === 'number') {
            playbackService.seekRelative(command.payload.delta);
          }
          break;
        case 'NEXT_TRACK':
          playbackService.next();
          break;
        case 'PREV_TRACK':
          playbackService.previous();
          break;
        case 'SET_VOLUME':
          if (typeof command.payload?.volume === 'number') {
            playbackService.setVolume(command.payload.volume);
            audioService.setVolume(command.payload.volume);
          }
          break;
        case 'VOLUME_DELTA':
          if (typeof command.payload?.delta === 'number') {
            const curVol = playbackService.getState().volume;
            const nextVol = Math.max(0, Math.min(1, curVol + command.payload.delta));
            playbackService.setVolume(nextVol);
            audioService.setVolume(nextVol);
          }
          break;
        case 'MUTE_TOGGLE':
          audioService.toggleMute();
          break;

        // --- 4. Ambient Lighting & System ---
        case 'SET_AMBIENT_MODE':
          if (command.payload?.mode) {
            ambientService.setMode(command.payload.mode);
          }
          break;
        case 'SET_AMBIENT_INTENSITY':
          if (typeof command.payload?.intensity === 'number') {
            ambientService.setIntensity(command.payload.intensity);
          }
          break;
        case 'TRIGGER_SCREENSAVER':
          this.callbacks.onTriggerScreensaver?.();
          break;
        case 'OPEN_SLEEP_TIMER':
          this.callbacks.onOpenSleepTimer?.();
          break;
        case 'POWER_ACTION':
          if (command.payload?.action) {
            if (command.payload.action === 'screensaver') {
              this.callbacks.onTriggerScreensaver?.();
            } else if (window.electronAPI?.executeSystemPower) {
              window.electronAPI.executeSystemPower(command.payload.action);
            }
          }
          break;

        // --- 5. App Launching & Direct Playback ---
        case 'LAUNCH_APP':
          if (command.payload?.app) {
            appLauncher.launchApp(command.payload.app);
          }
          break;
        case 'PLAY_MEDIA':
          if (command.payload?.media) {
            appLauncher.launchMedia(command.payload.media);
          }
          break;

        default:
          console.warn('[RemoteService] Unhandled command type:', command.type);
          return { success: false, error: `Unhandled command: ${command.type}` };
      }

      this.broadcastState();
      return { success: true };
    } catch (err: any) {
      console.error('[RemoteService] Error executing command:', err);
      return { success: false, error: err?.message || 'Execution error' };
    }
  }

  private navigateTab(direction: number): void {
    const tabs: NavigationTab[] = ['for-you', 'movies', 'shows', 'music', 'games', 'library'];
    const curIdx = tabs.indexOf(this.activeTab);
    const nextIdx = (curIdx + direction + tabs.length) % tabs.length;
    this.callbacks.onSetTab?.(tabs[nextIdx]);
  }

  // ─── BROADCAST & SYNCHRONIZATION ───────────────────────────────────────────

  public broadcastState(): void {
    const snapshot = this.getTVState();

    // 1. Notify local React listeners
    this.listeners.forEach((fn) => fn(snapshot));

    // 2. BroadcastChannel for same-origin tabs / popup preview
    if (this.broadcastChannel) {
      try {
        const msg: RemoteServerMessage = { type: 'STATE_UPDATE', payload: snapshot };
        this.broadcastChannel.postMessage(msg);
      } catch (e) {}
    }

    // 3. Electron IPC Bridge to Node WebSocket server
    if (window.electronAPI?.sendRemoteState) {
      window.electronAPI.sendRemoteState(snapshot);
    }
  }

  public setConnectedClients(count: number): void {
    if (this.connectedClients !== count) {
      const prev = this.connectedClients;
      this.connectedClients = count;
      this.clientCountListeners.forEach((fn) => fn(count));

      if (count > prev) {
        soundEffectsService.playSelectChime();
      }

      this.broadcastState();
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel('tvos_remote_channel');
      this.broadcastChannel.onmessage = (event) => {
        const data = event.data as RemoteClientMessage;
        if (!data || !data.type) return;

        if (data.type === 'COMMAND' && data.payload) {
          this.handleCommand(data.payload);
        } else if (data.type === 'REQUEST_STATE') {
          this.broadcastState();
        } else if (data.type === 'IDENTIFY') {
          this.setConnectedClients(Math.max(1, this.connectedClients));
        }
      };
    } catch (e) {
      console.warn('[RemoteService] BroadcastChannel init notice:', e);
    }
  }

  private listenToElectronIPC(): void {
    if (window.electronAPI?.onRemoteCommand) {
      window.electronAPI.onRemoteCommand((cmd: RemoteCommand) => {
        this.handleCommand(cmd);
      });
    }

    if (window.electronAPI?.onRemoteClientCount) {
      window.electronAPI.onRemoteClientCount((count: number) => {
        this.setConnectedClients(count);
      });
    }
  }

  private listenToSubsystems(): void {
    // Playback state changes
    playbackService.subscribe(() => {
      this.broadcastState();
    });

    // Ambient light state changes
    ambientService.subscribe(() => {
      this.broadcastState();
    });

    // Audio changes
    audioService.subscribe?.(() => {
      this.broadcastState();
    });
  }

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    // Periodically pulse state (keeps positionSeconds updated on remote during playback)
    this.syncTimer = setInterval(() => {
      const playState = playbackService.getState();
      if (playState.status === 'playing' || this.connectedClients > 0) {
        this.broadcastState();
      }
    }, 1000);
  }
}

export const remoteService = new RemoteService();
