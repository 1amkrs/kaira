export interface VideoCapabilities {
  hardwareDecode: boolean;
  hardwareDecodeType: string;
  gpuAcceleration: boolean;
  gpuRenderer: string;
  hdrSupported: boolean;
  supportedCodecs: {
    h264: boolean;
    hevc: boolean;
    av1: boolean;
    vp9: boolean;
    aac: boolean;
    opus: boolean;
  };
}

class CapabilitiesDetector {
  private cachedCapabilities: VideoCapabilities | null = null;

  public async detect(): Promise<VideoCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    const hasMediaSource = typeof window !== 'undefined' && 'MediaSource' in window;
    const testMSE = (mimeType: string): boolean => {
      if (!hasMediaSource) return false;
      try {
        return MediaSource.isTypeSupported(mimeType);
      } catch (e) {
        return false;
      }
    };

    const testVideoEl = (mimeType: string): boolean => {
      if (typeof document === 'undefined') return false;
      try {
        const v = document.createElement('video');
        return v.canPlayType(mimeType) !== '';
      } catch (e) {
        return false;
      }
    };

    // Codec detection
    const h264 = testMSE('video/mp4; codecs="avc1.42E01E"') || testVideoEl('video/mp4; codecs="avc1.42E01E"');
    const hevc = testMSE('video/mp4; codecs="hev1.1.6.L93.B0"') || testMSE('video/mp4; codecs="hvc1.1.6.L93.B0"') || testVideoEl('video/mp4; codecs="hev1.1.6.L93.B0"');
    const av1 = testMSE('video/mp4; codecs="av01.0.05M.08"') || testVideoEl('video/mp4; codecs="av01.0.05M.08"');
    const vp9 = testMSE('video/webm; codecs="vp09.00.10.08"') || testVideoEl('video/webm; codecs="vp09.00.10.08"');
    const aac = testVideoEl('audio/mp4; codecs="mp4a.40.2"');
    const opus = testVideoEl('audio/webm; codecs="opus"');

    // WebGL / GPU detection
    let gpuRenderer = 'Software / Unknown';
    let gpuAcceleration = false;

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
          gpuAcceleration = true;
          const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Hardware Accelerated GPU';
          } else {
            gpuRenderer = (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).RENDERER) || 'Hardware GPU';
          }
        }
      } catch (e) {
        console.warn('[CapabilitiesDetector] WebGL query notice:', e);
      }
    }

    // Hardware decode determination
    let hardwareDecode = gpuAcceleration && (h264 || hevc || av1 || vp9);
    let hardwareDecodeType = 'VA-API / D3D11 Accelerated Decode';

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('aarch64') || ua.includes('arm64')) {
      hardwareDecodeType = 'VideoCore VII V4L2 Hardware Path';
    } else if (gpuRenderer.toLowerCase().includes('nvidia')) {
      hardwareDecodeType = 'NVIDIA NVDEC Hardware Decode';
    } else if (gpuRenderer.toLowerCase().includes('amd') || gpuRenderer.toLowerCase().includes('radeon')) {
      hardwareDecodeType = 'AMD Mesa VA-API / AMF Decode';
    } else if (gpuRenderer.toLowerCase().includes('intel')) {
      hardwareDecodeType = 'Intel QuickSync / VA-API Decode';
    }

    // HDR Gamut detection
    const hdrSupported = typeof window !== 'undefined' && window.matchMedia && (
      window.matchMedia('(dynamic-range: high)').matches ||
      window.matchMedia('(color-gamut: p3)').matches ||
      window.matchMedia('(color-gamut: rec2020)').matches
    );

    this.cachedCapabilities = {
      hardwareDecode,
      hardwareDecodeType,
      gpuAcceleration,
      gpuRenderer,
      hdrSupported,
      supportedCodecs: {
        h264,
        hevc,
        av1,
        vp9,
        aac,
        opus,
      },
    };

    console.log('[CapabilitiesDetector] Detected hardware profile:', this.cachedCapabilities);
    return this.cachedCapabilities;
  }
}

export const capabilitiesDetector = new CapabilitiesDetector();
