import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
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
  return (
    <section className="tv-content-rail-section" aria-label={title}>
      {/* Rail Header */}
      <div className="tv-rail-header">
        <h3 className="tv-rail-title">{title}</h3>
        {subtitle && <span className="tv-rail-subtitle">{subtitle}</span>}
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
        <div className="tv-horizontal-scroll tv-rail-scroll-track" role="list">
          {children}
        </div>
      )}
    </section>
  );
};
