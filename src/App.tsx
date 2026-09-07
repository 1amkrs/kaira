import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationTab, ScreenId, Movie, Show, Episode, Album, Track, AppItem, PlaybackSource } from './types';
import { TopNav } from './components/Navigation/TopNav';
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
import { StandbyScreen } from './components/SleepTimer/StandbyScreen';
import { ProfileModal, UserProfile } from './components/Profile/ProfileModal';
import { SleepTimerModal } from './components/SleepTimer/SleepTimerModal';
import { QuickSettingsModal } from './components/QuickSettings/QuickSettingsModal';
import { CompanionRemoteModal } from './components/CompanionRemote/CompanionRemoteModal';
import { sleepTimerService } from './services/sleep/sleepTimerService';
import { screensaverService } from './services/screensaver/screensaverService';
import { displayService } from './services/display/displayService';
import { profileService } from './services/profile/ProfileService';
import { remoteService } from './services/remote/RemoteService';
import { SplashScreen } from './components/Splash/SplashScreen';
import { gamepadManager } from './services/controller/gamepadManager';
import { appLauncher, LaunchFeedback } from './services/appLauncher/appLauncher';
import { mediaProvider, ContinueWatchingItem } from './services/media/LiveMediaProvider';
import { playbackService } from './services/playback/PlaybackService';
import { addonService } from './services/addons/AddonService';
import { MediaItem } from './types';
import { Loader2, Gamepad, Volume2, VolumeX, Smartphone } from 'lucide-react';
import './App.css';

const TABS: NavigationTab[] = ['for-you', 'movies', 'shows', 'music', 'library'];

export const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<NavigationTab>('for-you');
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward');
  const [activeModal, setActiveModal] = useState<'search' | 'settings' | null>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(() => profileService.getState().promptOnLaunch);
  const [isSleepModalOpen, setIsSleepModalOpen] = useState<boolean>(false);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState<boolean>(false);
  const [activeProfile, setActiveProfile] = useState<UserProfile>(() => profileService.getActiveProfile());


  // Detail view state stack
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedShowSeason, setSelectedShowSeason] = useState<number>(1);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Fullscreen & PiP player states
  const [activeVideoSource, setActiveVideoSource] = useState<PlaybackSource | null>(null);
  const [pipVideoSource, setPipVideoSource] = useState<PlaybackSource | null>(null);
  const [isMusicPlayerOpen, setIsMusicPlayerOpen] = useState<boolean>(false);

  // 4K Aerial Screensaver & Deep Standby states
  const [isScreensaverActive, setIsScreensaverActive] = useState<boolean>(() => screensaverService.getState().isActive);
  const [isStandbyActive, setIsStandbyActive] = useState<boolean>(() => sleepTimerService.getState().isStandby);

  // HUD Toasts & Overlays
  const [launchToast, setLaunchToast] = useState<LaunchFeedback | null>(null);
  const [gamepadToast, setGamepadToast] = useState<{ message: string; connected: boolean } | null>(null);
  const [remoteToast, setRemoteToast] = useState<{ message: string; count: number } | null>(null);
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
    if (
      activeModal ||
      isQuickSettingsOpen ||
      isProfileModalOpen ||
      isSleepModalOpen ||
      isRemoteModalOpen ||
      isScreensaverActive ||
      isStandbyActive ||
      activeVideoSource ||
      isMusicPlayerOpen ||
      selectedMovie ||
      selectedShow ||
      selectedAlbum
    ) return;
    setTabDirection('backward');
    setCurrentTab((prev) => {
      const idx = TABS.indexOf(prev);
      const nextIdx = (idx - 1 + TABS.length) % TABS.length;
      const nextTab = TABS[nextIdx];
      profileService.setLastTab(activeProfile.id, nextTab);
      return nextTab;
    });
  }, [
    activeModal,
    isQuickSettingsOpen,
    isProfileModalOpen,
    isSleepModalOpen,
    isRemoteModalOpen,
    isScreensaverActive,
    isStandbyActive,
    activeVideoSource,
    isMusicPlayerOpen,
    selectedMovie,
    selectedShow,
    selectedAlbum,
    activeProfile.id,
  ]);

  const handleTabNext = useCallback(() => {
    if (
      activeModal ||
      isQuickSettingsOpen ||
      isProfileModalOpen ||
      isSleepModalOpen ||
      isRemoteModalOpen ||
      isScreensaverActive ||
      isStandbyActive ||
      activeVideoSource ||
      isMusicPlayerOpen ||
      selectedMovie ||
      selectedShow ||
      selectedAlbum
    ) return;
    setTabDirection('forward');
    setCurrentTab((prev) => {
      const idx = TABS.indexOf(prev);
      const nextIdx = (idx + 1) % TABS.length;
      const nextTab = TABS[nextIdx];
      profileService.setLastTab(activeProfile.id, nextTab);
      return nextTab;
    });
  }, [
    activeModal,
    isQuickSettingsOpen,
    isProfileModalOpen,
    isSleepModalOpen,
    isRemoteModalOpen,
    isScreensaverActive,
    isStandbyActive,
    activeVideoSource,
    isMusicPlayerOpen,
    selectedMovie,
    selectedShow,
    selectedAlbum,
    activeProfile.id,
  ]);

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
      genres: movie.genres,
      rating: movie.rating,
      year: movie.year,
    });

    await playbackService.play(source);
    setActiveVideoSource(source);
  }, [activeProfile.id]);

  const handlePlayEpisode = useCallback(async (episode: Episode, customStreamUrl?: string, streamType?: 'direct' | 'embed' | 'youtube' | 'torrent') => {
    // Eagerly ensure selectedShow is set to this TV show so it sits directly underneath the player
    setSelectedShowSeason(episode.seasonNumber || 1);
    if (!selectedShow || (selectedShow.id !== episode.showId && selectedShow.imdbId !== episode.showId)) {
      mediaProvider.getShow(episode.showId).then((s) => {
        if (s) {
          setSelectedMovie(null);
          setSelectedAlbum(null);
          setSelectedShow(s);
        }
      }).catch(() => {});
    }

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
    if (item.type === 'episode' || 'seasonNumber' in item.media) {
      const ep = item.media as Episode;
      const showId = ep.showId || (item as any).showId;
      if (showId) {
        setSelectedShowSeason(ep.seasonNumber || (item as any).seasonNumber || 1);
        mediaProvider.getShow(showId).then((s) => {
          if (s) {
            setSelectedMovie(null);
            setSelectedAlbum(null);
            setSelectedShow(s);
          }
        }).catch(() => {});
      }
    }
    const source = await mediaProvider.getPlaybackSource(item.media);
    source.initialPosition = item.lastPlayedPosition;
    await playbackService.play(source);
    setActiveVideoSource(source);
  }, []);

  const handleExitVideoPlayer = useCallback(async () => {
    playbackService.stop();
    const current = activeVideoSource;

    if (current && current.mediaType === 'episode') {
      const showId = current.showId || current.imdbId;
      if (showId) {
        setSelectedShowSeason(current.seasonNumber || 1);
        if (!selectedShow || (selectedShow.id !== showId && selectedShow.imdbId !== showId)) {
          try {
            const showObj = await mediaProvider.getShow(showId);
            setSelectedMovie(null);
            setSelectedAlbum(null);
            if (showObj) {
              setSelectedShow(showObj);
            } else {
              setSelectedShow({
                id: showId,
                imdbId: current.imdbId || (showId.startsWith('tt') ? showId : undefined),
                title: current.title,
                description: current.subtitle || '',
                poster: current.artwork || '',
                backdrop: current.backdrop || current.artwork || '',
                year: 2024,
                rating: '8.5',
                genres: ['Drama'],
                seasonsCount: current.seasonNumber || 1,
              });
            }
          } catch (e) {
            console.warn('[App] Could not load show on exit:', e);
          }
        }
      }
    }

    setActiveVideoSource(null);
  }, [activeVideoSource, selectedShow]);

  const handleMinimizeToPiP = useCallback(async () => {
    const current = activeVideoSource;
    if (!current) return;

    if (current.mediaType === 'episode') {
      const showId = current.showId || current.imdbId;
      if (showId) {
        setSelectedShowSeason(current.seasonNumber || 1);
        if (!selectedShow || (selectedShow.id !== showId && selectedShow.imdbId !== showId)) {
          try {
            const showObj = await mediaProvider.getShow(showId);
            setSelectedMovie(null);
            setSelectedAlbum(null);
            if (showObj) {
              setSelectedShow(showObj);
            }
          } catch (e) {}
        }
      }
    }

    const cur = playbackService.getState().currentTime;
    setPipVideoSource({
      ...current,
      initialPosition: cur || current.initialPosition,
    });
    setActiveVideoSource(null);
  }, [activeVideoSource, selectedShow]);

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

  // --- SCREENSAVER & STANDBY SUBSCRIPTIONS ---
  useEffect(() => {
    const unsubScreensaver = screensaverService.subscribe((s) => {
      setIsScreensaverActive(s.isActive);
    });
    const unsubSleep = sleepTimerService.subscribe((s) => {
      setIsStandbyActive(s.isStandby);
    });
    screensaverService.startMonitoring();

    return () => {
      unsubScreensaver();
      unsubSleep();
      screensaverService.stopMonitoring();
    };
  }, []);

  // Synchronize media playback status with screensaver service
  useEffect(() => {
    screensaverService.setMediaPlayingChecker(() => {
      const isFullVideoPlaying = Boolean(activeVideoSource);
      const isAudioPlaying = playbackService.getState().status === 'playing';
      return isFullVideoPlaying || (isMusicPlayerOpen && isAudioPlaying);
    });
  }, [activeVideoSource, isMusicPlayerOpen]);

  // --- CONTROLLER BACK NAVIGATION STACK ---
  const handleBack = useCallback(() => {
    if (isStandbyActive) {
      sleepTimerService.wakeFromStandby();
    } else if (isScreensaverActive) {
      screensaverService.wake();
    } else if (isRemoteModalOpen) {
      setIsRemoteModalOpen(false);
    } else if (isQuickSettingsOpen) {
      setIsQuickSettingsOpen(false);
    } else if (isProfileModalOpen) {
      setIsProfileModalOpen(false);
    } else if (activeVideoSource) {
      if (activeVideoSource.mediaType === 'episode') {
        const showId = activeVideoSource.showId || activeVideoSource.imdbId;
        if (showId) {
          setSelectedShowSeason(activeVideoSource.seasonNumber || 1);
          if (!selectedShow || (selectedShow.id !== showId && selectedShow.imdbId !== showId)) {
            mediaProvider.getShow(showId).then((s) => {
              if (s) {
                setSelectedMovie(null);
                setSelectedAlbum(null);
                setSelectedShow(s);
              }
            }).catch(() => {});
          }
        }
      }
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
    isRemoteModalOpen,
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
      if (activeVideoSource) {
        setActiveVideoSource(null);
      }
      displayService.triggerPowerAction('sleep');
    });

    const unsubGamepadActions = gamepadManager.subscribeAction(() => {
      screensaverService.reportActivity();
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
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 2500);
      } else if (e.key === '-' || e.key === '_' || e.key === 'VolumeDown') {
        const curVol = playbackService.getState().volume;
        const next = Math.max(0, curVol - 0.05);
        playbackService.setVolume(next);
        setVolumeToast({ level: Math.round(next * 100), muted: false });
        if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
        volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 2500);
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

    const unsubRemote = remoteService.subscribeClientCount((count) => {
      if (count > 0) {
        setRemoteToast({ message: `Phone Remote Connected (${count})`, count });
        setTimeout(() => setRemoteToast(null), 3200);
      }
    });

    remoteService.init({
      onSetTab: handleSelectTab,
      onOpenSearch: () => setActiveModal('search'),
      onOpenSettings: handleOpenSettings,
      onOpenQuickSettings: () => setIsQuickSettingsOpen((prev) => !prev),
      onOpenSleepTimer: () => setIsSleepModalOpen(true),
      onOpenRemoteModal: () => setIsRemoteModalOpen(true),
      onBack: handleBack,
      onTriggerScreensaver: () => screensaverService.trigger(),
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
      unsubGamepadActions();
      unsubRemote();
      window.removeEventListener('keydown', handleVolumeKeys);
      window.removeEventListener('mousemove', handleMouseMove);
      unsubLaunch();
      unsubProfile();
    };

  }, [handleBack, handleOpenSearch, handleOpenSettings, handleSelectTab, handleTabPrev, handleTabNext]);

  // Sync TV UI state with companion remote
  useEffect(() => {
    const modalType = isRemoteModalOpen
      ? 'remote'
      : isQuickSettingsOpen
      ? 'quick-settings'
      : isProfileModalOpen
      ? 'profile'
      : isSleepModalOpen
      ? 'sleep'
      : activeModal;
    remoteService.updateUIState(currentTab, modalType as any);
  }, [currentTab, activeModal, isQuickSettingsOpen, isProfileModalOpen, isSleepModalOpen, isRemoteModalOpen]);

  // Update Gamepad & Remote callbacks on navigation state change
  useEffect(() => {
    gamepadManager.setCallbacks({
      onBack: handleBack,
      onSearch: handleOpenSearch,
      onSettings: handleOpenSettings,
      onTabPrev: handleTabPrev,
      onTabNext: handleTabNext,
    });
    remoteService.setCallbacks({
      onSetTab: handleSelectTab,
      onOpenSearch: () => setActiveModal('search'),
      onOpenSettings: handleOpenSettings,
      onOpenQuickSettings: () => setIsQuickSettingsOpen((prev) => !prev),
      onOpenSleepTimer: () => setIsSleepModalOpen(true),
      onOpenRemoteModal: () => setIsRemoteModalOpen(true),
      onBack: handleBack,
      onTriggerScreensaver: () => screensaverService.trigger(),
    });
  }, [handleBack, handleOpenSearch, handleOpenSettings, handleSelectTab, handleTabPrev, handleTabNext]);

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
          onOpenRemoteModal={() => setIsRemoteModalOpen(true)}
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
            initialSeason={selectedShowSeason}
            onPlayEpisode={handlePlayEpisode}
            onSelectSimilar={(s) => {
              setSelectedShowSeason(1);
              setSelectedShow(s);
            }}
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
                onSelectShow={(s) => {
                  setSelectedShowSeason(1);
                  setSelectedShow(s);
                }}
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
                onSelectShow={(s) => {
                  setSelectedShowSeason(1);
                  setSelectedShow(s);
                }}
                onPlayShow={async (s) => {
                  setSelectedShow(s);
                  setSelectedShowSeason(1);
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
                onSelectMovie={(m) => setSelectedMovie(m)}
                onPlayMovie={handlePlayMovie}
                onSelectShow={(s) => {
                  setSelectedMovie(null);
                  setSelectedAlbum(null);
                  setSelectedShow(s);
                  setSelectedShowSeason(1);
                }}
                onSelectContinueItem={handleSelectContinueItem}
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
          key={activeVideoSource.id}
          source={activeVideoSource}
          onMinimizeToPiP={handleMinimizeToPiP}
          onExit={handleExitVideoPlayer}
          onPlayNextEpisode={(nextEp) => {
            handlePlayEpisode(nextEp);
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
        <QuickSettingsModal
          onClose={() => setIsQuickSettingsOpen(false)}
          onOpenRemoteModal={() => setIsRemoteModalOpen(true)}
        />
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

      {/* Companion Phone Remote Modal */}
      {isRemoteModalOpen && (
        <CompanionRemoteModal onClose={() => setIsRemoteModalOpen(false)} />
      )}

      {/* Deep Standby / Sleep Screen */}
      <StandbyScreen
        isActive={isStandbyActive}
        onWake={() => sleepTimerService.wakeFromStandby()}
      />

      {/* 4K Aerial Screensaver with Ambient Clock & Weather */}
      <AerialScreensaver
        isActive={isScreensaverActive && !isStandbyActive}
        onWake={() => screensaverService.wake()}
      />

      {/* Gamepad Connection HUD Notification */}
      {gamepadToast && (
        <div className="tv-gamepad-status-banner animate-fade-in" role="status">
          <Gamepad size={20} color={gamepadToast.connected ? '#81c995' : '#f28b82'} />
          <span>{gamepadToast.message}</span>
        </div>
      )}

      {/* Phone Remote Connection HUD Notification */}
      {remoteToast && (
        <div className="tv-gamepad-status-banner animate-fade-in" role="status">
          <Smartphone size={20} color="#81c995" />
          <span>{remoteToast.message}</span>
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


      {/* Startup Splash Animation */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </div>
  );
};

export default App;
