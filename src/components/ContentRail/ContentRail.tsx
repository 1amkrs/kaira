import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import './ContentRail.css';

interface ContentRailProps {
  id: string;
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  aspectRatio?: 'poster' | '16:9' | '1:1';
  children?: React.ReactNode;
}

export const ContentRail: React.FC<ContentRailProps> = ({
  id,
  title,
  subtitle,
  isLoading = false,
  error = null,
  onRetry,
  aspectRatio = 'poster',
  children,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  useEffect(() => {
    updateScrollState();
    // Delay check to allow DOM and image rendering to settle
    const timer = setTimeout(updateScrollState, 300);
    const timer2 = setTimeout(updateScrollState, 800);

    const el = trackRef.current;
    if (el) {
      el.addEventListener('scroll', updateScrollState, { passive: true });
    }
    window.addEventListener('resize', updateScrollState);

    let resizeObserver: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    }

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      if (el) {
        el.removeEventListener('scroll', updateScrollState);
      }
      window.removeEventListener('resize', updateScrollState);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateScrollState, children, isLoading]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 380);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(updateScrollState, 350);
  };

  return (
    <section className="tv-content-rail-section" aria-label={title} id={`rail-section-${id}`}>
      {/* Rail Header with Title and Scroll Controls */}
      <div className="tv-rail-header">
        <div className="tv-rail-header-text">
          <h3 className="tv-rail-title">{title}</h3>
          {subtitle && <span className="tv-rail-subtitle">{subtitle}</span>}
        </div>

        {!isLoading && !error && (
          <div className="tv-rail-header-nav" aria-label="Rail navigation">
            <button
              type="button"
              className={`tv-rail-nav-btn ${!canScrollLeft ? 'disabled' : ''}`}
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${title} backward`}
              title="Previous items"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={`tv-rail-nav-btn ${!canScrollRight ? 'disabled' : ''}`}
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              aria-label={`Scroll ${title} forward`}
              title="Next items"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Content Track */}
      {error ? (
        <div className="tv-rail-error-container">
          <div className="tv-rail-error-message">
            <AlertCircle size={20} className="error-icon" />
            <span>Media unavailable. {error}</span>
          </div>
          {onRetry && (
            <Focusable
              id={`rail-retry-${id}`}
              groupId={`rail-error-${id}`}
              className="tv-rail-retry-btn"
              onSelect={onRetry}
            >
              {(isFocused) => (
                <div className={`tv-retry-inner ${isFocused ? 'focused' : ''}`}>
                  <RefreshCw size={16} />
                  <span>Retry</span>
                </div>
              )}
            </Focusable>
          )}
        </div>
      ) : isLoading ? (
        <div className="tv-horizontal-scroll tv-rail-scroll-track" role="list">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`skeleton-${idx}`}
              className={`tv-rail-skeleton-card ratio-${aspectRatio}`}
              aria-hidden="true"
            >
              <div className="tv-skeleton-box shimmer" />
              <div className="tv-skeleton-line short shimmer" />
              <div className="tv-skeleton-line tiny shimmer" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={trackRef}
          className="tv-horizontal-scroll tv-rail-scroll-track"
          role="list"
        >
          {children}
        </div>
      )}
    </section>
  );
};

