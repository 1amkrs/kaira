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
import { isValidStreamUrl, extractImdbId } from './services/addons/streamFallback';
import { AddonStream } from './types/addons';
import { MediaItem } from './types';
import { Loader2, Gamepad, Volume2, VolumeX, Smartphone } from 'lucide-react';
import { OfflineIndicator } from './components/PWA/PWAInstallBanner';
import { platform } from './platform';
import { AndroidOnboarding } from './components/Onboarding/AndroidOnboarding';
import {
  shouldShowAndroidOnboarding,
  isRemoteFeatureEnabled,
  isAndroidOnboardingCompleted,
} from './components/Onboarding/onboardingState';
import './App.css';

const TABS: NavigationTab[] = ['for-you', 'movies', 'shows', 'music', 'library'];

export const App: React.FC = () => {
  const isRemoteEnabled = isRemoteFeatureEnabled(platform.isAndroid);
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') !== '1';
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() =>
    shouldShowAndroidOnboarding({
      isAndroid: platform.isAndroid,
      search: window.location.search,
      completed: isAndroidOnboardingCompleted(),
    })
  );
  const [currentTab, setCurrentTab] = useState<NavigationTab>('for-you');
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward');
  const [activeModal, setActiveModal] = useState<'search' | 'settings' | null>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(
    () =>
      profileService.getState().promptOnLaunch &&
      !shouldShowAndroidOnboarding({
        isAndroid: platform.isAndroid,
        search: window.location.search,
        completed: isAndroidOnboardingCompleted(),
      })
  );
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
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>('');
  const [launchToast, setLaunchToast] = useState<LaunchFeedback | null>(null);
  const [gamepadToast, setGamepadToast] = useState<{ message: string; connected: boolean } | null>(null);
  const [remoteToast, setRemoteToast] = useState<{ message: string; count: number } | null>(null);
  const [volumeToast, setVolumeToast] = useState<{ level: number; muted: boolean } | null>(null);
  const volumeToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeVideoSourceRef = useRef<PlaybackSource | null>(null);
  const isDetailOpenRef = useRef<boolean>(false);
  const selectedShowRef = useRef<Show | null>(null);
  activeVideoSourceRef.current = activeVideoSource;
  selectedShowRef.current = selectedShow;

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

  const handleOpenSearch = useCallback((initialQuery?: string) => {
    if (typeof initialQuery === 'string' && initialQuery.trim().length > 0) {
      setSearchInitialQuery(initialQuery);
      setActiveModal('search');
      return;
    }
    setActiveModal((prev) => {
      if (prev === 'search') {
        setSearchInitialQuery('');
        return null;
      }
      return 'search';
    });
  }, []);

  const handleOpenSettings = useCallback(() => {
    setActiveModal((prev) => (prev === 'settings' ? null : 'settings'));
  }, []);

  // --- PLAYBACK DISPATCHERS ---
  const handlePlayMovie = useCallback(async (
    movie: Movie,
    customStreamUrl?: string,
    streamType?: 'direct' | 'embed' | 'youtube' | 'torrent',
    proxyHeaders?: Record<string, string>,
    preloadedStreams?: AddonStream[]
  ) => {
    const cleanImdbId = extractImdbId(movie.imdbId, movie.id);
    let source: PlaybackSource;

    try {
      source = await mediaProvider.getPlaybackSource(movie);
    } catch (err) {
      console.warn('[App] getPlaybackSource failed for movie, synthesizing fallback source:', err);
      source = {
        id: `source-${movie.id}`,
        type: 'video',
        streamType: 'embed',
        title: movie.title,
        subtitle: `${movie.year} • ${movie.runtime}`,
        artwork: movie.poster,
        backdrop: movie.backdrop,
        streamUrl: movie.streamUrl || '',
        durationSeconds: (movie.runtimeMinutes || 120) * 60,
        initialPosition: 0,
        mediaType: 'movie',
        mediaId: movie.id,
        imdbId: cleanImdbId || undefined,
        ytTrailerId: movie.ytTrailerId,
      };
    }

    const plan = await addonService.resolveStreamPlan({
      type: 'movie',
      id: movie.id,
      imdbId: cleanImdbId || source.imdbId,
      titleHint: movie.title,
      ytTrailerId: movie.ytTrailerId || source.ytTrailerId,
      preferredStreamUrl: customStreamUrl,
      preferredStreamType: streamType,
      preferredProxyHeaders: proxyHeaders,
      preloadedStreams,
    });

    if (plan.warnings.length > 0) {
      console.warn(`[App] Movie stream fallback notice (${movie.title}):`, plan.warnings.join(' | '));
    }

    if (plan.primary && isValidStreamUrl(plan.primary.url)) {
      source.streamUrl = plan.primary.url;
      source.streamType = plan.primary.streamType;
      source.proxyHeaders = plan.primary.proxyHeaders;
      if (plan.primary.durationSeconds && plan.primary.durationSeconds > 0) {
        source.durationSeconds = plan.primary.durationSeconds;
      }
    } else if (!isValidStreamUrl(source.streamUrl) && plan.candidates.length > 0) {
      const backup = plan.candidates[0];
      source.streamUrl = backup.url;
      source.streamType = backup.streamType;
      source.proxyHeaders = backup.proxyHeaders;
    }

    if (plan.imdbId) {
      source.imdbId = plan.imdbId;
    }
    source.fallbackStreams = plan.candidates;

    // Save to active profile's watch history memory (preserving existing progress if resuming)
    const existingMovieHist = profileService
      .getWatchHistory(activeProfile.id)
      .find((h) => h.mediaId === movie.id);
    profileService.addWatchHistory(activeProfile.id, {
      mediaId: movie.id,
      title: movie.title,
      type: 'movie',
      poster: movie.poster,
      backdrop: movie.backdrop,
      progress: existingMovieHist?.progress ?? 0,
      positionSeconds: existingMovieHist?.positionSeconds ?? source.initialPosition ?? 0,
      durationSeconds: source.durationSeconds || (movie.runtimeMinutes || 120) * 60,
      genres: movie.genres,
      rating: movie.rating,
      year: movie.year,
    });

    try {
      await playbackService.play(source);
    } catch (err) {
      console.warn('[App] playbackService.play notice for movie:', err);
    }
    setActiveVideoSource(source);
  }, [activeProfile.id]);

  const handlePlayEpisode = useCallback(async (
    episode: Episode,
    customStreamUrl?: string,
    streamType?: 'direct' | 'embed' | 'youtube' | 'torrent',
    streamDurationSeconds?: number,
    proxyHeaders?: Record<string, string>,
    preloadedStreams?: AddonStream[]
  ) => {
    const currentSelectedShow = selectedShowRef.current;
    // Eagerly ensure selectedShow is set to this TV show so it sits directly underneath the player
    setSelectedShowSeason(episode.seasonNumber || 1);
    if (!currentSelectedShow || (currentSelectedShow.id !== episode.showId && currentSelectedShow.imdbId !== episode.showId)) {
      mediaProvider.getShow(episode.showId).then((s) => {
        if (s) {
          setSelectedMovie(null);
          setSelectedAlbum(null);
          setSelectedShow(s);
        }
      }).catch(() => {});
    }

    const matchingShow =
      currentSelectedShow &&
      (currentSelectedShow.id === episode.showId || currentSelectedShow.imdbId === episode.showId)
        ? currentSelectedShow
        : null;
    const cleanImdbId = extractImdbId(episode.imdbId, matchingShow?.imdbId, episode.showId);
    const titleHint = episode.showTitle || matchingShow?.title || episode.title;

    let source: PlaybackSource;
    try {
      source = await mediaProvider.getPlaybackSource(episode);
    } catch (err) {
      console.warn('[App] getPlaybackSource failed for episode, synthesizing fallback source:', err);
      source = {
        id: `source-${episode.id}`,
        type: 'video',
        streamType: 'embed',
        title: episode.title,
        subtitle: `Season ${episode.seasonNumber || 1} · Episode ${episode.number || 1}`,
        artwork: episode.thumbnail,
        backdrop: matchingShow?.backdrop || episode.thumbnail,
        streamUrl: episode.streamUrl || '',
        durationSeconds: episode.durationSeconds || (episode.runtimeMinutes || 45) * 60,
        initialPosition: 0,
        mediaType: 'episode',
        mediaId: episode.id,
        showId: episode.showId,
        showTitle: titleHint,
        seasonId: episode.seasonId,
        seasonNumber: episode.seasonNumber || 1,
        episodeNumber: episode.number || 1,
        imdbId: cleanImdbId || undefined,
      };
    }

    const plan = await addonService.resolveStreamPlan({
      type: 'series',
      id: episode.showId,
      imdbId: cleanImdbId || source.imdbId,
      seasonNumber: episode.seasonNumber || source.seasonNumber || 1,
      episodeNumber: episode.number || source.episodeNumber || 1,
      titleHint,
      ytTrailerId: matchingShow?.ytTrailerId || source.ytTrailerId,
      preferredStreamUrl: customStreamUrl,
      preferredStreamType: streamType,
      preferredProxyHeaders: proxyHeaders,
      preferredDurationSeconds: streamDurationSeconds,
      preloadedStreams,
    });

    if (plan.warnings.length > 0) {
      console.warn(
        `[App] Episode stream fallback notice (${titleHint} S${episode.seasonNumber}E${episode.number}):`,
        plan.warnings.join(' | ')
      );
    }

    if (plan.primary && isValidStreamUrl(plan.primary.url)) {
      source.streamUrl = plan.primary.url;
      source.streamType = plan.primary.streamType;
      source.proxyHeaders = plan.primary.proxyHeaders;
      if (plan.primary.durationSeconds && plan.primary.durationSeconds > 0) {
        source.durationSeconds = plan.primary.durationSeconds;
      }
    } else if (!isValidStreamUrl(source.streamUrl) && plan.candidates.length > 0) {
      const backup = plan.candidates[0];
      source.streamUrl = backup.url;
      source.streamType = backup.streamType;
      source.proxyHeaders = backup.proxyHeaders;
    }

    if (streamDurationSeconds && streamDurationSeconds > 0 && !source.durationSeconds) {
      source.durationSeconds = streamDurationSeconds;
    }

    if (plan.imdbId) {
      source.imdbId = plan.imdbId;
    }
    source.fallbackStreams = plan.candidates;

    // Save to active profile's watch history memory (preserving existing progress if resuming)
    const existingEpHist = profileService
      .getWatchHistory(activeProfile.id)
      .find((h) => h.mediaId === episode.id);
    profileService.addWatchHistory(activeProfile.id, {
      mediaId: episode.id,
      title: episode.title,
      type: 'show',
      poster: episode.thumbnail,
      backdrop: episode.thumbnail,
      progress: existingEpHist?.progress ?? 0,
      positionSeconds: existingEpHist?.positionSeconds ?? source.initialPosition ?? 0,
      durationSeconds: source.durationSeconds || episode.durationSeconds || (episode.runtimeMinutes || 45) * 60,
      episodeInfo: {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
      },
    });

    try {
      await playbackService.play(source);
    } catch (err) {
      console.warn('[App] playbackService.play notice for episode:', err);
    }
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
        ytVideoId: t.ytVideoId,
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
        ytVideoId: track.ytVideoId,
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
    } else if (isSleepModalOpen) {
      setIsSleepModalOpen(false);
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
      if (activeModal === 'search') {
        setSearchInitialQuery('');
      }
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
    isStandbyActive,
    isScreensaverActive,
    isRemoteModalOpen,
    isSleepModalOpen,
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
  isDetailOpenRef.current = isDetailOpen;

  const hasOverlayRef = useRef<boolean>(false);
  hasOverlayRef.current =
    isStandbyActive ||
    isScreensaverActive ||
    isRemoteModalOpen ||
    isQuickSettingsOpen ||
    isProfileModalOpen ||
    isSleepModalOpen ||
    Boolean(activeVideoSource) ||
    Boolean(pipVideoSource) ||
    isMusicPlayerOpen ||
    Boolean(activeModal) ||
    Boolean(selectedMovie) ||
    Boolean(selectedShow) ||
    Boolean(selectedAlbum) ||
    currentTab !== 'for-you';

  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  const handleOpenSearchRef = useRef(handleOpenSearch);
  handleOpenSearchRef.current = handleOpenSearch;
  const handleOpenSettingsRef = useRef(handleOpenSettings);
  handleOpenSettingsRef.current = handleOpenSettings;
  const handleSelectTabRef = useRef(handleSelectTab);
  handleSelectTabRef.current = handleSelectTab;
  const handleTabPrevRef = useRef(handleTabPrev);
  handleTabPrevRef.current = handleTabPrev;
  const handleTabNextRef = useRef(handleTabNext);
  handleTabNextRef.current = handleTabNext;

  // Controller & System Subscriptions (mount once per platform mode; fresh callbacks stay synced via setCallbacks & refs)
  useEffect(() => {
    sleepTimerService.setOnSleepCallback(() => {
      if (activeVideoSourceRef.current) {
        setActiveVideoSource(null);
      }
      displayService.triggerPowerAction('sleep');
    });

    const unsubGamepadActions = gamepadManager.subscribeAction(() => {
      screensaverService.reportActivity();
    });

    const cleanup = gamepadManager.init({
      onBack: () => handleBackRef.current(),
      onSearch: () => handleOpenSearchRef.current(),
      onSettings: () => handleOpenSettingsRef.current(),
      onMenu: () => setIsQuickSettingsOpen((prev) => !prev),
      onTabPrev: () => handleTabPrevRef.current(),
      onTabNext: () => handleTabNextRef.current(),
      onGamepadStatusChange: (connected, id) => {
        setGamepadToast({
          message: connected ? `Controller Connected: ${id.split('(')[0].trim() || 'Gamepad'}` : 'Controller Disconnected',
          connected,
        });
        setTimeout(() => setGamepadToast(null), 3200);
      },
    });

    const isEditableElement = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleVolumeKeys = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (activeVideoSourceRef.current) return;
      if (isEditableElement(e.target) || isEditableElement(document.activeElement)) return;

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

    const unsubRemote = isRemoteEnabled
      ? remoteService.subscribeClientCount((count) => {
          if (count > 0) {
            setRemoteToast({ message: `Phone Remote Connected (${count})`, count });
            setTimeout(() => setRemoteToast(null), 3200);
          }
        })
      : () => {};

    if (isRemoteEnabled) {
      remoteService.init({
        onSetTab: (tab) => handleSelectTabRef.current(tab),
        onOpenSearch: (query?: string) => {
          if (typeof query === 'string') {
            setSearchInitialQuery(query);
          }
          setActiveModal('search');
        },
        onOpenSettings: () => handleOpenSettingsRef.current(),
        onOpenQuickSettings: () => setIsQuickSettingsOpen((prev) => !prev),
        onOpenSleepTimer: () => setIsSleepModalOpen(true),
        onOpenRemoteModal: () => setIsRemoteModalOpen(true),
        onBack: () => handleBackRef.current(),
        onTriggerScreensaver: () => screensaverService.trigger(),
      });
    }

    const handleOpenOnboarding = () => {
      setShowOnboarding(true);
    };
    window.addEventListener('kaira:open-onboarding', handleOpenOnboarding);

    const handleMouseMove = () => {
      document.body.classList.remove('hide-cursor');
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        if (!isDetailOpenRef.current) {
          document.body.classList.add('hide-cursor');
        }
      }, 3500);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cleanup();
      unsubGamepadActions();
      unsubRemote();
      window.removeEventListener('kaira:open-onboarding', handleOpenOnboarding);
      window.removeEventListener('keydown', handleVolumeKeys);
      window.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
      unsubLaunch();
      unsubProfile();
    };
  }, [isRemoteEnabled]);

  // Sync TV UI state with companion remote (non-Android only)
  useEffect(() => {
    if (!isRemoteEnabled) return;
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
  }, [currentTab, activeModal, isQuickSettingsOpen, isProfileModalOpen, isSleepModalOpen, isRemoteModalOpen, isRemoteEnabled]);

  // Update Gamepad & Remote callbacks on navigation state change
  useEffect(() => {
    gamepadManager.setCallbacks({
      onBack: handleBack,
      onSearch: () => handleOpenSearch(),
      onSettings: handleOpenSettings,
      onMenu: () => setIsQuickSettingsOpen((prev) => !prev),
      onTabPrev: handleTabPrev,
      onTabNext: handleTabNext,
    });
    if (isRemoteEnabled) {
      remoteService.setCallbacks({
        onSetTab: handleSelectTab,
        onOpenSearch: (query?: string) => {
          if (typeof query === 'string') {
            setSearchInitialQuery(query);
          }
          setActiveModal('search');
        },
        onOpenSettings: handleOpenSettings,
        onOpenQuickSettings: () => setIsQuickSettingsOpen((prev) => !prev),
        onOpenSleepTimer: () => setIsSleepModalOpen(true),
        onOpenRemoteModal: () => setIsRemoteModalOpen(true),
        onBack: handleBack,
        onTriggerScreensaver: () => screensaverService.trigger(),
      });
    }
  }, [handleBack, handleOpenSearch, handleOpenSettings, handleSelectTab, handleTabPrev, handleTabNext, isRemoteEnabled]);

  // Android hardware back / system gesture navigation bridge (single guard entry, never pollutes history)
  useEffect(() => {
    if (!platform.isAndroid && !window.matchMedia('(max-width: 768px)').matches) return;

    const onPopState = () => {
      if (hasOverlayRef.current) {
        handleBackRef.current();
        window.history.pushState({ kairaNav: true }, '');
      }
    };

    window.history.pushState({ kairaNav: true }, '');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className={`tv-app-shell ${platform.isAndroid ? 'is-android' : ''} ${platform.isAndroidTV ? 'is-android-tv' : ''}`}>
      <OfflineIndicator />
      {/* Top Google TV Navigation Bar (hidden on detail views and full-screen modals) */}
      {!isDetailOpen && !activeModal && (
        <TopNav
          activeScreen={activeModal || currentTab}
          onSelectTab={handleSelectTab}
          onOpenSearch={handleOpenSearch}
          onOpenSettings={handleOpenSettings}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenRemoteModal={isRemoteEnabled ? () => setIsRemoteModalOpen(true) : undefined}
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
          initialQuery={searchInitialQuery}
          onClose={() => {
            setActiveModal(null);
            setSearchInitialQuery('');
          }}
          onSelectMovie={(m) => {
            setActiveModal(null);
            setSearchInitialQuery('');
            setSelectedMovie(m);
          }}
          onSelectShow={(s) => {
            setActiveModal(null);
            setSearchInitialQuery('');
            setSelectedShow(s);
          }}
          onSelectAlbum={(a) => {
            setActiveModal(null);
            setSearchInitialQuery('');
            setSelectedAlbum(a);
          }}
          onPlayTrack={(t, queue) => {
            setActiveModal(null);
            setSearchInitialQuery('');
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
          onOpenRemoteModal={isRemoteEnabled ? () => setIsRemoteModalOpen(true) : undefined}
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

      {/* Companion Phone Remote Modal (disabled on Android) */}
      {isRemoteEnabled && isRemoteModalOpen && (
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

      {/* Phone Remote Connection HUD Notification (disabled on Android) */}
      {isRemoteEnabled && remoteToast && (
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

      {/* Initial Android Onboarding Flow (Android TV & Mobile/Tablet) */}
      {!showSplash && showOnboarding && (
        <AndroidOnboarding
          onComplete={() => setShowOnboarding(false)}
          onProfileChanged={(prof) => setActiveProfile(prof)}
        />
      )}
    </div>
  );
};

export default App;
