import React from 'react';
import { ContinueWatchingItem, mediaProvider } from '../../services/media/LiveMediaProvider';
import { POPULAR_SERIES_ITEMS } from '../../data/media/showcaseData';
import { Movie, Show, MediaItem } from '../../types';
import './MobileShowcaseRails.css';

interface MobileShowcaseRailsProps {
  continueWatching: ContinueWatchingItem[];
  popularSeries?: (Show | MediaItem)[];
  onSelectContinueItem: (item: ContinueWatchingItem) => void;
  onSelectMediaItem: (item: MediaItem) => void;
  onSelectShow: (show: Show) => void;
  onSelectMovie: (movie: Movie) => void;
}

export const MobileShowcaseRails: React.FC<MobileShowcaseRailsProps> = ({
  continueWatching,
  popularSeries,
  onSelectContinueItem,
  onSelectMediaItem: _onSelectMediaItem,
  onSelectShow,
  onSelectMovie: _onSelectMovie,
}) => {
  // Use real popular series from props or fallback to authentic series
  const seriesList = (popularSeries && popularSeries.length > 0)
    ? popularSeries
    : POPULAR_SERIES_ITEMS;

  const handleSelectSeries = async (item: Show | MediaItem) => {
    const realShow = await mediaProvider.getShow(item.id);
    if (realShow) {
      onSelectShow(realShow);
    } else {
      const show: Show = {
        id: item.id,
        title: item.title,
        description: (item as any).description || '',
        poster: (item as any).poster || (item as any).posterUrl || '',
        backdrop: (item as any).backdrop || (item as any).backdropUrl || '',
        year: (item as any).year || 2024,
        rating: (item as any).rating || '8.7',
        genres: (item as any).genres || (item as any).genre || ['Drama'],
        network: (item as any).network || (item as any).source || 'Streaming',
        status: 'Ongoing',
        seasons: (item as any).seasons || [
          { id: `${item.id}-s1`, showId: item.id, number: 1, name: 'Season 1', episodeCount: 8 }
        ],
        seasonsCount: (item as any).seasonsCount || 1,
      };
      onSelectShow(show);
    }
  };

  return (
    <div className="mobile-showcase-rails-container">
      {/* ─── 1. Continue Watching Section (Real user watch sessions) ─── */}
      {continueWatching && continueWatching.length > 0 && (
        <section className="mobile-showcase-rail" aria-label="Continue Watching">
          <div className="mobile-rail-header">
            <h2 className="mobile-rail-title">Continue Watching</h2>
          </div>

          <div className="mobile-rail-scroll-row">
            {continueWatching.map((item) => {
              // Calculate remaining duration text
              let remainingText = item.duration || '1h left';
              if (item.duration && !item.duration.includes('left')) {
                remainingText = `${item.duration} left`;
              }

              // Extract Season & Episode tag if applicable
              let seasonEpTag = '';
              if (item.type === 'episode' && item.media) {
                const ep = item.media as any;
                if (ep.seasonNumber && ep.number) {
                  seasonEpTag = `S${ep.seasonNumber} E${ep.number}`;
                }
              }

              return (
                <div
                  key={`mobile-cw-${item.id}`}
                  className="mobile-continue-card"
                  onClick={() => onSelectContinueItem(item)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Resume ${item.title}`}
                >
                  <div className="mobile-continue-artwork-wrap">
                    <img
                      src={item.backdrop || item.poster}
                      alt={item.title}
                      className="mobile-continue-img"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (item.poster && target.src !== item.poster) {
                          target.src = item.poster;
                        }
                      }}
                    />
                    <div className="mobile-continue-gradient" />

                    {/* Remaining duration pill in top-right */}
                    {remainingText && (
                      <div className="mobile-continue-duration-pill">
                        {remainingText}
                      </div>
                    )}

                    {/* Metadata & Title Overlay */}
                    <div className="mobile-continue-info">
                      {seasonEpTag && (
                        <span className="mobile-continue-tag">{seasonEpTag}</span>
                      )}
                      <h3 className="mobile-continue-title">{item.title}</h3>
                      {item.subtitle && (
                        <p className="mobile-continue-subtitle">{item.subtitle}</p>
                      )}

                      {/* Progress Bar */}
                      <div className="mobile-continue-progress-track">
                        <div
                          className="mobile-continue-progress-fill"
                          style={{ width: `${Math.max(10, Math.min(100, item.progress))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── 2. Popular - Series Section (Real Series from Catalog) ─── */}
      <section className="mobile-showcase-rail" aria-label="Popular Series">
        <div className="mobile-rail-header">
          <h2 className="mobile-rail-title">Popular - Series</h2>
        </div>

        <div className="mobile-rail-scroll-row">
          {seriesList.slice(0, 10).map((item) => {
            const posterImg = (item as any).poster || (item as any).posterUrl || (item as any).backdrop || (item as any).backdropUrl;
            return (
              <div
                key={`mobile-series-${item.id}`}
                className="mobile-series-card"
                onClick={() => handleSelectSeries(item)}
                role="button"
                tabIndex={0}
                aria-label={`View series ${item.title}`}
              >
                <div className="mobile-series-poster-wrap">
                  <img
                    src={posterImg}
                    alt={item.title}
                    className="mobile-series-poster-img"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if ((item as any).backdrop && target.src !== (item as any).backdrop) {
                        target.src = (item as any).backdrop;
                      }
                    }}
                  />
                  <div className="mobile-series-poster-gradient" />
                  <h3 className="mobile-series-card-title">{item.title}</h3>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
