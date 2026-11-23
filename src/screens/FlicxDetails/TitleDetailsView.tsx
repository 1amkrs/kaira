import React, { useState, useEffect } from 'react';
import {
  Play,
  ArrowLeft,
  Star,
  Download,
  FolderOpen,
  Bookmark,
  Check,
  Video,
  ExternalLink,
} from 'lucide-react';
import { Movie, Show } from '../../types/media';
import { FlicxDownloadService, DownloadFile } from '../../services/flicx/FlicxDownloadService';
import './TitleDetailsView.css';

interface TitleDetailsViewProps {
  item: Movie | Show;
  isMovie: boolean;
  onPlay: (item: Movie | Show, season?: number, episode?: number) => void;
  onBack: () => void;
  onSelectSimilar?: (item: Movie | Show) => void;
}

export const TitleDetailsView: React.FC<TitleDetailsViewProps> = ({
  item,
  isMovie,
  onPlay,
  onBack,
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [downloadFiles, setDownloadFiles] = useState<DownloadFile[]>([]);
  const [folderUrl, setFolderUrl] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showTrailerModal, setShowTrailerModal] = useState<boolean>(false);

  // Load downloads from FlicxDownloadService
  useEffect(() => {
    if (isMovie) {
      const pkg = FlicxDownloadService.getMovieDownloads(item.title, item.year);
      setDownloadFiles(pkg.files);
      setFolderUrl(pkg.folderUrl);
    } else {
      const pkg = FlicxDownloadService.getShowEpisodeDownloads(item.title, selectedSeason, 1);
      setDownloadFiles(pkg.files);
      setFolderUrl(pkg.folderUrl);
    }

    // Check saved status in library
    try {
      const lib = JSON.parse(localStorage.getItem('flicx:library') || '[]');
      setIsSaved(lib.some((i: any) => i.id === item.id));
    } catch {
      // Ignored
    }
  }, [item, isMovie, selectedSeason]);

  const toggleSaveLibrary = () => {
    try {
      const lib = JSON.parse(localStorage.getItem('flicx:library') || '[]');
      let updated;
      if (isSaved) {
        updated = lib.filter((i: any) => i.id !== item.id);
        setIsSaved(false);
      } else {
        updated = [item, ...lib];
        setIsSaved(true);
      }
      localStorage.setItem('flicx:library', JSON.stringify(updated));
    } catch {
      // Ignored
    }
  };

  const seasonsCount = (item as any).seasonsCount || 1;
  const runtime = (item as any).runtime || '2h 10m';

  return (
    <div className="flicx-details-page">
      {/* ─── Hero Banner ─── */}
      <div className="flicx-hero-banner">
        <img
          src={item.backdrop || item.poster}
          alt={item.title}
          className="flicx-hero-backdrop"
        />
        <div className="flicx-hero-gradient" />

        {/* Back Button Floating */}
        <button
          className="capsule-btn capsule-btn-text"
          style={{ position: 'absolute', top: 24, left: 32, zIndex: 10 }}
          onClick={onBack}
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        {/* Hero Content */}
        <div className="flicx-hero-content">
          <h1 className="flicx-title-name">{item.title}</h1>

          <div className="flicx-title-meta-row">
            {item.rating && (
              <span className="rating-badge">
                <Star size={16} fill="currentColor" />
                <span>{item.rating} / 10</span>
              </span>
            )}
            {item.rating && <span className="flicx-meta-dot">·</span>}

            {item.year && <span>{item.year}</span>}
            {runtime && (
              <>
                <span className="flicx-meta-dot">·</span>
                <span>{runtime}</span>
              </>
            )}
            <span className="fx-tag">PG-13</span>

            {item.genres && item.genres.length > 0 && (
              <>
                <span className="flicx-meta-dot">·</span>
                <span>{item.genres.join(' · ')}</span>
              </>
            )}
          </div>

          <div className="flicx-action-row">
            <button
              className="capsule-btn capsule-btn-play capsule-btn-lit"
              onClick={() => onPlay(item, isMovie ? undefined : selectedSeason, 1)}
            >
              <Play size={18} fill="currentColor" />
              <span>Play</span>
            </button>

            {item.ytTrailerId && (
              <button
                className="capsule-btn capsule-btn-text"
                onClick={() => setShowTrailerModal(true)}
              >
                <Video size={18} />
                <span>Trailer</span>
              </button>
            )}

            <button className="capsule-btn capsule-btn-text" onClick={toggleSaveLibrary}>
              {isSaved ? <Check size={18} /> : <Bookmark size={18} />}
              <span>{isSaved ? 'In Library' : 'Add to Library'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Details Body ─── */}
      <div className="flicx-details-body">
        {/* Storyline */}
        <div className="flicx-story-box">
          <div className="eyebrow">Storyline</div>
          <p className="flicx-story-text">
            {item.description || 'No detailed overview available for this title.'}
          </p>
        </div>

        {/* ─── Signature Kaira Download Section ─── */}
        <div className="downloads-part">
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} />
            <span>Download High-Definition Releases</span>
          </div>

          {!isMovie && seasonsCount > 1 && (
            <div className="flicx-season-tabs">
              {Array.from({ length: seasonsCount }).map((_, idx) => (
                <button
                  key={`season-${idx + 1}`}
                  className={`flicx-season-tab ${selectedSeason === idx + 1 ? 'active' : ''}`}
                  onClick={() => setSelectedSeason(idx + 1)}
                >
                  Season {idx + 1}
                </button>
              ))}
            </div>
          )}

          <ul className="dl-list" aria-label="Available download files">
            {downloadFiles.map((file, idx) => (
              <li key={`dl-${idx}`}>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="dl-file"
                  title={file.name}
                >
                  <div className="dl-file-text">
                    <span className="dl-file-title">{file.quality}</span>
                    <span className="dl-file-meta">{file.tags.join(' · ')}</span>
                  </div>

                  <div className="dl-file-right">
                    <span className="dl-file-size">{file.sizeStr}</span>
                    <Download className="dl-file-icon" />
                  </div>
                </a>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 16 }}>
            <a
              href={folderUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="dl-folder"
            >
              <FolderOpen size={16} />
              <span>Open the folder in media directory</span>
              <ExternalLink size={12} style={{ opacity: 0.6 }} />
            </a>
          </div>
        </div>

        {/* Cast & Crew */}
        {item.cast && item.cast.length > 0 && (
          <div>
            <div className="eyebrow">Cast &amp; Characters</div>
            <div className="flicx-cast-row">
              {item.cast.map((actor, idx) => (
                <div key={`actor-${idx}`} className="flicx-cast-card">
                  <div className="flicx-cast-avatar" />
                  <div className="flicx-cast-info">
                    <span className="flicx-cast-name">{actor}</span>
                    <span className="flicx-cast-role">Actor</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Trailer Modal ─── */}
      {showTrailerModal && item.ytTrailerId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowTrailerModal(false)}
        >
          <div
            style={{
              width: '90%',
              maxWidth: 960,
              aspectRatio: '16/9',
              background: '#000000',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${item.ytTrailerId}?autoplay=1`}
              title="Official Trailer"
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
};
