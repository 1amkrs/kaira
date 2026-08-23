import React, { useState, useEffect } from 'react';
import { Play, Info, Sparkles } from 'lucide-react';
import { Movie, Show, Album, MediaItem } from '../../types';
import { mediaProvider, ContinueWatchingItem } from '../../services/media/LiveMediaProvider';
import { Focusable } from '../../components/Focusable/Focusable';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { MovieCard } from '../../components/MediaCard/MovieCard';
import { ShowCard } from '../../components/MediaCard/ShowCard';
import { AlbumCard } from '../../components/MediaCard/AlbumCard';
import { MediaCard } from '../../components/MediaCard/MediaCard';
import { MobileShowcaseHero } from '../../components/Showcase/MobileShowcaseHero';
import { MobileShowcaseRails } from '../../components/Showcase/MobileShowcaseRails';
import {
  NETFLIX_ORIGINALS,
  APPLE_TV_ORIGINALS,
  PRIME_VIDEO_HITS,
  MAX_DISNEY_HITS,
} from '../../data/media/streamingMedia';
import { Footer } from '../../components/Footer/Footer';
import './HomeScreen.css';

interface HomeScreenProps {
  onSelectMovie: (movie: Movie) => void;
  onPlayMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
  onSelectAlbum: (album: Album) => void;
  onSelectContinueItem: (item: ContinueWatchingItem) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectMovie,
  onPlayMovie,
  onSelectShow,
  onSelectAlbum,
  onSelectContinueItem,
}) => {
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [featured, setFeatured] = useState<Movie | null>(null);
  const [top10Daily, setTop10Daily] = useState<Movie[]>([]);
  const [hollywoodMovies, setHollywoodMovies] = useState<Movie[]>([]);
  const [regionalMovies, setRegionalMovies] = useState<Movie[]>([]);
  const [popularShows, setPopularShows] = useState<Show[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cw, feat, top10, hwMovs, regMovs, shows, albs] = await Promise.all([
        mediaProvider.getContinueWatching(),
        mediaProvider.getFeaturedMovie(),
        (mediaProvider as any).getTop10Daily(),
        mediaProvider.getHollywoodMovies(),
        mediaProvider.getRegionalMovies('all'),
        mediaProvider.getShows(),
        mediaProvider.getAlbums(),
      ]);
      setContinueWatching(cw);
      setFeatured(feat);
      setTop10Daily(top10 || []);
      setHollywoodMovies(hwMovs);
      setRegionalMovies(regMovs);
      setPopularShows(shows);
      setAlbums(albs);
    } catch (e) {
      console.warn('[HomeScreen] Error loading media rails', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectMediaItem = async (item: MediaItem) => {
    if (item.type === 'show') {
      const show = (await mediaProvider.getShow(item.id)) || {
        id: item.id,
        title: item.title,
        description: item.description,
        poster: item.posterUrl || item.backdropUrl,
        backdrop: item.backdropUrl,
        year: item.year,
        rating: item.rating,
        genres: item.genre || ['Drama'],
        network: item.source || 'Streaming',
        status: 'Ongoing',
      };
      onSelectShow(show as Show);
    } else {
      const movie = (await mediaProvider.getMovie(item.id)) || {
        id: item.id,
        title: item.title,
        description: item.description,
        poster: item.posterUrl || item.backdropUrl,
        backdrop: item.backdropUrl,
        year: item.year,
        runtime: item.duration || '2h',
        rating: item.rating,
        genres: item.genre || ['Action'],
      };
      onSelectMovie(movie as Movie);
    }
  };

  return (
    <div className="tv-scroll-container tv-home-screen" role="main" aria-label="Google TV For You Home">
      {/* ─── Mobile Hero Showcase (Active on Mobile <= 768px down to 350px) ─── */}
      <MobileShowcaseHero
        heroItems={
          [
            ...(featured ? [featured] : []),
            ...(top10Daily.length > 0 ? top10Daily : hollywoodMovies.slice(0, 5)),
            ...(popularShows.length > 0 ? popularShows.slice(0, 5) : []),
          ].filter(Boolean) as any
        }
        onSelectMovie={onSelectMovie}
        onSelectShow={onSelectShow}
        onPlayMovie={onPlayMovie}
      />

      {/* ─── Mobile Showcase Rails (Continue Watching & Popular Series) ─── */}
      <MobileShowcaseRails
        continueWatching={continueWatching}
        popularSeries={popularShows.length > 0 ? popularShows : undefined}
        onSelectContinueItem={onSelectContinueItem}
        onSelectMediaItem={handleSelectMediaItem}
        onSelectShow={onSelectShow}
        onSelectMovie={onSelectMovie}
      />

      {/* ─── Desktop / TV Featured Hero Billboard ─── */}
      {featured && (
        <section className="tv-hero-section desktop-only-hero" aria-label="Featured Highlight">
          <div className="tv-hero-backdrop-wrapper">
            <img
              src={featured.backdrop || featured.poster}
              alt={featured.title}
              className="tv-hero-backdrop-img"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (featured.poster && target.src !== featured.poster) {
                  target.src = featured.poster;
                }
              }}
            />
            <div className="tv-hero-gradient-overlay" />
          </div>

          <div className="tv-hero-content-container">
            <div className="tv-hero-badge-row">
              <span className="tv-hero-badge-pill">
                <Sparkles size={14} className="badge-icon" />
                Featured in 4K
              </span>
              <span className="tv-hero-source">{featured.genres.join(' • ')}</span>
            </div>

            <h1 className="tv-hero-title">{featured.title}</h1>
            <p className="tv-hero-subtitle">
              <span className="tv-hero-rating-score">{featured.rating.replace('★', '').trim()}</span> • {featured.year} • {featured.runtime}
            </p>
            <p className="tv-hero-description text-line-clamp-2">{featured.description}</p>

            <div className="tv-hero-actions-row">
              <Focusable
                id="hero-action-play"
                groupId="hero-actions"
                indexInGroup={0}
                className="tv-hero-btn primary-btn"
                onSelect={() => onPlayMovie(featured)}
                scaleEffect={true}
              >
                {(isFocused) => (
                  <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>Watch Now</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="hero-action-details"
                groupId="hero-actions"
                indexInGroup={1}
                className="tv-hero-btn secondary-btn"
                onSelect={() => onSelectMovie(featured)}
                scaleEffect={true}
              >
                {(isFocused) => (
                  <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                    <Info size={20} />
                    <span>About This Movie</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </section>
      )}

      {/* 2. Continue Watching Rail (Active watch sessions for Desktop/TV) */}
      {continueWatching.length > 0 && (
        <div className="desktop-only-rail">
          <ContentRail
            id="rail-continue-watching"
            title="Continue Watching"
            subtitle="Pick up where you left off"
            aspectRatio="16:9"
          >
            {continueWatching.map((item, idx) => (
              <MediaCard
                key={item.id}
                item={{
                  id: item.id,
                  title: item.title,
                  subtitle: item.subtitle,
                  backdropUrl: item.backdrop,
                  posterUrl: item.poster,
                  progress: item.progress,
                  duration: item.duration,
                  type: 'movie',
                }}
                groupId="rail-continue-watching"
                indexInGroup={idx}
                aspectRatio="16:9"
                onSelect={() => onSelectContinueItem(item)}
              />
            ))}
          </ContentRail>
        </div>
      )}

      {/* 3. Top 10 Today — Daily Trending from Cinemeta */}
      <ContentRail
        id="rail-trending-movies"
        title="Top 10 Today"
        subtitle="Updated daily · What everyone is watching right now"
        isLoading={isLoading}
        aspectRatio="poster"
      >
        {(top10Daily.length > 0 ? top10Daily : hollywoodMovies.slice(0, 10)).map((mov, idx) => (
          <div key={`top10-${mov.id}`} style={{ position: 'relative', display: 'inline-block' }}>
            {/* Rank badge overlay */}
            <div style={{
              position: 'absolute',
              bottom: 40,
              left: -4,
              zIndex: 10,
              fontFamily: 'var(--font-family)',
              fontSize: 'clamp(48px, 7vw, 86px)',
              fontWeight: 900,
              lineHeight: 1,
              color: 'rgba(255, 255, 255, 0.92)',
              textShadow: '0 2px 12px rgba(0,0,0,0.9), -2px 0 0 #e50914, 2px 0 0 #e50914',
              letterSpacing: '-4px',
              userSelect: 'none',
              pointerEvents: 'none',
            }}>
              {(mov as any).rank || idx + 1}
            </div>
            <MovieCard
              movie={mov}
              groupId="rail-trending-movies"
              indexInGroup={idx}
              onSelect={onSelectMovie}
            />
          </div>
        ))}
      </ContentRail>

      {/* 4. Popular on Netflix */}
      <ContentRail
        id="rail-netflix"
        title="Popular on Netflix"
        subtitle="Trending originals and fresh releases"
        aspectRatio="16:9"
      >
        {NETFLIX_ORIGINALS.map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            groupId="rail-netflix"
            indexInGroup={idx}
            aspectRatio="16:9"
            onSelect={handleSelectMediaItem}
          />
        ))}
      </ContentRail>

      {/* 5. Apple TV+ & Prime Video Exclusives */}
      <ContentRail
        id="rail-apple-prime"
        title="Apple TV+ & Prime Exclusives"
        subtitle="Award-winning series and films"
        aspectRatio="16:9"
      >
        {[...APPLE_TV_ORIGINALS, ...PRIME_VIDEO_HITS].map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            groupId="rail-apple-prime"
            indexInGroup={idx}
            aspectRatio="16:9"
            onSelect={handleSelectMediaItem}
          />
        ))}
      </ContentRail>

      {/* 6. HBO Max & Disney+ Hits */}
      <ContentRail
        id="rail-max-disney"
        title="HBO & Disney Highlights"
        subtitle="Fan-favorite series and cinematic classics"
        aspectRatio="16:9"
      >
        {MAX_DISNEY_HITS.map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            groupId="rail-max-disney"
            indexInGroup={idx}
            aspectRatio="16:9"
            onSelect={handleSelectMediaItem}
          />
        ))}
      </ContentRail>

      {/* 7. Regional Indian Cinema Spotlight */}
      {regionalMovies.length > 0 && (
        <ContentRail
          id="rail-regional-spotlight"
          title="Spotlight on Regional Cinema"
          subtitle="The best of Malayalam, Hindi, and Tamil cinema"
          isLoading={isLoading}
          aspectRatio="poster"
        >
          {regionalMovies.map((mov, idx) => (
            <MovieCard
              key={`reg-home-${mov.id}`}
              movie={mov}
              groupId="rail-regional-spotlight"
              indexInGroup={idx}
              onSelect={onSelectMovie}
            />
          ))}
        </ContentRail>
      )}

      {/* 8. Binge-Worthy TV Shows */}
      <ContentRail
        id="rail-popular-shows"
        title="Binge-Worthy TV Shows"
        subtitle="Popular series to dive into tonight"
        isLoading={isLoading}
        aspectRatio="poster"
      >
        {popularShows.map((show, idx) => (
          <ShowCard
            key={show.id}
            show={show}
            groupId="rail-popular-shows"
            indexInGroup={idx}
            onSelect={onSelectShow}
          />
        ))}
      </ContentRail>

      {/* 9. Music & Spatial Soundtracks */}
      <ContentRail
        id="rail-music-albums"
        title="Featured Music & Soundtracks"
        subtitle="Albums and tracks to set the mood"
        isLoading={isLoading}
        aspectRatio="1:1"
      >
        {albums.map((alb, idx) => (
          <AlbumCard
            key={alb.id}
            album={alb}
            groupId="rail-music-albums"
            indexInGroup={idx}
            onSelect={onSelectAlbum}
          />
        ))}
      </ContentRail>

      {/* Made with ❤️ by i.am.krs Footer */}
      <Footer />

      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
