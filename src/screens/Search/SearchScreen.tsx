import React, { useState, useEffect, useRef } from 'react';
import {
  Search as SearchIcon,
  X,
  Film,
  Tv,
  Music,
  Sparkles,
  TrendingUp,
  ArrowLeft,
  Loader2,
  Star,
  Play
} from 'lucide-react';
import { Movie, Show, Album, Track, MediaSearchCategoryResult } from '../../types';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { OnScreenKeyboard } from '../../components/OnScreenKeyboard/OnScreenKeyboard';
import { Focusable } from '../../components/Focusable/Focusable';
import { MovieCard } from '../../components/MediaCard/MovieCard';
import { ShowCard } from '../../components/MediaCard/ShowCard';
import { AlbumCard } from '../../components/MediaCard/AlbumCard';
import { TrackRow } from '../../components/MediaCard/TrackRow';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import './SearchScreen.css';

interface SearchScreenProps {
  onClose: () => void;
  onSelectMovie: (movie: Movie) => void;
  onSelectShow: (show: Show) => void;
  onSelectAlbum: (album: Album) => void;
  onPlayTrack: (track: Track, allTracks: Track[]) => void;
}

type SearchFilter = 'all' | 'movies' | 'shows' | 'music';

const TRENDING_QUICK_SEARCHES = [
  'Manjummel Boys',
  'Aavesham',
  'Leo',
  'Jawan',
  '12th Fail',
  'Interstellar',
  'Maharaja',
  'Bramayugam',
  'Premalu',
  'Breaking Bad',
  'Dune',
  'Oppenheimer',
];

export const SearchScreen: React.FC<SearchScreenProps> = ({
  onClose,
  onSelectMovie,
  onSelectShow,
  onSelectAlbum,
  onPlayTrack,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const [results, setResults] = useState<MediaSearchCategoryResult>({
    movies: [],
    shows: [],
    episodes: [],
    albums: [],
    artists: [],
    tracks: [],
  });
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Scope trapping
  useEffect(() => {
    spatialNav.pushScope('search-screen');
    return () => {
      spatialNav.popScope('search-screen');
    };
  }, []);

  // Debounced Universal Live Search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults({ movies: [], shows: [], episodes: [], albums: [], artists: [], tracks: [] });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      mediaProvider.search(trimmed).then((res) => {
        setResults(res);
        setIsSearching(false);
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Physical Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is typing inside the native input, let native onChange handle it
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setSearchQuery((prev) => prev.slice(0, -1));
        return;
      }

      // Normal typing characters (ignore modifiers and control keys)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setSearchQuery((prev) => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleKeyPress = (key: string) => {
    setSearchQuery((prev) => prev + key);
  };

  const handleDelete = () => {
    setSearchQuery((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setSearchQuery('');
  };

  const handleSelectQuickSearch = (query: string) => {
    setSearchQuery(query);
  };

  const totalResultsCount =
    results.movies.length + results.shows.length + results.albums.length + results.tracks.length;

  const hasResults = totalResultsCount > 0;

  return (
    <div className="tv-search-screen" role="dialog" aria-modal="true" aria-label="Search Hub">
      {/* Top Search Bar */}
      <div className="tv-search-header-bar">
        <Focusable
          id="search-back-btn"
          groupId="search-top-nav"
          indexInGroup={0}
          scaleEffect={false}
          className="tv-back-focusable"
          onSelect={onClose}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={20} />
              <span>Back (B)</span>
            </div>
          )}
        </Focusable>

        <div className="tv-search-input-box">
          {isSearching ? (
            <Loader2 size={24} className="tv-search-input-icon spin-icon" />
          ) : (
            <SearchIcon size={24} className="tv-search-input-icon" />
          )}

          <input
            ref={inputRef}
            type="text"
            className="tv-search-native-input"
            placeholder="Search movies, TV shows, music, or artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search Query Input"
          />

          {searchQuery.length > 0 && (
            <Focusable
              id="search-clear-btn"
              groupId="search-top-nav"
              indexInGroup={1}
              className="tv-search-icon-btn-focusable"
              onSelect={handleClear}
            >
              {(isFocused) => (
                <div className={`tv-search-clear-circle ${isFocused ? 'focused' : ''}`}>
                  <X size={18} />
                </div>
              )}
            </Focusable>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="tv-search-filter-pills" role="tablist">
          {(['all', 'movies', 'shows', 'music'] as const).map((fil, idx) => (
            <Focusable
              key={fil}
              id={`filter-pill-${fil}`}
              groupId="search-filters"
              indexInGroup={idx}
              className="tv-filter-pill-focusable"
              onSelect={() => setActiveFilter(fil)}
            >
              {(isFocused) => (
                <div
                  className={`tv-search-filter-pill ${activeFilter === fil ? 'active' : ''} ${
                    isFocused ? 'focused' : ''
                  }`}
                >
                  {fil === 'all' && <span>All Results</span>}
                  {fil === 'movies' && <span>Movies ({results.movies.length})</span>}
                  {fil === 'shows' && <span>TV Shows ({results.shows.length})</span>}
                  {fil === 'music' && <span>Music ({results.tracks.length + results.albums.length})</span>}
                </div>
              )}
            </Focusable>
          ))}
        </div>
      </div>

      {/* Main Split Layout: Left Keyboard / Quick Search & Right Results */}
      <div className="tv-search-body-layout">
        {/* Left Side: Virtual Keyboard & Trending Queries */}
        <div className="tv-search-left-panel">
          <div className="tv-search-keyboard-container">
            <OnScreenKeyboard
              onKeyPress={handleKeyPress}
              onBackspace={handleDelete}
              onClear={handleClear}
              onSubmit={() => {}}
            />
          </div>

          {/* Trending Suggestions */}
          <div className="tv-recent-searches-box">
            <span className="tv-recent-title">
              <TrendingUp size={14} /> Trending Searches
            </span>
            <div className="tv-recent-chips-row" role="list">
              {TRENDING_QUICK_SEARCHES.map((query, idx) => (
                <Focusable
                  key={query}
                  id={`quick-search-${idx}`}
                  groupId="quick-searches"
                  indexInGroup={idx}
                  className="tv-chip-btn-focusable"
                  onSelect={() => handleSelectQuickSearch(query)}
                >
                  {(isFocused) => (
                    <div className={`tv-search-query-chip ${isFocused ? 'focused' : ''}`}>
                      <span>{query}</span>
                    </div>
                  )}
                </Focusable>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Live Media Results */}
        <div className="tv-search-results-panel tv-scroll-container">
          {searchQuery.trim().length === 0 ? (
            /* Idle Screen */
            <div className="tv-search-idle-state">
              <Sparkles size={48} className="idle-icon" />
              <h3>Looking for something to watch?</h3>
              <p>Search by title, actor, or genre, or pick from popular searches on the left.</p>
            </div>
          ) : isSearching ? (
            /* Loading State */
            <div className="tv-search-idle-state" role="status" aria-label="Searching Catalogs">
              <Loader2 size={42} className="spin-icon idle-icon" />
              <h3>Searching catalogs...</h3>
              <p>Finding movies, shows, and audio streams for you...</p>
            </div>
          ) : !hasResults ? (
            /* Empty State */
            <div className="tv-search-empty-state">
              <SearchIcon size={48} className="idle-icon" />
              <h3>No results found</h3>
              <p>We couldn&apos;t find anything matching &ldquo;{searchQuery}&rdquo;. Double-check the spelling or try searching for another title.</p>
            </div>
          ) : (
            /* Results Display */
            <div className="tv-search-results-content">
              {/* Movies Section */}
              {(activeFilter === 'all' || activeFilter === 'movies') && results.movies.length > 0 && (
                <section className="tv-search-category-group">
                  <div className="tv-search-cat-header">
                    <Film size={20} />
                    <h4>Movies ({results.movies.length})</h4>
                  </div>
                  <div className="tv-search-posters-grid">
                    {results.movies.map((m, idx) => (
                      <MovieCard
                        key={`search-mov-${m.id}`}
                        movie={m}
                        groupId="search-movies-grid"
                        indexInGroup={idx}
                        aspectRatio="poster"
                        onSelect={onSelectMovie}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* TV Series Section */}
              {(activeFilter === 'all' || activeFilter === 'shows') && results.shows.length > 0 && (
                <section className="tv-search-category-group">
                  <div className="tv-search-cat-header">
                    <Tv size={20} />
                    <h4>TV Shows ({results.shows.length})</h4>
                  </div>
                  <div className="tv-search-posters-grid">
                    {results.shows.map((s, idx) => (
                      <ShowCard
                        key={`search-show-${s.id}`}
                        show={s}
                        groupId="search-shows-grid"
                        indexInGroup={idx}
                        aspectRatio="poster"
                        onSelect={onSelectShow}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Albums Section */}
              {(activeFilter === 'all' || activeFilter === 'music') && results.albums.length > 0 && (
                <section className="tv-search-category-group">
                  <div className="tv-search-cat-header">
                    <Music size={20} />
                    <h4>Albums ({results.albums.length})</h4>
                  </div>
                  <div className="tv-search-albums-grid">
                    {results.albums.map((alb, idx) => (
                      <AlbumCard
                        key={`search-alb-${alb.id}`}
                        album={alb}
                        groupId="search-albums-grid"
                        indexInGroup={idx}
                        onSelect={onSelectAlbum}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Songs Section */}
              {(activeFilter === 'all' || activeFilter === 'music') && results.tracks.length > 0 && (
                <section className="tv-search-category-group">
                  <div className="tv-search-cat-header">
                    <Play size={20} />
                    <h4>Tracks & Streams ({results.tracks.length})</h4>
                  </div>
                  <div className="tv-search-tracks-list" role="list">
                    {results.tracks.map((t, idx) => (
                      <TrackRow
                        key={`search-trk-${t.id}`}
                        track={t}
                        groupId="search-tracks-list"
                        indexInGroup={idx}
                        onSelect={() => onPlayTrack(t, results.tracks)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
