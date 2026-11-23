import React from 'react';
import { Search, Settings, Film } from 'lucide-react';
import { NavigationTab, ScreenId } from '../../types';
import './TopNav.css';

interface TopNavProps {
  activeScreen: ScreenId;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

const NAV_TABS: { id: NavigationTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'discover', label: 'Discover' },
  { id: 'movies', label: 'Movies' },
  { id: 'shows', label: 'TV shows' },
  { id: 'anime', label: 'Anime' },
  { id: 'collections', label: 'Collections' },
  { id: 'genres', label: 'Genres' },
  { id: '4k', label: '4K' },
  { id: 'awards', label: 'Awards' },
  { id: 'library', label: 'Library' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeScreen,
  onSelectTab,
  onOpenSearch,
  onOpenSettings,
}) => {
  return (
    <header className="kaira-navbar" role="navigation" aria-label="Main Navigation">
      <div className="kaira-nav-left">
        <div className="kaira-brand-logo" onClick={() => onSelectTab('home')}>
          <Film size={22} color="var(--brand)" />
          <span className="kaira-brand-text">Kaira</span>
        </div>

        <nav className="kaira-nav-links" aria-label="Categories">
          {NAV_TABS.map((tab) => {
            const isActive = activeScreen === tab.id;
            return (
              <button
                key={tab.id}
                className={`kaira-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="kaira-nav-right">
        <button
          className="kaira-nav-btn"
          onClick={onOpenSearch}
          title="Search movies and series"
          aria-label="Search"
        >
          <Search size={18} />
        </button>

        <button
          className="kaira-nav-btn"
          onClick={onOpenSettings}
          title="Settings and preferences"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
