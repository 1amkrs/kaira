import { IPlatformAdapter } from './types';
import { WindowsPlatformAdapter } from './windows/WindowsPlatformAdapter';
import { LinuxX64PlatformAdapter } from './linux/x86_64/LinuxX64Adapter';
import { LinuxARM64PlatformAdapter } from './linux/arm64/LinuxARM64Adapter';
import { AndroidPlatformAdapter } from './android/AndroidPlatformAdapter';
import { detectAndroidEnvironment } from './android/androidDetection';

export function createPlatformAdapter(): IPlatformAdapter {
  const ua = navigator.userAgent.toLowerCase();
  const platformStr = navigator.platform?.toLowerCase() || '';
  const bridgePlatform = (window as any).__TVOS_PLATFORM__;

  // 1. Android Mobile & Android TV check (must run BEFORE Linux because Android UA contains "Linux")
  const androidEnv = detectAndroidEnvironment();
  if (androidEnv.isAndroid) {
    console.log(
      `[PlatformFactory] Instantiating Android ${androidEnv.isAndroidTV ? 'TV (Leanback)' : 'Mobile'} Adapter`
    );
    return new AndroidPlatformAdapter(androidEnv);
  }

  // 2. Electron / Desktop Linux & Windows checks
  if (bridgePlatform === 'linux-arm64' || ua.includes('aarch64') || ua.includes('arm64')) {
    console.log('[PlatformFactory] Instantiating Linux ARM64 (Raspberry Pi 5) Adapter');
    return new LinuxARM64PlatformAdapter();
  }

  if (bridgePlatform === 'linux-x64' || ua.includes('linux') || platformStr.includes('linux')) {
    console.log('[PlatformFactory] Instantiating Linux x86_64 Adapter');
    return new LinuxX64PlatformAdapter();
  }

  if (bridgePlatform === 'win32-x64' || ua.includes('windows') || platformStr.includes('win')) {
    console.log('[PlatformFactory] Instantiating Windows x64 (Dev Host) Adapter');
    return new WindowsPlatformAdapter();
  }

  // Default fallback for browser / development
  console.log('[PlatformFactory] Defaulting to Windows Dev Adapter');
  return new WindowsPlatformAdapter();
}
