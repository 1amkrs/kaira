/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/* Static asset type declarations */
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

interface Window {
  AndroidBridge?: {
    isAndroidTV?: () => boolean;
    getDeviceInfo?: () => string;
    launchApp?: (packageName: string, fallbackUrl: string) => boolean;
    openExternal?: (url: string) => void;
    setImmersiveMode?: (enabled: boolean) => void;
    sleep?: () => void;
    exitApp?: () => void;
  };
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
  electronAPI?: {
    launchApp: (app: any) => Promise<{ success: boolean; error?: string }>;
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<string>;
    getDisplayInfo: () => Promise<any>;
    setFullscreen: (fullscreen: boolean) => Promise<void>;
    executeSystemPower: (action: 'sleep' | 'restart' | 'shutdown') => Promise<void>;
    getAudioDevices?: () => Promise<any>;
    setAudioDevice?: (deviceId: string) => Promise<boolean>;
    getSystemDiagnostics?: () => Promise<any>;
    getPlatformInfo?: () => Promise<{ platform: string; arch: string }>;
    getAmbientStatus?: () => Promise<any>;
    setAmbientMode?: (mode: string) => Promise<any>;
    setAmbientIntensity?: (intensity: number) => Promise<any>;
    getUblockStatus?: () => Promise<any>;
    setUblockEnabled?: (enabled: boolean) => Promise<any>;
    setUblockAntiPopup?: (enabled: boolean) => Promise<any>;
    resetUblockStats?: () => Promise<any>;
    controlMedia?: (action: string, value?: any) => Promise<{ success: boolean; error?: string }>;
    sendRemoteState?: (state: any) => void;
    onRemoteCommand?: (callback: (command: any) => void) => () => void;
    onRemoteClientCount?: (callback: (count: number) => void) => () => void;
    getRemoteServerInfo?: () => Promise<{ ip: string; port: number; url: string; interfaces?: Array<{ name: string; ip: string; isPrimary: boolean }> }>;
  };
}
