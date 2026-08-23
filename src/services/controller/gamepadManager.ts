import { spatialNav, Direction } from '../spatialNav/spatialNavEngine';
import { SemanticControllerAction } from '../../platform/types';

export interface GamepadActionDiagnostic {
  raw: string;
  normalized: SemanticControllerAction;
  uiAction: string;
  timestamp: number;
}

export interface GamepadCallbacks {
  onBack?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
  onMenu?: () => void; // Quick Settings
  onSubtitles?: () => void;
  onTabPrev?: () => void;
  onTabNext?: () => void;
  onGamepadStatusChange?: (connected: boolean, id: string) => void;
  onAction?: (action: SemanticControllerAction) => void;
}

class GamepadManager {
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private callbacks: GamepadCallbacks = {};
  private actionListeners: Set<(event: GamepadActionDiagnostic) => void> = new Set();

  // Timing & Hold-to-Repeat State
  private lastNavTime: number = 0;
  private currentHeldDirection: Direction | null = null;
  private holdStartTime: number = 0;
  private lastGamepadInputTime: number = 0;

  // Previous button press states (keyed by gamepad index)
  private prevButtonStates: Map<number, boolean[]> = new Map();

  // Deadzone & Timing Constants
  private readonly STICK_DEADZONE = 0.42;
  private readonly INITIAL_REPEAT_DELAY = 350; // ms before hold starts repeating
  private readonly REPEAT_INTERVAL = 130;       // ms between consecutive steps while held

  public isGamepadActive(thresholdMs: number = 3000): boolean {
    return Date.now() - this.lastGamepadInputTime < thresholdMs;
  }

  public init(callbacks: GamepadCallbacks): () => void {
    this.callbacks = callbacks;
    this.isRunning = true;

    // Window Gamepad Connection Events
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    // Centralized Keyboard Navigation
    window.addEventListener('keydown', this.handleKeyDown);

    // Start 60fps Gamepad Polling Loop
    this.startPollingLoop();

    return () => {
      this.destroy();
    };
  }

  public setCallbacks(callbacks: GamepadCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public subscribeAction(listener: (event: GamepadActionDiagnostic) => void): () => void {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  }

  private dispatchAction(raw: string, normalized: SemanticControllerAction, uiAction: string) {
    const diag: GamepadActionDiagnostic = {
      raw,
      normalized,
      uiAction,
      timestamp: Date.now(),
    };
    this.callbacks.onAction?.(normalized);
    this.actionListeners.forEach((fn) => fn(diag));
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleGamepadConnected = (e: GamepadEvent) => {
    console.log('[GamepadManager] Gamepad Connected:', e.gamepad.id, 'index:', e.gamepad.index);
    this.callbacks.onGamepadStatusChange?.(true, e.gamepad.id);
  };

  private handleGamepadDisconnected = (e: GamepadEvent) => {
    console.log('[GamepadManager] Gamepad Disconnected:', e.gamepad.id);
    this.prevButtonStates.delete(e.gamepad.index);
    this.callbacks.onGamepadStatusChange?.(false, e.gamepad.id);
  };

  // ─── KEYBOARD DISPATCHER ───────────────────────────────────────────────────

  private handleKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    // Tab key: map to spatial navigation
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? 'left' : 'right';
      this.dispatchAction(`Keyboard: Tab${e.shiftKey ? '+Shift' : ''}`, dir === 'left' ? 'NAV_LEFT' : 'NAV_RIGHT', `Move focus ${dir}`);
      spatialNav.navigate(dir);
      return;
    }

    // Inside text inputs (search bar, text boxes)
    if (isInput && e.key !== 'Escape') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const dir = e.key === 'ArrowDown' ? 'down' : 'up';
        this.dispatchAction(`Keyboard: ${e.key}`, dir === 'down' ? 'NAV_DOWN' : 'NAV_UP', `Move focus ${dir}`);
        spatialNav.navigate(dir);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.dispatchAction('Keyboard: ArrowUp', 'NAV_UP', 'Move focus up');
        spatialNav.navigate('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.dispatchAction('Keyboard: ArrowDown', 'NAV_DOWN', 'Move focus down');
        spatialNav.navigate('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.dispatchAction('Keyboard: ArrowLeft', 'NAV_LEFT', 'Move focus left');
        spatialNav.navigate('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.dispatchAction('Keyboard: ArrowRight', 'NAV_RIGHT', 'Move focus right');
        spatialNav.navigate('right');
        break;
      case 'Enter':
        e.preventDefault();
        this.dispatchAction('Keyboard: Enter', 'SELECT', 'Trigger focused element');
        spatialNav.triggerSelect();
        break;
      case ' ':
        // Space is reserved for Play/Pause in the video player.
        // Only trigger select when NOT in the video player screen.
        if (!(document.querySelector('.tv-player-screen') || document.querySelector('.tv-player-hud'))) {
          e.preventDefault();
          this.dispatchAction('Keyboard: Space', 'SELECT', 'Trigger focused element');
          spatialNav.triggerSelect();
        }
        break;
      case 'Escape':
      case 'Backspace':
        e.preventDefault();
        this.dispatchAction(`Keyboard: ${e.key}`, 'BACK', 'Navigate back / dismiss modal');
        this.callbacks.onBack?.();
        break;
      case 'm':
      case 'M':
        if (!isInput) {
          e.preventDefault();
          this.dispatchAction('Keyboard: M', 'MENU', 'Toggle Quick Settings modal');
          if (this.callbacks.onMenu) this.callbacks.onMenu();
          else this.callbacks.onSettings?.();
        }
        break;
      case 'q':
      case 'Q':
      case '[':
        if (!isInput) {
          e.preventDefault();
          this.dispatchAction(`Keyboard: ${e.key}`, 'TAB_PREV', 'Switch to previous tab');
          this.callbacks.onTabPrev?.();
        }
        break;
      case 'e':
      case 'E':
      case ']':
        if (!isInput) {
          e.preventDefault();
          this.dispatchAction(`Keyboard: ${e.key}`, 'TAB_NEXT', 'Switch to next tab');
          this.callbacks.onTabNext?.();
        }
        break;
      case 'y':
      case 'Y':
      case '/':
        if (!isInput) {
          e.preventDefault();
          this.dispatchAction(`Keyboard: ${e.key}`, 'SEARCH', 'Open global search');
          this.callbacks.onSearch?.();
        }
        break;
    }
  };

  // ─── 60FPS GAMEPAD POLLING LOOP ────────────────────────────────────────────

  private startPollingLoop(): void {
    const poll = () => {
      if (!this.isRunning) return;

      try {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let anyGamepadActive = false;

        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (gp && gp.connected) {
            anyGamepadActive = true;
            this.processGamepad(gp);
          }
        }

        if (anyGamepadActive) {
          this.lastGamepadInputTime = Date.now();
        }
      } catch (err) {
        console.warn('[GamepadManager] Polling tick notice:', err);
      }

      this.animationFrameId = requestAnimationFrame(poll);
    };

    this.animationFrameId = requestAnimationFrame(poll);
  }

  private processGamepad(gp: Gamepad): void {
    const prev = this.prevButtonStates.get(gp.index) || new Array(gp.buttons.length).fill(false);
    const curr = gp.buttons.map((b) => b.pressed);

    const isJustPressed = (btnIdx: number): boolean => {
      return Boolean(curr[btnIdx] && !prev[btnIdx]);
    };

    // ── 1. Action Buttons (Standard Xbox Layout) ─────────────────────────────
    // Button 0: A / Cross -> Select
    if (isJustPressed(0)) {
      this.dispatchAction('Xbox: Button A', 'SELECT', 'Trigger focused element');
      spatialNav.triggerSelect();
    }

    // Button 1: B / Circle -> Back / Dismiss
    if (isJustPressed(1)) {
      this.dispatchAction('Xbox: Button B', 'BACK', 'Navigate back / dismiss modal');
      this.callbacks.onBack?.();
    }

    // Button 2: X / Square -> Search / Secondary Action
    if (isJustPressed(2)) {
      this.dispatchAction('Xbox: Button X', 'SEARCH', 'Open search overlay');
      this.callbacks.onSearch?.();
    }

    // Button 3: Y / Triangle -> Settings / Subtitles
    if (isJustPressed(3)) {
      this.dispatchAction('Xbox: Button Y', 'SUBTITLES', 'Toggle subtitles / quick action');
      this.callbacks.onSubtitles?.();
    }

    // Button 4: LB (Left Bumper) -> Previous Tab / Rewind
    if (isJustPressed(4)) {
      this.dispatchAction('Xbox: Left Bumper (LB)', 'TAB_PREV', 'Switch to previous tab');
      this.callbacks.onTabPrev?.();
    }

    // Button 5: RB (Right Bumper) -> Next Tab / FastForward
    if (isJustPressed(5)) {
      this.dispatchAction('Xbox: Right Bumper (RB)', 'TAB_NEXT', 'Switch to next tab');
      this.callbacks.onTabNext?.();
    }

    // Button 6: LT (Left Trigger) -> Seek Backward
    if (isJustPressed(6)) {
      this.dispatchAction('Xbox: Left Trigger (LT)', 'SEEK_BACKWARD', 'Seek backward 10s');
    }

    // Button 7: RT (Right Trigger) -> Seek Forward
    if (isJustPressed(7)) {
      this.dispatchAction('Xbox: Right Trigger (RT)', 'SEEK_FORWARD', 'Seek forward 10s');
    }

    // Button 8: View / Select -> Search
    if (isJustPressed(8)) {
      this.dispatchAction('Xbox: View Button', 'SEARCH', 'Open search overlay');
      this.callbacks.onSearch?.();
    }

    // Button 9: Menu / Start -> Quick Settings Drawer
    if (isJustPressed(9)) {
      this.dispatchAction('Xbox: Menu Button', 'MENU', 'Open Quick Settings modal');
      if (this.callbacks.onMenu) {
        this.callbacks.onMenu();
      } else {
        this.callbacks.onSettings?.();
      }
    }

    // ── 2. Directional Input (D-Pad & Left Stick with Hold-to-Repeat) ─────────
    const dpadUp = Boolean(curr[12]);
    const dpadDown = Boolean(curr[13]);
    const dpadLeft = Boolean(curr[14]);
    const dpadRight = Boolean(curr[15]);

    const stickX = gp.axes && gp.axes.length > 0 ? gp.axes[0] : 0;
    const stickY = gp.axes && gp.axes.length > 1 ? gp.axes[1] : 0;

    let activeDir: Direction | null = null;
    let inputSource = 'D-Pad';

    if (dpadUp || stickY < -this.STICK_DEADZONE) {
      activeDir = 'up';
      inputSource = dpadUp ? 'Xbox: D-Pad Up' : 'Xbox: Left Stick Up';
    } else if (dpadDown || stickY > this.STICK_DEADZONE) {
      activeDir = 'down';
      inputSource = dpadDown ? 'Xbox: D-Pad Down' : 'Xbox: Left Stick Down';
    } else if (dpadLeft || stickX < -this.STICK_DEADZONE) {
      activeDir = 'left';
      inputSource = dpadLeft ? 'Xbox: D-Pad Left' : 'Xbox: Left Stick Left';
    } else if (dpadRight || stickX > this.STICK_DEADZONE) {
      activeDir = 'right';
      inputSource = dpadRight ? 'Xbox: D-Pad Right' : 'Xbox: Left Stick Right';
    }

    const now = Date.now();

    if (activeDir) {
      const semanticAction: SemanticControllerAction =
        activeDir === 'up' ? 'NAV_UP' : activeDir === 'down' ? 'NAV_DOWN' : activeDir === 'left' ? 'NAV_LEFT' : 'NAV_RIGHT';

      if (this.currentHeldDirection !== activeDir) {
        this.currentHeldDirection = activeDir;
        this.holdStartTime = now;
        this.lastNavTime = now;
        this.dispatchAction(inputSource, semanticAction, `Move focus ${activeDir}`);
        spatialNav.navigate(activeDir);
      } else {
        const heldDuration = now - this.holdStartTime;
        if (heldDuration > this.INITIAL_REPEAT_DELAY) {
          if (now - this.lastNavTime > this.REPEAT_INTERVAL) {
            this.lastNavTime = now;
            this.dispatchAction(`${inputSource} (Hold Repeat)`, semanticAction, `Repeat focus ${activeDir}`);
            spatialNav.navigate(activeDir);
          }
        }
      }
    } else {
      this.currentHeldDirection = null;
    }

    this.prevButtonStates.set(gp.index, curr);
  }
}

export const gamepadManager = new GamepadManager();
