import Peer, { DataConnection } from 'peerjs';
import { spatialNav } from '../spatialNav/spatialNavEngine';
import { playbackService } from '../playback/PlaybackService';
import { audioService } from '../audio/AudioService';
import { ambientService } from '../ambient/ambientService';
import { displayService } from '../display/displayService';
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

export interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  isPrimary: boolean;
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

  private selectedIp: string = '';
  private availableInterfaces: NetworkInterfaceInfo[] = [];
  private serverPort: number = 3000;
  private sseReceiver: EventSource | null = null;

  // WebRTC PeerJS P2P (Serverless cross-device connection for GitHub Pages / Cloud)
  private tvPeer: Peer | null = null;
  private tvPeerId: string = '';
  private peerConnections: Set<DataConnection> = new Set();

  constructor() {
    this.initBroadcastChannel();
  }

  public init(callbacks: RemoteCallbacks): () => void {
    this.callbacks = callbacks;
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.initWebRTCPeer();
      this.discoverServerInfo();
      this.listenToSubsystems();
      this.listenToElectronIPC();
      this.initBrowserReceiver();
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

  // ─── WEBRTC PEERJS INITIALIZATION (Serverless P2P) ─────────────────────────

  private initWebRTCPeer(): void {
    if (typeof window === 'undefined') return;

    try {
      // Generate or retrieve persistent short TV Room ID
      let storedId = '';
      try {
        storedId = sessionStorage.getItem('kaira_tv_peer_id') || '';
      } catch (e) {}

      if (!storedId) {
        storedId = `kaira-${Math.random().toString(36).substring(2, 7)}`;
        try {
          sessionStorage.setItem('kaira_tv_peer_id', storedId);
        } catch (e) {}
      }

      this.tvPeerId = storedId;
      this.tvPeer = new Peer(this.tvPeerId, {
        debug: 1,
      });

      this.tvPeer.on('open', (id) => {
        console.log(`[RemoteService] 🌐 WebRTC Peer Ready with ID: ${id}`);
        this.tvPeerId = id;
        this.broadcastState();
      });

      this.tvPeer.on('connection', (conn) => {
        console.log(`[RemoteService] 📱 Incoming WebRTC Peer Connection from phone: ${conn.peer}`);

        conn.on('open', () => {
          this.peerConnections.add(conn);
          this.setConnectedClients(this.peerConnections.size);

          // Send immediate TV State snapshot
          conn.send({ type: 'STATE_UPDATE', payload: this.getTVState() });
        });

        conn.on('data', (data: any) => {
          if (data && data.type === 'COMMAND' && data.payload) {
            this.handleCommand(data.payload);
          } else if (data && data.type === 'REQUEST_STATE') {
            conn.send({ type: 'STATE_UPDATE', payload: this.getTVState() });
          }
        });

        conn.on('close', () => {
          this.peerConnections.delete(conn);
          this.setConnectedClients(this.peerConnections.size);
        });

        conn.on('error', (err) => {
          console.warn('[RemoteService] Peer connection error:', err);
          this.peerConnections.delete(conn);
          this.setConnectedClients(this.peerConnections.size);
        });
      });

      this.tvPeer.on('error', (err: any) => {
        console.warn('[RemoteService] PeerJS error:', err?.type || err);
        // If ID is taken, fallback to random ID
        if (err?.type === 'unavailable-id') {
          this.tvPeerId = `kaira-${Math.random().toString(36).substring(2, 9)}`;
          try {
            this.tvPeer = new Peer(this.tvPeerId);
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('[RemoteService] WebRTC PeerJS init notice:', e);
    }
  }

  public getPeerId(): string {
    return this.tvPeerId;
  }

  public async discoverServerInfo(): Promise<void> {
    // 1. Try Electron API
    if (window.electronAPI?.getRemoteServerInfo) {
      try {
        const info = await window.electronAPI.getRemoteServerInfo();
        if (info && info.ip) {
          this.selectedIp = info.ip;
          this.serverPort = info.port || 3000;
          if (info.interfaces) {
            this.availableInterfaces = info.interfaces;
          }
          networkService.setIp(this.selectedIp);
          this.broadcastState();
          return;
        }
      } catch (e) {}
    }

    // 2. Try HTTP endpoint /api/remote/info (Local dev server)
    try {
      const res = await fetch('/api/remote/info');
      if (res.ok) {
        const info = await res.json();
        if (info && info.ip) {
          this.selectedIp = info.ip;
          this.serverPort = info.port || (window.location.port ? parseInt(window.location.port, 10) : 3000);
          if (info.interfaces) {
            this.availableInterfaces = info.interfaces;
          }
          networkService.setIp(this.selectedIp);
          this.broadcastState();
          return;
        }
      }
    } catch (e) {}

    // Fallback: If on GitHub Pages or public HTTPS host
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      this.selectedIp = host;
    }
  }

  public getAvailableInterfaces(): NetworkInterfaceInfo[] {
    return this.availableInterfaces;
  }

  public setSelectedIp(ip: string): void {
    this.selectedIp = ip;
    networkService.setIp(ip);
    this.broadcastState();
  }

  public getSelectedIp(): string {
    if (this.selectedIp) return this.selectedIp;
    const netState = networkService.getState();
    if (netState.ip && netState.ip !== '127.0.0.1') return netState.ip;
    return window.location.hostname || 'localhost';
  }

  public getConnectedClients(): number {
    return Math.max(this.connectedClients, this.peerConnections.size);
  }

  private tunnelUrl: string | null = null;
  private isTunnelStarting: boolean = false;

  public async startTunnel(): Promise<string | null> {
    if (this.tunnelUrl) return this.tunnelUrl;
    this.isTunnelStarting = true;
    try {
      const res = await fetch('/api/remote/tunnel/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.url) {
          this.tunnelUrl = data.url;
          this.broadcastState();
          return this.tunnelUrl;
        }
      }
    } catch (e) {
      console.warn('[RemoteService] startTunnel error:', e);
    } finally {
      this.isTunnelStarting = false;
    }
    return null;
  }

  public async stopTunnel(): Promise<void> {
    if (!this.tunnelUrl) return;
    try {
      await fetch('/api/remote/tunnel/stop', { method: 'POST' });
    } catch (e) {}
    this.tunnelUrl = null;
    this.broadcastState();
  }

  public getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }

  public getIsTunnelStarting(): boolean {
    return this.isTunnelStarting;
  }

  public getRemoteUrl(preferTunnel: boolean = false): string {
    if (preferTunnel && this.tunnelUrl) {
      return this.tunnelUrl;
    }

    const isStaticDeploy =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('github.io') ||
        window.location.hostname.includes('vercel.app') ||
        window.location.hostname.includes('netlify.app') ||
        (window.location.protocol === 'https:' && !this.tunnelUrl));

    const peerParam = this.tvPeerId ? `&peer=${encodeURIComponent(this.tvPeerId)}` : '';

    if (isStaticDeploy) {
      // Build static host URL (e.g. https://1amkrs.github.io/kaira/?mode=remote&peer=kaira-xxx)
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      return `${origin}${pathname}?mode=remote${peerParam}`;
    }

    const hostIp = this.getSelectedIp();
    const port = this.serverPort || (window.location.port ? parseInt(window.location.port, 10) : 3000);
    const portStr = port === 80 || port === 443 ? '' : `:${port}`;
    return `${window.location.protocol}//${hostIp}${portStr}/?mode=remote${peerParam}`;
  }

  public getTVState(): TVStateSnapshot {
    const playState = playbackService.getState();
    const curSource = playState.currentSource;
    const amb = ambientService.getState();
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

    const hostIp = this.getSelectedIp();
    const port = this.serverPort || (window.location.port ? parseInt(window.location.port, 10) : 3000);

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
      connectedClients: this.getConnectedClients(),
      serverIp: hostIp,
      serverPort: port,
      tvName: diag?.deviceModel || 'Kaira TV',
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
    listener(this.getConnectedClients());
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
          soundEffectsService.playSelectChime();
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
          this.callbacks.onOpenSearch?.();
          break;

        // --- 2. Tab Navigation ---
        case 'SET_TAB':
          if (command.payload && typeof command.payload.tab === 'string') {
            soundEffectsService.playSelectChime();
            this.callbacks.onSetTab?.(command.payload.tab as NavigationTab);
          }
          break;
        case 'TAB_PREV':
          soundEffectsService.playFocusTick();
          this.navigateTab(-1);
          break;
        case 'TAB_NEXT':
          soundEffectsService.playFocusTick();
          this.navigateTab(1);
          break;

        // --- 3. Search & Text Input ---
        case 'SEARCH_QUERY':
        case 'VOICE_QUERY':
          if (command.payload && typeof command.payload.query === 'string') {
            soundEffectsService.playSelectChime();
            this.callbacks.onOpenSearch?.(command.payload.query);
          }
          break;
        case 'INPUT_TEXT':
          if (command.payload && typeof command.payload.text === 'string') {
            this.callbacks.onOpenSearch?.(command.payload.text);
          }
          break;

        // --- 4. Media Playback Controls ---
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
          if (command.payload && typeof command.payload.position === 'number') {
            playbackService.seek(command.payload.position);
          }
          break;
        case 'SEEK_RELATIVE':
          if (command.payload && typeof command.payload.offset === 'number') {
            playbackService.seekRelative(command.payload.offset);
          }
          break;
        case 'NEXT_TRACK':
          playbackService.next();
          break;
        case 'PREV_TRACK':
          playbackService.previous();
          break;

        // --- 5. Audio & Volume Controls ---
        case 'SET_VOLUME':
          if (command.payload && typeof command.payload.level === 'number') {
            const vol = Math.max(0, Math.min(1, command.payload.level));
            playbackService.setVolume(vol);
            audioService.setVolume(vol);
          }
          break;
        case 'VOLUME_DELTA':
          {
            const cur = playbackService.getState().volume;
            const next = Math.max(0, Math.min(1, cur + (command.payload?.delta || 0.05)));
            playbackService.setVolume(next);
            audioService.setVolume(next);
          }
          break;
        case 'MUTE_TOGGLE':
          audioService.toggleMute();
          break;

        // --- 6. Quick Launch & Apps ---
        case 'LAUNCH_APP':
          if (command.payload && command.payload.appId) {
            appLauncher.launchApp(command.payload.appId);
          }
          break;

        // --- 7. Ambient Lighting Controls ---
        case 'SET_AMBIENT_MODE':
          if (command.payload && command.payload.mode) {
            ambientService.setMode(command.payload.mode);
          }
          break;
        case 'SET_AMBIENT_INTENSITY':
          if (command.payload && typeof command.payload.intensity === 'number') {
            ambientService.setIntensity(command.payload.intensity);
          }
          break;

        // --- 8. Power & System Controls ---
        case 'TRIGGER_SCREENSAVER':
          this.callbacks.onTriggerScreensaver?.();
          break;
        case 'OPEN_SLEEP_TIMER':
          this.callbacks.onOpenSleepTimer?.();
          break;
        case 'POWER_ACTION':
          if (command.payload && command.payload.action) {
            displayService.triggerPowerAction(command.payload.action);
          }
          break;

        default:
          return { success: false, error: 'Unknown command' };
      }

      this.broadcastState();
      return { success: true };
    } catch (err: any) {
      console.error('[RemoteService] Error executing command:', err);
      return { success: false, error: err.message };
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

    // 2. Broadcast via WebRTC PeerJS to all connected phone clients
    for (const conn of this.peerConnections) {
      try {
        if (conn.open) {
          conn.send({ type: 'STATE_UPDATE', payload: snapshot });
        }
      } catch (e) {
        this.peerConnections.delete(conn);
      }
    }

    // 3. BroadcastChannel for same-origin tabs / popup preview
    if (this.broadcastChannel) {
      try {
        const msg: RemoteServerMessage = { type: 'STATE_UPDATE', payload: snapshot };
        this.broadcastChannel.postMessage(msg);
      } catch (e) {}
    }

    // 4. Electron IPC Bridge to Node WebSocket server
    if (window.electronAPI?.sendRemoteState) {
      window.electronAPI.sendRemoteState(snapshot);
    }

    // 5. HTTP POST sync to local dev server (if available)
    if (typeof fetch !== 'undefined' && !window.location.hostname.includes('github.io')) {
      try {
        fetch('/api/remote/sync-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        }).catch(() => {});
      } catch (e) {}
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

  private initBrowserReceiver(): void {
    if (typeof window === 'undefined' || window.electronAPI?.onRemoteCommand || window.location.hostname.includes('github.io')) return;

    try {
      if (this.sseReceiver) {
        this.sseReceiver.close();
      }

      this.sseReceiver = new EventSource('/api/remote/events');
      this.sseReceiver.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'COMMAND' && data.payload) {
            this.handleCommand(data.payload);
          }
        } catch (e) {}
      };

      this.sseReceiver.onerror = () => {
        // SSE auto-reconnect
      };
    } catch (e) {
      console.warn('[RemoteService] SSE receiver init notice:', e);
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
    playbackService.subscribe(() => {
      this.broadcastState();
    });

    ambientService.subscribe(() => {
      this.broadcastState();
    });

    audioService.subscribe?.(() => {
      this.broadcastState();
    });
  }

  private startSyncLoop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      const playState = playbackService.getState();
      if (playState.status === 'playing' || this.getConnectedClients() > 0) {
        this.broadcastState();
      }
    }, 1000);
  }
}

export const remoteService = new RemoteService();
