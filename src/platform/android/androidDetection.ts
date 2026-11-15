export interface AndroidEnvironmentInfo {
  isAndroid: boolean;
  isAndroidTV: boolean;
  androidVersion: string;
  deviceModel: string;
  isNativeBridge: boolean;
}

const TV_UA_MARKERS = [
  'android tv',
  'googletv',
  'aft',
  'bravia',
  'shield',
  'mibox',
  'chromecast',
  'adt-',
  'nexus player',
  'leanback',
  'smarttv',
  'tv ',
  'tizen',
  'webos',
];

export function detectAndroidEnvironment(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  bridgePlatform: string | undefined = typeof window !== 'undefined' ? (window as any).__TVOS_PLATFORM__ : undefined,
  hasAndroidBridge: boolean = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge || (window as any).Capacitor?.getPlatform?.() === 'android'),
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 720,
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
): AndroidEnvironmentInfo {
  const lowerUa = ua.toLowerCase();
  const params = new URLSearchParams(search || '');
  const platformParam = (params.get('platform') || '').toLowerCase();
  const androidModeParam = (params.get('android') || '').toLowerCase();

  const isExplicitAndroid =
    bridgePlatform === 'android' ||
    bridgePlatform === 'android-mobile' ||
    bridgePlatform === 'android-tv' ||
    platformParam === 'android' ||
    androidModeParam === 'mobile' ||
    androidModeParam === 'tv' ||
    hasAndroidBridge;

  const isAndroid = isExplicitAndroid || lowerUa.includes('android');

  if (!isAndroid) {
    return {
      isAndroid: false,
      isAndroidTV: false,
      androidVersion: '',
      deviceModel: '',
      isNativeBridge: false,
    };
  }

  let isAndroidTV = false;
  if (bridgePlatform === 'android-tv' || androidModeParam === 'tv') {
    isAndroidTV = true;
  } else if (bridgePlatform === 'android-mobile' || androidModeParam === 'mobile') {
    isAndroidTV = false;
  } else if (typeof window !== 'undefined' && (window as any).AndroidBridge?.isAndroidTV?.()) {
    isAndroidTV = true;
  } else if (TV_UA_MARKERS.some((marker) => lowerUa.includes(marker))) {
    isAndroidTV = true;
  } else if (maxTouchPoints === 0 && viewportWidth >= 960 && viewportWidth > viewportHeight) {
    isAndroidTV = true;
  }

  const versionMatch = ua.match(/Android\s+([0-9]+(?:\.[0-9]+)*)/i);
  const androidVersion = versionMatch ? versionMatch[1] : '14';

  const modelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/i);
  const deviceModel = modelMatch
    ? modelMatch[1].trim()
    : isAndroidTV
    ? 'Android TV Device'
    : 'Android Mobile Device';

  return {
    isAndroid: true,
    isAndroidTV,
    androidVersion,
    deviceModel,
    isNativeBridge: hasAndroidBridge,
  };
}
