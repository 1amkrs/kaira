import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationTab, ScreenId, Movie, Show, Episode, Album, Track, AppItem, PlaybackSource } from './types';
import { TopNav } from './components/Navigation/TopNav';
import { ControllerHints } from './components/ControllerHints/ControllerHints';
import { HomeScreen } from './screens/Home/HomeScreen';
import { MoviesScreen } from './screens/Movies/MoviesScreen';
import { MovieDetailsScreen } from './screens/Movies/MovieDetailsScreen';
import { ShowsScreen } from './screens/Shows/ShowsScreen';
import { ShowDetailsScreen } from './screens/Shows/ShowDetailsScreen';
import { MusicScreen } from './screens/Music/MusicScreen';
import { AlbumDetailsScreen } from './screens/Music/AlbumDetailsScreen';
import { LibraryScreen } from './screens/Library/LibraryScreen';
import { GamesScreen } from './screens/Games/GamesScreen';
import { SearchScreen } from './screens/Search/SearchScreen';
import { SettingsScreen } from './screens/Settings/SettingsScreen';
import { VideoPlayerScreen } from './screens/Playback/VideoPlayerScreen';
import { MusicPlayerScreen } from './screens/Playback/MusicPlayerScreen';
import { MiniPlayer } from './components/Playback/MiniPlayer';
import { FloatingVideoPiP } from './components/Playback/FloatingVideoPiP';
import { AerialScreensaver } from './components/Screensaver/AerialScreensaver';
import { ProfileModal, UserProfile } from './components/Profile/ProfileModal';
import { SleepTimerModal } from './components/SleepTimer/SleepTimerModal';
import { QuickSettingsModal } from './components/QuickSettings/QuickSettingsModal';
import { sleepTimerService } from './services/sleep/sleepTimerService';
import { profileService } from './services/profile/ProfileService';
import { SplashScreen } from './components/Splash/SplashScreen';
import { gamepadManager } from './services/controller/gamepadManager';
import { appLauncher, LaunchFeedback } from './services/appLauncher/appLauncher';
import { mediaProvider, ContinueWatchingItem } from './services/media/LiveMediaProvider';
import { playbackService } from './services/playback/PlaybackService';
import { addonService } from './services/addons/AddonService';
import { MediaItem } from './types';
import { Loader2, Gamepad, Volume2, VolumeX } from 'lucide-react';
import './App.css';

const TABS: NavigationTab[] = ['for-you', 'movies', 'shows', 'music', 'games', 'library'];

export const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<NavigationTab>('for-you');
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward');
  const [activeModal, setActiveModal] = useState<'search' | 'settings' | null>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(() => profileService.getState().promptOnLaunch);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState<boolean>(false);
  const [activeProfile, setActiveProfile] = useState<UserProfile>(() => profileService.getActiveProfile());


  // Detail view state stack
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Fullscreen & PiP player states
  const [activeVideoSource, setActiveVideoSource] = useState<PlaybackSource | null>(null);
  const [pipVideoSource, setPipVideoSource] = useState<PlaybackSource | null>(null);
  const [isMusicPlayerOpen, setIsMusicPlayerOpen] = useState<boolean>(false);

  // 4K Aerial Screensaver state & timer
  const [isScreensaverActive, setIsScreensaverActive] = useState<boolean>(false);
  const screensaverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // HUD Toasts & Overlays
  const [launchToast, setLaunchToast] = useState<LaunchFeedback | null>(null);
  const [gamepadToast, setGamepadToast] = useState<{ message: string; connected: boolean } | null>(null);
  const [volumeToast, setVolumeToast] = useState<{ level: number; muted: boolean } | null>(null);
  const volumeToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- TAB NAVIGATION ---
  const handleSelectTab = useCallback((tab: NavigationTab) => {
    setActiveModal(null);
    setSelectedMovie(null);
    setSelectedShow(null);
    setSelectedAlbum(null);
    profileService.setLastTab(activeProfile.id, tab);
    setCurrentTab((prev) => {
      const prevIdx = TABS.indexOf(prev);
      const nextIdx = TABS.indexOf(tab);
      setTabDirection(nextIdx >= prevIdx ? 'forward' : 'backward');
      return tab;
    });
  }, [activeProfile.id]);

  const handleTabPrev = useCallback(() => {
    if (activeModal || activeVideoSource || isMusicPlayerOpen || selectedMovie || selectedShow || selectedAlbum) return;
    setTabDirection('backward');
    setCurrentTab((prev) => {
      const idx = TABS.indexOf(prev);
      const nextIdx = (idx - 1 + TABS.length) % TABS.length;
      const nextTab = TABS[nextIdx];
      profileService.setLastTab(activeProfile.id, nextTab);
      return nextTab;
    });
  }, [activeModal, activeVideoSource, isMusicPlayerOpen, selectedMovie, selectedShow, selectedAlbum, activeProfile.id]);

  const handleTabNext = useCallback(() => {
    if (activeModal || activeVideoSource || isMusicPlayerOpen || selectedMovie || selectedShow || selectedAlbum) return;
    setTabDirection('forward');
    setCurrentTab((prev) => {
      const idx = TABS.indexOf(prev);
      const nextIdx = (idx + 1) % TABS.length;
      const nextTab = TABS[nextIdx];
      profileService.setLastTab(activeProfile.id, nextTab);
      return nextTab;
    });
  }, [activeModal, activeVideoSource, isMusicPlayerOpen, selectedMovie, selectedShow, selectedAlbum, activeProfile.id]);

  const handleOpenSearch = useCallback(() => {
    setActiveModal((prev) => (prev === 'search' ? null : 'search'));
  }, []);

  const handleOpenSettings = useCallback(() => {
    setActiveModal((prev) => (prev === 'settings' ? null : 'settings'));
  }, []);

  // --- PLAYBACK DISPATCHERS ---
  const handlePlayMovie = useCallback(async (movie: Movie, customStreamUrl?: string, streamType?: 'direct' | 'embed' | 'youtube' | 'torrent') => {
    const source = await mediaProvider.getPlaybackSource(movie);
    if (customStreamUrl) {
      source.streamUrl = customStreamUrl;
    } else {
      try {
        const streams = await addonService.fetchStreams('movie', movie.id, undefined, undefined, movie.title, movie.ytTrailerId);
        const best = addonService.selectBestStream(streams);
        if (best) {
          source.streamUrl = best.url;
          source.streamType = best.streamType;
        }
      } catch (e) {}
    }
    if (streamType) {
      source.streamType = streamType;
    }

    // Save to active profile's watch history memory
    profileService.addWatchHistory(activeProfile.id, {
      mediaId: movie.id,
      title: movie.title,
      type: 'movie',
      poster: movie.poster,
      backdrop: movie.backdrop,
      progress: 0,
      positionSeconds: 0,
      durationSeconds: (movie.runtimeMinutes || 120) * 60,
    });

    await playbackService.play(source);
    setActiveVideoSource(source);
  }, [activeProfile.id]);

  const handlePlayEpisode = useCallback(async (episode: Episode, customStreamUrl?: string, streamType?: 'direct' | 'embed' | 'youtube' | 'torrent') => {
    const source = await mediaProvider.getPlaybackSource(episode);
    if (customStreamUrl) {
      source.streamUrl = customStreamUrl;
    } else {
      try {
        const streams = await addonService.fetchStreams('series', episode.showId, episode.seasonNumber, episode.number, `${episode.title}`, undefined);
        const best = addonService.selectBestStream(streams);
        if (best) {
          source.streamUrl = best.url;
          source.streamType = best.streamType;
        }
      } catch (e) {}
    }
    if (streamType) {
      source.streamType = streamType;
    }

    // Save to active profile's watch history memory
    profileService.addWatchHistory(activeProfile.id, {
      mediaId: episode.id,
      title: episode.title,
      type: 'show',
      poster: episode.thumbnail,
      backdrop: episode.thumbnail,
      progress: 0,
      positionSeconds: 0,
      durationSeconds: (episode.runtimeMinutes || 45) * 60,
      episodeInfo: {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
      },
    });

    await playbackService.play(source);
    setActiveVideoSource(source);
  }, [activeProfile.id]);

  const handlePlayTrack = useCallback(async (track: Track, allTracks: Track[] = []) => {
    try {
      // Save to active profile's music history memory
      profileService.addWatchHistory(activeProfile.id, {
        mediaId: track.id,
        title: `${track.title} - ${track.artist}`,
        type: 'track',
        poster: track.artwork,
        backdrop: track.artwork,
        progress: 0,
        positionSeconds: 0,
        durationSeconds: track.durationSeconds || 210,
      });

      // 1. Immediately resolve and start playing the requested track
      const source = await mediaProvider.getPlaybackSource(track);

      // 2. Build lightweight queue stubs synchronously so playback starts instantly
      const queueList = allTracks.length > 0 ? allTracks : [track];
      const queue: PlaybackSource[] = queueList.map((t) => ({
        id: `source-${t.id}`,
        type: 'audio',
        title: t.title,
        subtitle: `${t.artist} — ${t.album}`,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork,
        streamUrl: t.audioUrl || '',
        durationSeconds: t.durationSeconds,
        initialPosition: 0,
        mediaType: 'track',
        mediaId: t.id,
      }));

      const activeIdx = queue.findIndex((q) => q.mediaId === track.id || q.id === `source-${track.id}`);
      if (activeIdx >= 0) {
        queue[activeIdx] = source;
      }

      await playbackService.play(source, queue);
    } catch (err) {
      console.warn('[App] Direct audio fallback play triggered:', err);
      const fallbackSource: PlaybackSource = {
        id: `source-${track.id}`,
        type: 'audio',
        title: track.title,
        subtitle: `${track.artist} — ${track.album}`,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        streamUrl: track.audioUrl || '',
        durationSeconds: track.durationSeconds,
        initialPosition: 0,
        mediaType: 'track',
        mediaId: track.id,
      };
      await playbackService.play(fallbackSource);
    }
  }, [activeProfile.id]);


  const handleSelectContinueItem = useCallback(async (item: ContinueWatchingItem) => {
    const source = await mediaProvider.getPlaybackSource(item.media);
    source.initialPosition = item.lastPlayedPosition;
    await playbackService.play(source);
    setActiveVideoSource(source);
  }, []);

  const handleSelectApp = useCallback((app: AppItem) => {
    appLauncher.launchApp(app);
  }, []);

  const handleSelectMedia = useCallback(async (item: MediaItem) => {
    if (item.type === 'game' || item.type === 'app') {
      appLauncher.launchMedia(item);
    } else if (item.type === 'movie') {
      const mov = await mediaProvider.getMovie(item.id);
      if (mov) {
        setSelectedMovie(mov);
      }
    } else if (item.type === 'show') {
      const sh = await mediaProvider.getShow(item.id);
      if (sh) {
        setSelectedShow(sh);
      }
    }
  }, []);

  // --- SCREENSAVER IDLE TIMER (3 MINUTES) ---
  useEffect(() => {
    const resetIdleTimer = () => {
      if (isScreensaverActive) {
        setIsScreensaverActive(false);
      }
      if (screensaverTimerRef.current) {
        clearTimeout(screensaverTimerRef.current);
      }
      // Only start screensaver if full video player is not actively playing AND music is not open/playing
      const isAudioPlaying = playbackService.getState().status === 'playing';
      if (!activeVideoSource && !isMusicPlayerOpen && !isAudioPlaying) {
        screensaverTimerRef.current = setTimeout(() => {
          setIsScreensaverActive(true);
        }, 180000); // 3 minutes
      }
    };

    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('pointerdown', resetIdleTimer);
    resetIdleTimer();

    return () => {
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('pointerdown', resetIdleTimer);
      if (screensaverTimerRef.current) clearTimeout(screensaverTimerRef.current);
    };
  }, [isScreensaverActive, activeVideoSource, isMusicPlayerOpen]);

  // --- CONTROLLER BACK NAVIGATION STACK ---
  const handleBack = useCallback(() => {
    if (isScreensaverActive) {
      setIsScreensaverActive(false);
    } else if (isQuickSettingsOpen) {
      setIsQuickSettingsOpen(false);
    } else if (isProfileModalOpen) {
      setIsProfileModalOpen(false);
    } else if (activeVideoSource) {
      const curPos = playbackService.getState().currentTime;
      setPipVideoSource({
        ...activeVideoSource,
        initialPosition: curPos,
      });
      setActiveVideoSource(null);
    } else if (pipVideoSource) {
      setPipVideoSource(null);
    } else if (isMusicPlayerOpen) {
      setIsMusicPlayerOpen(false);
    } else if (activeModal) {
      setActiveModal(null);
    } else if (selectedMovie) {
      setSelectedMovie(null);
    } else if (selectedShow) {
      setSelectedShow(null);
    } else if (selectedAlbum) {
      setSelectedAlbum(null);
    } else if (currentTab !== 'for-you') {
      setCurrentTab('for-you');
    }
  }, [
    isScreensaverActive,
    isQuickSettingsOpen,
    isProfileModalOpen,
    activeVideoSource,
    pipVideoSource,
    isMusicPlayerOpen,
    activeModal,
    selectedMovie,
    selectedShow,
    selectedAlbum,
    currentTab,
  ]);

  const isDetailOpen = Boolean(selectedMovie || selectedShow || selectedAlbum);

  // Controller & System Subscriptions
  useEffect(() => {
    sleepTimerService.setOnSleepCallback(() => {
      setIsScreensaverActive(true);
    });

    const cleanup = gamepadManager.init({
      onBack: handleBack,
      onSearch: handleOpenSearch,
      onSettings: handleOpenSettings,
      onMenu: () => setIsQuickSettingsOpen((prev) => !prev),
      onTabPrev: handleTabPrev,
      onTabNext: handleTabNext,
      onGamepadStatusChange: (connected, id) => {
        setGamepadToast({
          message: connected ? `Controller Connected: ${id.split('(')[0].trim() || 'Gamepad'}` : 'Controller Disconnected',
          connected,
        });
        setTimeout(() => setGamepadToast(null), 3200);
      },
    });

    const handleVolumeKeys = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=' || e.key === 'VolumeUp') {
        const curVol = playbackService.getState().volume;
        const next = Math.min(1, curVol + 0.05);
        playbackService.setVolume(next);
        setVolumeToast({ level: Math.round(next * 100), muted: false });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
      } else if (e.key === '-' || e.key === '_' || e.key === 'VolumeDown') {
        const curVol = playbackService.getState().volume;
        const next = Math.max(0, curVol - 0.05);
        playbackService.setVolume(next);
        setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'VolumeMute') {
        const curVol = playbackService.getState().volume;
        const next = curVol > 0 ? 0 : 0.75;
        playbackService.setVolume(next);
        setVolumeToast({ level: Math.round(next * 100), muted: next === 0 });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1800);
      }
    };

    window.addEventListener('keydown', handleVolumeKeys);

    const unsubLaunch = appLauncher.subscribeToLaunchEvents(setLaunchToast);
    const unsubProfile = profileService.subscribe((state) => {
      const cur = profileService.getActiveProfile();
      setActiveProfile(cur);
      if (state.rememberLastTab) {
        const rememberedTab = profileService.getLastTab(cur.id);
        setCurrentTab((prev) => (prev !== rememberedTab ? rememberedTab : prev));
      }
    });

    const handleMouseMove = () => {
      document.body.classList.remove('hide-cursor');
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        if (!isDetailOpen) {
          document.body.classList.add('hide-cursor');
        }
      }, 3500);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cleanup();
      window.removeEventListener('keydown', handleVolumeKeys);
      window.removeEventListener('mousemove', handleMouseMove);
      unsubLaunch();
      unsubProfile();
    };

  }, [handleBack, handleOpenSearch, handleOpenSettings, handleTabPrev, handleTabNext, isDetailOpen]);

  // Update Gamepad callbacks on navigation state change
  useEffect(() => {
    gamepadManager.setCallbacks({
      onBack: handleBack,
      onSearch: handleOpenSearch,
      onSettings: handleOpenSettings,
      onTabPrev: handleTabPrev,
      onTabNext: handleTabNext,
    });
  }, [handleBack, handleOpenSearch, handleOpenSettings, handleTabPrev, handleTabNext]);

  return (
    <div className="tv-app-shell">
      {/* Top Google TV Navigation Bar (hidden on detail views) */}
      {!isDetailOpen && (
        <TopNav
          activeScreen={activeModal || currentTab}
          onSelectTab={handleSelectTab}
          onOpenSearch={handleOpenSearch}
          onOpenSettings={handleOpenSettings}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenSleepTimer={() => setIsSleepModalOpen(true)}
          activeProfile={activeProfile}
          activeProfileName={activeProfile.name}
        />
      )}


      {/* Main Screen Router */}
      <main
        className={`tv-main-viewport ${isDetailOpen ? 'is-detail-view' : ''}`}
        style={activeVideoSource ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      >
        {selectedMovie ? (
          <MovieDetailsScreen
            movie={selectedMovie}
            onPlay={handlePlayMovie}
            onSelectSimilar={(m) => setSelectedMovie(m)}
            onBack={() => setSelectedMovie(null)}
            isPlayerActive={Boolean(activeVideoSource)}
          />
        ) : selectedShow ? (
          <ShowDetailsScreen
            show={selectedShow}
            onPlayEpisode={handlePlayEpisode}
            onSelectSimilar={(s) => setSelectedShow(s)}
            onBack={() => setSelectedShow(null)}
            isPlayerActive={Boolean(activeVideoSource)}
          />
        ) : selectedAlbum ? (
          <AlbumDetailsScreen
            album={selectedAlbum}
            onPlayTrack={handlePlayTrack}
            onBack={() => setSelectedAlbum(null)}
          />
        ) : (
          <div key={currentTab} className={`tv-tab-transition-wrapper slide-${tabDirection}`}>
            {currentTab === 'for-you' && (
              <HomeScreen
                onSelectMovie={(m) => setSelectedMovie(m)}
                onPlayMovie={handlePlayMovie}
                onSelectShow={(s) => setSelectedShow(s)}
                onSelectAlbum={(a) => setSelectedAlbum(a)}
                onSelectContinueItem={handleSelectContinueItem}
              />
            )}
            {currentTab === 'movies' && (
              <MoviesScreen
                onSelectMovie={(m) => setSelectedMovie(m)}
                onPlayMovie={handlePlayMovie}
              />
            )}
            {currentTab === 'shows' && (
              <ShowsScreen
                onSelectShow={(s) => setSelectedShow(s)}
                onPlayShow={async (s) => {
                  const eps = await mediaProvider.getEpisodes(s.id, 1);
                  if (eps && eps.length > 0) {
                    handlePlayEpisode(eps[0]);
                  }
                }}
              />
            )}
            {currentTab === 'music' && (
              <MusicScreen
                onSelectAlbum={(a) => setSelectedAlbum(a)}
                onPlayTrack={handlePlayTrack}
              />
            )}
            {currentTab === 'games' && (
              <GamesScreen />
            )}
            {currentTab === 'library' && (
              <LibraryScreen
                onSelectMedia={handleSelectMedia}
              />
            )}
          </div>
        )}
      </main>

      {/* Persistent Bottom Mini-Player for Audio */}
      <MiniPlayer onOpenFullPlayer={() => setIsMusicPlayerOpen(true)} />

      {/* Floating Picture-in-Picture Video Player */}
      {pipVideoSource && !activeVideoSource && (
        <FloatingVideoPiP
          source={pipVideoSource}
          isPlaying={playbackService.getState().status === 'playing'}
          onExpand={() => {
            const cur = playbackService.getState().currentTime;
            setActiveVideoSource({
              ...pipVideoSource,
              initialPosition: cur || pipVideoSource.initialPosition,
            });
            setPipVideoSource(null);
          }}
          onClose={() => {
            playbackService.stop();
            setPipVideoSource(null);
          }}
          onTogglePlayPause={() => {
            playbackService.togglePlayPause();
          }}
        />
      )}

      {/* Fullscreen Video Player */}
      {activeVideoSource && (
        <VideoPlayerScreen
          source={activeVideoSource}
          onMinimizeToPiP={() => {
            const cur = playbackService.getState().currentTime;
            setPipVideoSource({
              ...activeVideoSource,
              initialPosition: cur || activeVideoSource.initialPosition,
            });
            setActiveVideoSource(null);
          }}
          onExit={() => {
            playbackService.stop();
            setActiveVideoSource(null);
          }}
        />
      )}

      {/* Fullscreen Music Player */}
      {isMusicPlayerOpen && (
        <MusicPlayerScreen onClose={() => setIsMusicPlayerOpen(false)} />
      )}

      {/* Search Overlay */}
      {activeModal === 'search' && (
        <SearchScreen
          onClose={() => setActiveModal(null)}
          onSelectMovie={(m) => {
            setActiveModal(null);
            setSelectedMovie(m);
          }}
          onSelectShow={(s) => {
            setActiveModal(null);
            setSelectedShow(s);
          }}
          onSelectAlbum={(a) => {
            setActiveModal(null);
            setSelectedAlbum(a);
          }}
          onPlayTrack={(t, queue) => {
            setActiveModal(null);
            handlePlayTrack(t, queue);
          }}
        />
      )}

      {/* Settings Overlay */}
      {activeModal === 'settings' && (
        <SettingsScreen onClose={() => setActiveModal(null)} />
      )}

      {/* Quick Settings Drawer Overlay */}
      {isQuickSettingsOpen && (
        <QuickSettingsModal onClose={() => setIsQuickSettingsOpen(false)} />
      )}

      {/* User Profile Modal */}
      {isProfileModalOpen && (
        <ProfileModal
          currentProfileId={activeProfile.id}
          onSelectProfile={(prof) => {
            setActiveProfile(prof);
            setIsProfileModalOpen(false);
          }}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {/* Sleep Timer Modal */}
      {isSleepModalOpen && (
        <SleepTimerModal onClose={() => setIsSleepModalOpen(false)} />
      )}

      {/* 4K Aerial Screensaver with Ambient Clock & Weather */}
      <AerialScreensaver
        isActive={isScreensaverActive}
        onWake={() => setIsScreensaverActive(false)}
      />

      {/* Gamepad Connection HUD Notification */}
      {gamepadToast && (
        <div className="tv-gamepad-status-banner animate-fade-in" role="status">
          <Gamepad size={20} color={gamepadToast.connected ? '#81c995' : '#f28b82'} />
          <span>{gamepadToast.message}</span>
        </div>
      )}

      {/* On-Screen Volume HUD Pill */}
      {volumeToast && (
        <div className="tv-volume-hud-pill animate-pop" role="status">
          {volumeToast.muted ? <VolumeX size={22} color="#f28b82" /> : <Volume2 size={22} color="#8ab4f8" />}
          <div className="tv-volume-bar-track">
            <div className="tv-volume-bar-fill" style={{ width: `${volumeToast.level}%` }} />
          </div>
          <span className="tv-volume-percent">{volumeToast.muted ? 'Muted' : `${volumeToast.level}%`}</span>
        </div>
      )}

      {/* App Launching Feedback Toast */}
      {launchToast && (
        <div className="tv-launch-toast-banner" role="status" aria-live="polite">
          <div className="tv-toast-spinner">
            <Loader2 size={24} className="spin-icon" />
          </div>
          <div className="tv-toast-text">
            <span className="toast-title">{launchToast.appName}</span>
            <span className="toast-desc">{launchToast.message}</span>
          </div>
        </div>
      )}

      {/* Bottom Subtle Controller Navigation Hints */}
      <ControllerHints
        customHints={
          activeVideoSource
            ? [
                { button: 'A', label: 'Play/Pause', color: '#81c995' },
                { button: 'D-Pad', label: 'Seek 10s', color: '#ffffff' },
                { button: 'LB/RB', label: 'Episode', color: '#8ab4f8' },
                { button: 'B', label: 'Exit Player', color: '#f28b82' },
              ]
            : isMusicPlayerOpen
            ? [
                { button: 'A', label: 'Play/Pause', color: '#81c995' },
                { button: 'LB/RB', label: 'Prev/Next Track', color: '#8ab4f8' },
                { button: 'B', label: 'Minimize', color: '#f28b82' },
              ]
            : activeModal === 'search'
            ? [
                { button: 'A', label: 'Type Key', color: '#81c995' },
                { button: 'B', label: 'Close Search', color: '#f28b82' },
                { button: 'D-Pad', label: 'Move Focus', color: '#ffffff' },
              ]
            : activeModal === 'settings'
            ? [
                { button: 'A', label: 'Select Option', color: '#81c995' },
                { button: 'B', label: 'Close Settings', color: '#f28b82' },
              ]
            : isProfileModalOpen
            ? [
                { button: 'A', label: 'Select Profile', color: '#81c995' },
                { button: 'B', label: 'Cancel', color: '#f28b82' },
              ]
            : undefined
        }
      />

      {/* Startup Splash Animation */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </div>
  );
};

export default App;
