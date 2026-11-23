import React, { useState, useEffect } from 'react';
import { Download, Upload, Trash2, Bookmark } from 'lucide-react';
import { Movie, Show } from '../../types/media';
import { FlicxSettingsService } from '../../services/flicx/FlicxSettingsService';

interface FlicxLibraryScreenProps {
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
}

export const FlicxLibraryScreen: React.FC<FlicxLibraryScreenProps> = ({
  onSelectMovie,
  onSelectShow,
}) => {
  const [libraryItems, setLibraryItems] = useState<(Movie | Show)[]>([]);

  const reloadLibrary = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('flicx:library') || '[]');
      setLibraryItems(saved);
    } catch {
      setLibraryItems([]);
    }
  };

  useEffect(() => {
    reloadLibrary();
  }, []);

  const handleExport = () => {
    FlicxSettingsService.exportLibraryData();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      FlicxSettingsService.importLibraryData(file).then(() => {
        reloadLibrary();
      });
    }
  };

  const clearLibrary = () => {
    if (window.confirm('Clear all saved titles from your library?')) {
      localStorage.removeItem('flicx:library');
      setLibraryItems([]);
    }
  };

  return (
    <div style={{ maxWidth: 'var(--content-max-width)', margin: '0 auto', padding: '36px 40px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', fontWeight: 800, color: '#ffffff' }}>
            My Library
          </h1>
          <p style={{ color: 'var(--color-fg-muted)', marginTop: 6, fontSize: '0.96rem' }}>
            Your saved titles, watch history, and progress backed up locally.
          </p>
        </div>

        {/* Action Buttons matching Flicx Data Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="capsule-btn capsule-btn-text" onClick={handleExport} title="Export library to JSON">
            <Download size={16} />
            <span>Save to a file</span>
          </button>

          <label className="capsule-btn capsule-btn-text" style={{ cursor: 'pointer' }} title="Import library JSON">
            <Upload size={16} />
            <span>Restore from file</span>
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>

          {libraryItems.length > 0 && (
            <button className="capsule-btn capsule-btn-text" onClick={clearLibrary} title="Clear library">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {libraryItems.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--color-line)',
            borderRadius: 16,
          }}
        >
          <Bookmark size={48} color="var(--color-fg-subtle)" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>Your library is empty</h3>
          <p style={{ color: 'var(--color-fg-muted)', marginTop: 8, maxWidth: 420 }}>
            Browse films and series across Flicx, and click &ldquo;Add to Library&rdquo; to keep track of what you want to watch.
          </p>
        </div>
      ) : (
        <div className="flicx-grid">
          {libraryItems.map((item) => {
            const isMovie = !('seasonsCount' in item);
            return (
              <div
                key={item.id}
                className="flicx-card"
                onClick={() => (isMovie ? onSelectMovie(item as Movie) : onSelectShow(item as Show))}
              >
                <div className="flicx-card-poster">
                  <img src={item.poster} alt={item.title} loading="lazy" />
                </div>
                <span className="flicx-card-title">{item.title}</span>
                <span className="flicx-card-meta">
                  {item.rating && <span style={{ color: '#f5c518', fontWeight: 600 }}>★ {item.rating}</span>}
                  {item.year && <span>{item.year}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
