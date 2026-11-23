import React, { useState, useEffect } from 'react';
import { NavigationTab } from './types';
import { Movie, Show } from './types/media';
import { TopNav } from './components/Navigation/TopNav';
import { FlicxHomeScreen } from './screens/FlicxHome/FlicxHomeScreen';
import { FlicxCatalogScreen } from './screens/FlicxCatalog/FlicxCatalogScreen';
import { FlicxLibraryScreen } from './screens/FlicxLibrary/FlicxLibraryScreen';
import { FlicxSettingsScreen } from './screens/FlicxSettings/FlicxSettingsScreen';
import { TitleDetailsView } from './screens/FlicxDetails/TitleDetailsView';
import { FlicxPlayer } from './components/FlicxPlayer/FlicxPlayer';
import { FlicxSearchModal } from './screens/FlicxSearch/FlicxSearchModal';
import { FlicxSettingsService } from './services/flicx/FlicxSettingsService';
import './App.css';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Active Playback Item
  const [activePlayback, setActivePlayback] = useState<{
    item: Movie | Show;
    season?: number;
    episode?: number;
  } | null>(null);

  useEffect(() => {
    // Apply Kaira theme & tokens to document on initial mount
    FlicxSettingsService.applyToDOM();
  }, []);

  const handleSelectTab = (tab: NavigationTab) => {
    setSelectedMovie(null);
    setSelectedShow(null);
    setIsSettingsOpen(false);
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlay = (item: Movie | Show, season?: number, episode?: number) => {
    setActivePlayback({ item, season, episode });
  };

  const handleBackFromDetails = () => {
    setSelectedMovie(null);
    setSelectedShow(null);
  };

  return (
    <div className="flicx-app-container">
      {/* ─── Top Navigation Bar ─── */}
      <TopNav
        activeScreen={isSettingsOpen ? 'settings' : currentTab}
        onSelectTab={handleSelectTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => {
          setSelectedMovie(null);
          setSelectedShow(null);
          setIsSettingsOpen(true);
        }}
      />

      {/* ─── Main Content Viewports ─── */}
      <main className="flicx-main-viewport">
        {selectedMovie ? (
          <TitleDetailsView
            item={selectedMovie}
            isMovie={true}
            onPlay={(m) => handlePlay(m)}
            onBack={handleBackFromDetails}
          />
        ) : selectedShow ? (
          <TitleDetailsView
            item={selectedShow}
            isMovie={false}
            onPlay={(s, season, ep) => handlePlay(s, season, ep)}
            onBack={handleBackFromDetails}
          />
        ) : isSettingsOpen ? (
          <FlicxSettingsScreen onBack={() => setIsSettingsOpen(false)} />
        ) : currentTab === 'home' ? (
          <FlicxHomeScreen
            onSelectMovie={(m) => setSelectedMovie(m)}
            onSelectShow={(s) => setSelectedShow(s)}
            onPlay={(item) => handlePlay(item)}
          />
        ) : currentTab === 'library' ? (
          <FlicxLibraryScreen
            onSelectMovie={(m) => setSelectedMovie(m)}
            onSelectShow={(s) => setSelectedShow(s)}
          />
        ) : (
          <FlicxCatalogScreen
            tab={currentTab}
            onSelectMovie={(m) => setSelectedMovie(m)}
            onSelectShow={(s) => setSelectedShow(s)}
          />
        )}
      </main>

      {/* ─── Fullscreen Modern Video Player ─── */}
      {activePlayback && (
        <FlicxPlayer
          title={activePlayback.item.title}
          subtitle={
            activePlayback.season
              ? `Season ${activePlayback.season} · Episode ${activePlayback.episode || 1}`
              : activePlayback.item.year
              ? String(activePlayback.item.year)
              : undefined
          }
          imdbId={activePlayback.item.imdbId || 'tt1757678'}
          season={activePlayback.season}
          episode={activePlayback.episode}
          onExit={() => setActivePlayback(null)}
        />
      )}

      {/* ─── Search Modal ─── */}
      <FlicxSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectMovie={(m) => {
          setSelectedMovie(m);
          setSelectedShow(null);
        }}
        onSelectShow={(s) => {
          setSelectedShow(s);
          setSelectedMovie(null);
        }}
      />
    </div>
  );
};

export default App;
