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
  private status: ConnectionStatus = 'disconnected';
  private latestState: TVStateSnapshot | null = null;
  private listeners: Set<RemoteClientListener> = new Set();
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private serverHost: string = '';
  private serverPort: number = 3000;
  private isExplicitlyClosed: boolean = false;

  constructor() {
    this.initBroadcastChannel();
  }

  public connect(host?: string, port?: number): void {
    this.isExplicitlyClosed = false;
    this.serverHost = host || window.location.hostname || 'localhost';
    this.serverPort = port || (window.location.port ? parseInt(window.location.port, 10) : 3000);

    this.setStatus('connecting');
    this.tryWebSocket();
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
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

    // 1. Send via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: RemoteClientMessage = { type: 'COMMAND', payload: cmd };
      this.ws.send(JSON.stringify(msg));
      return true;
    }

    // 2. Send via BroadcastChannel for same-origin tabs
    if (this.broadcastChannel) {
      try {
        const msg: RemoteClientMessage = { type: 'COMMAND', payload: cmd };
        this.broadcastChannel.postMessage(msg);
      } catch (e) {}
    }

    // 3. Fallback via HTTP POST
    this.sendHttpCommand(cmd);
    return true;
  }

  public triggerHaptic(durationMs: number = 15): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(durationMs);
      } catch (e) {}
    }
  }

  // ─── WEBSOCKET CONNECTION ──────────────────────────────────────────────────

  private tryWebSocket(): void {
    if (this.isExplicitlyClosed) return;

    // Try primary port, or secondary port 3001 if in Electron
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
        // Identify client device
        const identifyMsg: RemoteClientMessage = {
          type: 'IDENTIFY',
          payload: {
            deviceName: navigator.userAgent.includes('iPhone')
              ? 'iPhone'
              : navigator.userAgent.includes('Android')
              ? 'Android Phone'
              : 'Mobile Device',
            browser: navigator.userAgent,
          },
        };
        this.ws?.send(JSON.stringify(identifyMsg));
        this.ws?.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as RemoteServerMessage;
          this.handleServerMessage(msg);
        } catch (e) {}
      };

      this.ws.onerror = () => {
        // Switch to SSE / HTTP fallback on failure
        this.trySseFallback();
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.trySseFallback();
    }
  }

  // ─── SSE / HTTP FALLBACK ───────────────────────────────────────────────────

  private trySseFallback(): void {
    if (this.isExplicitlyClosed || this.sse) return;

    try {
      const sseUrl = `${window.location.protocol}//${this.serverHost}:${this.serverPort}/api/remote/events`;
      this.sse = new EventSource(sseUrl);

      this.sse.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
      };

      this.sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as RemoteServerMessage;
          this.handleServerMessage(msg);
        } catch (e) {}
      };

      this.sse.onerror = () => {
        if (this.sse) {
          this.sse.close();
          this.sse = null;
        }
        this.startHttpPolling();
      };
    } catch (e) {
      this.startHttpPolling();
    }
  }

  private async sendHttpCommand(cmd: RemoteCommand): Promise<void> {
    const urls = [
      `${window.location.protocol}//${this.serverHost}:${this.serverPort}/api/remote/command`,
      `${window.location.protocol}//${this.serverHost}:3001/api/remote/command`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd),
          mode: 'cors',
        });
        if (res.ok) return;
      } catch (e) {}
    }
  }

  private startHttpPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);

    const poll = async () => {
      try {
        const res = await fetch(
          `${window.location.protocol}//${this.serverHost}:${this.serverPort}/api/remote/status`,
          { mode: 'cors' }
        );
        if (res.ok) {
          const state = await res.json();
          this.handleServerMessage({ type: 'STATE_UPDATE', payload: state });
          this.setStatus('connected');
        } else {
          this.setStatus('reconnecting');
        }
      } catch (e) {
        this.setStatus('disconnected');
      }
    };

    poll();
    this.pollTimer = setInterval(poll, 1500);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectTimer = setTimeout(() => {
      this.tryWebSocket();
    }, delay);
  }

  private handleServerMessage(msg: RemoteServerMessage): void {
    if (!msg) return;

    if (msg.type === 'STATE_UPDATE' && msg.payload) {
      this.latestState = msg.payload;
      this.listeners.forEach((l) => l.onStateUpdate?.(msg.payload));
    } else if (msg.type === 'TOAST' && msg.payload?.message) {
      this.listeners.forEach((l) => l.onToast?.(msg.payload.message));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.listeners.forEach((l) => l.onStatusChange?.(status));
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel('tvos_remote_channel');
      this.broadcastChannel.onmessage = (event) => {
        const data = event.data as RemoteServerMessage;
        if (data && data.type) {
          this.handleServerMessage(data);
          this.setStatus('connected');
        }
      };
      // Request initial state from TV
      this.broadcastChannel.postMessage({ type: 'REQUEST_STATE' });
    } catch (e) {}
  }
}

export const remoteClient = new RemoteClient();
