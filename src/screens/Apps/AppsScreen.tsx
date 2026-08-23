import React from 'react';
import { AppItem } from '../../types';
import { APP_REGISTRY } from '../../data/apps/appRegistry';
import { AppIcon } from '../../components/AppIcon/AppIcon';
import './AppsScreen.css';

interface AppsScreenProps {
  onSelectApp: (app: AppItem) => void;
}

export const AppsScreen: React.FC<AppsScreenProps> = ({ onSelectApp }) => {
  const streamingApps = APP_REGISTRY.filter(a => a.category === 'streaming');
  const gamingApps = APP_REGISTRY.filter(a => a.category === 'gaming');
  const musicApps = APP_REGISTRY.filter(a => a.category === 'music');
  const mediaAndTools = APP_REGISTRY.filter(a => a.category === 'media' || a.category === 'utility');

  return (
    <div className="tv-scroll-container tv-apps-screen" role="main" aria-label="Apps Library Screen">
      <div className="tv-screen-page-header">
        <h2 className="tv-screen-page-title">Your Apps</h2>
        <p className="tv-screen-page-subtitle">Installed TV applications, streaming hubs, and Windows utilities</p>
      </div>

      {/* Streaming Services */}
      <section className="tv-app-category-section">
        <div className="tv-section-header">
          <h3 className="tv-section-title">Streaming & Video</h3>
        </div>
        <div className="tv-horizontal-scroll tv-apps-scroll-track" role="list">
          {streamingApps.map((app, idx) => (
            <AppIcon
              key={app.id}
              app={app}
              groupId="apps-cat-streaming"
              indexInGroup={idx}
              onSelect={onSelectApp}
            />
          ))}
        </div>
      </section>

      {/* Gaming & Launchers */}
      <section className="tv-app-category-section">
        <div className="tv-section-header">
          <h3 className="tv-section-title">Gaming & Launchers</h3>
        </div>
        <div className="tv-horizontal-scroll tv-apps-scroll-track" role="list">
          {gamingApps.map((app, idx) => (
            <AppIcon
              key={app.id}
              app={app}
              groupId="apps-cat-gaming"
              indexInGroup={idx}
              onSelect={onSelectApp}
            />
          ))}
        </div>
      </section>

      {/* Music & Audio */}
      <section className="tv-app-category-section">
        <div className="tv-section-header">
          <h3 className="tv-section-title">Music & Podcasts</h3>
        </div>
        <div className="tv-horizontal-scroll tv-apps-scroll-track" role="list">
          {musicApps.map((app, idx) => (
            <AppIcon
              key={app.id}
              app={app}
              groupId="apps-cat-music"
              indexInGroup={idx}
              onSelect={onSelectApp}
            />
          ))}
        </div>
      </section>

      {/* Media Servers & Tools */}
      <section className="tv-app-category-section">
        <div className="tv-section-header">
          <h3 className="tv-section-title">Media Servers & Utilities</h3>
        </div>
        <div className="tv-horizontal-scroll tv-apps-scroll-track" role="list">
          {mediaAndTools.map((app, idx) => (
            <AppIcon
              key={app.id}
              app={app}
              groupId="apps-cat-tools"
              indexInGroup={idx}
              onSelect={onSelectApp}
            />
          ))}
        </div>
      </section>

      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
