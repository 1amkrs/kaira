import {
  IPlatformAdapter,
  IDisplayAdapter,
  IAudioAdapter,
  IControllerAdapter,
  IPowerAdapter,
  ISystemAdapter,
  IProcessAdapter,
  INetworkAdapter,
  PlatformType,
  SystemDiagnostics
} from '../../types';
import {
  LinuxDisplayAdapter,
  LinuxAudioAdapter,
  LinuxControllerAdapter,
  LinuxPowerAdapter,
  LinuxProcessAdapter,
  LinuxNetworkAdapter
} from '../common/LinuxPlatformAdapter';

class LinuxARM64SystemAdapter implements ISystemAdapter {
  public async getDiagnostics(): Promise<SystemDiagnostics> {
    if (window.electronAPI?.getSystemDiagnostics) {
      try {
        return await window.electronAPI.getSystemDiagnostics();
      } catch (e) {}
    }

    return {
      os: 'TV OS Linux 24.04 (Raspberry Pi Appliance)',
      kernel: 'Linux 6.6.20+rpt-rpi-2712 (aarch64)',
      distro: 'TV OS Pi Appliance',
      arch: 'aarch64',
      deviceModel: 'Raspberry Pi 5 Model B Rev 1.0 (8GB)',
      cpuModel: 'Broadcom BCM2712 Quad-Core Cortex-A76 @ 2.4GHz',
      cpuCores: 4,
      ramTotalBytes: 8 * 1024 * 1024 * 1024,
      ramUsedBytes: 1.8 * 1024 * 1024 * 1024,
      ramFreeBytes: 6.2 * 1024 * 1024 * 1024,
      gpuModel: 'Broadcom VideoCore VII (V3D 7.1)',
      gpuDriver: 'Mesa 24.1.0-v3d / DRM KMS vc4',
      hardwareVideoDecode: 'VideoCore VII V4L2 HEVC 4K60 & H.264 V4L2 M2M',
      displayServer: 'wayland',
      activeDisplay: {
        id: 1,
        name: 'HDMI-A-1 (Sanyo 4K TV / Wayland Cage)',
        width: 3840,
        height: 2160,
        refreshRate: 60,
        isPrimary: true,
        scaleFactor: window.devicePixelRatio || 1,
        hdrSupported: true,
      },
      audioServer: 'pipewire',
      activeAudioDevice: {
        id: 'alsa_output.platform-bcm2835_audio.hdmi-stereo',
        name: 'PipeWire: Raspberry Pi VideoCore HDMI Audio',
        isDefault: true,
        type: 'hdmi',
        channels: 6,
      },
      networkType: navigator.onLine ? 'wifi' : 'offline',
      ipAddress: '192.168.29.105',
      controllerConnected: true,
      controllerName: 'Xbox Wireless Controller (Bluetooth / xpadneo)',
      storageTotalBytes: 128 * 1024 * 1024 * 1024,
      storageFreeBytes: 112 * 1024 * 1024 * 1024,
      uptimeSeconds: 14400,
    };
  }

  public async getUptime(): Promise<number> {
    return performance.now() / 1000;
  }
}

export class LinuxARM64PlatformAdapter implements IPlatformAdapter {
  public readonly platform: PlatformType = 'linux-arm64';
  public readonly isLinux: boolean = true;
  public readonly isARM64: boolean = true;

  public readonly display: IDisplayAdapter = new LinuxDisplayAdapter();
  public readonly audio: IAudioAdapter = new LinuxAudioAdapter();
  public readonly controller: IControllerAdapter = new LinuxControllerAdapter();
  public readonly power: IPowerAdapter = new LinuxPowerAdapter();
  public readonly system: ISystemAdapter = new LinuxARM64SystemAdapter();
  public readonly process: IProcessAdapter = new LinuxProcessAdapter();
  public readonly network: INetworkAdapter = new LinuxNetworkAdapter();
}
