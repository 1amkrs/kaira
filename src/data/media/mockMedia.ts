import { MediaItem, ContentRailData } from '../../types';

export const FEATURED_HERO: MediaItem = {
  id: 'tt0816692',
  title: 'Interstellar: Beyond the Horizon',
  subtitle: 'Now Streaming in 4K HDR • Dolby Atmos',
  description: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.',
  backdropUrl: 'https://images.metahub.space/background/medium/tt0816692/img',
  posterUrl: 'https://images.metahub.space/poster/medium/tt0816692/img',
  type: 'movie',
  genre: ['Sci-Fi', 'Adventure', 'Drama'],
  year: 2024,
  duration: '2h 49m',
  rating: '8.7 ★',
  source: 'Cinemeta 4K',
  featured: true,
  actionUrl: 'netflix:'
};

export const CONTINUE_WATCHING: MediaItem[] = [
  {
    id: 'tt4574334',
    title: 'Stranger Things',
    subtitle: 'S4 : E7 • The Massacre at Hawkins Lab',
    description: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt4574334/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt4574334/img',
    type: 'show',
    genre: ['Sci-Fi', 'Horror', 'Mystery'],
    year: 2023,
    duration: '1h 18m',
    rating: '8.7 ★',
    progress: 68,
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt12590266',
    title: 'Cyberpunk: Edgerunners',
    subtitle: 'S1 : E4 • Lucky You',
    description: 'A street kid trying to survive in a technology and body modification-obsessed city of the future loses everything and chooses to stay alive by becoming an edgerunner.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt12590266/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt12590266/img',
    type: 'show',
    genre: ['Anime', 'Sci-Fi', 'Action'],
    year: 2023,
    duration: '24m',
    rating: '8.3 ★',
    progress: 42,
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt15239678',
    title: 'Dune: Part Two',
    subtitle: 'Resume at 1h 14m',
    description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt15239678/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt15239678/img',
    type: 'movie',
    genre: ['Sci-Fi', 'Adventure', 'Action'],
    year: 2024,
    duration: '2h 46m',
    rating: '8.5 ★',
    progress: 45,
    source: 'Prime Video',
    actionUrl: 'https://www.primevideo.com'
  },
  {
    id: 'tt11126994',
    title: 'Arcane: League of Legends',
    subtitle: 'S2 : E3 • The Weight of Water',
    description: 'Set in the utopian region of Piltover and the oppressed underground of Zaun, the story follows the origins of two iconic League champions.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt11126994/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt11126994/img',
    type: 'show',
    genre: ['Animation', 'Sci-Fi', 'Action'],
    year: 2024,
    duration: '42m',
    rating: '9.0 ★',
    progress: 85,
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt11280740',
    title: 'Severance',
    subtitle: 'S1 : E9 • The We We Are',
    description: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt11280740/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt11280740/img',
    type: 'show',
    genre: ['Sci-Fi', 'Thriller', 'Mystery'],
    year: 2023,
    duration: '52m',
    rating: '8.7 ★',
    progress: 90,
    source: 'Apple TV',
    actionUrl: 'https://tv.apple.com'
  }
];

export const RECOMMENDED_MEDIA: MediaItem[] = [
  {
    id: 'tt15398776',
    title: 'Oppenheimer',
    subtitle: 'Top Pick for You',
    description: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt15398776/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt15398776/img',
    type: 'movie',
    genre: ['Biography', 'Drama', 'History'],
    year: 2023,
    duration: '3h 00m',
    rating: '8.9 ★',
    source: 'Prime Video',
    actionUrl: 'https://www.primevideo.com'
  },
  {
    id: 'tt3581920',
    title: 'The Last of Us',
    subtitle: '99% Match',
    description: 'After a global pandemic destroys civilization, a hardened survivor takes charge of a 14-year-old girl who may be humanity\'s last hope.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt3581920/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt3581920/img',
    type: 'show',
    genre: ['Action', 'Adventure', 'Drama'],
    year: 2023,
    duration: '9 Episodes',
    rating: '8.8 ★',
    source: 'HBO Max',
    actionUrl: 'https://max.com'
  },
  {
    id: 'tt1856101',
    title: 'Blade Runner 2049',
    subtitle: 'Visual Masterpiece',
    description: 'Young Blade Runner K\'s discovery of a long-buried secret leads him to track down former Blade Runner Rick Deckard, who\'s been missing for thirty years.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt1856101/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt1856101/img',
    type: 'movie',
    genre: ['Sci-Fi', 'Mystery', 'Action'],
    year: 2017,
    duration: '2h 44m',
    rating: '8.0 ★',
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt2788316',
    title: 'Shōgun',
    subtitle: 'Critically Acclaimed',
    description: 'When a mysterious European ship is found marooned in a nearby fishing village, Lord Yoshii Toranaga discovers secrets that could tip the scales of power.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt2788316/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt2788316/img',
    type: 'show',
    genre: ['Drama', 'History', 'War'],
    year: 2024,
    duration: '10 Episodes',
    rating: '8.7 ★',
    source: 'Disney+',
    actionUrl: 'https://www.disneyplus.com'
  },
  {
    id: 'tt17279496',
    title: 'Civil War',
    subtitle: 'Trending Now',
    description: 'A journey across a dystopian future America, following a team of military-embedded journalists as they race against time to reach DC before rebel factions descend.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt17279496/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt17279496/img',
    type: 'movie',
    genre: ['Action', 'Thriller'],
    year: 2024,
    duration: '1h 49m',
    rating: '7.1 ★',
    source: 'Prime Video',
    actionUrl: 'https://www.primevideo.com'
  }
];

export const POPULAR_MOVIES: MediaItem[] = [
  {
    id: 'tt1877830',
    title: 'The Batman',
    description: 'Batman ventures into Gotham City\'s underworld when a sadistic killer leaves behind a trail of cryptic clues.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt1877830/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt1877830/img',
    type: 'movie',
    genre: ['Action', 'Crime', 'Drama'],
    year: 2022,
    duration: '2h 56m',
    rating: '7.8 ★',
    source: 'HBO Max',
    actionUrl: 'https://max.com'
  },
  {
    id: 'tt9362722',
    title: 'Spider-Man: Across the Spider-Verse',
    description: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt9362722/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt9362722/img',
    type: 'movie',
    genre: ['Animation', 'Action', 'Sci-Fi'],
    year: 2023,
    duration: '2h 20m',
    rating: '8.6 ★',
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt23289160',
    title: 'Godzilla Minus One',
    description: 'Post-war Japan is at its lowest point when a new crisis emerges in the form of a giant monster fueled by the power of the atomic bomb.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt23289160/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt23289160/img',
    type: 'movie',
    genre: ['Action', 'Sci-Fi', 'Drama'],
    year: 2023,
    duration: '2h 05m',
    rating: '7.9 ★',
    source: 'Netflix',
    actionUrl: 'netflix:'
  },
  {
    id: 'tt18412256',
    title: 'Alien: Romulus',
    description: 'While scavenging the deep ends of a derelict space station, a group of young space colonizers come face to face with the most terrifying life form in the universe.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt18412256/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt18412256/img',
    type: 'movie',
    genre: ['Horror', 'Sci-Fi', 'Thriller'],
    year: 2024,
    duration: '1h 59m',
    rating: '7.2 ★',
    source: 'Disney+',
    actionUrl: 'https://www.disneyplus.com'
  }
];

export const POPULAR_SHOWS: MediaItem[] = [
  {
    id: 'tt7660850',
    title: 'Succession',
    description: 'The Roy family is known for controlling the biggest media and entertainment company in the world. However, their world changes when their aging father steps down.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt7660850/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt7660850/img',
    type: 'show',
    genre: ['Drama'],
    year: 2023,
    duration: '4 Seasons',
    rating: '8.9 ★',
    source: 'HBO Max',
    actionUrl: 'https://max.com'
  },
  {
    id: 'tt14452776',
    title: 'The Bear',
    description: 'A young chef from the fine dining world comes home to Chicago to run his family Italian beef sandwich shop after a heartbreaking death.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt14452776/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt14452776/img',
    type: 'show',
    genre: ['Comedy', 'Drama'],
    year: 2024,
    duration: '3 Seasons',
    rating: '8.6 ★',
    source: 'Disney+',
    actionUrl: 'https://www.disneyplus.com'
  },
  {
    id: 'tt11198330',
    title: 'House of the Dragon',
    description: 'An internal succession war within House Targaryen at the height of its power, 172 years before the birth of Daenerys Targaryen.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt11198330/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt11198330/img',
    type: 'show',
    genre: ['Action', 'Adventure', 'Drama', 'Fantasy'],
    year: 2024,
    duration: '2 Seasons',
    rating: '8.4 ★',
    source: 'HBO Max',
    actionUrl: 'https://max.com'
  },
  {
    id: 'tt12637874',
    title: 'Fallout',
    description: 'In a future, post-apocalyptic Los Angeles brought about by nuclear decimation, citizens must live in underground bunkers to protect themselves.',
    backdropUrl: 'https://images.metahub.space/background/medium/tt12637874/img',
    posterUrl: 'https://images.metahub.space/poster/medium/tt12637874/img',
    type: 'show',
    genre: ['Action', 'Adventure', 'Sci-Fi'],
    year: 2024,
    duration: '1 Season',
    rating: '8.4 ★',
    source: 'Prime Video',
    actionUrl: 'https://www.primevideo.com'
  }
];

export const HOME_RAILS: ContentRailData[] = [
  {
    id: 'rail-continue-watching',
    title: 'Continue Watching',
    subtitle: 'From your streaming apps & library',
    items: CONTINUE_WATCHING
  },
  {
    id: 'rail-recommended',
    title: 'Top Picks for You',
    subtitle: 'Personalized recommendations',
    items: RECOMMENDED_MEDIA
  },
  {
    id: 'rail-movies',
    title: 'Popular Movies',
    subtitle: 'Trending this week',
    items: POPULAR_MOVIES
  },
  {
    id: 'rail-shows',
    title: 'Binge-Worthy Shows',
    subtitle: 'Top rated television series',
    items: POPULAR_SHOWS
  }
];
