import React, { useState, useEffect } from 'react';
import { Palette, Sliders, HardDrive, Key, Download, Upload, ArrowLeft } from 'lucide-react';
import { FlicxSettingsService, FlicxSettings } from '../../services/flicx/FlicxSettingsService';

interface FlicxSettingsScreenProps {
  onBack: () => void;
}

export const FlicxSettingsScreen: React.FC<FlicxSettingsScreenProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<FlicxSettings>(() => FlicxSettingsService.get());
  const [febboxInput, setFebboxInput] = useState<string>(() => settings.febboxToken || '');
  const [isSavedToast, setIsSavedToast] = useState<boolean>(false);

  useEffect(() => {
    FlicxSettingsService.applyToDOM();
  }, []);

  const handleUpdate = (partial: Partial<FlicxSettings>) => {
    const updated = FlicxSettingsService.update(partial);
    setSettings(updated);
  };

  const handleSaveFebbox = () => {
    handleUpdate({ febboxToken: febboxInput.trim() || null });
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '36px 32px 80px' }}>
      <button className="capsule-btn capsule-btn-text" onClick={onBack} style={{ marginBottom: 24 }}>
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>

      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', fontWeight: 800, color: '#ffffff' }}>
          Settings
        </h1>
        <p style={{ color: 'var(--color-fg-muted)', marginTop: 6, fontSize: '0.96rem' }}>
          Personalize playback, appearance themes, and storage integrations.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Appearance Group */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid var(--color-line)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Palette size={20} color="var(--brand)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>Appearance</h2>
          </div>

          {/* Accent Hue */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
              <span style={{ fontWeight: 600 }}>Brand Accent Color</span>
              <span style={{ color: 'var(--color-fg-muted)' }}>Hue {settings.accentHue}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="359"
              value={settings.accentHue}
              onChange={(e) => handleUpdate({ accentHue: Number(e.target.value) })}
              style={{
                width: '100%',
                accentColor: 'var(--brand)',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Contrast Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>High Contrast</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-fg-faint)' }}>Increase border lines and text clarity</div>
            </div>
            <input
              type="checkbox"
              checked={settings.contrast}
              onChange={(e) => handleUpdate({ contrast: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
          </div>

          {/* Reduce Motion */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Reduce Motion</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-fg-faint)' }}>Minimize animations and transitions</div>
            </div>
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(e) => handleUpdate({ reduceMotion: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
          </div>
        </section>

        {/* Downloads Group */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid var(--color-line)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={20} color="var(--brand)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>Downloads &amp; Files</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Show Download Links</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-fg-faint)' }}>
                Display direct open-directory download options on film and TV pages
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.downloads}
              onChange={(e) => handleUpdate({ downloads: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
          </div>
        </section>

        {/* Integrations: FebBox */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid var(--color-line)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={20} color="var(--brand)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>FebBox Token</h2>
          </div>

          <p style={{ fontSize: '0.86rem', color: 'var(--color-fg-muted)' }}>
            Enter your FebBox cookie or cloud authentication token for unthrottled streaming and cloud storage access.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              placeholder="Paste FebBox 'ui' cookie or token..."
              value={febboxInput}
              onChange={(e) => setFebboxInput(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid var(--color-line)',
                color: '#ffffff',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <button className="capsule-btn capsule-btn-play capsule-btn-lit" onClick={handleSaveFebbox}>
              Save
            </button>
          </div>

          {isSavedToast && (
            <div style={{ color: 'var(--brand)', fontSize: '0.84rem', fontWeight: 600 }}>
              ✓ FebBox token updated successfully!
            </div>
          )}
        </section>

        {/* Data Tools */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid var(--color-line)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={20} color="var(--brand)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>Data Backup</h2>
          </div>

          <p style={{ fontSize: '0.86rem', color: 'var(--color-fg-muted)' }}>
            Export or import your saved library, ratings, and watch progress.
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="capsule-btn capsule-btn-text"
              onClick={() => FlicxSettingsService.exportLibraryData()}
            >
              <Download size={16} />
              <span>Save to a file</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
