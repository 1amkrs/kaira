import React, { useState, useEffect, useRef } from 'react';
import { ShowcaseHeroItem, SHOWCASE_HERO_ITEMS } from '../../data/media/showcaseData';
import { Movie, Show, MediaItem } from '../../types';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import './MobileShowcaseHero.css';

interface MobileShowcaseHeroProps {
  heroItems?: (Movie | Show | MediaItem)[];
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
  onPlayMovie: (movie: Movie) => void;
}

export const MobileShowcaseHero: React.FC<MobileShowcaseHeroProps> = ({
  heroItems,
  onSelectMovie,
  onSelectShow,
  onPlayMovie: _onPlayMovie,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const timerRef = useRef<any>(null);

  // Normalize real items passed from HomeScreen or fallback to authentic showcase items
  const items: ShowcaseHeroItem[] = (heroItems && heroItems.length > 0)
    ? heroItems.slice(0, 8).map((item) => {
        const isShow = 'seasons' in item || ('type' in item && (item as any).type === 'show');
        const poster = (item as any).poster || (item as any).posterUrl || '';
        const backdrop = (item as any).backdrop || (item as any).backdropUrl || poster;
        const genres = (item as any).genres || (item as any).genre || ['Drama'];
        const year = String((item as any).year || 2024);
        const rating = (item as any).rating || '8.7';
        const source = (item as any).network || (item as any).source || 'Streaming';
        const streamUrl = (item as any).streamUrl || '';
        
        return {
          id: item.id,
          title: item.title,
          type: isShow ? ('show' as const) : ('movie' as const),
          typeLabel: isShow ? 'Series' : 'Movie',
          genres,
          year,
          backdropUrl: backdrop,
          posterUrl: poster,
          description: (item as any).description || '',
          rating,
          source,
          streamUrl,
          metadataBadge: `${isShow ? 'Series' : 'Movie'} • ${genres[0] || 'Drama'} • ${year}`,
        };
      })
    : SHOWCASE_HERO_ITEMS;

  const currentItem: ShowcaseHeroItem = items[activeIndex] || items[0];

  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 7000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeIndex, items.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || items.length <= 1) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 45) {
      // Swiped left -> next
      setActiveIndex((prev) => (prev + 1) % items.length);
    } else if (diff < -45) {
      // Swiped right -> prev
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleAction = async () => {
    if (!currentItem) return;
    
    if (currentItem.type === 'show') {
      const realShow = await mediaProvider.getShow(currentItem.id);
      if (realShow) {
        onSelectShow(realShow);
      } else {
        const show: Show = {
          id: currentItem.id,
          title: currentItem.title,
          description: currentItem.description,
          poster: currentItem.posterUrl,
          backdrop: currentItem.backdropUrl,
          year: parseInt(currentItem.year, 10) || 2024,
          rating: currentItem.rating,
          genres: currentItem.genres,
          network: currentItem.source,
          status: 'Ongoing',
          seasons: [
            { id: `${currentItem.id}-s1`, showId: currentItem.id, number: 1, name: 'Season 1', episodeCount: 8 }
          ],
          seasonsCount: 1,
        };
        onSelectShow(show);
      }
    } else {
      const realMovie = await mediaProvider.getMovie(currentItem.id);
      if (realMovie) {
        onSelectMovie(realMovie);
      } else {
        const movie: Movie = {
          id: currentItem.id,
          title: currentItem.title,
          description: currentItem.description,
          poster: currentItem.posterUrl,
          backdrop: currentItem.backdropUrl,
          year: parseInt(currentItem.year, 10) || 2024,
          runtime: currentItem.duration || '2h 15m',
          rating: currentItem.rating,
          genres: currentItem.genres,
          streamUrl: currentItem.streamUrl,
        };
        onSelectMovie(movie);
      }
    }
  };

  return (
    <section
      className="mobile-showcase-hero"
      aria-label="Featured Showcase"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Image Carousel */}
      <div className="mobile-showcase-backdrop-wrapper">
        <img
          key={currentItem.id}
          src={currentItem.backdropUrl || currentItem.posterUrl}
          alt={currentItem.title}
          className="mobile-showcase-img"
          loading="eager"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (currentItem.posterUrl && target.src !== currentItem.posterUrl) {
              target.src = currentItem.posterUrl;
            }
          }}
        />
        {/* Soft atmospheric gradient transitions */}
        <div className="mobile-showcase-top-gradient" />
        <div className="mobile-showcase-bottom-gradient" />
      </div>

      {/* Foreground Hero Information */}
      <div className="mobile-showcase-info">
        {/* Title */}
        <h1 className="mobile-showcase-title">
          <span>{currentItem.title}</span>
        </h1>

        {/* Metadata Line e.g. Series • Sci-Fi • 2025 */}
        <p className="mobile-showcase-meta">
          {currentItem.metadataBadge || `${currentItem.type === 'show' ? 'Series' : 'Movie'} • ${currentItem.genres[0]} • ${currentItem.year}`}
        </p>

        {/* View Details Capsule Button */}
        <button
          type="button"
          className="mobile-showcase-action-btn"
          onClick={handleAction}
          aria-label={`View Details for ${currentItem.title}`}
        >
          <span>View Details</span>
        </button>

        {/* Pagination Dots */}
        {items.length > 1 && (
          <div className="mobile-showcase-dots" role="tablist" aria-label="Hero Carousel Navigation">
            {items.map((item, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={`hero-dot-${item.id}-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Go to slide ${idx + 1}: ${item.title}`}
                  className={`mobile-dot ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveIndex(idx)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
