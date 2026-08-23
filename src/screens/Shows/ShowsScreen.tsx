import React, { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { Show } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { ShowCard } from '../../components/MediaCard/ShowCard';
import { Focusable } from '../../components/Focusable/Focusable';
import './ShowsScreen.css';

interface ShowsScreenProps {
  onSelectShow: (show: Show) => void;
  onPlayShow?: (show: Show) => void;
}

export const ShowsScreen: React.FC<ShowsScreenProps> = ({ onSelectShow, onPlayShow }) => {
  const [shows, setShows] = useState<Show[]>([]);
  const [favorites, setFavorites] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allShows, favs] = await Promise.all([
        mediaProvider.getShows(),
        mediaProvider.getFavorites(),
      ]);
      setShows(allShows);
      setFavorites(favs.shows);
    } catch (e) {
      setError('Unable to load TV series');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const featured = shows.length > 0 ? shows[0] : null;
  const recentlyAdded = shows.slice(1, 7);
  const popular = shows.slice(3, 10);
  const dramaShows = shows.filter(s => s.genres.includes('Drama'));

  return (
    <div className="tv-shows-screen tv-scroll-container">
      {/* Featured Show Hero Billboard */}
      {featured && (
        <section className="tv-show-hero-billboard">
          <div
            className="tv-show-hero-bg"
            style={{ backgroundImage: `url(${featured.backdrop})` }}
          >
            <div className="tv-show-hero-scrim" />
          </div>

          <div className="tv-show-hero-content">
            <span className="tv-show-hero-badge">Featured TV Series</span>
            <h1 className="tv-show-hero-title">{featured.title}</h1>
            <div className="tv-show-hero-meta">
              <span className="rating-pill">{featured.rating}</span>
              <span>{featured.year}</span>
              <span className="tv-meta-dot" aria-hidden="true" />
              <span>{featured.genres.join(', ')}</span>
              {featured.network && (
                <>
                  <span className="tv-meta-dot" aria-hidden="true" />
                  <span>{featured.network}</span>
                </>
              )}
            </div>
            <p className="tv-show-hero-desc text-line-clamp-2">{featured.description}</p>

            <div className="tv-show-hero-actions">
              <Focusable
                id="hero-show-play"
                groupId="shows-hero"
                indexInGroup={0}
                className="tv-hero-btn-focusable"
                onSelect={() => {
                  if (onPlayShow) onPlayShow(featured);
                  else onSelectShow(featured);
                }}
              >
                {(isFocused) => (
                  <div className={`tv-hero-play-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>Watch Now</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="hero-show-details"
                groupId="shows-hero"
                indexInGroup={1}
                className="tv-hero-btn-focusable"
                onSelect={() => onSelectShow(featured)}
              >
                {(isFocused) => (
                  <div className={`tv-hero-info-btn ${isFocused ? 'focused' : ''}`}>
                    <Info size={20} />
                    <span>Details</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </section>
      )}

      {/* Rails */}
      <div className="tv-shows-rails-container">
        {favorites.length > 0 && (
          <ContentRail id="shows-favorites" title="My Favorite Shows" aspectRatio="poster">
            {favorites.map((s, idx) => (
              <ShowCard
                key={`fav-${s.id}`}
                show={s}
                groupId="shows-favorites"
                indexInGroup={idx}
                onSelect={onSelectShow}
                aspectRatio="poster"
              />
            ))}
          </ContentRail>
        )}

        <ContentRail
          id="shows-popular"
          title="Popular TV Shows"
          isLoading={isLoading}
          error={error}
          onRetry={loadData}
          aspectRatio="poster"
        >
          {popular.map((s, idx) => (
            <ShowCard
              key={`pop-${s.id}`}
              show={s}
              groupId="shows-popular"
              indexInGroup={idx}
              onSelect={onSelectShow}
              aspectRatio="poster"
            />
          ))}
        </ContentRail>

        <ContentRail
          id="shows-recent"
          title="Recently Added Series"
          isLoading={isLoading}
          aspectRatio="16:9"
        >
          {recentlyAdded.map((s, idx) => (
            <ShowCard
              key={`rec-${s.id}`}
              show={s}
              groupId="shows-recent"
              indexInGroup={idx}
              onSelect={onSelectShow}
              aspectRatio="16:9"
            />
          ))}
        </ContentRail>

        <ContentRail
          id="shows-drama"
          title="Critically Acclaimed Dramas"
          isLoading={isLoading}
          aspectRatio="poster"
        >
          {dramaShows.map((s, idx) => (
            <ShowCard
              key={`drama-${s.id}`}
              show={s}
              groupId="shows-drama"
              indexInGroup={idx}
              onSelect={onSelectShow}
              aspectRatio="poster"
            />
          ))}
        </ContentRail>

        <ContentRail
          id="shows-all"
          title="All TV Series"
          isLoading={isLoading}
          aspectRatio="poster"
        >
          {shows.map((s, idx) => (
            <ShowCard
              key={`all-${s.id}`}
              show={s}
              groupId="shows-all"
              indexInGroup={idx}
              onSelect={onSelectShow}
              aspectRatio="poster"
            />
          ))}
        </ContentRail>
      </div>
      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
