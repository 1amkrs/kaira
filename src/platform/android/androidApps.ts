export interface AndroidAppMapping {
  packageName: string;
  intentUri: string;
  webFallback: string;
}

const ANDROID_APP_PACKAGES: Record<string, AndroidAppMapping> = {
  youtube: {
    packageName: 'com.google.android.youtube',
    intentUri: 'intent://www.youtube.com/#Intent;scheme=https;package=com.google.android.youtube;end',
    webFallback: 'https://m.youtube.com',
  },
  'youtube-tv': {
    packageName: 'com.google.android.youtube.tv',
    intentUri: 'intent://www.youtube.com/tv#Intent;scheme=https;package=com.google.android.youtube.tv;end',
    webFallback: 'https://www.youtube.com/tv',
  },
  netflix: {
    packageName: 'com.netflix.mediaclient',
    intentUri: 'intent://www.netflix.com/browse#Intent;scheme=https;package=com.netflix.mediaclient;end',
    webFallback: 'https://www.netflix.com',
  },
  spotify: {
    packageName: 'com.spotify.music',
    intentUri: 'intent://open.spotify.com/#Intent;scheme=https;package=com.spotify.music;end',
    webFallback: 'https://open.spotify.com',
  },
  steam: {
    packageName: 'com.valvesoftware.steamlink',
    intentUri: 'intent://#Intent;package=com.valvesoftware.steamlink;end',
    webFallback: 'https://store.steampowered.com',
  },
  plex: {
    packageName: 'com.plexapp.android',
    intentUri: 'intent://app.plex.tv/#Intent;scheme=https;package=com.plexapp.android;end',
    webFallback: 'https://app.plex.tv/desktop',
  },
  'prime-video': {
    packageName: 'com.amazon.avod.thirdpartyclient',
    intentUri: 'intent://www.primevideo.com/#Intent;scheme=https;package=com.amazon.avod.thirdpartyclient;end',
    webFallback: 'https://www.primevideo.com',
  },
  disney: {
    packageName: 'com.disney.disneyplus',
    intentUri: 'intent://www.disneyplus.com/#Intent;scheme=https;package=com.disney.disneyplus;end',
    webFallback: 'https://www.disneyplus.com',
  },
  xbox: {
    packageName: 'com.gamepass',
    intentUri: 'intent://www.xbox.com/play#Intent;scheme=https;package=com.gamepass;end',
    webFallback: 'https://www.xbox.com/play',
  },
  twitch: {
    packageName: 'tv.twitch.android.app',
    intentUri: 'intent://www.twitch.tv/#Intent;scheme=https;package=tv.twitch.android.app;end',
    webFallback: 'https://www.twitch.tv',
  },
  kodi: {
    packageName: 'org.xbmc.kodi',
    intentUri: 'intent://#Intent;package=org.xbmc.kodi;end',
    webFallback: 'https://kodi.tv',
  },
  retroarch: {
    packageName: 'com.retroarch.aarch64',
    intentUri: 'intent://#Intent;package=com.retroarch.aarch64;end',
    webFallback: 'https://www.retroarch.com',
  },
  browser: {
    packageName: 'com.android.chrome',
    intentUri: 'intent://www.google.com/#Intent;scheme=https;package=com.android.chrome;end',
    webFallback: 'https://www.google.com',
  },
};

export function resolveAndroidAppTarget(
  appIdOrTarget: string,
  isAndroidTV: boolean = false,
): AndroidAppMapping | null {
  const key = appIdOrTarget.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (key === 'youtube' && isAndroidTV) {
    return ANDROID_APP_PACKAGES['youtube-tv'];
  }
  if (ANDROID_APP_PACKAGES[key]) {
    return ANDROID_APP_PACKAGES[key];
  }
  const byPrefix = Object.keys(ANDROID_APP_PACKAGES).find((k) => key.startsWith(k));
  return byPrefix ? ANDROID_APP_PACKAGES[byPrefix] : null;
}
