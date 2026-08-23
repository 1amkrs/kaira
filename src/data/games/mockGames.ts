import { MediaItem } from '../../types';

export const POPULAR_GAMES: MediaItem[] = [
  {
    id: 'game-cyberpunk-2077',
    title: 'Cyberpunk 2077: Phantom Liberty',
    subtitle: 'Ray Tracing Overdrive Ready',
    description: 'An open-world, action-adventure RPG set in the megalopolis of Night City, where you play as a cyberpunk mercenary.',
    backdropUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
    posterUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900.jpg',
    type: 'game',
    genre: ['RPG', 'Action', 'Open World'],
    year: 2023,
    duration: '60h+ Gameplay',
    rating: 'M (17+)',
    source: 'Steam',
    actionUrl: 'steam://rungameid/1091500'
  },
  {
    id: 'game-forza-horizon-5',
    title: 'Forza Horizon 5',
    subtitle: 'Xbox Game Pass • 4K 60FPS',
    description: 'Explore the vibrant and ever-evolving open world landscapes of Mexico with limitless, fun driving action in hundreds of the world’s greatest cars.',
    backdropUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1551360/header.jpg',
    posterUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1551360/library_600x900.jpg',
    type: 'game',
    genre: ['Racing', 'Open World', 'Sports'],
    year: 2022,
    duration: 'HDR Supported',
    rating: 'E',
    source: 'Xbox',
    actionUrl: 'xbox:'
  },
  {
    id: 'game-elden-ring',
    title: 'Elden Ring: Shadow of the Erdtree',
    subtitle: 'Game of the Year Edition',
    description: 'Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.',
    backdropUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
    posterUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/library_600x900.jpg',
    type: 'game',
    genre: ['Action RPG', 'Souls-like', 'Dark Fantasy'],
    year: 2024,
    duration: '100h+ Gameplay',
    rating: 'M (17+)',
    source: 'Steam',
    actionUrl: 'steam://rungameid/1245620'
  },
  {
    id: 'game-starfield',
    title: 'Starfield',
    subtitle: 'Next-Gen Space RPG',
    description: 'In this next generation role-playing game set amongst the stars, create any character you want and explore with unparalleled freedom.',
    backdropUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/header.jpg',
    posterUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/library_600x900.jpg',
    type: 'game',
    genre: ['Space RPG', 'Sci-Fi', 'Exploration'],
    year: 2023,
    duration: 'Xbox & PC',
    rating: 'M (17+)',
    source: 'Xbox',
    actionUrl: 'xbox:'
  },
  {
    id: 'game-hades-2',
    title: 'Hades II',
    subtitle: 'Early Access',
    description: 'Battle beyond the Underworld using dark sorcery to take on the Titan of Time in this god-like rogue-like dungeon crawler.',
    backdropUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/header.jpg',
    posterUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/library_600x900.jpg',
    type: 'game',
    genre: ['Rogue-like', 'Action', 'Indie'],
    year: 2024,
    duration: 'Controller Tuned',
    rating: 'T',
    source: 'Steam',
    actionUrl: 'steam://rungameid/1145350'
  }
];
