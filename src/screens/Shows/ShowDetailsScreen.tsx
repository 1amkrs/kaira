import React, { useState, useEffect, useRef } from 'react';
import { Play, Heart, Star, Calendar, ArrowLeft, Tv, Loader2, Volume2, VolumeX, Film, Layers, Sparkles } from 'lucide-react';
import { Show, Episode } from '../../types/media';
import { AddonStream } from '../../types/addons';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { addonService } from '../../services/addons/AddonService';
import { Focusable } from '../../components/Focusable/Focusable';
import { EpisodeCard } from '../../components/MediaCard/EpisodeCard';
import { ShowCard } from '../../components/MediaCard/ShowCard';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { StreamSelectModal } from '../../components/Playback/StreamSelectModal';
import './ShowDetailsScreen.css';

interface ShowDetailsScreenProps {
  show: Show;
  onPlayEpisode: (episode: Episode, customStreamUrl?: string, streamType?: AddonStream['streamType']) => void;
  onSelectSimilar?: (show: Show) => void;
  onBack: () => void;
  isPlayerActive?: boolean;
}

export const ShowDetailsScreen: React.FC<ShowDetailsScreenProps> = ({
  show,
  onPlayEpisode,
  onSelectSimilar,
  onBack,
  isPlayerActive = false,
}) => {
  const [detailedShow, setDetailedShow] = useState<Show>(show);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(!!show.isFavorite);
  const [similarShows, setSimilarShows] = useState<Show[]>([]);
  const [isLogoError, setIsLogoError] = useState<boolean>(false);

  // Background Trailer State
  const [isTrailerReady, setIsTrailerReady] = useState<boolean>(false);
  const [isTrailerMuted, setIsTrailerMuted] = useState<boolean>(true);
  const trailerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stream Resolution
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolvingEpisode, setResolvingEpisode] = useState<Episode | null>(null);
  const [availableStreams, setAvailableStreams] = useState<AddonStream[] | null>(null);

  useEffect(() => {
    setDetailedShow(show);
    setIsTrailerReady(false);
    setIsLogoError(false);

    mediaProvider.getShow(show.id).then((res) => {
      if (res) {
        setDetailedShow(res);
        if (res.seasons && res.seasons.length > 0 && !res.seasons.some((s) => s.number === selectedSeason)) {
          setSelectedSeason(res.seasons[0].number);
        }
      }
    });

    mediaProvider.getShows().then((all) => {
      setSimilarShows(all.filter((s) => s.id !== show.id).slice(0, 6));
    });

    trailerTimerRef.current = setTimeout(() => {
      setIsTrailerReady(true);
    }, 1200);

    return () => {
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    };
  }, [show.id]);

  useEffect(() => {
    setIsLoadingEpisodes(true);
    mediaProvider.getEpisodes(show.id, selectedSeason).then((eps) => {
      setEpisodes(eps);
      setIsLoadingEpisodes(false);
    });
  }, [show.id, selectedSeason]);

  const handleToggleFavorite = async () => {
    const nextState = await mediaProvider.toggleFavorite(show.id, 'show');
    setIsFavorite(nextState);
  };

  const handleEpisodeSelect = async (ep: Episode) => {
    setIsTrailerReady(false);
    setResolvingEpisode(ep);
    setIsResolving(true);
    try {
      const cleanImdb = detailedShow.imdbId || (detailedShow.id.startsWith('tt') ? detailedShow.id : detailedShow.id.replace(/^show-/, ''));
      const streams = await addonService.fetchStreams(
        'series',
        cleanImdb,
        ep.seasonNumber,
        ep.number,
        `${detailedShow.title} S${ep.seasonNumber}E${ep.number}`,
        undefined
      );
      if (streams && streams.length > 0) {
        const best = addonService.selectBestStream(streams);
        if (best) {
          onPlayEpisode(ep, best.url, best.streamType);
          return;
        }
      }
      onPlayEpisode(ep);
    } catch (e) {
      onPlayEpisode(ep);
    } finally {
      setIsResolving(false);
      setResolvingEpisode(null);
    }
  };

  const handleOpenSourceSelector = async (ep?: Episode) => {
    const targetEp = ep || (episodes.length > 0 ? episodes[0] : null);
    if (!targetEp) return;
    setResolvingEpisode(targetEp);
    setIsResolving(true);
    try {
      const cleanImdb = detailedShow.imdbId || (detailedShow.id.startsWith('tt') ? detailedShow.id : detailedShow.id.replace(/^show-/, ''));
      const streams = await addonService.fetchStreams(
        'series',
        cleanImdb,
        targetEp.seasonNumber,
        targetEp.number,
        `${detailedShow.title} S${targetEp.seasonNumber}E${targetEp.number}`,
        undefined
      );
      if (streams && streams.length > 0) {
        setAvailableStreams(streams);
      }
    } catch (e) {
    } finally {
      setIsResolving(false);
    }
  };

  const handleSelectStream = (stream: AddonStream) => {
    if (!resolvingEpisode) return;
    setIsTrailerReady(false);
    setAvailableStreams(null);
    onPlayEpisode(resolvingEpisode, stream.url, stream.streamType);
    setResolvingEpisode(null);
  };

  const seasonsList = detailedShow.seasons && detailedShow.seasons.length > 0
    ? detailedShow.seasons
    : Array.from({ length: detailedShow.seasonsCount || 1 }, (_, i) => ({
        id: `s-${i + 1}`,
        showId: detailedShow.id,
        number: i + 1,
        name: `Season ${i + 1}`,
      }));

  const trailerId = detailedShow.ytTrailerId;
  const firstEpisode = episodes.length > 0 ? episodes[0] : null;

  return (
    <div className="tv-show-details-screen tv-scroll-container">
      {/* 1. Static Cinematic Backdrop Poster (Layer 1) */}
      <div
        className="tv-show-backdrop"
        style={{ backgroundImage: `url(${detailedShow.backdrop})` }}
      />

      {/* 2. Auto-playing YouTube Background Trailer (Layer 2) */}
      {trailerId && !isPlayerActive && (
        <div className={`tv-details-trailer-bg ${isTrailerReady ? 'visible' : 'hidden'}`}>
          <iframe
            src={`https://www.youtube.com/embed/${trailerId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${trailerId}&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
            allow="autoplay; encrypted-media"
            title={detailedShow.title}
            className="tv-trailer-iframe"
          />
        </div>
      )}

      {/* 3. Cinematic Vignette & Scrim Gradient (Layer 3) */}
      <div className="tv-show-scrim" />

      {/* 4. Top Back Navigation Bar */}
      <div className="tv-show-top-bar">
        <Focusable
          id="show-details-back"
          groupId="show-details-nav"
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

      {/* 5. Main Show Details Hero Content */}
      <div className="tv-show-hero-content">
        {/* Genres Row */}
        <div className="tv-show-genres-row">
          {detailedShow.genres.map((g) => (
            <span key={g} className="tv-genre-pill">{g}</span>
          ))}
        </div>

        {/* Show Title or Transparent Clearart Logo */}
        {detailedShow.logo && !isLogoError ? (
          <div className="tv-details-logo-container">
            <img
              src={detailedShow.logo}
              alt={detailedShow.title}
              className="tv-details-title-logo"
              onError={() => setIsLogoError(true)}
            />
          </div>
        ) : (
          <h1 className="tv-show-details-title">{detailedShow.title}</h1>
        )}

        {/* Metadata Badges Row */}
        <div className="tv-show-meta-row">
          <span className="tv-meta-badge rating">
            <Star size={15} fill="currentColor" />
            {detailedShow.rating}
          </span>
          <span className="tv-meta-badge year">
            <Calendar size={15} />
            {detailedShow.year}
          </span>
          <span className="tv-meta-badge seasons">
            <Layers size={15} />
            {detailedShow.seasonsCount || seasonsList.length} {detailedShow.seasonsCount === 1 ? 'Season' : 'Seasons'}
          </span>
          {detailedShow.network && (
            <span className="tv-meta-badge network">
              <Tv size={15} />
              {detailedShow.network}
            </span>
          )}
          {trailerId && isTrailerReady && (
            <span className="tv-meta-badge trailer-live">
              <Film size={14} />
              <span>Official Trailer</span>
            </span>
          )}
        </div>

        {/* Plot Description */}
        <p className="tv-show-description">{detailedShow.description}</p>

        {/* Creators & Cast Chips */}
        {((detailedShow.cast && detailedShow.cast.length > 0) || detailedShow.network) && (
          <div className="tv-details-credits">
            {detailedShow.network && (
              <div className="tv-credit-item">
                <span className="label">Network:</span>
                <span className="value-highlight">{detailedShow.network}</span>
              </div>
            )}
            {detailedShow.cast && detailedShow.cast.length > 0 && (
              <div className="tv-credit-item cast-row">
                <span className="label">Cast:</span>
                <div className="tv-cast-chips-wrap">
                  {detailedShow.cast.slice(0, 6).map((actor, idx) => (
                    <span key={idx} className="tv-cast-chip">{actor}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="tv-show-actions-row">
          {firstEpisode && (
            <Focusable
              id="show-details-play-first"
              groupId="show-details-actions"
              indexInGroup={0}
              autoFocus={true}
              className="tv-action-btn-focusable"
              scaleEffect={false}
              onSelect={() => handleEpisodeSelect(firstEpisode)}
            >
              {(isFocused) => (
                <div className={`tv-details-play-btn ${isFocused ? 'focused' : ''}`}>
                  {isResolving ? (
                    <Loader2 size={22} className="spin-icon" />
                  ) : (
                    <Play size={22} fill="currentColor" />
                  )}
                  <span>{isResolving ? 'Finding best stream...' : `Play S${selectedSeason}E1`}</span>
                </div>
              )}
            </Focusable>
          )}

          {firstEpisode && (
            <Focusable
              id="show-details-sources-btn"
              groupId="show-details-actions"
              indexInGroup={1}
              className="tv-action-btn-focusable"
              scaleEffect={false}
              onSelect={() => handleOpenSourceSelector(firstEpisode)}
            >
              {(isFocused) => (
                <div className={`tv-details-audio-btn ${isFocused ? 'focused' : ''}`}>
                  <Layers size={18} />
                  <span>Choose Source</span>
                </div>
              )}
            </Focusable>
          )}

          {trailerId && (
            <Focusable
              id="show-details-audio-btn"
              groupId="show-details-actions"
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
            id="show-details-fav-btn"
            groupId="show-details-actions"
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

      {/* 6. Season Selector Tabs & Episodes Rail */}
      <div className="tv-show-seasons-section">
        <h3 className="tv-seasons-title">Episodes</h3>
        <div className="tv-seasons-tabs-row" role="tablist">
          {seasonsList.map((season, idx) => (
            <Focusable
              key={season.id}
              id={`season-tab-${season.number}`}
              groupId="season-tabs"
              indexInGroup={idx}
              className="tv-season-tab-focusable"
              scaleEffect={false}
              onSelect={() => setSelectedSeason(season.number)}
            >
              {(isFocused) => (
                <div
                  className={`tv-season-tab-pill ${isFocused ? 'focused' : ''} ${
                    selectedSeason === season.number ? 'active' : ''
                  }`}
                >
                  <span>{season.name || `Season ${season.number}`}</span>
                </div>
              )}
            </Focusable>
          ))}
        </div>

        {/* Episodes Rail */}
        <div className="tv-episodes-horizontal-rail tv-horizontal-scroll" role="list">
          {isLoadingEpisodes ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={`ep-skel-${idx}`} className="tv-episode-skel-card shimmer" />
            ))
          ) : episodes.length > 0 ? (
            episodes.map((ep, idx) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                groupId="episodes-list"
                indexInGroup={idx}
                onSelect={handleEpisodeSelect}
              />
            ))
          ) : (
            <span className="tv-empty-episodes">No episodes found for Season {selectedSeason}</span>
          )}
        </div>
      </div>

      {/* 7. More Like This Similar Shows Rail */}
      {similarShows.length > 0 && onSelectSimilar && (
        <div className="tv-details-supporting-rail">
          <ContentRail id="show-details-similar" title="More Like This" aspectRatio="poster">
            {similarShows.map((sim, idx) => (
              <ShowCard
                key={sim.id}
                show={sim}
                groupId="show-details-similar"
                indexInGroup={idx}
                onSelect={onSelectSimilar}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        </div>
      )}

      {/* 8. Stream Selection Modal */}
      {availableStreams && resolvingEpisode && (
        <StreamSelectModal
          mediaTitle={`${detailedShow.title} - S${resolvingEpisode.seasonNumber}E${resolvingEpisode.number}`}
          mediaSubtitle={resolvingEpisode.title}
          streams={availableStreams}
          onSelectStream={handleSelectStream}
          onClose={() => {
            setAvailableStreams(null);
            setResolvingEpisode(null);
          }}
        />
      )}
    </div>
  );
};
