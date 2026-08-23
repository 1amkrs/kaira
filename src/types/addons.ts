export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  background?: string;
  resources: ('stream' | 'catalog' | 'subtitles' | 'meta')[];
  types: ('movie' | 'series' | 'anime' | 'other')[];
  idPrefixes?: string[];
  catalogs?: {
    type: string;
    id: string;
    name: string;
  }[];
  behaviorHints?: {
    adult?: boolean;
    p2p?: boolean;
    configurable?: boolean;
    configurationRequired?: boolean;
  };
}

export interface SubtitleTrack {
  id: string;
  lang: string;
  label: string;
  url: string; // VTT or SRT URL
}

export interface AddonStream {
  name: string; // e.g. "Torrentio [RD+]", "Torrentio [4K]", "Web Stream", "Trailer"
  title: string; // e.g. "Interstellar (2014) • 4K HDR • 18.2 GB\n💾 1000+ seeds • Atmos"
  description?: string;
  url: string; // Direct HTTPS stream link / Web embed / YouTube embed
  streamType?: 'direct' | 'embed' | 'youtube' | 'torrent';
  infoHash?: string;
  fileIdx?: number;
  quality?: '4K' | '1080p' | '720p' | 'HDR' | 'SD';
  resolution?: string; // e.g. "2160p", "1080p"
  fileSize?: string; // e.g. "14.5 GB"
  audio?: string; // e.g. "Dolby Atmos", "5.1 Surround"
  providerName?: string;
  isDebrid?: boolean;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    proxyHeaders?: Record<string, string>;
  };
}

export interface InstalledAddon {
  id: string;
  name: string;
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  installedAt: number;
}

export interface DebridConfig {
  provider: 'realdebrid' | 'alldebrid' | 'selfdebrid' | 'torbox' | 'premiumize' | 'none';
  apiKey: string;
  endpointUrl?: string; // e.g. "http://localhost:8081" or "http://127.0.0.1:8081"
  enabled: boolean;
}
