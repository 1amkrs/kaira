export interface FlicxSettings {
  accentHue: number;
  contrast: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
  downloads: boolean;
  febboxToken: string | null;
  settingsVersion: number;
}

const DEFAULT_SETTINGS: FlicxSettings = {
  accentHue: 62,
  contrast: false,
  reduceMotion: false,
  underlineLinks: false,
  downloads: true,
  febboxToken: null,
  settingsVersion: 6,
};

const STORAGE_KEY = 'flicx:settings:v6';

export class FlicxSettingsService {
  private static settings: FlicxSettings = this.loadSettings();

  public static get(): FlicxSettings {
    return { ...this.settings };
  }

  public static update(partial: Partial<FlicxSettings>): FlicxSettings {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
    this.applyToDOM();
    return { ...this.settings };
  }

  public static applyToDOM(): void {
    if (typeof document === 'undefined') return;
    const doc = document.documentElement;

    // Apply Brand Accent Hue shift
    const shift = (this.settings.accentHue - 62 + 360) % 360;
    doc.style.setProperty('--brand-shift', `${shift}deg`);

    // Contrast
    if (this.settings.contrast) {
      doc.setAttribute('data-contrast', 'more');
    } else {
      doc.removeAttribute('data-contrast');
    }

    // Motion
    if (this.settings.reduceMotion) {
      doc.setAttribute('data-motion', 'reduce');
    } else {
      doc.removeAttribute('data-motion');
    }

    // Underline
    if (this.settings.underlineLinks) {
      doc.setAttribute('data-underline', 'on');
    } else {
      doc.removeAttribute('data-underline');
    }

    // Downloads toggle
    if (this.settings.downloads) {
      doc.removeAttribute('data-downloads');
    } else {
      doc.setAttribute('data-downloads', 'off');
    }
  }

  private static loadSettings(): FlicxSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  }

  private static saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage unavailable
    }
  }

  public static exportLibraryData(): void {
    const today = new Date().toISOString().split('T')[0];
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      library: JSON.parse(localStorage.getItem('flicx:library') || '[]'),
      progress: JSON.parse(localStorage.getItem('flicx:player:progress') || '{}'),
      ratings: JSON.parse(localStorage.getItem('flicx:ratings') || '{}'),
      settings: this.settings,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flicx-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public static importLibraryData(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (parsed.library) localStorage.setItem('flicx:library', JSON.stringify(parsed.library));
          if (parsed.progress) localStorage.setItem('flicx:player:progress', JSON.stringify(parsed.progress));
          if (parsed.ratings) localStorage.setItem('flicx:ratings', JSON.stringify(parsed.ratings));
          if (parsed.settings) this.update(parsed.settings);
          resolve(true);
        } catch {
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }
}
