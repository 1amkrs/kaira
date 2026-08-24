import { 
  UserProfile, 
  ProfileServiceState, 
  CreateProfileDTO, 
  UpdateProfileDTO,
  PinMemoryPolicy,
  ProfileMemoryData,
  WatchHistoryEntry 
} from '../../types/profile';

const STORAGE_PROFILES_KEY = 'tv_user_profiles';
const STORAGE_ACTIVE_PROFILE_KEY = 'tv_active_profile_id';
const STORAGE_PROMPT_ON_LAUNCH_KEY = 'tv_profile_prompt_on_launch';
const STORAGE_PIN_POLICY_KEY = 'tv_pin_memory_policy';
const STORAGE_REMEMBER_LAST_TAB_KEY = 'tv_remember_last_tab';
const STORAGE_DEVICE_UNLOCKED_KEY = 'tv_device_unlocked_profiles';

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'prof-primary',
    name: 'Primary (Living Room)',
    avatarColor: 'linear-gradient(135deg, #e50914, #ff453a)',
    avatarIcon: 'user',
    type: 'adult',
    badge: 'Full Access',
    createdAt: Date.now(),
  },
  {
    id: 'prof-kids',
    name: 'Kids Profile',
    avatarColor: 'linear-gradient(135deg, #ff453a, #fbbc04)',
    avatarIcon: 'baby',
    type: 'kids',
    badge: 'Family Friendly',
    isKid: true,
    createdAt: Date.now() + 1,
  },
  {
    id: 'prof-guest',
    name: 'Guest Mode',
    avatarColor: 'linear-gradient(135deg, #34a853, #81c995)',
    avatarIcon: 'sparkles',
    type: 'guest',
    badge: 'Incognito History',
    createdAt: Date.now() + 2,
  },
];

export const AVATAR_COLOR_PALETTES = [
  'linear-gradient(135deg, #e50914, #ff453a)', // Cinema Red
  'linear-gradient(135deg, #ea4335, #f28b82)', // Red
  'linear-gradient(135deg, #34a853, #81c995)', // Green
  'linear-gradient(135deg, #fbbc04, #fdd663)', // Yellow / Gold
  'linear-gradient(135deg, #9334e8, #c58af9)', // Purple
  'linear-gradient(135deg, #e8710a, #fcad70)', // Orange
  'linear-gradient(135deg, #12b5cb, #78d9ec)', // Cyan
  'linear-gradient(135deg, #e52592, #ff8bcb)', // Pink
  'linear-gradient(135deg, #202124, #5f6368)', // Midnight Dark
];

class ProfileService {
  private profiles: UserProfile[] = [];
  private activeProfileId: string = 'prof-primary';
  private promptOnLaunch: boolean = false;
  private pinMemoryPolicy: PinMemoryPolicy = 'session';
  private rememberLastTab: boolean = true;
  private unlockedProfileIds: Set<string> = new Set();
  private listeners: Set<(state: ProfileServiceState) => void> = new Set();

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const storedProfiles = localStorage.getItem(STORAGE_PROFILES_KEY);
      if (storedProfiles) {
        this.profiles = JSON.parse(storedProfiles);
      } else {
        this.profiles = [...DEFAULT_PROFILES];
        this.saveProfiles();
      }

      const storedActiveId = localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY);
      if (storedActiveId && this.profiles.some((p) => p.id === storedActiveId)) {
        this.activeProfileId = storedActiveId;
      } else {
        this.activeProfileId = this.profiles[0]?.id || 'prof-primary';
        localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, this.activeProfileId);
      }

      const storedPrompt = localStorage.getItem(STORAGE_PROMPT_ON_LAUNCH_KEY);
      this.promptOnLaunch = storedPrompt === 'true';

      const storedPolicy = localStorage.getItem(STORAGE_PIN_POLICY_KEY) as PinMemoryPolicy;
      if (storedPolicy === 'always' || storedPolicy === 'session' || storedPolicy === 'device') {
        this.pinMemoryPolicy = storedPolicy;
      } else {
        this.pinMemoryPolicy = 'session';
      }

      const storedRememberTab = localStorage.getItem(STORAGE_REMEMBER_LAST_TAB_KEY);
      this.rememberLastTab = storedRememberTab !== 'false';

      // Load persistent device-remembered unlocked profiles if policy is 'device'
      if (this.pinMemoryPolicy === 'device') {
        const storedDeviceUnlocks = localStorage.getItem(STORAGE_DEVICE_UNLOCKED_KEY);
        if (storedDeviceUnlocks) {
          const list: string[] = JSON.parse(storedDeviceUnlocks);
          this.unlockedProfileIds = new Set(list);
        }
      }

      // Initial active profile is automatically unlocked in session
      const activeProf = this.getActiveProfile();
      if (activeProf && !activeProf.pin) {
        this.unlockedProfileIds.add(activeProf.id);
      }
    } catch (e) {
      this.profiles = [...DEFAULT_PROFILES];
      this.activeProfileId = 'prof-primary';
    }
  }

  private saveProfiles() {
    try {
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(this.profiles));
    } catch (e) {}
  }

  private saveDeviceUnlocked() {
    try {
      if (this.pinMemoryPolicy === 'device') {
        localStorage.setItem(
          STORAGE_DEVICE_UNLOCKED_KEY,
          JSON.stringify(Array.from(this.unlockedProfileIds))
        );
      } else {
        localStorage.removeItem(STORAGE_DEVICE_UNLOCKED_KEY);
      }
    } catch (e) {}
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public getState(): ProfileServiceState {
    return {
      profiles: [...this.profiles],
      activeProfileId: this.activeProfileId,
      promptOnLaunch: this.promptOnLaunch,
      pinMemoryPolicy: this.pinMemoryPolicy,
      rememberLastTab: this.rememberLastTab,
      unlockedProfileIds: Array.from(this.unlockedProfileIds),
    };
  }

  public getProfiles(): UserProfile[] {
    return [...this.profiles];
  }

  public getActiveProfile(): UserProfile {
    const found = this.profiles.find((p) => p.id === this.activeProfileId);
    return found || this.profiles[0] || DEFAULT_PROFILES[0];
  }

  // --- PIN MEMORY & UNLOCK LOGIC ---
  public isProfileUnlocked(profileId: string): boolean {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return false;
    if (!profile.pin) return true; // Unlocked by default if no PIN
    if (this.pinMemoryPolicy === 'always') return false; // Strict mode: never remember
    return this.unlockedProfileIds.has(profileId);
  }

  public unlockProfileSession(profileId: string, rememberOnDevice: boolean = false): void {
    this.unlockedProfileIds.add(profileId);
    if (rememberOnDevice || this.pinMemoryPolicy === 'device') {
      this.saveDeviceUnlocked();
    }
    this.notify();
  }

  public lockProfile(profileId: string): void {
    this.unlockedProfileIds.delete(profileId);
    this.saveDeviceUnlocked();
    this.notify();
  }

  public lockAllProfiles(): void {
    this.unlockedProfileIds.clear();
    // Re-add unpinned profiles
    this.profiles.forEach((p) => {
      if (!p.pin) this.unlockedProfileIds.add(p.id);
    });
    this.saveDeviceUnlocked();
    this.notify();
  }

  public setPinMemoryPolicy(policy: PinMemoryPolicy): void {
    this.pinMemoryPolicy = policy;
    try {
      localStorage.setItem(STORAGE_PIN_POLICY_KEY, policy);
    } catch (e) {}

    if (policy === 'always') {
      this.lockAllProfiles();
    } else if (policy === 'device') {
      this.saveDeviceUnlocked();
    }
    this.notify();
  }

  public getPinMemoryPolicy(): PinMemoryPolicy {
    return this.pinMemoryPolicy;
  }

  public setRememberLastTab(remember: boolean): void {
    this.rememberLastTab = remember;
    try {
      localStorage.setItem(STORAGE_REMEMBER_LAST_TAB_KEY, remember ? 'true' : 'false');
    } catch (e) {}
    this.notify();
  }

  public verifyPin(profileId: string, inputPin: string): boolean {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return false;
    if (!profile.pin) return true;
    return profile.pin === inputPin.trim();
  }

  public setActiveProfile(
    profileId: string, 
    inputPin?: string, 
    rememberOnDevice: boolean = false
  ): { success: boolean; error?: string } {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    if (profile.pin) {
      const isAlreadyUnlocked = this.isProfileUnlocked(profileId);
      if (!isAlreadyUnlocked) {
        if (!inputPin || profile.pin !== inputPin.trim()) {
          return { success: false, error: 'Incorrect 4-digit PIN' };
        }
        // Successfully verified -> remember unlock
        this.unlockProfileSession(profileId, rememberOnDevice);
      }
    } else {
      this.unlockedProfileIds.add(profileId);
    }

    this.activeProfileId = profileId;
    try {
      localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, profileId);
    } catch (e) {}

    // Update memory timestamp for this profile
    this.setProfileMemory(profileId, {
      lastActiveTimestamp: Date.now(),
    });

    // Dispatch global custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tv:profile-changed', { detail: { profile } }));
    }

    this.notify();
    return { success: true };
  }

  public createProfile(data: CreateProfileDTO): UserProfile {
    const newProfile: UserProfile = {
      id: `prof-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: data.name.trim() || 'New User',
      avatarColor: data.avatarColor || AVATAR_COLOR_PALETTES[0],
      avatarIcon: data.avatarIcon || (data.type === 'kids' ? 'baby' : 'user'),
      type: data.type,
      badge: data.type === 'kids' ? 'Family Friendly' : data.type === 'guest' ? 'Incognito' : 'Full Access',
      pin: data.pin ? data.pin.trim() : undefined,
      isKid: data.type === 'kids' || data.isKid || false,
      createdAt: Date.now(),
    };

    this.profiles.push(newProfile);
    if (!newProfile.pin) {
      this.unlockedProfileIds.add(newProfile.id);
    }
    this.saveProfiles();
    this.notify();
    return newProfile;
  }

  public updateProfile(id: string, updates: UpdateProfileDTO): boolean {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    const current = this.profiles[idx];
    const newPin = updates.pin === null ? undefined : updates.pin !== undefined ? updates.pin.trim() : current.pin;
    
    // If pin changed or was added, lock the profile
    if (newPin !== current.pin) {
      this.lockProfile(id);
    }

    const updated: UserProfile = {
      ...current,
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      avatarColor: updates.avatarColor || current.avatarColor,
      avatarIcon: updates.avatarIcon || current.avatarIcon,
      type: updates.type || current.type,
      badge: updates.type ? (updates.type === 'kids' ? 'Family Friendly' : updates.type === 'guest' ? 'Incognito' : 'Full Access') : current.badge,
      pin: newPin,
      isKid: updates.isKid !== undefined ? updates.isKid : (updates.type === 'kids' ? true : current.isKid),
    };

    this.profiles[idx] = updated;
    this.saveProfiles();
    this.notify();
    return true;
  }

  public deleteProfile(id: string): boolean {
    if (this.profiles.length <= 1) {
      return false;
    }

    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    this.profiles.splice(idx, 1);
    this.unlockedProfileIds.delete(id);
    this.saveProfiles();
    this.saveDeviceUnlocked();

    // Clean up profile-specific storage (memory, favorites, watch history, progress)
    try {
      localStorage.removeItem(`tv_profile_memory_${id}`);
      localStorage.removeItem(`tv_favorites_${id}`);
      localStorage.removeItem(`tv_watch_history_${id}`);

      // Remove all playback progress keys scoped to this profile
      const progressPrefix = `tv_playback_progress_${id}_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(progressPrefix)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch (e) {}

    // If active profile was deleted, switch to the first remaining profile
    if (this.activeProfileId === id) {
      this.setActiveProfile(this.profiles[0].id);
    } else {
      this.notify();
    }

    return true;
  }


  public setPromptOnLaunch(prompt: boolean): void {
    this.promptOnLaunch = prompt;
    try {
      localStorage.setItem(STORAGE_PROMPT_ON_LAUNCH_KEY, prompt ? 'true' : 'false');
    } catch (e) {}
    this.notify();
  }

  // --- PROFILE PREFERENCES & LAST TAB MEMORY ---
  public getProfileMemory(profileId?: string): ProfileMemoryData {
    const id = profileId || this.activeProfileId;
    try {
      const stored = localStorage.getItem(`tv_profile_memory_${id}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return {
      lastTab: 'for-you',
      lastActiveTimestamp: Date.now(),
    };
  }

  public setProfileMemory(profileId: string, updates: Partial<ProfileMemoryData>): void {
    try {
      const current = this.getProfileMemory(profileId);
      const merged: ProfileMemoryData = {
        ...current,
        ...updates,
      };
      localStorage.setItem(`tv_profile_memory_${profileId}`, JSON.stringify(merged));
    } catch (e) {}
  }

  public getLastTab(profileId?: string): 'for-you' | 'movies' | 'shows' | 'music' | 'games' | 'library' {
    if (!this.rememberLastTab) return 'for-you';
    const mem = this.getProfileMemory(profileId);
    return (mem.lastTab as any) || 'for-you';
  }

  public setLastTab(profileId: string, tab: 'for-you' | 'movies' | 'shows' | 'music' | 'games' | 'library'): void {
    if (!this.rememberLastTab) return;
    this.setProfileMemory(profileId, { lastTab: tab });
  }

  // --- WATCH HISTORY MEMORY ---
  public getWatchHistory(profileId?: string): WatchHistoryEntry[] {
    const id = profileId || this.activeProfileId;
    try {
      const stored = localStorage.getItem(`tv_watch_history_${id}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return [];
  }

  public addWatchHistory(
    profileId: string, 
    entry: Omit<WatchHistoryEntry, 'id' | 'timestamp'>
  ): void {
    try {
      const history = this.getWatchHistory(profileId);
      // Remove previous entry for same mediaId if exists so it moves to top
      const filtered = history.filter((h) => h.mediaId !== entry.mediaId);
      const newEntry: WatchHistoryEntry = {
        ...entry,
        id: `wh-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
      };
      // Keep up to 60 most recent history items
      const updated = [newEntry, ...filtered].slice(0, 60);
      localStorage.setItem(`tv_watch_history_${profileId}`, JSON.stringify(updated));
    } catch (e) {}
  }

  public removeWatchHistoryItem(profileId: string, entryId: string): void {
    try {
      const history = this.getWatchHistory(profileId);
      const updated = history.filter((h) => h.id !== entryId && h.mediaId !== entryId);
      localStorage.setItem(`tv_watch_history_${profileId}`, JSON.stringify(updated));
    } catch (e) {}
  }

  public clearWatchHistory(profileId?: string): void {
    const id = profileId || this.activeProfileId;
    try {
      localStorage.removeItem(`tv_watch_history_${id}`);
    } catch (e) {}
  }

  public clearAllMemoryData(): void {
    try {
      this.lockAllProfiles();
      this.profiles.forEach((p) => {
        localStorage.removeItem(`tv_profile_memory_${p.id}`);
        localStorage.removeItem(`tv_watch_history_${p.id}`);
      });
      localStorage.removeItem(STORAGE_DEVICE_UNLOCKED_KEY);
    } catch (e) {}
    this.notify();
  }

  public subscribe(listener: (state: ProfileServiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const profileService = new ProfileService();
