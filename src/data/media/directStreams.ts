/**
 * High-Speed Direct Hardware Streams for Native Playback & Full Transport Control
 */

export const SAMPLE_CDN_POOL = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
];

export function getDirectFallbackStream(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SAMPLE_CDN_POOL.length;
  return SAMPLE_CDN_POOL[index];
}

export const DIRECT_CINEMA_STREAMS: Record<string, string> = {
  // Hollywood Blockbusters
  'tt15239678': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', // Dune: Part Two
  'tt6263850': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',   // Deadpool & Wolverine
  'tt18412256': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',        // Alien: Romulus
  'tt17279496': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// Civil War
  'tt12037194': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4', // Furiosa
  'tt15398776': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // Oppenheimer
  'tt9362722': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', // Spider-Man: Across the Spider-Verse
  'tt23289160': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', // Godzilla Minus One
  'tt1877830': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4', // The Batman
  'tt1745960': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', // Top Gun: Maverick
  'tt1630029': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', // Avatar: The Way of Water
  'tt1375666': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',  // Inception
  'tt0816692': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',   // Interstellar
  'tt0468569': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',        // The Dark Knight
  'tt0133093': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// The Matrix

  // Malayalam Blockbusters
  'tt26458038': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', // Manjummel Boys
  'tt26660021': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Aavesham
  'tt27431598': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',       // Bramayugam
  'tt28288786': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// Premalu
  'tt5525650': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // Aadujeevitham
  'tt29606884': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', // Turbo
  'tt23067332': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', // Malaikottai Vaaliban
  'tt28362483': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4', // Varshangalkku Shesham

  // Hindi Blockbusters
  'tt13751694': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', // Animal
  'tt15354916': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', // Jawan
  'tt28377757': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4', // Stree 2
  'tt23849204': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', // 12th Fail
  'tt13818368': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Fighter

  // Tamil Blockbusters
  'tt15654328': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', // Leo
  'tt11663228': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', // Jailer
  'tt9179430': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // Vikram
  'tt26548265': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', // Maharaja
  'tt10701074': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', // Ponniyin Selvan

  // TV Shows
  'tt9320140': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',  // Chernobyl
  'tt0903747': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',   // Breaking Bad
  'tt0944947': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',        // Game of Thrones
  'tt4574334': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// Stranger Things
  'tt11280740': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', // Severance
  'tt12637874': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Fallout
  'tt11198330': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',       // House of the Dragon
  'tt3581920': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// The Last of Us
  'tt11126994': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', // Arcane
  'tt2788316': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',  // Shogun
  'tt14452776': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',       // The Bear
  'tt7660850': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',// Succession
};
