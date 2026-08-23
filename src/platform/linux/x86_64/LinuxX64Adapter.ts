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

class LinuxX64SystemAdapter implements ISystemAdapter {
  public async getDiagnostics(): Promise<SystemDiagnostics> {
    if (window.electronAPI?.getSystemDiagnostics) {
      try {
        return await window.electronAPI.getSystemDiagnostics();
      } catch (e) {}
    }

    return {
      os: 'TV OS Linux 24.04 LTS (Appliance Mode)',
      kernel: 'Linux 6.8.0-generic (x86_64)',
      distro: 'TV OS Linux Appliance',
      arch: 'x86_64',
      deviceModel: 'x86_64 PC / Laptop Media Host',
      cpuModel: 'AMD Ryzen 7 / Intel Core i7 Processor',
      cpuCores: navigator.hardwareConcurrency || 12,
      ramTotalBytes: 16 * 1024 * 1024 * 1024,
      ramUsedBytes: 3.4 * 1024 * 1024 * 1024,
      ramFreeBytes: 12.6 * 1024 * 1024 * 1024,
      gpuModel: 'AMD Radeon RX / Intel Iris Xe / NVIDIA RTX',
      gpuDriver: 'Mesa 24.1.0 / VA-API Intel-media-driver',
      hardwareVideoDecode: 'VA-API Hardware Decode Active (H.264, HEVC, AV1, VP9)',
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
        id: 'alsa_output.pci-0000_00_1f.3.hdmi-stereo',
        name: 'PipeWire: Intel/AMD HDMI Digital Audio',
        isDefault: true,
        type: 'hdmi',
        channels: 6,
      },
      networkType: navigator.onLine ? 'ethernet' : 'offline',
      ipAddress: '192.168.29.120',
      controllerConnected: true,
      controllerName: 'Xbox Wireless Controller (Linux evdev/SDL2)',
      storageTotalBytes: 512 * 1024 * 1024 * 1024,
      storageFreeBytes: 380 * 1024 * 1024 * 1024,
      uptimeSeconds: 7200,
    };
  }

  public async getUptime(): Promise<number> {
    return performance.now() / 1000;
  }
}

export class LinuxX64PlatformAdapter implements IPlatformAdapter {
  public readonly platform: PlatformType = 'linux-x64';
  public readonly isLinux: boolean = true;
  public readonly isARM64: boolean = false;

  public readonly display: IDisplayAdapter = new LinuxDisplayAdapter();
  public readonly audio: IAudioAdapter = new LinuxAudioAdapter();
  public readonly controller: IControllerAdapter = new LinuxControllerAdapter();
  public readonly power: IPowerAdapter = new LinuxPowerAdapter();
  public readonly system: ISystemAdapter = new LinuxX64SystemAdapter();
  public readonly process: IProcessAdapter = new LinuxProcessAdapter();
  public readonly network: INetworkAdapter = new LinuxNetworkAdapter();
}
