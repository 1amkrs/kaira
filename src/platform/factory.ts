import { IPlatformAdapter } from './types';
import { WindowsPlatformAdapter } from './windows/WindowsPlatformAdapter';
import { LinuxX64PlatformAdapter } from './linux/x86_64/LinuxX64Adapter';
import { LinuxARM64PlatformAdapter } from './linux/arm64/LinuxARM64Adapter';

export function createPlatformAdapter(): IPlatformAdapter {
  const ua = navigator.userAgent.toLowerCase();
  const platformStr = navigator.platform?.toLowerCase() || '';

  // 1. Electron bridge platform check if available
  const bridgePlatform = (window as any).__TVOS_PLATFORM__;

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
