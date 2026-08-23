import { soundEffectsService } from '../audio/soundEffectsService';

export interface SpatialNode {
  id: string;
  element: HTMLElement;
  groupId?: string; // e.g. "top-nav", "hero-actions", "rail-movies-trending", "player-hud-transport"
  indexInGroup?: number;
  priority?: number;
  autoFocus?: boolean;
  onSelect?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavScope {
  id: string;
  element?: HTMLElement | null;
}

class SpatialNavigationEngine {
  private nodes: Map<string, SpatialNode> = new Map();
  private currentFocusedId: string | null = null;
  private groupMemory: Map<string, string> = new Map(); // Remembers last focused node per groupId
  private listeners: Set<(focusedId: string | null) => void> = new Set();
  private scopeStack: NavScope[] = [];
  private isEnabled: boolean = true;

  // ─── REGISTRATION & LIFECYCLE ──────────────────────────────────────────────

  public register(node: SpatialNode): () => void {
    this.nodes.set(node.id, node);

    // If autoFocus requested or initial state
    if (node.autoFocus || (!this.currentFocusedId && (node.groupId === 'top-nav' || node.priority))) {
      setTimeout(() => {
        if (this.nodes.has(node.id) && this.isElementVisible(node.element)) {
          const activeScope = this.getActiveScope();
          if (!activeScope || activeScope.contains(node.element)) {
            this.setFocus(node.id, true);
          }
        }
      }, 30);
    }

    return () => {
      this.unregister(node.id);
    };
  }

  public unregister(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      if (this.currentFocusedId === id) {
        this.currentFocusedId = null;
        setTimeout(() => {
          if (!this.currentFocusedId) {
            this.fallbackFocus();
          }
        }, 16);
      }
      this.nodes.delete(id);
    }
  }

  // ─── SCOPE STACK (MODALS, OVERLAYS, PLAYER) ────────────────────────────────

  public pushScope(id: string, element?: HTMLElement | null): void {
    this.scopeStack = this.scopeStack.filter((s) => s.id !== id);
    this.scopeStack.push({ id, element });
    console.log(`[SpatialNav] Pushed scope: ${id} (depth: ${this.scopeStack.length})`);
    setTimeout(() => this.fallbackFocus(), 20);
  }

  public popScope(id: string): void {
    this.scopeStack = this.scopeStack.filter((s) => s.id !== id);
    console.log(`[SpatialNav] Popped scope: ${id} (remaining: ${this.scopeStack.length})`);
    setTimeout(() => this.fallbackFocus(), 20);
  }

  public getActiveScope(): HTMLElement | null {
    // 1. Explicit Scope Stack
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const s = this.scopeStack[i];
      if (s.element && s.element.isConnected && this.isElementVisible(s.element)) {
        return s.element;
      }
    }

    // 2. Fallback DOM Modal Detection
    const modalSelectors = [
      '.tv-player-menu-backdrop',
      '.tv-stream-modal-backdrop',
      '.tv-profile-modal-backdrop',
      '.tv-sleep-modal-backdrop',
      '.tv-search-screen',
      '.tv-settings-screen',
      '.tv-video-player-container',
      '[role="dialog"]',
      '[role="alertdialog"]',
    ];

    for (const sel of modalSelectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && this.isElementVisible(el)) {
        return el;
      }
    }

    return null;
  }

  // ─── FOCUS MANAGEMENT ──────────────────────────────────────────────────────

  public getFocusedId(): string | null {
    return this.currentFocusedId;
  }

  public getFocusedNode(): SpatialNode | null {
    if (!this.currentFocusedId) return null;
    return this.nodes.get(this.currentFocusedId) || null;
  }

  public setFocus(id: string, triggerScroll: boolean = true): boolean {
    if (!this.isEnabled) return false;
    this.pruneDeadNodes();

    const node = this.nodes.get(id);
    if (!node || !node.element || !this.isElementVisible(node.element)) return false;

    // Check scope containment
    const activeScope = this.getActiveScope();
    if (activeScope && !activeScope.contains(node.element)) {
      return false;
    }

    // Blur previous node
    if (this.currentFocusedId && this.currentFocusedId !== id) {
      const oldNode = this.nodes.get(this.currentFocusedId);
      if (oldNode?.onBlur) {
        oldNode.onBlur();
      }
    }

    const prevId = this.currentFocusedId;
    this.currentFocusedId = id;

    // Save group column memory
    if (node.groupId) {
      this.groupMemory.set(node.groupId, id);
    }

    // Play tick sound on change
    if (prevId !== id) {
      soundEffectsService.playFocusTick();
    }

    // Trigger focus callback
    if (node.onFocus) {
      node.onFocus();
    }

    // Focus DOM element safely without window jump
    try {
      node.element.focus({ preventScroll: true });
    } catch (e) {}

    // TV Viewport Auto-Scroll
    if (triggerScroll) {
      this.scrollIntoView(node.element);
    }

    this.notifyListeners();
    return true;
  }

  public triggerSelect(): void {
    if (!this.currentFocusedId) {
      this.fallbackFocus();
      return;
    }

    const node = this.nodes.get(this.currentFocusedId);
    if (node && this.isElementVisible(node.element)) {
      soundEffectsService.playSelectChime();
      if (node.onSelect) {
        node.onSelect();
      } else {
        node.element.click();
      }
    } else {
      this.fallbackFocus();
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public subscribe(listener: (focusedId: string | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentFocusedId);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const cur = this.currentFocusedId;
    this.listeners.forEach((fn) => fn(cur));
  }

  // ─── CORE NAVIGATION RESOLVER ──────────────────────────────────────────────

  public navigate(direction: Direction): boolean {
    if (!this.isEnabled || this.nodes.size === 0) return false;
    this.pruneDeadNodes();

    const activeScope = this.getActiveScope();

    // Get all valid active candidate nodes
    const validCandidates = Array.from(this.nodes.values()).filter((n) => {
      if (!this.isElementVisible(n.element)) return false;
      if (activeScope && !activeScope.contains(n.element)) return false;
      return true;
    });

    if (validCandidates.length === 0) return false;

    const currentNode = this.currentFocusedId ? this.nodes.get(this.currentFocusedId) : null;

    // If current focus is invalid or outside scope -> fallback
    if (!currentNode || !this.isElementVisible(currentNode.element) || (activeScope && !activeScope.contains(currentNode.element))) {
      return this.fallbackFocus(validCandidates);
    }

    const currentRect = currentNode.element.getBoundingClientRect();

    // ── 1. HORIZONTAL NAVIGATION (Left / Right) ──────────────────────────────
    if (direction === 'left' || direction === 'right') {
      // Step A: If inside a structured group (rail, tabs, player transport)
      if (currentNode.groupId) {
        const groupNodes = validCandidates
          .filter((n) => n.groupId === currentNode.groupId)
          .sort((a, b) => {
            if (a.indexInGroup !== undefined && b.indexInGroup !== undefined) {
              return a.indexInGroup - b.indexInGroup;
            }
            return a.element.getBoundingClientRect().left - b.element.getBoundingClientRect().left;
          });

        const curIdx = groupNodes.findIndex((n) => n.id === currentNode.id);
        if (curIdx >= 0) {
          const targetIdx = curIdx + (direction === 'right' ? 1 : -1);
          if (targetIdx >= 0 && targetIdx < groupNodes.length) {
            return this.setFocus(groupNodes[targetIdx].id, true);
          }
        }
      }

      // Step B: Geometric Line-of-Sight search in horizontal corridor
      let bestHorizontal: SpatialNode | null = null;
      let minHScore = Infinity;

      for (const node of validCandidates) {
        if (node.id === currentNode.id) continue;
        const r = node.element.getBoundingClientRect();

        const isInHCorridor =
          direction === 'right' ? r.left >= currentRect.left + 5 : r.right <= currentRect.right - 5;

        if (isInHCorridor) {
          const dx = direction === 'right' ? r.left - currentRect.right : currentRect.left - r.right;
          const dy = Math.abs((r.top + r.height / 2) - (currentRect.top + currentRect.height / 2));
          // Heavy vertical penalty to keep focus on the same horizontal row
          const score = Math.max(0, dx) + dy * 3.5;
          if (score < minHScore) {
            minHScore = score;
            bestHorizontal = node;
          }
        }
      }

      if (bestHorizontal) {
        return this.setFocus(bestHorizontal.id, true);
      }
      return false;
    }

    // ── 2. VERTICAL NAVIGATION (Up / Down) ──────────────────────────────────
    let bestVertical: SpatialNode | null = null;
    let minVScore = Infinity;

    // Find all nodes in the vertical direction
    const verticalCandidates = validCandidates.filter((node) => {
      if (node.id === currentNode.id) return false;
      const r = node.element.getBoundingClientRect();
      return direction === 'down' ? r.top >= currentRect.top + 10 : r.bottom <= currentRect.bottom - 10;
    });

    if (verticalCandidates.length === 0) {
      // If moving UP from top rail and TopNav is in scope, focus TopNav
      if (direction === 'up' && !activeScope) {
        const topNavNode = validCandidates.find((n) => n.groupId === 'top-nav');
        if (topNavNode && topNavNode.id !== currentNode.id) {
          return this.setFocus(topNavNode.id, true);
        }
      }
      return false;
    }

    // Group vertical candidates by groupId to check group column memory
    const candidatesByGroup = new Map<string, SpatialNode[]>();
    for (const node of verticalCandidates) {
      const gid = node.groupId || 'ungrouped';
      if (!candidatesByGroup.has(gid)) candidatesByGroup.set(gid, []);
      candidatesByGroup.get(gid)!.push(node);
    }

    // Step A: Check if closest group has remembered focus column
    for (const [gid, gNodes] of candidatesByGroup.entries()) {
      if (gid !== 'ungrouped' && this.groupMemory.has(gid)) {
        const rememberedId = this.groupMemory.get(gid);
        const rememberedNode = gNodes.find((n) => n.id === rememberedId);
        if (rememberedNode) {
          const r = rememberedNode.element.getBoundingClientRect();
          const dy = direction === 'down' ? r.top - currentRect.bottom : currentRect.top - r.bottom;
          const dx = Math.abs((r.left + r.width / 2) - (currentRect.left + currentRect.width / 2));
          const score = Math.max(0, dy) + dx * 1.5;
          if (score < minVScore) {
            minVScore = score;
            bestVertical = rememberedNode;
          }
        }
      }
    }

    // Step B: Geometric line-of-sight distance search
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    for (const node of verticalCandidates) {
      const r = node.element.getBoundingClientRect();
      const nodeCenterX = r.left + r.width / 2;
      const nodeCenterY = r.top + r.height / 2;

      const dy = direction === 'down' ? r.top - currentRect.bottom : currentRect.top - r.bottom;
      const dx = Math.abs(nodeCenterX - currentCenterX);

      // Penalize horizontal misalignment
      const score = Math.max(0, dy) + dx * 2.0;

      if (score < minVScore) {
        minVScore = score;
        bestVertical = node;
      }
    }

    if (bestVertical) {
      return this.setFocus(bestVertical.id, true);
    }

    return false;
  }

  // ─── FALLBACK & AUTO-RECOVERY ──────────────────────────────────────────────

  public fallbackFocus(candidates?: SpatialNode[]): boolean {
    this.pruneDeadNodes();
    const activeScope = this.getActiveScope();
    const list = candidates || Array.from(this.nodes.values());

    const valid = list.filter((n) => {
      if (!this.isElementVisible(n.element)) return false;
      if (activeScope && !activeScope.contains(n.element)) return false;
      return true;
    });

    if (valid.length === 0) return false;

    // Prefer high priority, modal items, player items, or top-nav
    const preferred =
      valid.find((n) => n.autoFocus) ||
      valid.find((n) => n.priority) ||
      valid.find((n) => n.groupId === 'player-hud-transport') ||
      valid.find((n) => n.groupId === 'top-nav') ||
      valid[0];

    if (preferred) {
      return this.setFocus(preferred.id, true);
    }
    return false;
  }

  // ─── DOM UTILITIES & AUTO-SCROLL ───────────────────────────────────────────

  public isElementVisible(el: HTMLElement): boolean {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private pruneDeadNodes(): void {
    for (const [id, node] of this.nodes.entries()) {
      if (!node.element || !node.element.isConnected) {
        this.nodes.delete(id);
      }
    }
  }

  private scrollIntoView(element: HTMLElement): void {
    // 1. Horizontal Rail Carousel Scroll
    const railScroll = element.closest<HTMLElement>('.tv-horizontal-scroll');
    if (railScroll) {
      const railRect = railScroll.getBoundingClientRect();
      const elRect = element.getBoundingClientRect();

      const targetLeft = railScroll.scrollLeft + (elRect.left - railRect.left) - 96;
      railScroll.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });
    }

    // 2. Vertical Page Viewport Scroll
    const pageScroll = element.closest<HTMLElement>('.tv-scroll-container') || document.querySelector<HTMLElement>('.tv-main-viewport');
    if (pageScroll) {
      const pageRect = pageScroll.getBoundingClientRect();
      const elRect = element.getBoundingClientRect();

      // Position focused card row comfortably in upper third (28% from top)
      const idealOffset = pageRect.height * 0.28;
      const targetTop = pageScroll.scrollTop + (elRect.top - pageRect.top) - idealOffset;

      pageScroll.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
    }
  }
}

export const spatialNav = new SpatialNavigationEngine();
