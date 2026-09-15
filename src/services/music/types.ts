import { SyncedLyricLine, Track, PlaybackSource } from '../../types/media';

export type RepeatMode = 'off' | 'all' | 'one';

export interface EQBand {
  frequency: number;
  label: string;
  gain: number; // in dB (-12 to +12)
  filter?: BiquadFilterNode;
}

export type SoundPresetName =
  | 'flat'
  | 'bass-boost'
  | 'vocal-clarity'
  | 'electronic'
  | 'rock'
  | 'acoustic'
  | 'jazz'
  | 'classical'
  | 'night-mode';

export interface SoundPreset {
  id: SoundPresetName;
  name: string;
  description: string;
  gains: number[]; // 10 band gains corresponding to [32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz]
  bassBoost?: number; // dB boost
  vocalEnhance?: boolean;
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export const SOUND_PRESETS: Record<SoundPresetName, SoundPreset> = {
  flat: {
    id: 'flat',
    name: 'Flat (Studio Reference)',
    description: 'Pure, uncolored studio monitor frequency response',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  'bass-boost': {
    id: 'bass-boost',
    name: 'Deep Bass Boost',
    description: 'Deep, punchy sub-bass & low-end warmth for TV speakers and soundbars',
    gains: [7, 6, 4.5, 2, 0, 0, 1, 2, 3, 3.5],
    bassBoost: 6,
  },
  'vocal-clarity': {
    id: 'vocal-clarity',
    name: 'Vocal & Dialogue Clarity',
    description: 'Crisp mid-range definition so vocals and lyrics shine through clearly',
    gains: [-2, -1, 0, 2, 4, 4.5, 3.5, 2, 1, 0],
    vocalEnhance: true,
  },
  electronic: {
    id: 'electronic',
    name: 'Electronic / EDM / Dance',
    description: 'Elevated sub-bass kicks with bright sparkling highs',
    gains: [6, 5.5, 3, 0, -1, 2, 3.5, 4.5, 5, 5],
  },
  rock: {
    id: 'rock',
    name: 'Rock / Metal / Anthem',
    description: 'Full rhythm presence with biting guitar crunch and cymbal clarity',
    gains: [4.5, 3.5, 2, 0, -1, 1.5, 3, 4, 4.5, 4],
  },
  acoustic: {
    id: 'acoustic',
    name: 'Acoustic / Unplugged',
    description: 'Warm natural mids and pristine acoustic guitar string resonance',
    gains: [2, 3, 2.5, 1, 2, 2.5, 3, 3.5, 3, 2.5],
  },
  jazz: {
    id: 'jazz',
    name: 'Smooth Jazz & Soul',
    description: 'Velvety brass tones, smooth upright bass, and warm room ambiance',
    gains: [3, 2.5, 1.5, 2, 1, 1.5, 2, 2.5, 3, 3],
  },
  classical: {
    id: 'classical',
    name: 'Classical & Orchestral',
    description: 'Expansive dynamic staging for grand strings, brass, and percussion',
    gains: [3, 2.5, 2, 1.5, 0, 0, 1.5, 2.5, 3.5, 4],
  },
  'night-mode': {
    id: 'night-mode',
    name: 'Night Listening Mode',
    description: 'Attenuates heavy bass booms while lifting dialogue & soft sounds',
    gains: [-6, -5, -3, 0, 2.5, 3, 2, 1, 0, -1],
  },
};

export interface MusicEngineState {
  currentTrack: Track | null;
  currentSource: PlaybackSource | null;
  status: 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';
  currentTime: number;
  duration: number;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  queue: Track[];
  queueIndex: number;
  originalQueue: Track[]; // For non-destructive shuffle
  isShuffle: boolean;
  repeatMode: RepeatMode;
  activePreset: SoundPresetName;
  eqGains: number[];
  audioBoostEnabled: boolean;
  lyrics: SyncedLyricLine[];
  plainLyrics?: string;
  error: string | null;
  isWebAudioActive: boolean;
}
