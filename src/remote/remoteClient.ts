import Peer, { DataConnection } from 'peerjs';
import {
  RemoteCommand,
  RemoteCommandType,
  TVStateSnapshot,
  RemoteServerMessage,
  RemoteClientMessage,
} from '../services/remote/remoteTypes';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RemoteClientListener {
  onStatusChange?: (status: ConnectionStatus) => void;
  onStateUpdate?: (state: TVStateSnapshot) => void;
  onToast?: (message: string) => void;
}

class RemoteClient {
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private peer: Peer | null = null;
  private peerConnection: DataConnection | null = null;
  private status: ConnectionStatus = 'disconnected';
  private latestState: TVStateSnapshot | null = null;
  private listeners: Set<RemoteClientListener> = new Set();
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private serverHost: string = '';
  private serverPort: number = 3000;
  private isExplicitlyClosed: boolean = false;
  private targetPeerId: string | null = null;

  constructor() {
    this.initBroadcastChannel();
  }

  public connect(host?: string, port?: number): void {
    this.isExplicitlyClosed = false;
    this.serverHost = host || window.location.hostname || 'localhost';
    this.serverPort = port || (window.location.port ? parseInt(window.location.port, 10) : 3000);

    // 1. Check for WebRTC Peer ID from URL or sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    const peerFromUrl = urlParams.get('peer');
    if (peerFromUrl) {
      this.targetPeerId = peerFromUrl;
      try {
        sessionStorage.setItem('kaira_target_peer', peerFromUrl);
      } catch (e) {}
    } else {
      try {
        this.targetPeerId = sessionStorage.getItem('kaira_target_peer');
      } catch (e) {}
    }

    this.setStatus('connecting');

    // 2. If targetPeerId is available, connect via WebRTC PeerJS (Works on GitHub Pages & Static Hosts)
    if (this.targetPeerId) {
      console.log(`[RemoteClient] 🌐 Connecting via WebRTC PeerJS to TV: ${this.targetPeerId}`);
      this.connectWebRTCPeer(this.targetPeerId);
    }

    // 3. Also try local WebSocket if on local network / dev server
    if (!window.location.hostname.includes('github.io')) {
      this.tryWebSocket();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    this.setStatus('disconnected');
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getLatestState(): TVStateSnapshot | null {
    return this.latestState;
  }

  public subscribe(listener: RemoteClientListener): () => void {
    this.listeners.add(listener);
    if (this.latestState) {
      listener.onStateUpdate?.(this.latestState);
    }
    listener.onStatusChange?.(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── SEND COMMAND ──────────────────────────────────────────────────────────

  public sendCommand(type: RemoteCommandType, payload?: any): boolean {
    this.triggerHaptic(12);

    const cmd: RemoteCommand = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      payload,
      timestamp: Date.now(),
    };

    let sent = false;

    // 1. Send via WebRTC DataConnection (GitHub Pages / Internet)
    if (this.peerConnection && this.peerConnection.open) {
      try {
        this.peerConnection.send({ type: 'COMMAND', payload: cmd });
        sent = true;
      } catch (e) {}
    }

    // 2. Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: RemoteClientMessage = { type: 'COMMAND', payload: cmd };
      this.ws.send(JSON.stringify(msg));
      sent = true;
    }

    // 3. Send via BroadcastChannel for same-origin tabs
    if (this.broadcastChannel) {
      try {
        const msg: RemoteClientMessage = { type: 'COMMAND', payload: cmd };
        this.broadcastChannel.postMessage(msg);
        sent = true;
      } catch (e) {}
    }

    // 4. Fallback via HTTP POST if on local dev server
    if (!sent && !window.location.hostname.includes('github.io')) {
      this.sendHttpCommand(cmd);
    }

    return true;
  }

  public triggerHaptic(durationMs: number = 15): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(durationMs);
      } catch (e) {}
    }
  }

  // ─── WEBRTC PEERJS CONNECTION ──────────────────────────────────────────────

  private connectWebRTCPeer(targetId: string): void {
    try {
      if (this.peer) {
        this.peer.destroy();
      }

      const clientPeerId = `phone-${Math.random().toString(36).substring(2, 8)}`;
      this.peer = new Peer(clientPeerId, { debug: 1 });

      this.peer.on('open', () => {
        console.log(`[RemoteClient] 📱 Client Peer ready, connecting to TV ${targetId}...`);
        const conn = this.peer!.connect(targetId, {
          reliable: true,
        });

        this.setupPeerConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('[RemoteClient] PeerJS client error:', err);
      });
    } catch (e) {
      console.warn('[RemoteClient] WebRTC connection error:', e);
    }
  }

  private setupPeerConnection(conn: DataConnection): void {
    this.peerConnection = conn;

    conn.on('open', () => {
      console.log('[RemoteClient] 🟢 WebRTC DataChannel Connected directly to Kaira TV!');
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      // Request TV state
      conn.send({ type: 'REQUEST_STATE' });
    });

    conn.on('data', (data: any) => {
      if (data && data.type === 'STATE_UPDATE' && data.payload) {
        this.handleStateUpdate(data.payload);
      }
    });

    conn.on('close', () => {
      console.warn('[RemoteClient] WebRTC DataChannel closed');
      if (!this.isExplicitlyClosed) {
        this.setStatus('reconnecting');
        setTimeout(() => {
          if (this.targetPeerId) this.connectWebRTCPeer(this.targetPeerId);
        }, 2000);
      }
    });

    conn.on('error', (err) => {
      console.warn('[RemoteClient] WebRTC DataChannel error:', err);
    });
  }

  // ─── WEBSOCKET CONNECTION ──────────────────────────────────────────────────

  private tryWebSocket(): void {
    if (this.isExplicitlyClosed || window.location.hostname.includes('github.io')) return;

    const wsProt = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const portsToTry = [this.serverPort, 3001, 3000];
    const targetPort = portsToTry[Math.min(this.reconnectAttempts, portsToTry.length - 1)] || this.serverPort;
    const wsUrl = `${wsProt}//${this.serverHost}:${targetPort}/ws/remote`;

    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.ws?.send(
          JSON.stringify({
            type: 'IDENTIFY',
            payload: {
              deviceType: 'mobile-web',
              userAgent: navigator.userAgent,
            },
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: RemoteServerMessage = JSON.parse(event.data);
          if (msg.type === 'STATE_UPDATE' && msg.payload) {
            this.handleStateUpdate(msg.payload);
          }
        } catch (e) {}
      };

      this.ws.onerror = () => {
        this.trySSEFallback();
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed && !this.peerConnection?.open) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.trySSEFallback();
    }
  }

  // ─── SSE FALLBACK ──────────────────────────────────────────────────────────

  private trySSEFallback(): void {
    if (this.sse || this.isExplicitlyClosed || window.location.hostname.includes('github.io')) return;

    try {
      this.sse = new EventSource('/api/remote/events');

      this.sse.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
      };

      this.sse.onmessage = (event) => {
        try {
          const msg: RemoteServerMessage = JSON.parse(event.data);
          if (msg.type === 'STATE_UPDATE' && msg.payload) {
            this.handleStateUpdate(msg.payload);
          }
        } catch (e) {}
      };

      this.sse.onerror = () => {
        if (this.sse) {
          this.sse.close();
          this.sse = null;
        }
      };
    } catch (e) {}
  }

  // ─── HTTP COMMAND FALLBACK ─────────────────────────────────────────────────

  private async sendHttpCommand(cmd: RemoteCommand): Promise<void> {
    if (window.location.hostname.includes('github.io')) return;

    try {
      await fetch('/api/remote/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      });
    } catch (e) {}
  }

  // ─── BROADCAST CHANNEL FOR SAME-ORIGIN TABS ────────────────────────────────

  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel('tvos_remote_channel');

      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as RemoteServerMessage;
        if (!msg || !msg.type) return;

        if (msg.type === 'STATE_UPDATE' && msg.payload) {
          this.setStatus('connected');
          this.handleStateUpdate(msg.payload);
        }
      };

      // Announce client presence
      this.broadcastChannel.postMessage({
        type: 'IDENTIFY',
        payload: { deviceType: 'browser-tab' },
      });
    } catch (e) {}
  }

  // ─── RECONNECT LOOP ────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || this.reconnectTimer) return;

    this.setStatus('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.targetPeerId) {
        this.connectWebRTCPeer(this.targetPeerId);
      }
      if (!window.location.hostname.includes('github.io')) {
        this.tryWebSocket();
      }
    }, delay);
  }

  private handleStateUpdate(state: TVStateSnapshot): void {
    this.latestState = state;
    this.listeners.forEach((l) => l.onStateUpdate?.(state));
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.listeners.forEach((l) => l.onStatusChange?.(newStatus));
  }
}

export const remoteClient = new RemoteClient();
