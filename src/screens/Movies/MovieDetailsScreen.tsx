import React, { useState, useEffect, useRef } from 'react';
import { Play, Heart, Star, Clock, Calendar, ArrowLeft, Loader2, Volume2, VolumeX, Film, Layers, Sparkles } from 'lucide-react';
import { Movie } from '../../types/media';
import { AddonStream } from '../../types/addons';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { addonService } from '../../services/addons/AddonService';
import { Focusable } from '../../components/Focusable/Focusable';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { MovieCard } from '../../components/MediaCard/MovieCard';
import { StreamSelectModal } from '../../components/Playback/StreamSelectModal';
import './MovieDetailsScreen.css';

interface MovieDetailsScreenProps {
  movie: Movie;
  onPlay: (movie: Movie, customStreamUrl?: string, streamType?: AddonStream['streamType']) => void;
  onSelectSimilar: (movie: Movie) => void;
  onBack: () => void;
  isPlayerActive?: boolean;
}

export const MovieDetailsScreen: React.FC<MovieDetailsScreenProps> = ({
  movie,
  onPlay,
  onSelectSimilar,
  onBack,
  isPlayerActive = false,
}) => {
  const [detailedMovie, setDetailedMovie] = useState<Movie>(movie);
  const [isFavorite, setIsFavorite] = useState<boolean>(!!movie.isFavorite);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [isResolvingStreams, setIsResolvingStreams] = useState<boolean>(false);
  const [availableStreams, setAvailableStreams] = useState<AddonStream[] | null>(null);

  // Background Trailer State
  const [isTrailerReady, setIsTrailerReady] = useState<boolean>(false);
  const [isTrailerMuted, setIsTrailerMuted] = useState<boolean>(true);
  const [isLogoError, setIsLogoError] = useState<boolean>(false);
  const trailerTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setDetailedMovie(movie);
    setIsTrailerReady(false);
    setIsLogoError(false);

    // Fetch full rich metadata (cast, director, high-res backdrop, trailer)
    mediaProvider.getMovie(movie.id).then((full) => {
      if (full) {
        setDetailedMovie(full);
      }
    });

    // Fetch similar movies
    mediaProvider.getMovies().then((all) => {
      setSimilarMovies(all.filter((m) => m.id !== movie.id).slice(0, 6));
    });

    // Auto-fade trailer after a short delay
    trailerTimerRef.current = setTimeout(() => {
      setIsTrailerReady(true);
    }, 1200);

    return () => {
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    };
  }, [movie.id]);

  const handleToggleFavorite = async () => {
    const nextState = await mediaProvider.toggleFavorite(movie.id, 'movie');
    setIsFavorite(nextState);
  };

  const handlePlayClick = async () => {
    setIsTrailerReady(false);
    setIsResolvingStreams(true);
    try {
      const streams = await addonService.fetchStreams(
        'movie',
        detailedMovie.id,
        undefined,
        undefined,
        detailedMovie.title,
        detailedMovie.ytTrailerId
      );
      if (streams && streams.length > 0) {
        const best = addonService.selectBestStream(streams);
        if (best) {
          onPlay(detailedMovie, best.url, best.streamType);
          return;
        }
      }
      onPlay(detailedMovie);
    } catch (e) {
      onPlay(detailedMovie);
    } finally {
      setIsResolvingStreams(false);
    }
  };

  const handleOpenSourceSelector = async () => {
    setIsResolvingStreams(true);
    try {
      const streams = await addonService.fetchStreams(
        'movie',
        detailedMovie.id,
        undefined,
        undefined,
        detailedMovie.title,
        detailedMovie.ytTrailerId
      );
      if (streams && streams.length > 0) {
        setAvailableStreams(streams);
      }
    } catch (e) {
    } finally {
      setIsResolvingStreams(false);
    }
  };

  const handleSelectStream = (stream: AddonStream) => {
    setIsTrailerReady(false);
    setAvailableStreams(null);
    onPlay(detailedMovie, stream.url, stream.streamType);
  };

  const trailerId = detailedMovie.ytTrailerId;

  return (
    <div className="tv-movie-details-screen tv-scroll-container">
      {/* 1. Static Cinematic Backdrop Poster (Layer 1) */}
      <div
        className="tv-details-backdrop"
        style={{ backgroundImage: `url(${detailedMovie.backdrop})` }}
      />

      {/* 2. Auto-playing YouTube Background Trailer (Layer 2) */}
      {trailerId && !isPlayerActive && (
        <div className={`tv-details-trailer-bg ${isTrailerReady ? 'visible' : 'hidden'}`}>
          <iframe
            src={`https://www.youtube.com/embed/${trailerId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${trailerId}&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
            allow="autoplay; encrypted-media"
            title={detailedMovie.title}
            className="tv-trailer-iframe"
          />
        </div>
      )}

      {/* 3. Cinematic Vignette & Scrim Gradient (Layer 3) */}
      <div className="tv-details-scrim" />

      {/* 4. Top Back Navigation Bar */}
      <div className="tv-details-top-bar">
        <Focusable
          id="movie-details-back"
          groupId="movie-details-nav"
          indexInGroup={0}
          scaleEffect={false}
          className="tv-back-focusable"
          onSelect={onBack}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={20} />
              <span>Back (B)</span>
            </div>
          )}
        </Focusable>
      </div>

      {/* 5. Main Details Hero Content */}
      <div className="tv-details-hero-content">
        {/* Genres Row */}
        <div className="tv-details-genres-row">
          {detailedMovie.genres.map((g) => (
            <span key={g} className="tv-genre-pill">{g}</span>
          ))}
        </div>

        {/* Movie Title or Transparent Logo (Amazon Prime Video style) */}
        {detailedMovie.logo && !isLogoError ? (
          <div className="tv-details-logo-container">
            <img
              src={detailedMovie.logo}
              alt={detailedMovie.title}
              className="tv-details-title-logo"
              onError={() => setIsLogoError(true)}
            />
          </div>
        ) : (
          <h1 className="tv-details-title">{detailedMovie.title}</h1>
        )}

        {/* Metadata Badges Row */}
        <div className="tv-details-meta-row">
          <span className="tv-meta-badge rating">
            <Star size={15} fill="currentColor" />
            {detailedMovie.rating}
          </span>
          <span className="tv-meta-badge year">
            <Calendar size={15} />
            {detailedMovie.year}
          </span>
          <span className="tv-meta-badge runtime">
            <Clock size={15} />
            {detailedMovie.runtime}
          </span>
          {trailerId && isTrailerReady && (
            <span className="tv-meta-badge trailer-live">
              <Film size={14} />
              <span>Official Trailer</span>
            </span>
          )}
        </div>

        {/* Plot Description */}
        <p className="tv-details-description">{detailedMovie.description}</p>

        {/* Director & Cast Details */}
        <div className="tv-details-credits">
          {detailedMovie.director && (
            <div className="tv-credit-item">
              <span className="label">Director:</span>
              <span className="value-highlight">{detailedMovie.director}</span>
            </div>
          )}
          {detailedMovie.cast && detailedMovie.cast.length > 0 && (
            <div className="tv-credit-item cast-row">
              <span className="label">Cast:</span>
              <div className="tv-cast-chips-wrap">
                {detailedMovie.cast.slice(0, 6).map((actor, idx) => (
                  <span key={idx} className="tv-cast-chip">{actor}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="tv-details-actions-row">
          <Focusable
            id="movie-details-play-btn"
            groupId="movie-details-actions"
            indexInGroup={0}
            autoFocus={true}
            className="tv-action-btn-focusable"
            scaleEffect={false}
            onSelect={handlePlayClick}
          >
            {(isFocused) => (
              <div className={`tv-details-play-btn ${isFocused ? 'focused' : ''}`}>
                {isResolvingStreams ? (
                  <Loader2 size={22} className="spin-icon" />
                ) : (
                  <Play size={22} fill="currentColor" />
                )}
                <span>{isResolvingStreams ? 'Finding best stream...' : 'Play Movie'}</span>
              </div>
            )}
          </Focusable>

          <Focusable
            id="movie-details-sources-btn"
            groupId="movie-details-actions"
            indexInGroup={1}
            className="tv-action-btn-focusable"
            scaleEffect={false}
            onSelect={handleOpenSourceSelector}
          >
            {(isFocused) => (
              <div className={`tv-details-audio-btn ${isFocused ? 'focused' : ''}`}>
                <Layers size={18} />
                <span>Choose Source</span>
              </div>
            )}
          </Focusable>

          {trailerId && (
            <Focusable
              id="movie-details-audio-btn"
              groupId="movie-details-actions"
              indexInGroup={2}
              className="tv-action-btn-focusable"
              scaleEffect={false}
              onSelect={() => setIsTrailerMuted((prev) => !prev)}
            >
              {(isFocused) => (
                <div className={`tv-details-audio-btn ${isFocused ? 'focused' : ''}`}>
                  {isTrailerMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  <span>{isTrailerMuted ? 'Unmute Trailer' : 'Mute Trailer'}</span>
                </div>
              )}
            </Focusable>
          )}

          <Focusable
            id="movie-details-fav-btn"
            groupId="movie-details-actions"
            indexInGroup={3}
            className="tv-action-btn-focusable"
            scaleEffect={false}
            onSelect={handleToggleFavorite}
          >
            {(isFocused) => (
              <div className={`tv-details-fav-btn ${isFocused ? 'focused' : ''}`}>
                <Heart size={20} fill={isFavorite ? '#ea4335' : 'none'} color={isFavorite ? '#ea4335' : 'currentColor'} />
                <span>{isFavorite ? 'In My Library' : 'Add to Library'}</span>
              </div>
            )}
          </Focusable>
        </div>
      </div>

      {/* 6. More Like This Similar Movies Rail */}
      {similarMovies.length > 0 && (
        <div className="tv-details-supporting-rail">
          <ContentRail id="movie-details-similar" title="More Like This" aspectRatio="poster">
            {similarMovies.map((sim, idx) => (
              <MovieCard
                key={sim.id}
                movie={sim}
                groupId="movie-details-similar"
                indexInGroup={idx}
                onSelect={onSelectSimilar}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        </div>
      )}

      {/* 7. Stream Selection Modal */}
      {availableStreams && (
        <StreamSelectModal
          mediaTitle={detailedMovie.title}
          mediaSubtitle={`${detailedMovie.year} • ${detailedMovie.runtime}`}
          streams={availableStreams}
          onSelectStream={handleSelectStream}
          onClose={() => setAvailableStreams(null)}
        />
      )}
    </div>
  );
};
