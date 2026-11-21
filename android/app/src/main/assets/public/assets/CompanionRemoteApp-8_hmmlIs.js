var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { $ as $dd0187d7f28e386f$export$2e2bcd8739ae039, j as jsxRuntimeExports } from "./index-MExTs1ZP.js";
import { a as reactExports, aB as ChevronUp, aC as ChevronDown, j as ChevronLeft, k as ChevronRight, aF as Undo2, d as House, u as Pause, P as Play, a5 as Plus, aG as Minus, t as VolumeX, T as Tv, aH as Disc3, a4 as RotateCcw, am as SkipBack, an as SkipForward, ac as RotateCw, al as Shuffle, ao as Repeat1, ap as Repeat, a3 as Power, aI as LogOut, s as Layers } from "./vendor-icons-CzR-KKfP.js";
import "./vendor-react-B6lSvvUc.js";
class RemoteClient {
  constructor() {
    __publicField(this, "ws", null);
    __publicField(this, "sse", null);
    __publicField(this, "broadcastChannel", null);
    __publicField(this, "peer", null);
    __publicField(this, "peerConnection", null);
    __publicField(this, "status", "disconnected");
    __publicField(this, "latestState", null);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "reconnectAttempts", 0);
    __publicField(this, "reconnectTimer", null);
    __publicField(this, "pollTimer", null);
    __publicField(this, "serverHost", "");
    __publicField(this, "serverPort", 3e3);
    __publicField(this, "isExplicitlyClosed", false);
    __publicField(this, "targetPeerId", null);
  }
  connect(host, port) {
    this.isExplicitlyClosed = false;
    this.serverHost = host || window.location.hostname || "localhost";
    this.serverPort = port || (window.location.port ? parseInt(window.location.port, 10) : 3e3);
    const urlParams = new URLSearchParams(window.location.search);
    const peerFromUrl = urlParams.get("peer");
    if (peerFromUrl) {
      this.targetPeerId = peerFromUrl;
      try {
        sessionStorage.setItem("kaira_target_peer", peerFromUrl);
      } catch (e) {
      }
    } else {
      try {
        this.targetPeerId = sessionStorage.getItem("kaira_target_peer");
      } catch (e) {
      }
    }
    this.setStatus("connecting");
    this.initBroadcastChannel();
    if (this.targetPeerId) {
      console.log(`[RemoteClient] 🌐 Connecting via WebRTC PeerJS to TV: ${this.targetPeerId}`);
      this.connectWebRTCPeer(this.targetPeerId);
    }
    if (!window.location.hostname.includes("github.io")) {
      this.tryWebSocket();
    }
  }
  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch (e) {
      }
      this.broadcastChannel = null;
    }
    this.setStatus("disconnected");
  }
  getStatus() {
    return this.status;
  }
  getLatestState() {
    return this.latestState;
  }
  subscribe(listener) {
    var _a, _b;
    this.listeners.add(listener);
    if (this.latestState) {
      (_a = listener.onStateUpdate) == null ? void 0 : _a.call(listener, this.latestState);
    }
    (_b = listener.onStatusChange) == null ? void 0 : _b.call(listener, this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }
  // ─── SEND COMMAND ──────────────────────────────────────────────────────────
  sendCommand(type, payload) {
    this.triggerHaptic(12);
    const cmd = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      payload,
      timestamp: Date.now()
    };
    let sent = false;
    if (this.peerConnection && this.peerConnection.open) {
      try {
        this.peerConnection.send({ type: "COMMAND", payload: cmd });
        sent = true;
      } catch (e) {
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = { type: "COMMAND", payload: cmd };
      this.ws.send(JSON.stringify(msg));
      sent = true;
    }
    if (this.broadcastChannel) {
      try {
        const msg = { type: "COMMAND", payload: cmd };
        this.broadcastChannel.postMessage(msg);
        sent = true;
      } catch (e) {
      }
    }
    if (!sent && !window.location.hostname.includes("github.io")) {
      this.sendHttpCommand(cmd);
    }
    return true;
  }
  triggerHaptic(durationMs = 15) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(durationMs);
      } catch (e) {
      }
    }
  }
  // ─── WEBRTC PEERJS CONNECTION ──────────────────────────────────────────────
  connectWebRTCPeer(targetId) {
    try {
      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {
        }
        this.peer = null;
      }
      const clientPeerId = `phone-${Math.random().toString(36).substring(2, 8)}`;
      const peer = new $dd0187d7f28e386f$export$2e2bcd8739ae039(clientPeerId, { debug: 0 });
      this.peer = peer;
      peer.on("open", () => {
        if (this.peer !== peer || this.isExplicitlyClosed) return;
        const conn = peer.connect(targetId, {
          reliable: true
        });
        this.setupPeerConnection(conn);
      });
      peer.on("disconnected", () => {
        if (!this.isExplicitlyClosed && this.peer === peer && !peer.destroyed) {
          this.scheduleReconnect();
        }
      });
      peer.on("error", () => {
        var _a;
        if (!this.isExplicitlyClosed && !((_a = this.peerConnection) == null ? void 0 : _a.open)) {
          this.scheduleReconnect();
        }
      });
    } catch (e) {
    }
  }
  setupPeerConnection(conn) {
    this.peerConnection = conn;
    conn.on("open", () => {
      console.log("[RemoteClient] 🟢 WebRTC DataChannel Connected directly to Kaira TV!");
      this.setStatus("connected");
      this.reconnectAttempts = 0;
      conn.send({ type: "REQUEST_STATE" });
    });
    conn.on("data", (data) => {
      if (data && data.type === "STATE_UPDATE" && data.payload) {
        this.handleStateUpdate(data.payload);
      }
    });
    conn.on("close", () => {
      console.warn("[RemoteClient] WebRTC DataChannel closed");
      if (!this.isExplicitlyClosed) {
        this.setStatus("reconnecting");
        setTimeout(() => {
          if (this.targetPeerId) this.connectWebRTCPeer(this.targetPeerId);
        }, 2e3);
      }
    });
    conn.on("error", (err) => {
      console.warn("[RemoteClient] WebRTC DataChannel error:", err);
    });
  }
  // ─── WEBSOCKET CONNECTION ──────────────────────────────────────────────────
  tryWebSocket() {
    if (this.isExplicitlyClosed || window.location.hostname.includes("github.io")) return;
    const wsProt = window.location.protocol === "https:" ? "wss:" : "ws:";
    const portsToTry = [this.serverPort, 3001, 3e3];
    const targetPort = portsToTry[Math.min(this.reconnectAttempts, portsToTry.length - 1)] || this.serverPort;
    const wsUrl = `${wsProt}//${this.serverHost}:${targetPort}/ws/remote`;
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        var _a;
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        (_a = this.ws) == null ? void 0 : _a.send(
          JSON.stringify({
            type: "IDENTIFY",
            payload: {
              deviceType: "mobile-web",
              userAgent: navigator.userAgent
            }
          })
        );
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "STATE_UPDATE" && msg.payload) {
            this.handleStateUpdate(msg.payload);
          }
        } catch (e) {
        }
      };
      this.ws.onerror = () => {
        this.trySSEFallback();
      };
      this.ws.onclose = () => {
        var _a;
        if (!this.isExplicitlyClosed && !((_a = this.peerConnection) == null ? void 0 : _a.open)) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.trySSEFallback();
    }
  }
  // ─── SSE FALLBACK ──────────────────────────────────────────────────────────
  trySSEFallback() {
    if (this.sse || this.isExplicitlyClosed || window.location.hostname.includes("github.io")) return;
    try {
      this.sse = new EventSource("/api/remote/events");
      this.sse.onopen = () => {
        this.setStatus("connected");
        this.reconnectAttempts = 0;
      };
      this.sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "STATE_UPDATE" && msg.payload) {
            this.handleStateUpdate(msg.payload);
          }
        } catch (e) {
        }
      };
      this.sse.onerror = () => {
        if (this.sse) {
          this.sse.close();
          this.sse = null;
        }
      };
    } catch (e) {
    }
  }
  // ─── HTTP COMMAND FALLBACK ─────────────────────────────────────────────────
  async sendHttpCommand(cmd) {
    if (window.location.hostname.includes("github.io")) return;
    try {
      await fetch("/api/remote/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd)
      });
    } catch (e) {
    }
  }
  // ─── BROADCAST CHANNEL FOR SAME-ORIGIN TABS ────────────────────────────────
  initBroadcastChannel() {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    try {
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.close();
        } catch (e) {
        }
        this.broadcastChannel = null;
      }
      this.broadcastChannel = new BroadcastChannel("tvos_remote_channel");
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        if (msg.type === "STATE_UPDATE" && msg.payload) {
          this.setStatus("connected");
          this.handleStateUpdate(msg.payload);
        }
      };
      this.broadcastChannel.postMessage({
        type: "IDENTIFY",
        payload: { deviceType: "browser-tab" }
      });
    } catch (e) {
    }
  }
  // ─── RECONNECT LOOP ────────────────────────────────────────────────────────
  scheduleReconnect() {
    if (this.isExplicitlyClosed || this.reconnectTimer) return;
    this.setStatus("reconnecting");
    this.reconnectAttempts++;
    const delay = Math.min(1e3 * Math.pow(1.5, this.reconnectAttempts), 8e3);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.targetPeerId) {
        this.connectWebRTCPeer(this.targetPeerId);
      }
      if (!window.location.hostname.includes("github.io")) {
        this.tryWebSocket();
      }
    }, delay);
  }
  handleStateUpdate(state) {
    this.latestState = state;
    this.listeners.forEach((l) => {
      var _a;
      return (_a = l.onStateUpdate) == null ? void 0 : _a.call(l, state);
    });
  }
  setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.listeners.forEach((l) => {
      var _a;
      return (_a = l.onStatusChange) == null ? void 0 : _a.call(l, newStatus);
    });
  }
}
const remoteClient = new RemoteClient();
const TouchpadRemote = ({ tvState }) => {
  var _a;
  const [controlMode, setControlMode] = reactExports.useState("clickpad");
  const [activeDir, setActiveDir] = reactExports.useState(null);
  const [ripples, setRipples] = reactExports.useState([]);
  const isMediaPlaying = ((_a = tvState == null ? void 0 : tvState.nowPlaying) == null ? void 0 : _a.isPlaying) || false;
  const touchStartRef = reactExports.useRef(null);
  const lastSwipeTimeRef = reactExports.useRef(0);
  const lastTapTimeRef = reactExports.useRef(0);
  const hasMovedRef = reactExports.useRef(false);
  const handleNav = (dir) => {
    remoteClient.triggerHaptic(12);
    const map = {
      up: "NAV_UP",
      down: "NAV_DOWN",
      left: "NAV_LEFT",
      right: "NAV_RIGHT"
    };
    remoteClient.sendCommand(map[dir]);
  };
  const handleSelect = () => {
    remoteClient.triggerHaptic(20);
    remoteClient.sendCommand("SELECT");
  };
  const handleBack = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("BACK");
  };
  const handleHome = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("HOME");
  };
  const handlePlayPause = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("PLAY_PAUSE");
  };
  const handleVolumeDelta = (delta) => {
    remoteClient.triggerHaptic(10);
    remoteClient.sendCommand("VOLUME_DELTA", { delta });
  };
  const handleTabDelta = (dir) => {
    remoteClient.triggerHaptic(10);
    remoteClient.sendCommand(dir === "prev" ? "TAB_PREV" : "TAB_NEXT");
  };
  const handleToggleMute = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("MUTE_TOGGLE");
  };
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    hasMovedRef.current = false;
    const rippleId = Date.now();
    setRipples((prev) => [...prev.slice(-3), { x, y, id: rippleId }]);
  };
  const handleTouchMove = (e) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dist = Math.hypot(dx, dy);
    const SWIPE_THRESHOLD = 30;
    const now = Date.now();
    if (dist >= SWIPE_THRESHOLD && now - lastSwipeTimeRef.current > 100) {
      hasMovedRef.current = true;
      lastSwipeTimeRef.current = now;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) handleNav("right");
        else handleNav("left");
      } else {
        if (dy > 0) handleNav("down");
        else handleNav("up");
      }
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: now };
    }
  };
  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    const now = Date.now();
    const duration = now - touchStartRef.current.time;
    if (!hasMovedRef.current && duration < 280) {
      if (now - lastTapTimeRef.current < 280) {
        handleBack();
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
        setTimeout(() => {
          if (lastTapTimeRef.current === now) {
            handleSelect();
          }
        }, 220);
      }
    }
    touchStartRef.current = null;
    hasMovedRef.current = false;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-remote-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-mode-pill", role: "tablist", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-mode-btn ${controlMode === "clickpad" ? "active" : ""}`,
          onClick: () => {
            setControlMode("clickpad");
            remoteClient.triggerHaptic(10);
          },
          children: "Clickpad"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-mode-btn ${controlMode === "touchpad" ? "active" : ""}`,
          onClick: () => {
            setControlMode("touchpad");
            remoteClient.triggerHaptic(10);
          },
          children: "Touch Surface"
        }
      )
    ] }),
    controlMode === "clickpad" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-clickpad-wheel", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-sector up ${activeDir === "up" ? "is-active" : ""}`,
          onClick: () => handleNav("up"),
          onPointerDown: () => setActiveDir("up"),
          onPointerUp: () => setActiveDir(null),
          onPointerLeave: () => setActiveDir(null),
          onPointerCancel: () => setActiveDir(null),
          "aria-label": "Up",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { size: 26, strokeWidth: 2.6, className: "ref-sector-glyph" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-sector down ${activeDir === "down" ? "is-active" : ""}`,
          onClick: () => handleNav("down"),
          onPointerDown: () => setActiveDir("down"),
          onPointerUp: () => setActiveDir(null),
          onPointerLeave: () => setActiveDir(null),
          onPointerCancel: () => setActiveDir(null),
          "aria-label": "Down",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 26, strokeWidth: 2.6, className: "ref-sector-glyph" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-sector left ${activeDir === "left" ? "is-active" : ""}`,
          onClick: () => handleNav("left"),
          onPointerDown: () => setActiveDir("left"),
          onPointerUp: () => setActiveDir(null),
          onPointerLeave: () => setActiveDir(null),
          onPointerCancel: () => setActiveDir(null),
          "aria-label": "Left",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { size: 26, strokeWidth: 2.6, className: "ref-sector-glyph" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-sector right ${activeDir === "right" ? "is-active" : ""}`,
          onClick: () => handleNav("right"),
          onPointerDown: () => setActiveDir("right"),
          onPointerUp: () => setActiveDir(null),
          onPointerLeave: () => setActiveDir(null),
          onPointerCancel: () => setActiveDir(null),
          "aria-label": "Right",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 26, strokeWidth: 2.6, className: "ref-sector-glyph" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-center-btn",
          onClick: handleSelect,
          "aria-label": "Select",
          children: "Select"
        }
      )
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "ref-touchpad-surface",
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        role: "region",
        "aria-label": "Touchpad Surface",
        children: [
          ripples.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "ref-touch-ripple",
              style: { left: r.x, top: r.y }
            },
            r.id
          )),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ref-crosshair-circle", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ref-crosshair-dot" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ref-touchpad-hint", children: "Swipe to Navigate • Tap to Select" })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-mid-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: handleBack,
          title: "Back",
          "aria-label": "Back",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { size: 24, strokeWidth: 2.4 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: handleHome,
          title: "Home",
          "aria-label": "Home",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(House, { size: 25, strokeWidth: 2.2 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: handlePlayPause,
          title: isMediaPlaying ? "Pause" : "Play",
          "aria-label": isMediaPlaying ? "Pause" : "Play",
          children: isMediaPlaying ? /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 22, fill: "currentColor" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 22, fill: "currentColor", style: { marginLeft: "2px" } })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-rocker-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-rocker-pill", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "ref-rocker-btn",
            onClick: () => handleVolumeDelta(0.05),
            title: "Volume Up",
            "aria-label": "Volume Up",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 24, strokeWidth: 2.6 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "ref-rocker-btn",
            onClick: () => handleVolumeDelta(-0.05),
            title: "Volume Down",
            "aria-label": "Volume Down",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { size: 24, strokeWidth: 2.6 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-mute-btn",
          onClick: handleToggleMute,
          title: "Mute Toggle",
          "aria-label": "Mute",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(VolumeX, { size: 26, strokeWidth: 2.2 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-rocker-pill", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "ref-rocker-btn",
            onClick: () => handleTabDelta("next"),
            title: "Channel / Tab Up",
            "aria-label": "Channel Up",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { size: 26, strokeWidth: 2.6 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "ref-rocker-btn",
            onClick: () => handleTabDelta("prev"),
            title: "Channel / Tab Down",
            "aria-label": "Channel Down",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 26, strokeWidth: 2.6 })
          }
        )
      ] })
    ] })
  ] });
};
function formatSeconds(sec) {
  if (isNaN(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM < 10 ? "0" : ""}${remM}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
const NowPlayingRemote = ({ tvState }) => {
  const media = tvState == null ? void 0 : tvState.nowPlaying;
  const [seekPos, setSeekPos] = reactExports.useState((media == null ? void 0 : media.positionSeconds) || 0);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const progressBarRef = reactExports.useRef(null);
  reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!isDragging && media) {
      setSeekPos(media.positionSeconds || 0);
    }
  }, [media == null ? void 0 : media.positionSeconds, isDragging]);
  const handlePlayPause = () => {
    remoteClient.triggerHaptic(20);
    remoteClient.sendCommand("PLAY_PAUSE");
  };
  const handleSeekRelative = (delta) => {
    remoteClient.triggerHaptic(12);
    remoteClient.sendCommand("SEEK_RELATIVE", { delta });
  };
  const handlePrev = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("PREV_TRACK");
  };
  const handleNext = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("NEXT_TRACK");
  };
  const handleShuffle = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("SHUFFLE_TOGGLE");
  };
  const handleRepeat = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("REPEAT_TOGGLE");
  };
  const handleSeekStart = (clientX) => {
    if (!progressBarRef.current || !media || !media.durationSeconds) return;
    setIsDragging(true);
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = ratio * media.durationSeconds;
    setSeekPos(target);
  };
  const handleSeekMove = (clientX) => {
    if (!isDragging || !progressBarRef.current || !media || !media.durationSeconds) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = ratio * media.durationSeconds;
    setSeekPos(target);
  };
  const handleSeekEnd = () => {
    if (isDragging && media) {
      setIsDragging(false);
      remoteClient.triggerHaptic(10);
      remoteClient.sendCommand("SEEK", { position: seekPos });
    }
  };
  const duration = (media == null ? void 0 : media.durationSeconds) || 0;
  const progressPercent = duration > 0 ? seekPos / duration * 100 : 0;
  const remainingSeconds = Math.max(0, duration - seekPos);
  const volumeLevel = Math.round(((tvState == null ? void 0 : tvState.volume) ?? 1) * 100);
  (tvState == null ? void 0 : tvState.isMuted) || volumeLevel === 0;
  if (!media) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-player-view", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ref-artwork-card", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Tv, { size: 48, strokeWidth: 1.5, color: "rgba(255,255,255,0.4)" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center", marginBottom: "auto" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { style: { fontSize: "18px", fontWeight: 600, margin: "0 0 4px 0", color: "#1c1d21" }, children: "Not Playing" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontSize: "13px", color: "#8e8e93", margin: 0, maxWidth: "240px" }, children: "Play a movie, show, or song on Kaira TV to control media here." })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-player-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ref-artwork-card", children: media.artwork ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: media.artwork,
        alt: media.title,
        className: "ref-artwork-img"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(Disc3, { size: 56, color: "rgba(255,255,255,0.4)", className: media.isPlaying ? "spin-icon" : "" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", padding: "0 8px", textAlign: "center" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "ref-player-title", children: media.title || "Untitled Media" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "ref-player-artist", children: media.artist || media.subtitle || media.album || "Kaira TV" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", padding: "0 4px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: progressBarRef,
          className: "ref-scrubber-track",
          onTouchStart: (e) => handleSeekStart(e.touches[0].clientX),
          onTouchMove: (e) => handleSeekMove(e.touches[0].clientX),
          onTouchEnd: handleSeekEnd,
          onMouseDown: (e) => {
            handleSeekStart(e.clientX);
            const onMove = (me) => handleSeekMove(me.clientX);
            const onUp = () => {
              handleSeekEnd();
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "ref-scrubber-fill",
              style: { width: `${progressPercent}%` }
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-timestamps", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatSeconds(seekPos) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: duration > 0 ? `-${formatSeconds(remainingSeconds)}` : "--:--" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-player-transport", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: () => handleSeekRelative(-15),
          title: "Rewind 15s",
          "aria-label": "Rewind 15 Seconds",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { size: 20 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: handlePrev,
          title: "Previous",
          "aria-label": "Previous Track",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(SkipBack, { size: 20, fill: "currentColor" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-play-btn",
          onClick: handlePlayPause,
          title: media.isPlaying ? "Pause" : "Play",
          "aria-label": media.isPlaying ? "Pause" : "Play",
          children: media.isPlaying ? /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 24, fill: "currentColor" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 24, fill: "currentColor", style: { marginLeft: "2px" } })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: handleNext,
          title: "Next",
          "aria-label": "Next Track",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(SkipForward, { size: 20, fill: "currentColor" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          onClick: () => handleSeekRelative(15),
          title: "Fast Forward 15s",
          "aria-label": "Fast Forward 15 Seconds",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCw, { size: 20 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "center", gap: "20px", marginTop: "12px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          style: {
            width: "36px",
            height: "36px",
            color: media.isShuffle ? "#4285f4" : "rgba(255, 255, 255, 0.6)",
            background: media.isShuffle ? "rgba(66, 133, 244, 0.2)" : "rgba(255, 255, 255, 0.08)"
          },
          onClick: handleShuffle,
          title: "Toggle Shuffle",
          "aria-label": "Toggle Shuffle",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Shuffle, { size: 16 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-circle-btn",
          style: {
            width: "36px",
            height: "36px",
            color: media.repeatMode && media.repeatMode !== "off" ? "#4285f4" : "rgba(255, 255, 255, 0.6)",
            background: media.repeatMode && media.repeatMode !== "off" ? "rgba(66, 133, 244, 0.2)" : "rgba(255, 255, 255, 0.08)"
          },
          onClick: handleRepeat,
          title: `Repeat: ${(media.repeatMode || "off").toUpperCase()}`,
          "aria-label": "Toggle Repeat",
          children: media.repeatMode === "one" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Repeat1, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Repeat, { size: 16 })
        }
      )
    ] })
  ] });
};
const CompanionRemoteApp = () => {
  const [activeView, setActiveView] = reactExports.useState("touchpad");
  const [connectionStatus, setConnectionStatus] = reactExports.useState("connecting");
  const [tvState, setTvState] = reactExports.useState(null);
  const [toastMessage, setToastMessage] = reactExports.useState(null);
  reactExports.useEffect(() => {
    document.title = "Kaira Remote";
    remoteClient.connect();
    const unsubscribe = remoteClient.subscribe({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          showToast("🟢 Connected to Kaira TV");
        } else if (status === "disconnected") {
          showToast("🔴 Disconnected");
        }
      },
      onStateUpdate: (state) => {
        setTvState(state);
      },
      onToast: (msg) => {
        showToast(msg);
      }
    });
    return () => {
      unsubscribe();
      remoteClient.disconnect();
    };
  }, []);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => prev === msg ? null : prev);
    }, 2800);
  };
  const handlePower = () => {
    remoteClient.triggerHaptic(20);
    if (confirm("Put Kaira TV to sleep / start screensaver?")) {
      remoteClient.sendCommand("TRIGGER_SCREENSAVER");
    }
  };
  const handleSource = () => {
    remoteClient.triggerHaptic(15);
    remoteClient.sendCommand("QUICK_SETTINGS");
  };
  const tvDisplayName = (tvState == null ? void 0 : tvState.tvName) || "Bedroom TV";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "kaira-remote-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "ref-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-power-btn",
          onClick: handlePower,
          title: "Power / Sleep",
          "aria-label": "Power",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Power, { size: 20, strokeWidth: 2.3 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ref-device-pill", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Tv, { size: 16, strokeWidth: 2.2 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: tvDisplayName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `ref-conn-dot ${connectionStatus === "connected" ? "connected" : "connecting"}` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "ref-header-action-btn",
          onClick: handleSource,
          title: "Inputs / Source",
          "aria-label": "Inputs",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(LogOut, { size: 20, strokeWidth: 2.2, style: { transform: "rotate(180deg)" } })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "ref-body", children: activeView === "touchpad" ? /* @__PURE__ */ jsxRuntimeExports.jsx(TouchpadRemote, { tvState }) : /* @__PURE__ */ jsxRuntimeExports.jsx(NowPlayingRemote, { tvState }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "ref-dock", role: "navigation", "aria-label": "Dock Navigation", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-dock-tab ${activeView === "touchpad" ? "active" : ""}`,
          onClick: () => {
            setActiveView("touchpad");
            remoteClient.triggerHaptic(10);
          },
          title: "Remote",
          "aria-label": "Remote",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(House, { size: 18, strokeWidth: 2.2 })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `ref-dock-tab ${activeView === "now-playing" ? "active" : ""}`,
          onClick: () => {
            setActiveView("now-playing");
            remoteClient.triggerHaptic(10);
          },
          title: "Media / Now Playing",
          "aria-label": "Now Playing",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { size: 18, strokeWidth: 2.2 })
        }
      )
    ] }),
    toastMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "remote-toast-pill", role: "status", children: toastMessage })
  ] });
};
export {
  CompanionRemoteApp,
  CompanionRemoteApp as default
};
