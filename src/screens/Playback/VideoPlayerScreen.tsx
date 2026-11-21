import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  AlertCircle,
  Subtitles,
  SlidersHorizontal,
  Layers,
  Volume2,
  Volume1,
  VolumeX,
  Check,
  X,
  FastForward,
  Minimize2,
  RefreshCw,
  Loader2,
  ListVideo,
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react';
import { PlayerEngineController, PlayerEngineState } from '../../services/player/PlayerEngineController';
import { DriverType } from '../../services/player/types';
import {
  formatTime,
  formatRemainingTime,
  formatEndsAt,
  computeIntroRangePercent,
  loadSubtitleStyle,
  saveSubtitleStyle,
  SubtitleStylePrefs,
  SubtitleSize,
  SubtitleBackdrop,
} from '../../services/player/playerHudUtils';
import { addonService } from '../../services/addons/AddonService';
import {
  getStreamPlayerBadge,
  sortStreamsForDisplay,
  formatPlayerErrorMessage,
} from '../../services/addons/stremioProtocol';
import {
  deduplicateStreams,
  extractImdbId,
  buildEmergencyFallbackStreams,
} from '../../services/addons/streamFallback';
import { introService } from '../../services/playback/IntroService';
import { continueWatchingService } from '../../services/playback/ContinueWatchingService';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { gamepadManager } from '../../services/controller/gamepadManager';
import { PlaybackSource, Episode } from '../../types/media';
import { AddonStream, SubtitleTrack } from '../../types/addons';
import { Focusable } from '../../components/Focusable/Focusable';
import { playbackService } from '../../services/playback/PlaybackService';
import './VideoPlayerScreen.css';

type SheetTab = 'audio_subs' | 'sources' | 'playback' | 'episodes';

interface VideoPlayerScreenProps {
  source: PlaybackSource;
  onExit: () => void;
  onMinimizeToPiP?: () => void;
  onPlayNextEpisode?: (nextEpisode: Episode) => void;
}

export const VideoPlayerScreen: React.FC<VideoPlayerScreenProps> = ({
  source,
  onExit,
  onMinimizeToPiP,
  onPlayNextEpisode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PlayerEngineController | null>(null);

  // Engine state mirror
  const [engineState, setEngineState] = useState<PlayerEngineState>({
    driverType: source.streamType === 'youtube' ? 'youtube' : source.streamType === 'embed' ? 'embed' : 'direct',
    status: 'buffering',
    currentTime: source.initialPosition || 0,
    duration: source.durationSeconds || 7200,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    bufferedPercent: 0,
    currentSubtitleText: null,
    vocalBoostEnabled: false,
  });

  // HUD & UI States
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const [isCursorHidden, setIsCursorHidden] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [menuTab, setMenuTab] = useState<SheetTab>('audio_subs');
  const [showCodecTools, setShowCodecTools] = useState<boolean>(false);
  const [feedbackBadge, setFeedbackBadge] = useState<string | null>(null);
  const [debugOverlayOpen, setDebugOverlayOpen] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string>('Player Initialized');
  const [showSlowBufferHint, setShowSlowBufferHint] = useState<boolean>(false);
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  // Subtitle appearance preferences (persisted in localStorage)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStylePrefs>(() => loadSubtitleStyle());

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStylePrefs>) => {
    setSubtitleStyle((prev) => {
      const next = { ...prev, ...patch };
      saveSubtitleStyle(next);
      return next;
    });
  }, []);

  // Stream & Subtitles metadata
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(source.streamUrl);
  const [currentProxyHeaders, setCurrentProxyHeaders] = useState<Record<string, string> | undefined>(
    source.proxyHeaders
  );
  const [currentDriverType, setCurrentDriverType] = useState<DriverType>(
    source.streamType === 'youtube' ? 'youtube' : source.streamType === 'embed' ? 'embed' : 'direct'
  );
  const [availableStreams, setAvailableStreams] = useState<AddonStream[]>(() => {
    if (source.fallbackStreams && source.fallbackStreams.length > 0) {
      return sortStreamsForDisplay(deduplicateStreams(source.fallbackStreams));
    }
    const cleanImdb = extractImdbId(source.imdbId, source.showId, source.mediaId);
    return buildEmergencyFallbackStreams({
      type: source.mediaType === 'episode' ? 'series' : 'movie',
      imdbId: cleanImdb,
      seasonNumber: source.seasonNumber,
      episodeNumber: source.episodeNumber,
      titleHint: source.showTitle || source.title,
      ytTrailerId: source.ytTrailerId,
    });
  });
  const [activeStreamIdx, setActiveStreamIdx] = useState<number | null>(null);
  const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>(source.subtitles || []);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Intro Skip State
  const [introSegment, setIntroSegment] = useState<{ start: number; end: number; type?: string } | null>(
    source.intro || null
  );
  const [autoSkipIntro, setAutoSkipIntro] = useState<boolean>(() => introService.isAutoSkipEnabled());
  const [hasAutoSkipped, setHasAutoSkipped] = useState<boolean>(false);

  // Reset intro skip state when source changes
  useEffect(() => {
    setHasAutoSkipped(false);
    setIntroSegment(source.intro || null);
  }, [source.id, source.intro]);

  // Next Episode & Season Episode List State (Strictly for TV Shows)
  const [nextEpisode, setNextEpisode] = useState<Episode | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Episode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(false);
  const [isLoadingNext, setIsLoadingNext] = useState<boolean>(false);

  // Scrubbing & Tooltip State
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  // Audio Tracks State
  const [audioTracks, setAudioTracks] = useState<Array<{ id: string; label: string; language: string; enabled: boolean }>>([]);
  const [selectedAudioTrackIdx, setSelectedAudioTrackIdx] = useState<number>(0);

  // Volume OSD state
  const [volumeToast, setVolumeToast] = useState<{ level: number; muted: boolean } | null>(null);
  const volumeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep "Ends HH:MM PM" fresh every 30s while HUD is visible
  useEffect(() => {
    if (!isHudVisible) return;
    setClockTick(Date.now());
    const id = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [isHudVisible]);

  // Show quiet "Taking a while? Switch Source" hint if buffering persists > 8s
  useEffect(() => {
    if (engineState.status !== 'buffering') {
      setShowSlowBufferHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowBufferHint(true), 8000);
    return () => clearTimeout(timer);
  }, [engineState.status, currentStreamUrl]);

  // Helper: Trigger visual feedback badge
  const triggerFeedback = useCallback((text: string) => {
    setFeedbackBadge(text);
    setLastAction(text);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedbackBadge(null), 1100);
  }, []);

  const showVolumeOsd = useCallback((level: number, muted: boolean) => {
    setVolumeToast({ level, muted });
    if (volumeToastTimerRef.current) clearTimeout(volumeToastTimerRef.current);
    volumeToastTimerRef.current = setTimeout(() => setVolumeToast(null), 1600);
  }, []);

  // Helper: Reset HUD and cursor auto-hide timers
  const pingHud = useCallback(() => {
    setIsHudVisible(true);
    setIsCursorHidden(false);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);

    if (engineRef.current?.getState().status === 'playing' && !isMenuOpen && !isScrubbing) {
      hudTimerRef.current = setTimeout(() => {
        setIsHudVisible(false);
      }, 3500);

      cursorTimerRef.current = setTimeout(() => {
        setIsCursorHidden(true);
      }, 2500);
    }
  }, [isMenuOpen, isScrubbing]);

  // Clean up cursor timer when playback status changes (e.g. paused)
  useEffect(() => {
    if (engineState.status !== 'playing' || isMenuOpen || isScrubbing) {
      setIsCursorHidden(false);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    } else {
      pingHud();
    }
  }, [engineState.status, isMenuOpen, isScrubbing, pingHud]);

  // Helper to open/close settings slide-over sheet cleanly
  const openSheet = useCallback((tab?: SheetTab) => {
    if (tab) setMenuTab(tab);
    setIsMenuOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setIsMenuOpen(false);
    const restoreTarget = currentDriverType === 'embed' ? 'player-hud-menu-btn' : 'player-playpause-main-btn';
    setTimeout(() => spatialNav.setFocus(restoreTarget), 30);
  }, [currentDriverType]);

  // 1. Initialize Player Engine Controller
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new PlayerEngineController();
    engine.initialize(containerRef.current);
    engineRef.current = engine;

    const unsub = engine.subscribe((s) => {
      setEngineState((prev) => {
        const fallback = source.durationSeconds || (source.mediaType === 'episode' ? 2700 : 7200);
        const resolvedDuration =
          s.duration && s.duration > 60 ? s.duration : prev.duration > 60 ? prev.duration : fallback;
        return {
          ...s,
          duration: resolvedDuration,
        };
      });
    });

    spatialNav.pushScope('video-player-screen');

    return () => {
      spatialNav.popScope('video-player-screen');
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1b. React to source stream URL changes (async resolution from App.tsx)
  useEffect(() => {
    if (!engineRef.current || !source.streamUrl) return;

    const driverType: DriverType =
      source.streamType === 'youtube' ? 'youtube'
      : source.streamType === 'embed' ? 'embed'
      : 'direct';

    setCurrentStreamUrl(source.streamUrl);
    setCurrentProxyHeaders(source.proxyHeaders);
    setCurrentDriverType(driverType);
    setActiveStreamIdx(null);

    if (source.fallbackStreams && source.fallbackStreams.length > 0) {
      setAvailableStreams((prev) =>
        sortStreamsForDisplay(deduplicateStreams([...(source.fallbackStreams || []), ...prev]))
      );
    }

    const initialExpectedDur = source.durationSeconds || (source.mediaType === 'episode' ? 2700 : 7200);
    engineRef.current.loadMedia(
      source.streamUrl,
      driverType,
      source.initialPosition || 0,
      source.subtitles && source.subtitles.length > 0 ? source.subtitles[0].url : undefined,
      initialExpectedDur,
      source.proxyHeaders,
    );

    if (source.subtitles && source.subtitles.length > 0) {
      setSelectedSubId(source.subtitles[0].id);
    }

    if (source.streamUrl.includes(':8081')) {
      fetch(source.streamUrl, { method: 'HEAD' })
        .then((res) => {
          const h = res.headers.get('X-Media-Duration') || res.headers.get('Content-Duration');
          if (h) {
            const p = parseFloat(h);
            if (isFinite(p) && p > 60) {
              setEngineState((prev) => ({ ...prev, duration: p }));
            }
          }
        })
        .catch(() => {});
    }
  }, [source.streamUrl, source.streamType, source.durationSeconds, source.initialPosition, source.mediaType, source.subtitles, source.proxyHeaders, source.fallbackStreams]);

  // 1c. Stream Loading Watchdog, Alternate Direct Failover & Automatic Backup Mirror Fallback
  const [hasExhaustedFallbacks, setHasExhaustedFallbacks] = useState<boolean>(false);
  const loadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedPlayingRef = useRef<boolean>(false);
  const failedStreamUrlsRef = useRef<Set<string>>(new Set());
  const directFailureCountRef = useRef<number>(0);

  useEffect(() => {
    failedStreamUrlsRef.current.clear();
    directFailureCountRef.current = 0;
    hasStartedPlayingRef.current = false;
    setHasExhaustedFallbacks(false);
  }, [source.id, source.streamUrl]);

  const triggerNextFallback = useCallback(
    (reason: string, forceMirror: boolean = false) => {
      if (currentStreamUrl) {
        failedStreamUrlsRef.current.add(currentStreamUrl);
        addonService.markStreamFailed(currentStreamUrl, reason);
      }

      if (currentDriverType === 'direct') {
        directFailureCountRef.current += 1;
      }

      const cleanImdb = extractImdbId(source.imdbId, source.showId, source.mediaId);
      const emergency = buildEmergencyFallbackStreams({
        type: source.mediaType === 'episode' ? 'series' : 'movie',
        imdbId: cleanImdb,
        seasonNumber: source.seasonNumber,
        episodeNumber: source.episodeNumber,
        titleHint: source.showTitle || source.title,
        ytTrailerId: source.ytTrailerId,
      });

      const candidatePool = sortStreamsForDisplay(
        deduplicateStreams([...availableStreams, ...emergency])
      );

      const nextStream = addonService.getNextFallbackStream(
        candidatePool,
        failedStreamUrlsRef.current,
        {
          allowDirect: !forceMirror,
          allowSelfDebrid: false,
          maxDirectAttemptsReached: directFailureCountRef.current >= 3,
        }
      );

      if (!nextStream || !engineRef.current) {
        console.warn(`[VideoPlayerScreen] All fallback streams exhausted (${reason})`);
        setHasExhaustedFallbacks(true);
        return false;
      }

      const nextDriver: DriverType =
        nextStream.streamType === 'youtube'
          ? 'youtube'
          : nextStream.streamType === 'embed'
          ? 'embed'
          : 'direct';

      console.warn(
        `[VideoPlayerScreen] Stream failed (${reason}); failing over to "${nextStream.name}" [${nextDriver}]`
      );
      triggerFeedback(
        nextDriver === 'direct' ? 'Trying next direct stream' : 'Switching to backup mirror'
      );

      setCurrentStreamUrl(nextStream.url);
      setCurrentProxyHeaders(nextStream.proxyHeaders);
      setCurrentDriverType(nextDriver);
      const idx = availableStreams.findIndex((s) => s.url === nextStream.url);
      setActiveStreamIdx(idx >= 0 ? idx : null);

      engineRef.current.loadMedia(
        nextStream.url,
        nextDriver,
        engineState.currentTime,
        undefined,
        nextStream.durationSeconds || engineState.duration || source.durationSeconds || 7200,
        nextStream.proxyHeaders
      );
      return true;
    },
    [
      currentStreamUrl,
      currentDriverType,
      availableStreams,
      source,
      engineState.currentTime,
      engineState.duration,
      triggerFeedback,
    ]
  );

  useEffect(() => {
    if (engineState.status === 'playing') {
      hasStartedPlayingRef.current = true;
    }

    if (engineState.status === 'playing' || hasExhaustedFallbacks) {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current);
        loadingWatchdogRef.current = null;
      }
      return;
    }

    const isSelfDebrid =
      currentStreamUrl.includes(':8081') ||
      Boolean(source.streamUrl && source.streamUrl.includes(':8081'));
    const isDirectOrDebrid =
      currentDriverType === 'direct' ||
      currentStreamUrl.includes('.mp4') ||
      currentStreamUrl.includes('.mkv') ||
      isSelfDebrid;

    if (engineState.status === 'buffering' && isDirectOrDebrid && !isSelfDebrid && !hasStartedPlayingRef.current) {
      if (!loadingWatchdogRef.current) {
        loadingWatchdogRef.current = setTimeout(() => {
          triggerNextFallback('Stream buffering exceeded 10 seconds timeout', false);
        }, 10000);
      }
    } else if (engineState.status === 'error') {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current);
        loadingWatchdogRef.current = null;
      }
      triggerNextFallback(
        `Playback error encountered: ${engineState.error || 'Connection failed'}`,
        currentDriverType !== 'direct'
      );
    }

    return () => {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current);
        loadingWatchdogRef.current = null;
      }
    };
  }, [
    engineState.status,
    engineState.error,
    currentDriverType,
    currentStreamUrl,
    source.streamUrl,
    hasExhaustedFallbacks,
    triggerNextFallback,
  ]);

  // 2. Fetch Alternate Mirrors & Intro Timestamps in background
  useEffect(() => {
    let cancelled = false;
    const fetchExtraData = async () => {
      try {
        const imdb = extractImdbId(source.imdbId, source.showId, source.mediaId);
        if (imdb && imdb.startsWith('tt')) {
          const streams = await addonService.fetchStreams(
            source.mediaType === 'episode' ? 'series' : 'movie',
            imdb,
            source.seasonNumber,
            source.episodeNumber,
            source.showTitle || source.title,
            source.ytTrailerId
          );
          if (!cancelled && streams && streams.length > 0) {
            setAvailableStreams((prev) =>
              sortStreamsForDisplay(deduplicateStreams([...streams, ...prev]))
            );
          }

          if (!cancelled && (!source.subtitles || source.subtitles.length === 0)) {
            const subs = await addonService.fetchSubtitles(
              source.mediaType === 'episode' ? 'series' : 'movie',
              imdb
            );
            if (!cancelled && subs && subs.length > 0) {
              setAvailableSubtitles(subs);
            }
          }
        }
      } catch (e) {
        console.warn('[VideoPlayerScreen] Background stream query notice:', e);
      }

      if (!cancelled && !source.intro && (source.mediaType === 'episode' || Boolean(source.showId || source.seasonNumber))) {
        const intro = await introService.getIntroTimestamps(source);
        if (!cancelled && intro) {
          setIntroSegment(intro);
        }
      }
    };

    fetchExtraData();
    return () => {
      cancelled = true;
    };
  }, [source.id, source.showId, source.imdbId, source.seasonNumber, source.episodeNumber, source.mediaId, source.mediaType, source.showTitle, source.title, source.ytTrailerId, source.subtitles, source.intro]);

  // 2a-2. Pre-fetch Next Episode & Season Episodes (Strictly for TV Shows)
  useEffect(() => {
    let isCancelled = false;
    if (source.mediaType === 'episode' && (source.showId || source.imdbId)) {
      const showId = source.showId || source.imdbId || '';
      const seasonNum = source.seasonNumber || 1;
      const epNum = source.episodeNumber || 1;

      mediaProvider
        .getNextEpisode(showId, seasonNum, epNum)
        .then((nextEp) => {
          if (!isCancelled) {
            setNextEpisode(nextEp);
          }
        })
        .catch((err) => {
          console.warn('[VideoPlayerScreen] Error fetching next episode:', err);
          if (!isCancelled) setNextEpisode(null);
        });

      setIsLoadingEpisodes(true);
      mediaProvider
        .getEpisodes(showId, seasonNum)
        .then((eps) => {
          if (!isCancelled) {
            setSeasonEpisodes(eps || []);
          }
        })
        .catch(() => {
          if (!isCancelled) setSeasonEpisodes([]);
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingEpisodes(false);
        });
    } else {
      setNextEpisode(null);
      setSeasonEpisodes([]);
    }

    return () => {
      isCancelled = true;
    };
  }, [source.id, source.mediaType, source.showId, source.imdbId, source.seasonNumber, source.episodeNumber]);

  // 2b. Progress Saver — persist watch position to ContinueWatchingService
  const engineStateRef = useRef(engineState);
  engineStateRef.current = engineState;

  useEffect(() => {
    const saveNow = (isComplete: boolean = false) => {
      const state = engineStateRef.current;
      const dur = state.duration > 0 ? state.duration : (source.durationSeconds ?? 7200);
      if (state.currentTime < 10 && !isComplete) return;
      continueWatchingService.upsertFromEngine(source, state.currentTime, dur, isComplete);
    };

    const interval = setInterval(() => {
      const state = engineStateRef.current;
      if (state.status === 'playing') {
        saveNow(false);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      const state = engineStateRef.current;
      if (state.currentTime >= 10) {
        saveNow(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.mediaId]);

  // 2c. Mark completed when engine reports 'ended'
  useEffect(() => {
    if (engineState.status === 'ended') {
      const dur = engineState.duration > 0 ? engineState.duration : (source.durationSeconds ?? 7200);
      continueWatchingService.upsertFromEngine(source, engineState.currentTime, dur, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineState.status]);

  // 2d. Auto-detect available audio tracks
  useEffect(() => {
    if (engineRef.current) {
      const tracks = engineRef.current.getAudioTracks();
      if (tracks && tracks.length > 0) {
        setAudioTracks(tracks);
        const activeIdx = tracks.findIndex((t) => t.enabled);
        if (activeIdx >= 0) setSelectedAudioTrackIdx(activeIdx);
      }
    }
  }, [engineState.status, currentStreamUrl]);

  // 3. Transport Handlers
  const handleTogglePlayPause = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.togglePlayPause();
    const nextStatus = engineRef.current.getState().status;
    triggerFeedback(nextStatus === 'playing' ? 'Playing' : 'Paused');
    pingHud();
  }, [triggerFeedback, pingHud]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      if (!engineRef.current) return;
      engineRef.current.seekBy(deltaSeconds);
      triggerFeedback(deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`);
      pingHud();
    },
    [triggerFeedback, pingHud]
  );

  const seekTo = useCallback(
    (seconds: number) => {
      if (!engineRef.current) return;
      engineRef.current.seekTo(seconds);
      pingHud();
    },
    [pingHud]
  );

  // Register Video Delegate with PlaybackService so Companion Remote directly controls video playback
  useEffect(() => {
    playbackService.setVideoDelegate({
      seek: (sec) => seekTo(sec),
      seekRelative: (delta) => seekBy(delta),
      play: () => {
        engineRef.current?.play();
        pingHud();
      },
      pause: () => {
        engineRef.current?.pause();
        pingHud();
      },
      togglePlayPause: () => handleTogglePlayPause(),
    });

    return () => {
      playbackService.setVideoDelegate(null);
    };
  }, [seekTo, seekBy, handleTogglePlayPause, pingHud]);

  const handleSkipIntro = useCallback(() => {
    if (!introSegment || !engineRef.current) return;
    setHasAutoSkipped(true);
    seekTo(introSegment.end);
    triggerFeedback('Intro skipped');
  }, [introSegment, seekTo, triggerFeedback]);

  const handleSelectEpisode = useCallback(
    async (episode: Episode) => {
      setIsLoadingNext(true);
      setIsMenuOpen(false);
      triggerFeedback(`S${episode.seasonNumber} E${episode.number}`);

      if (onPlayNextEpisode) {
        onPlayNextEpisode(episode);
        setIsLoadingNext(false);
        return;
      }

      try {
        const nextSource = await mediaProvider.getPlaybackSource(episode);
        if (engineRef.current) {
          const driverType: DriverType =
            nextSource.streamType === 'youtube' ? 'youtube' : nextSource.streamType === 'embed' ? 'embed' : 'direct';
          setCurrentStreamUrl(nextSource.streamUrl);
          setCurrentDriverType(driverType);
          engineRef.current.loadMedia(
            nextSource.streamUrl,
            driverType,
            0,
            nextSource.subtitles && nextSource.subtitles.length > 0 ? nextSource.subtitles[0].url : undefined,
            nextSource.durationSeconds || 2700
          );
        }
      } catch (err) {
        console.error('[VideoPlayerScreen] Error starting episode:', err);
      } finally {
        setIsLoadingNext(false);
      }
    },
    [onPlayNextEpisode, triggerFeedback]
  );

  const handlePlayNextEpisode = useCallback(async () => {
    if (!nextEpisode) return;
    await handleSelectEpisode(nextEpisode);
  }, [nextEpisode, handleSelectEpisode]);

  const handleReplayCurrent = useCallback(() => {
    if (!engineRef.current) return;
    seekTo(0);
    engineRef.current.play();
    triggerFeedback('Replaying');
    pingHud();
  }, [seekTo, triggerFeedback, pingHud]);

  // 4. Intro Auto-Skip Monitor & Reset
  useEffect(() => {
    if (!introSegment) return;
    if (hasAutoSkipped && engineState.currentTime < introSegment.start) {
      setHasAutoSkipped(false);
      return;
    }
    if (hasAutoSkipped || !autoSkipIntro) return;
    const { start, end } = introSegment;
    if (engineState.currentTime >= start && engineState.currentTime < end - 1) {
      setHasAutoSkipped(true);
      handleSkipIntro();
    }
  }, [engineState.currentTime, introSegment, hasAutoSkipped, autoSkipIntro, handleSkipIntro]);

  // 4b. Auto-focus Next Episode button when playback ends
  useEffect(() => {
    if (engineState.status === 'ended') {
      if (source.mediaType === 'episode' && nextEpisode) {
        spatialNav.setFocus('player-next-episode-btn');
      } else {
        spatialNav.setFocus('player-replay-btn');
      }
    }
  }, [engineState.status, source.mediaType, nextEpisode]);

  // 5. Remote Controller & Physical Keyboard Mapping
  useEffect(() => {
    spatialNav.setFocus(currentDriverType === 'embed' ? 'player-hud-menu-btn' : 'player-playpause-main-btn');

    const handleKeyDown = (e: KeyboardEvent) => {
      pingHud();

      // Escape / B button
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isMenuOpen) {
          closeSheet();
        } else {
          onExit();
        }
        return;
      }

      // Space / PlayPause key / Key K
      if (e.key === ' ' || e.key === 'MediaPlayPause' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleTogglePlayPause();
        return;
      }

      // Dedicated Seek keys: [ / J (-10s) and ] / L (+10s)
      if (e.key === '[' || e.key === 'j' || e.key === 'J' || (e.shiftKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        seekBy(-10);
        return;
      }
      if (e.key === ']' || e.key === 'l' || e.key === 'L' || (e.shiftKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        seekBy(10);
        return;
      }

      // Left / Right Arrow: Seek +/-10s when HUD is hidden OR focus is on scrubber
      const focusedId = spatialNav.getFocusedId();
      const isScrubberFocused = focusedId === 'player-scrubber-bar';

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isMenuOpen) {
        if (!isHudVisible || isScrubberFocused) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const delta = e.key === 'ArrowLeft' ? -10 : 10;
          seekBy(delta);
          return;
        }
      }

      // 'I' key: Skip intro immediately
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        if (introSegment) {
          handleSkipIntro();
        }
        return;
      }

      // 'N' key: Skip to Next Episode (Strictly for TV Shows)
      if ((e.key === 'n' || e.key === 'N') && !isMenuOpen && source.mediaType === 'episode' && nextEpisode) {
        e.preventDefault();
        handlePlayNextEpisode();
        return;
      }

      // 'Y' key: Toggle settings sheet
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isMenuOpen) closeSheet();
        else openSheet();
        return;
      }

      // 'X' / 'S' key: Quick subtitles & audio sheet
      if (e.key === 'x' || e.key === 'X' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSheet('audio_subs');
        return;
      }

      // Volume Keys
      if (e.key === '+' || e.key === '=' || e.key === 'VolumeUp' || (e.key === 'ArrowUp' && !isMenuOpen && !isHudVisible)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const next = engineRef.current ? engineRef.current.adjustVolume(0.05) : 1;
        showVolumeOsd(Math.round(next * 100), next === 0);
        return;
      }
      if (e.key === '-' || e.key === '_' || e.key === 'VolumeDown' || (e.key === 'ArrowDown' && !isMenuOpen && !isHudVisible)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const next = engineRef.current ? engineRef.current.adjustVolume(-0.05) : 0;
        showVolumeOsd(Math.round(next * 100), next === 0);
        return;
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'VolumeMute') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const muted = engineRef.current ? engineRef.current.toggleMute() : false;
        const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
        showVolumeOsd(muted ? 0 : Math.round(curVol * 100), muted);
        return;
      }

      // 'D' key: Diagnostics overlay
      if (e.key === 'd' || e.key === 'D') {
        setDebugOverlayOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pingHud, isHudVisible, isMenuOpen, onExit, closeSheet, openSheet, currentDriverType, handleTogglePlayPause, seekBy, introSegment, handleSkipIntro, handlePlayNextEpisode, source.mediaType, nextEpisode, showVolumeOsd]);

  // 5b. Gamepad Action Handling
  useEffect(() => {
    const unsubGamepad = gamepadManager.subscribeAction((diag) => {
      pingHud();
      const action = diag.normalized;

      switch (action) {
        case 'BACK':
          if (isMenuOpen) {
            closeSheet();
          } else {
            onExit();
          }
          break;
        case 'PLAY_PAUSE':
          handleTogglePlayPause();
          break;
        case 'SUBTITLES':
          openSheet('audio_subs');
          break;
        case 'MENU':
          if (isMenuOpen) closeSheet();
          else openSheet();
          break;
        case 'SEEK_BACKWARD':
        case 'TAB_PREV':
          seekBy(-10);
          break;
        case 'SEEK_FORWARD':
        case 'TAB_NEXT':
          seekBy(10);
          break;
        case 'VOLUME_UP': {
          const next = engineRef.current ? engineRef.current.adjustVolume(0.05) : 1;
          showVolumeOsd(Math.round(next * 100), next === 0);
          break;
        }
        case 'VOLUME_DOWN': {
          const next = engineRef.current ? engineRef.current.adjustVolume(-0.05) : 0;
          showVolumeOsd(Math.round(next * 100), next === 0);
          break;
        }
        case 'MUTE': {
          const muted = engineRef.current ? engineRef.current.toggleMute() : false;
          const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
          showVolumeOsd(muted ? 0 : Math.round(curVol * 100), muted);
          break;
        }
        default:
          break;
      }
    });

    return () => {
      unsubGamepad();
    };
  }, [pingHud, isMenuOpen, onExit, closeSheet, openSheet, handleTogglePlayPause, seekBy, showVolumeOsd]);

  const fallbackDur = source.durationSeconds || (source.mediaType === 'episode' ? 2700 : 7200);
  const currentEffectiveDur =
    engineState.duration > 60
      ? engineState.duration
      : fallbackDur > 0
      ? fallbackDur
      : engineState.duration;

  // 6. Scrubber Drag & Pointer Handlers
  const handleScrubberMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos);
    if (isScrubbing) {
      setScrubPosition(pos);
    }
  };

  const handleScrubberCommit = (pos: number) => {
    seekTo(pos * currentEffectiveDur);
  };

  const currentScrubFraction = isScrubbing && scrubPosition !== null ? scrubPosition : null;

  const displayCurrentTime =
    currentScrubFraction !== null ? currentScrubFraction * currentEffectiveDur : engineState.currentTime;

  const progressPct =
    currentScrubFraction !== null
      ? currentScrubFraction * 100
      : currentEffectiveDur > 0
      ? Math.min(100, (engineState.currentTime / currentEffectiveDur) * 100)
      : 0;

  const bufferedPct = Math.max(progressPct, Math.min(100, engineState.bufferedPercent || 0));
  const introRange = computeIntroRangePercent(introSegment, currentEffectiveDur);
  const endsAtLabel = formatEndsAt(
    displayCurrentTime,
    currentEffectiveDur,
    engineState.playbackSpeed,
    new Date(clockTick)
  );

  const isInsideIntro =
    introSegment && engineState.currentTime >= introSegment.start && engineState.currentTime <= introSegment.end;

  const isOutroOrNearEnd =
    source.mediaType === 'episode' &&
    nextEpisode !== null &&
    engineState.status === 'playing' &&
    !isMenuOpen &&
    currentEffectiveDur > 60 &&
    engineState.currentTime >= currentEffectiveDur - 25;

  const isEpisode = source.mediaType === 'episode';
  const inlineSubtitle =
    source.subtitle ||
    (isEpisode && source.seasonNumber && source.episodeNumber
      ? `Season ${source.seasonNumber} · Episode ${source.episodeNumber}`
      : null);

  // Deduplicate identical language codes so subtitle picker stays clean (max 1 per language label unless distinct)
  const dedupedSubtitles = React.useMemo(() => {
    const seen = new Set<string>();
    const result: SubtitleTrack[] = [];
    for (const sub of availableSubtitles) {
      const key = (sub.label || sub.lang || sub.id).trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(sub);
      }
    }
    return result;
  }, [availableSubtitles]);

  // Resolve a single active source index (avoid marking multiple mirrors that share a fallback URL)
  const resolvedActiveStreamIdx = React.useMemo(() => {
    if (activeStreamIdx !== null && activeStreamIdx >= 0 && activeStreamIdx < availableStreams.length) {
      return activeStreamIdx;
    }
    return availableStreams.findIndex((st) => st.url === currentStreamUrl);
  }, [activeStreamIdx, availableStreams, currentStreamUrl]);

  return (
    <div
      className={`tv-video-player-container ${isCursorHidden ? 'hide-cursor' : ''}`}
      onPointerMove={pingHud}
      onMouseMove={pingHud}
      onClick={pingHud}
      role="region"
      aria-label="Video Player"
    >
      {/* 1. Underlying Playback Viewport Container (Driver attaches here) */}
      <div ref={containerRef} className="tv-player-viewport-wrapper" />

      {/* 2. Live Subtitle Rendering Layer */}
      {engineState.currentSubtitleText && (
        <div
          className={`tv-player-live-subtitles-container ${
            isHudVisible && currentDriverType !== 'embed' ? 'hud-lifted' : ''
          }`}
        >
          <div
            className={`tv-player-live-subtitles-text sub-size-${subtitleStyle.size} sub-bg-${subtitleStyle.backdrop}`}
          >
            {engineState.currentSubtitleText}
          </div>
        </div>
      )}

      {/* 3. Center Gesture Feedback Pill ("+10s", "-10s", "Paused") */}
      {feedbackBadge && (
        <div className="tv-player-feedback-badge animate-pop" aria-live="assertive">
          <span>{feedbackBadge}</span>
        </div>
      )}

      {/* 4. Minimal Right-Edge Vertical Volume Rail OSD */}
      {volumeToast && (
        <div className="tv-player-volume-osd" role="status" aria-live="polite">
          <div className="tv-volume-osd-rail">
            <div
              className="tv-volume-osd-fill"
              style={{ height: `${volumeToast.muted ? 0 : volumeToast.level}%` }}
            />
          </div>
          {volumeToast.muted || volumeToast.level === 0 ? (
            <VolumeX size={16} className="tv-volume-osd-icon muted" />
          ) : volumeToast.level < 50 ? (
            <Volume1 size={16} className="tv-volume-osd-icon" />
          ) : (
            <Volume2 size={16} className="tv-volume-osd-icon" />
          )}
          <span className="tv-volume-osd-text">
            {volumeToast.muted ? '0%' : `${volumeToast.level}%`}
          </span>
        </div>
      )}

      {/* 5. Quiet Cinema Buffering Ring (no giant acrylic box, no blue halo) */}
      {engineState.status === 'buffering' && !isMenuOpen && (
        <div className="tv-player-buffering-overlay" aria-label="Buffering Media" role="status">
          <div className="tv-spinner-circle" />
          {showSlowBufferHint && (
            <div className="tv-buffering-slow-wrap">
              <Focusable
                id="btn-slow-buffer-switch"
                groupId="player-buffer-hint"
                indexInGroup={0}
                className="tv-hud-btn-focusable"
                onSelect={() => openSheet('sources')}
              >
                {(isFocused) => (
                  <div className={`tv-hud-menu-pill tv-buffering-switch-pill ${isFocused ? 'focused' : ''}`}>
                    <Layers size={14} />
                    <span>Taking a while? Switch source</span>
                  </div>
                )}
              </Focusable>
            </div>
          )}
        </div>
      )}

      {/* 5.5. Error Recovery Modal (Calm Cinema Charcoal) */}
      {engineState.status === 'error' && !isMenuOpen && (
        <div className="tv-player-error-modal animate-scale-up" role="alertdialog" aria-label="Stream Unavailable">
          <AlertCircle size={36} className="error-icon" />
          <h2 className="error-title">Stream Unavailable</h2>
          <p className="error-desc">
            {formatPlayerErrorMessage(engineState.error, currentStreamUrl)}
          </p>
          <div className="error-actions">
            <Focusable
              id="btn-retry-stream"
              groupId="player-error-group"
              indexInGroup={0}
              autoFocus={true}
              className="tv-action-pill"
              onSelect={() => {
                failedStreamUrlsRef.current.delete(currentStreamUrl);
                addonService.clearFailedStreams(currentStreamUrl);
                setHasExhaustedFallbacks(false);
                if (engineRef.current) {
                  engineRef.current.loadMedia(
                    currentStreamUrl,
                    currentDriverType,
                    engineState.currentTime,
                    undefined,
                    engineState.duration || source.durationSeconds || 7200,
                    currentProxyHeaders
                  );
                }
              }}
            >
              {(isFocused) => (
                <div className={`tv-btn-inner primary ${isFocused ? 'focused' : ''}`}>
                  <RefreshCw size={16} />
                  <span>Try Again</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="btn-switch-mirror"
              groupId="player-error-group"
              indexInGroup={1}
              className="tv-action-pill"
              onSelect={() => openSheet('sources')}
            >
              {(isFocused) => (
                <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                  <Layers size={16} />
                  <span>Sources</span>
                </div>
              )}
            </Focusable>

            <Focusable
              id="btn-fallback-vidsrc"
              groupId="player-error-group"
              indexInGroup={2}
              className="tv-action-pill"
              onSelect={() => triggerNextFallback('Manual fallback requested from error dialog', true)}
            >
              {(isFocused) => (
                <div className={`tv-btn-inner ${isFocused ? 'focused' : ''}`}>
                  <span>Backup Mirror</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      )}

      {/* 6. Apple TV / Cinema Minimal HUD Overlay */}
      <div className={`tv-player-hud ${isHudVisible || isMenuOpen ? 'visible' : 'hidden'}`}>
        {/* Top Scrim & Minimal Header */}
        <div className="tv-hud-top">
          <div className="tv-hud-top-left">
            <Focusable
              id="player-hud-back-btn"
              groupId="player-hud-top"
              indexInGroup={0}
              className="tv-hud-btn-focusable"
              ariaLabel="Back"
              onSelect={onExit}
            >
              {(isFocused) => (
                <div className={`tv-hud-back-btn ${isFocused ? 'focused' : ''}`}>
                  <ArrowLeft size={18} />
                  <span>Back</span>
                </div>
              )}
            </Focusable>

            <div className="tv-hud-title-col">
              <h1 className="tv-hud-title">{source.title}</h1>
              {inlineSubtitle && <span className="tv-hud-subtitle">{inlineSubtitle}</span>}
            </div>
          </div>

          <div className={`tv-hud-top-right ${isMenuOpen ? 'sheet-open' : ''}`}>
            {onMinimizeToPiP && (
              <Focusable
                id="player-hud-pip-btn"
                groupId="player-hud-top"
                indexInGroup={1}
                className="tv-hud-btn-focusable"
                ariaLabel="Picture in Picture"
                onSelect={onMinimizeToPiP}
              >
                {(isFocused) => (
                  <div className={`tv-hud-menu-pill icon-only ${isFocused ? 'focused' : ''}`} title="Picture in Picture">
                    <Minimize2 size={17} />
                  </div>
                )}
              </Focusable>
            )}

            <Focusable
              id="player-hud-menu-btn"
              groupId="player-hud-top"
              indexInGroup={2}
              className="tv-hud-btn-focusable"
              ariaLabel="Player Settings"
              onSelect={() => (isMenuOpen ? closeSheet() : openSheet())}
            >
              {(isFocused) => (
                <div className={`tv-hud-menu-pill ${isMenuOpen ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                  <SlidersHorizontal size={16} />
                  <span>Settings</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>

        {/* Bottom Cinema Timeline & 3-Zone Transport (Rendered for Direct / YouTube streams) */}
        {currentDriverType !== 'embed' && (
          <div className="tv-hud-bottom">
            {/* Full-Width Hairline Timeline */}
            <div className="tv-hud-timeline-block">
              <Focusable
                id="player-scrubber-bar"
                groupId="player-hud-timeline"
                indexInGroup={0}
                className="tv-hud-scrubber-focusable"
                scaleEffect={false}
                ariaLabel="Seek timeline"
                onSelect={handleTogglePlayPause}
              >
                {(isFocused) => (
                  <div
                    className={`tv-hud-progress-bar-container ${isFocused ? 'focused' : ''} ${
                      isScrubbing ? 'scrubbing' : ''
                    }`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setIsScrubbing(true);
                      try {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      } catch (_) {}
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (rect.width > 0) {
                        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        setScrubPosition(pos);
                        setHoverPosition(pos);
                      }
                    }}
                    onPointerMove={handleScrubberMove}
                    onPointerLeave={() => {
                      if (!isScrubbing) setHoverPosition(null);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      try {
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                      } catch (_) {}
                      if (isScrubbing) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos =
                          rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
                        handleScrubberCommit(scrubPosition !== null ? scrubPosition : pos);
                      }
                      setIsScrubbing(false);
                      setScrubPosition(null);
                    }}
                    onPointerCancel={(e) => {
                      try {
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                      } catch (_) {}
                      setIsScrubbing(false);
                      setScrubPosition(null);
                      setHoverPosition(null);
                    }}
                  >
                    <div className="tv-hud-progress-track">
                      {/* Buffered Range */}
                      <div className="tv-hud-progress-buffered" style={{ width: `${bufferedPct}%` }} />

                      {/* Real Intro Segment Marker (only rendered when detected) */}
                      {introRange && (
                        <div
                          className="tv-hud-intro-range"
                          style={{ left: `${introRange.leftPct}%`, width: `${introRange.widthPct}%` }}
                          title="Intro segment"
                        />
                      )}

                      {/* Monochrome White Played Fill */}
                      <div className="tv-hud-progress-fill" style={{ width: `${progressPct}%` }} />
                      <div className="tv-hud-scrubber-head" style={{ left: `${progressPct}%` }} />

                      {(isFocused || isScrubbing || hoverPosition !== null) && (
                        <div
                          className="tv-hud-scrubber-tooltip"
                          style={{
                            left: `${Math.max(4, Math.min(96, hoverPosition !== null ? hoverPosition * 100 : progressPct))}%`,
                          }}
                        >
                          {formatTime(
                            (hoverPosition !== null ? hoverPosition : progressPct / 100) * currentEffectiveDur
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Focusable>

              {/* Time Metadata Row: Elapsed left, Remaining · Ends HH:MM PM right */}
              <div className="tv-hud-time-meta-row">
                <span className="tv-hud-time">{formatTime(displayCurrentTime)}</span>
                <div className="tv-hud-time-right">
                  <span className="tv-hud-time tv-hud-time-remaining">
                    {formatRemainingTime(displayCurrentTime, currentEffectiveDur)}
                  </span>
                  {endsAtLabel && (
                    <>
                      <span className="tv-hud-time-dot" aria-hidden="true">·</span>
                      <span className="tv-hud-time-ends">{endsAtLabel}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 3-Zone Transport Bar */}
            <div className="tv-hud-controls-row">
              {/* Left Zone: Active non-default status indicators (quiet when defaults) */}
              <div className="tv-hud-zone-left">
                {engineState.playbackSpeed !== 1 && (
                  <Focusable
                    id="player-speed-indicator-btn"
                    groupId="player-hud-transport"
                    indexInGroup={0}
                    className="tv-hud-ctrl-pill-focusable"
                    ariaLabel={`Playback speed ${engineState.playbackSpeed}x`}
                    onSelect={() => openSheet('playback')}
                  >
                    {(isFocused) => (
                      <div className={`tv-hud-util-chip ${isFocused ? 'focused' : ''}`}>
                        <Gauge size={14} />
                        <span>{engineState.playbackSpeed}x</span>
                      </div>
                    )}
                  </Focusable>
                )}
              </div>

              {/* Center Zone: Primary Transport (-10s, Play/Pause, +10s) */}
              <div className="tv-hud-zone-center">
                <Focusable
                  id="player-seek-back-btn"
                  groupId="player-hud-transport"
                  indexInGroup={1}
                  className="tv-hud-ctrl-btn-wrapper"
                  ariaLabel="Rewind 10 seconds"
                  onSelect={() => seekBy(-10)}
                >
                  {(isFocused) => (
                    <div className={`tv-hud-ctrl-btn seek-btn ${isFocused ? 'focused' : ''}`} title="Rewind 10s (J)">
                      <RotateCcw size={24} strokeWidth={1.75} />
                      <span className="tv-hud-badge-10">10</span>
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="player-playpause-main-btn"
                  groupId="player-hud-transport"
                  indexInGroup={2}
                  autoFocus={true}
                  className="tv-hud-ctrl-btn-wrapper"
                  ariaLabel={engineState.status === 'playing' ? 'Pause' : 'Play'}
                  onSelect={handleTogglePlayPause}
                >
                  {(isFocused) => (
                    <div className={`tv-hud-ctrl-btn primary ${isFocused ? 'focused' : ''}`}>
                      {engineState.status === 'playing' ? (
                        <Pause size={24} fill="currentColor" />
                      ) : (
                        <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />
                      )}
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="player-seek-fwd-btn"
                  groupId="player-hud-transport"
                  indexInGroup={3}
                  className="tv-hud-ctrl-btn-wrapper"
                  ariaLabel="Forward 10 seconds"
                  onSelect={() => seekBy(10)}
                >
                  {(isFocused) => (
                    <div className={`tv-hud-ctrl-btn seek-btn ${isFocused ? 'focused' : ''}`} title="Forward 10s (L)">
                      <RotateCw size={24} strokeWidth={1.75} />
                      <span className="tv-hud-badge-10">10</span>
                    </div>
                  )}
                </Focusable>
              </div>

              {/* Right Zone: Volume + CC + Sources + Episodes (TV only) */}
              <div className="tv-hud-zone-right">
                <div className="tv-hud-volume-cluster">
                  <Focusable
                    id="player-volume-btn"
                    groupId="player-hud-transport"
                    indexInGroup={4}
                    className="tv-hud-ctrl-btn-wrapper"
                    ariaLabel={engineState.isMuted ? 'Unmute' : 'Mute'}
                    onSelect={() => {
                      const muted = engineRef.current ? engineRef.current.toggleMute() : false;
                      const curVol = engineRef.current ? engineRef.current.getState().volume : 1;
                      showVolumeOsd(muted ? 0 : Math.round(curVol * 100), muted);
                    }}
                  >
                    {(isFocused) => (
                      <div className={`tv-hud-ctrl-btn subtle ${isFocused ? 'focused' : ''}`} title="Mute (M)">
                        {engineState.isMuted || engineState.volume === 0 ? (
                          <VolumeX size={18} />
                        ) : engineState.volume < 0.5 ? (
                          <Volume1 size={18} />
                        ) : (
                          <Volume2 size={18} />
                        )}
                      </div>
                    )}
                  </Focusable>

                  <div
                    className="tv-hud-volume-slider-track"
                    title="Volume"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (rect.width <= 0) return;
                      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      engineRef.current?.setVolume(pos);
                      showVolumeOsd(Math.round(pos * 100), pos === 0);
                    }}
                  >
                    <div
                      className="tv-hud-volume-slider-fill"
                      style={{ width: `${engineState.isMuted ? 0 : Math.round(engineState.volume * 100)}%` }}
                    />
                  </div>
                </div>

                <Focusable
                  id="player-subtitles-btn"
                  groupId="player-hud-transport"
                  indexInGroup={5}
                  className="tv-hud-ctrl-btn-wrapper"
                  ariaLabel="Audio and Subtitles"
                  onSelect={() => openSheet('audio_subs')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-hud-ctrl-btn subtle ${selectedSubId ? 'is-active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                      title="Audio & Subtitles (S)"
                    >
                      <Subtitles size={18} />
                    </div>
                  )}
                </Focusable>

                <Focusable
                  id="player-mirrors-btn"
                  groupId="player-hud-transport"
                  indexInGroup={6}
                  className="tv-hud-ctrl-btn-wrapper"
                  ariaLabel="Video Sources"
                  onSelect={() => openSheet('sources')}
                >
                  {(isFocused) => (
                    <div className={`tv-hud-ctrl-btn subtle ${isFocused ? 'focused' : ''}`} title="Sources (Y)">
                      <Layers size={18} />
                    </div>
                  )}
                </Focusable>

                {isEpisode && (
                  <Focusable
                    id="player-episodes-btn"
                    groupId="player-hud-transport"
                    indexInGroup={7}
                    className="tv-hud-ctrl-btn-wrapper"
                    ariaLabel="Episodes"
                    onSelect={() => openSheet('episodes')}
                  >
                    {(isFocused) => (
                      <div className={`tv-hud-ctrl-btn subtle ${isFocused ? 'focused' : ''}`} title="Episodes">
                        <ListVideo size={18} />
                      </div>
                    )}
                  </Focusable>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7. Floating Skip Intro Pill */}
      {isInsideIntro && !isMenuOpen && (
        <div className={`tv-player-floating-skip-intro ${isHudVisible ? 'hud-visible' : 'hud-hidden'} animate-pop`}>
          <Focusable
            id="player-floating-skip-intro-btn"
            groupId="player-skip-intro"
            indexInGroup={0}
            autoFocus={true}
            className="tv-skip-intro-focusable"
            onSelect={handleSkipIntro}
          >
            {(isFocused) => (
              <div className={`tv-skip-intro-btn ${isFocused ? 'focused' : ''}`}>
                <FastForward size={15} strokeWidth={2.4} className="tv-skip-intro-icon" />
                <span className="tv-skip-intro-title">Skip Intro</span>
                <span className="tv-skip-intro-divider" />
                <span className="tv-skip-intro-timer">
                  {Math.max(0, Math.ceil((introSegment?.end || 0) - engineState.currentTime))}s
                </span>
              </div>
            )}
          </Focusable>
        </div>
      )}

      {/* 7b. Floating Play Next Episode Pill (TV Shows Outro) */}
      {isOutroOrNearEnd && nextEpisode && (
        <div className={`tv-player-floating-next-prompt ${isHudVisible ? 'hud-visible' : 'hud-hidden'} animate-pop`}>
          <Focusable
            id="player-floating-next-btn"
            groupId="player-floating-next"
            indexInGroup={0}
            className="tv-floating-next-focusable"
            onSelect={handlePlayNextEpisode}
          >
            {(isFocused) => (
              <div className={`tv-floating-next-btn ${isFocused ? 'focused' : ''}`}>
                <div className="tv-floating-next-icon-wrap">
                  {isLoadingNext ? (
                    <Loader2 size={16} className="spin-animate" />
                  ) : (
                    <Play size={15} fill="currentColor" style={{ marginLeft: '1px' }} />
                  )}
                </div>
                <div className="tv-floating-next-text-col">
                  <span className="tv-floating-next-action">Next Episode</span>
                  <span className="tv-floating-next-title">
                    S{nextEpisode.seasonNumber} E{nextEpisode.number} · {nextEpisode.title}
                  </span>
                </div>
              </div>
            )}
          </Focusable>
        </div>
      )}

      {/* 8. Right-Side Slide-Over Cinema Settings Sheet (Video stays visible on left) */}
      {isMenuOpen && (
        <div
          className="tv-player-sheet-backdrop"
          role="dialog"
          aria-label="Player Settings"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}
        >
          <aside className="tv-player-sheet" onClick={(e) => e.stopPropagation()}>
            {/* Sheet Header */}
            <div className="tv-sheet-header">
              <h2 className="tv-sheet-title">Settings</h2>
              <Focusable
                id="btn-close-player-menu"
                groupId="player-modal-tabs"
                indexInGroup={10}
                className="tv-menu-close-focusable"
                ariaLabel="Close Settings"
                onSelect={closeSheet}
              >
                {(isFocused) => (
                  <div className={`tv-menu-close-btn icon-only ${isFocused ? 'focused' : ''}`}>
                    <X size={16} />
                  </div>
                )}
              </Focusable>
            </div>

            {/* Compact Segmented Tab Strip */}
            <div className="tv-sheet-tabs" role="tablist">
              <Focusable
                id="tab-opt-audio-subs"
                groupId="player-modal-tabs"
                indexInGroup={0}
                autoFocus={menuTab === 'audio_subs'}
                className="tv-sheet-tab-focusable"
                role="tab"
                ariaSelected={menuTab === 'audio_subs'}
                onSelect={() => setMenuTab('audio_subs')}
              >
                {(isFocused) => (
                  <div
                    className={`tv-sheet-tab ${menuTab === 'audio_subs' ? 'active' : ''} ${
                      isFocused ? 'focused' : ''
                    }`}
                  >
                    Audio &amp; CC
                  </div>
                )}
              </Focusable>

              <Focusable
                id="tab-opt-sources"
                groupId="player-modal-tabs"
                indexInGroup={1}
                autoFocus={menuTab === 'sources'}
                className="tv-sheet-tab-focusable"
                role="tab"
                ariaSelected={menuTab === 'sources'}
                onSelect={() => setMenuTab('sources')}
              >
                {(isFocused) => (
                  <div
                    className={`tv-sheet-tab ${menuTab === 'sources' ? 'active' : ''} ${
                      isFocused ? 'focused' : ''
                    }`}
                  >
                    Sources{availableStreams.length > 0 ? ` (${availableStreams.length})` : ''}
                  </div>
                )}
              </Focusable>

              <Focusable
                id="tab-opt-playback"
                groupId="player-modal-tabs"
                indexInGroup={2}
                autoFocus={menuTab === 'playback'}
                className="tv-sheet-tab-focusable"
                role="tab"
                ariaSelected={menuTab === 'playback'}
                onSelect={() => setMenuTab('playback')}
              >
                {(isFocused) => (
                  <div
                    className={`tv-sheet-tab ${menuTab === 'playback' ? 'active' : ''} ${
                      isFocused ? 'focused' : ''
                    }`}
                  >
                    Playback
                  </div>
                )}
              </Focusable>

              {isEpisode && (
                <Focusable
                  id="tab-opt-episodes"
                  groupId="player-modal-tabs"
                  indexInGroup={3}
                  autoFocus={menuTab === 'episodes'}
                  className="tv-sheet-tab-focusable"
                  role="tab"
                  ariaSelected={menuTab === 'episodes'}
                  onSelect={() => setMenuTab('episodes')}
                >
                  {(isFocused) => (
                    <div
                      className={`tv-sheet-tab ${menuTab === 'episodes' ? 'active' : ''} ${
                        isFocused ? 'focused' : ''
                      }`}
                    >
                      Episodes
                    </div>
                  )}
                </Focusable>
              )}
            </div>

            {/* Sheet Scroll Body */}
            <div className="tv-sheet-body">
              {/* TAB 1: Audio & Subtitles */}
              {menuTab === 'audio_subs' && (
                <div className="tv-sheet-stack">
                  {/* Subtitles Track Picker */}
                  <section className="tv-sheet-section">
                    <div className="tv-sheet-section-label">
                      Subtitles{dedupedSubtitles.length > 0 ? ` (${dedupedSubtitles.length})` : ''}
                    </div>
                    <div className="tv-sheet-list tv-sheet-subtitles-scroll">
                      <Focusable
                        id="sub-opt-off"
                        groupId="menu-subs-list"
                        indexInGroup={0}
                        className="tv-sheet-row-focusable"
                        onSelect={() => {
                          setSelectedSubId(null);
                          engineRef.current?.clearSubtitles();
                          triggerFeedback('Subtitles Off');
                        }}
                      >
                        {(isFocused) => (
                          <div
                            className={`tv-sheet-row ${selectedSubId === null ? 'active' : ''} ${
                              isFocused ? 'focused' : ''
                            }`}
                          >
                            <span className="tv-sheet-row-label">Off</span>
                            {selectedSubId === null && <Check size={16} className="tv-sheet-check" />}
                          </div>
                        )}
                      </Focusable>

                      {dedupedSubtitles.map((sub, idx) => (
                        <Focusable
                          key={sub.id}
                          id={`sub-opt-${sub.id}`}
                          groupId="menu-subs-list"
                          indexInGroup={idx + 1}
                          className="tv-sheet-row-focusable"
                          onSelect={() => {
                            setSelectedSubId(sub.id);
                            engineRef.current?.loadSubtitleTrack(sub.url);
                            triggerFeedback(`Subtitles: ${sub.label || sub.lang}`);
                          }}
                        >
                          {(isFocused) => (
                            <div
                              className={`tv-sheet-row ${selectedSubId === sub.id ? 'active' : ''} ${
                                isFocused ? 'focused' : ''
                              }`}
                            >
                              <span className="tv-sheet-row-label">{sub.label || sub.lang.toUpperCase()}</span>
                              {selectedSubId === sub.id && <Check size={16} className="tv-sheet-check" />}
                            </div>
                          )}
                        </Focusable>
                      ))}
                    </div>
                  </section>

                  {/* Live Subtitle Appearance Controls */}
                  <section className="tv-sheet-section">
                    <div className="tv-sheet-section-label">Subtitle Style</div>
                    <div className="tv-sheet-control-pair">
                      <span className="tv-sheet-control-name">Size</span>
                      <div className="tv-sheet-segmented">
                        {(['sm', 'md', 'lg'] as SubtitleSize[]).map((sz, idx) => (
                          <Focusable
                            key={sz}
                            id={`sub-size-${sz}`}
                            groupId="menu-sub-size"
                            indexInGroup={idx}
                            className="tv-sheet-seg-focusable"
                            onSelect={() => updateSubtitleStyle({ size: sz })}
                          >
                            {(isFocused) => (
                              <div
                                className={`tv-sheet-seg-opt ${subtitleStyle.size === sz ? 'active' : ''} ${
                                  isFocused ? 'focused' : ''
                                }`}
                              >
                                {sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large'}
                              </div>
                            )}
                          </Focusable>
                        ))}
                      </div>
                    </div>

                    <div className="tv-sheet-control-pair">
                      <span className="tv-sheet-control-name">Backdrop</span>
                      <div className="tv-sheet-segmented">
                        {(['none', 'dim', 'box'] as SubtitleBackdrop[]).map((bg, idx) => (
                          <Focusable
                            key={bg}
                            id={`sub-bg-${bg}`}
                            groupId="menu-sub-bg"
                            indexInGroup={idx}
                            className="tv-sheet-seg-focusable"
                            onSelect={() => updateSubtitleStyle({ backdrop: bg })}
                          >
                            {(isFocused) => (
                              <div
                                className={`tv-sheet-seg-opt ${subtitleStyle.backdrop === bg ? 'active' : ''} ${
                                  isFocused ? 'focused' : ''
                                }`}
                              >
                                {bg === 'none' ? 'None' : bg === 'dim' ? 'Dim' : 'Box'}
                              </div>
                            )}
                          </Focusable>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Audio Enhancement & Tracks */}
                  <section className="tv-sheet-section">
                    <div className="tv-sheet-section-label">Audio</div>
                    <div className="tv-sheet-list">
                      <Focusable
                        id="audio-boost-toggle"
                        groupId="menu-audio-list"
                        indexInGroup={0}
                        className="tv-sheet-row-focusable"
                        onSelect={() => {
                          const next = !engineState.vocalBoostEnabled;
                          engineRef.current?.setVocalBoost(next);
                          triggerFeedback(next ? 'Dialogue Boost On' : 'Dialogue Boost Off');
                        }}
                      >
                        {(isFocused) => (
                          <div
                            className={`tv-sheet-row ${engineState.vocalBoostEnabled ? 'active' : ''} ${
                              isFocused ? 'focused' : ''
                            }`}
                          >
                            <div className="tv-sheet-row-text">
                              <span className="tv-sheet-row-label">Dialogue Clarity</span>
                              <span className="tv-sheet-row-sub">Boost quiet speech &amp; voices</span>
                            </div>
                            <span className={`tv-sheet-switch ${engineState.vocalBoostEnabled ? 'on' : ''}`}>
                              <span className="tv-sheet-switch-knob" />
                            </span>
                          </div>
                        )}
                      </Focusable>

                      {audioTracks.length > 1 &&
                        audioTracks.map((tr, idx) => (
                          <Focusable
                            key={tr.id || idx}
                            id={`audio-track-${idx}`}
                            groupId="menu-audio-list"
                            indexInGroup={idx + 1}
                            className="tv-sheet-row-focusable"
                            onSelect={() => {
                              setSelectedAudioTrackIdx(idx);
                              engineRef.current?.selectAudioTrack(idx);
                              triggerFeedback(`Audio: ${tr.label}`);
                            }}
                          >
                            {(isFocused) => (
                              <div
                                className={`tv-sheet-row ${selectedAudioTrackIdx === idx ? 'active' : ''} ${
                                  isFocused ? 'focused' : ''
                                }`}
                              >
                                <div className="tv-sheet-row-text">
                                  <span className="tv-sheet-row-label">{tr.label}</span>
                                  <span className="tv-sheet-row-sub">
                                    {tr.language ? tr.language.toUpperCase() : 'Stereo'}
                                  </span>
                                </div>
                                {selectedAudioTrackIdx === idx && <Check size={16} className="tv-sheet-check" />}
                              </div>
                            )}
                          </Focusable>
                        ))}
                    </div>
                  </section>

                  {/* Collapsible No-Sound Codec Troubleshooting Disclosure */}
                  <section className="tv-sheet-section tv-sheet-disclosure-section">
                    <Focusable
                      id="audio-codec-disclosure-btn"
                      groupId="menu-audio-list"
                      indexInGroup={audioTracks.length + 1}
                      className="tv-sheet-row-focusable"
                      onSelect={() => setShowCodecTools((prev) => !prev)}
                    >
                      {(isFocused) => (
                        <div className={`tv-sheet-row disclosure ${isFocused ? 'focused' : ''}`}>
                          <span className="tv-sheet-row-label">No sound? Audio tools</span>
                          {showCodecTools ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      )}
                    </Focusable>

                    {showCodecTools && (
                      <div className="tv-sheet-disclosure-body">
                        <p className="tv-sheet-help-text">
                          Some surround streams (AC3/DTS) need stereo downmixing or a web mirror to play audio in the browser.
                        </p>
                        <div className="tv-sheet-action-stack">
                          <Focusable
                            id="audio-fix-aac-btn"
                            groupId="menu-audio-tools"
                            indexInGroup={0}
                            className="tv-sheet-row-focusable"
                            onSelect={() => {
                              if (!currentStreamUrl) return;
                              let fixedUrl = currentStreamUrl;
                              if (!fixedUrl.includes('audio=aac')) {
                                fixedUrl += (fixedUrl.includes('?') ? '&' : '?') + 'audio=aac&transcode=1&downmix=stereo';
                              }
                              setCurrentStreamUrl(fixedUrl);
                              engineRef.current?.loadMedia(
                                fixedUrl,
                                'direct',
                                engineState.currentTime,
                                undefined,
                                engineState.duration || source.durationSeconds || 7200
                              );
                              triggerFeedback('AAC Stereo Transcode');
                            }}
                          >
                            {(isFocused) => (
                              <div className={`tv-addon-action-pill tv-sheet-tool-btn ${isFocused ? 'focused' : ''}`}>
                                <span>Force AAC Stereo Transcode</span>
                              </div>
                            )}
                          </Focusable>

                          {availableStreams.some((s) => s.streamType === 'embed') && (
                            <Focusable
                              id="audio-fix-web-btn"
                              groupId="menu-audio-tools"
                              indexInGroup={1}
                              className="tv-sheet-row-focusable"
                              onSelect={() => {
                                const webStream = availableStreams.find((s) => s.streamType === 'embed');
                                if (webStream) {
                                  setCurrentStreamUrl(webStream.url);
                                  setCurrentDriverType('embed');
                                  engineRef.current?.loadMedia(
                                    webStream.url,
                                    'embed',
                                    engineState.currentTime,
                                    undefined,
                                    engineState.duration || source.durationSeconds || 7200
                                  );
                                  triggerFeedback(`Mirror: ${webStream.name}`);
                                  closeSheet();
                                }
                              }}
                            >
                              {(isFocused) => (
                                <div className={`tv-addon-action-pill tv-sheet-tool-btn ${isFocused ? 'focused' : ''}`}>
                                  <span>Switch to Web Mirror (Stereo)</span>
                                </div>
                              )}
                            </Focusable>
                          )}

                          <Focusable
                            id="audio-test-chime-btn"
                            groupId="menu-audio-tools"
                            indexInGroup={2}
                            className="tv-sheet-row-focusable"
                            onSelect={() => {
                              engineRef.current?.playTestChime();
                              triggerFeedback('Speaker Test');
                            }}
                          >
                            {(isFocused) => (
                              <div className={`tv-addon-action-pill tv-sheet-tool-btn ${isFocused ? 'focused' : ''}`}>
                                <span>Play Test Tone</span>
                              </div>
                            )}
                          </Focusable>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 2: Video Sources / Mirrors */}
              {menuTab === 'sources' && (
                <div className="tv-sheet-stack">
                  <div className="tv-sheet-section-label">Available Streams</div>
                  {availableStreams.length === 0 ? (
                    <div className="tv-sheet-empty">
                      No alternate mirrors detected for this title yet.
                    </div>
                  ) : (
                    <div className="tv-sheet-list">
                      {availableStreams.map((st, idx) => {
                        const isActive = idx === resolvedActiveStreamIdx;
                        const playerBadge = getStreamPlayerBadge(st.streamType);
                        return (
                          <Focusable
                            key={`${st.url}-${idx}`}
                            id={`opt-stream-${idx}`}
                            groupId="menu-sources-list"
                            indexInGroup={idx}
                            className="tv-sheet-row-focusable"
                            onSelect={() => {
                              failedStreamUrlsRef.current.delete(st.url);
                              addonService.clearFailedStreams(st.url);
                              setHasExhaustedFallbacks(false);
                              setActiveStreamIdx(idx);
                              setCurrentStreamUrl(st.url);
                              setCurrentProxyHeaders(st.proxyHeaders);
                              const driver: DriverType =
                                st.streamType === 'youtube'
                                  ? 'youtube'
                                  : st.streamType === 'embed'
                                  ? 'embed'
                                  : 'direct';
                              setCurrentDriverType(driver);
                              engineRef.current?.loadMedia(
                                st.url,
                                driver,
                                engineState.currentTime,
                                undefined,
                                st.durationSeconds || engineState.duration || source.durationSeconds || 7200,
                                st.proxyHeaders
                              );
                              triggerFeedback(st.name);
                              closeSheet();
                            }}
                          >
                            {(isFocused) => (
                              <div
                                className={`tv-sheet-row source-row ${isActive ? 'active' : ''} ${
                                  isFocused ? 'focused' : ''
                                }`}
                              >
                                <div className="tv-sheet-row-text">
                                  <div className="tv-sheet-source-heading">
                                    <span className="tv-sheet-row-label">{st.name}</span>
                                    <span className="tv-sheet-quality-tag">{st.quality || 'HD'}</span>
                                  </div>
                                  <div className="tv-sheet-source-meta">
                                    <span className={`tv-sheet-engine-tag tone-${playerBadge.tone}`}>
                                      {playerBadge.label}
                                    </span>
                                    {(st.description || st.title) && (
                                      <span className="tv-sheet-row-sub">{st.description || st.title}</span>
                                    )}
                                  </div>
                                </div>
                                {isActive && <Check size={16} className="tv-sheet-check" />}
                              </div>
                            )}
                          </Focusable>
                        );
                      })}
                    </div>
                  )}

                  {!availableStreams.some((s) => s.streamType === 'direct') && (
                    <p className="tv-sheet-source-hint">
                      Using third-party web embeds. Add a Direct-URL Stremio addon in Settings → Addons &amp; Streams for native Kaira Player playback.
                    </p>
                  )}
                </div>
              )}

              {/* TAB 3: Playback Speed & Auto-Skip Intro */}
              {menuTab === 'playback' && (
                <div className="tv-sheet-stack">
                  <section className="tv-sheet-section">
                    <div className="tv-sheet-section-label">Playback Speed</div>
                    <div className="tv-sheet-segmented speed-grid">
                      {[0.75, 1.0, 1.25, 1.5, 2.0].map((spd, idx) => (
                        <Focusable
                          key={spd}
                          id={`speed-opt-${spd}`}
                          groupId="menu-speed-list"
                          indexInGroup={idx}
                          className="tv-sheet-seg-focusable"
                          onSelect={() => {
                            engineRef.current?.setSpeed(spd);
                            triggerFeedback(`${spd}x`);
                          }}
                        >
                          {(isFocused) => (
                            <div
                              className={`tv-sheet-seg-opt ${engineState.playbackSpeed === spd ? 'active' : ''} ${
                                isFocused ? 'focused' : ''
                              }`}
                            >
                              {spd === 1 ? '1x' : `${spd}x`}
                            </div>
                          )}
                        </Focusable>
                      ))}
                    </div>
                  </section>

                  <section className="tv-sheet-section">
                    <div className="tv-sheet-section-label">Automation</div>
                    <div className="tv-sheet-list">
                      <Focusable
                        id="intro-auto-toggle"
                        groupId="menu-intro-list"
                        indexInGroup={0}
                        className="tv-sheet-row-focusable"
                        onSelect={() => {
                          const next = !autoSkipIntro;
                          setAutoSkipIntro(next);
                          introService.setAutoSkipEnabled(next);
                          triggerFeedback(next ? 'Auto-Skip On' : 'Auto-Skip Off');
                        }}
                      >
                        {(isFocused) => (
                          <div className={`tv-sheet-row ${autoSkipIntro ? 'active' : ''} ${isFocused ? 'focused' : ''}`}>
                            <div className="tv-sheet-row-text">
                              <span className="tv-sheet-row-label">Auto-Skip Intros</span>
                              <span className="tv-sheet-row-sub">Jump past opening credits on TV episodes</span>
                            </div>
                            <span className={`tv-sheet-switch ${autoSkipIntro ? 'on' : ''}`}>
                              <span className="tv-sheet-switch-knob" />
                            </span>
                          </div>
                        )}
                      </Focusable>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 4: Episodes (TV Shows only) */}
              {menuTab === 'episodes' && isEpisode && (
                <div className="tv-sheet-stack">
                  <div className="tv-sheet-section-label">
                    Season {source.seasonNumber || 1} Episodes
                  </div>
                  {isLoadingEpisodes ? (
                    <div className="tv-sheet-empty">Loading episodes...</div>
                  ) : seasonEpisodes.length === 0 ? (
                    <div className="tv-sheet-empty">No episode list available for this season.</div>
                  ) : (
                    <div className="tv-sheet-episodes-list">
                      {seasonEpisodes.map((ep, idx) => {
                        const isCurrent =
                          ep.number === source.episodeNumber &&
                          (ep.seasonNumber || 1) === (source.seasonNumber || 1);
                        return (
                          <Focusable
                            key={ep.id || `ep-${ep.number}`}
                            id={`sheet-ep-${ep.number}`}
                            groupId="menu-episodes-list"
                            indexInGroup={idx}
                            className="tv-sheet-row-focusable"
                            onSelect={() => {
                              if (!isCurrent) handleSelectEpisode(ep);
                              else closeSheet();
                            }}
                          >
                            {(isFocused) => (
                              <div
                                className={`tv-sheet-ep-card ${isCurrent ? 'active' : ''} ${
                                  isFocused ? 'focused' : ''
                                }`}
                              >
                                <div className="tv-sheet-ep-thumb">
                                  {ep.thumbnail ? (
                                    <img src={ep.thumbnail} alt={ep.title} />
                                  ) : (
                                    <div className="tv-sheet-ep-thumb-fallback">E{ep.number}</div>
                                  )}
                                  {ep.runtime && <span className="tv-sheet-ep-runtime">{ep.runtime}</span>}
                                </div>
                                <div className="tv-sheet-ep-info">
                                  <span className="tv-sheet-ep-meta">
                                    Episode {ep.number}
                                    {isCurrent ? ' · Playing' : ''}
                                  </span>
                                  <span className="tv-sheet-ep-title">{ep.title}</span>
                                </div>
                              </div>
                            )}
                          </Focusable>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* 8.5. End-Screen Overlay (Calm Monochrome Cinema) */}
      {engineState.status === 'ended' && !isMenuOpen && (
        <div className="tv-player-end-screen-overlay animate-scale-up" role="dialog" aria-label="Playback Ended">
          <div
            className="tv-end-screen-backdrop"
            style={{
              backgroundImage:
                isEpisode && nextEpisode?.thumbnail
                  ? `url(${nextEpisode.thumbnail})`
                  : source.backdrop || source.artwork
                  ? `url(${source.backdrop || source.artwork})`
                  : undefined,
            }}
          />
          <div className="tv-end-screen-scrim" />

          <div className="tv-end-screen-card">
            {isEpisode && nextEpisode ? (
              <>
                <span className="tv-end-eyebrow">Up Next</span>

                <div className="tv-end-episode-info">
                  <div className="tv-end-thumb-container">
                    <img
                      src={nextEpisode.thumbnail || source.artwork || source.backdrop || ''}
                      alt={nextEpisode.title}
                      className="tv-end-thumb-img"
                    />
                    {nextEpisode.runtime && (
                      <div className="tv-end-thumb-runtime">{nextEpisode.runtime}</div>
                    )}
                  </div>

                  <div className="tv-end-text-col">
                    <span className="tv-end-sub-label">
                      Season {nextEpisode.seasonNumber} · Episode {nextEpisode.number}
                    </span>
                    <h2 className="tv-end-ep-title">{nextEpisode.title}</h2>
                    {nextEpisode.description && (
                      <p className="tv-end-ep-desc">{nextEpisode.description}</p>
                    )}
                  </div>
                </div>

                <div className="tv-end-actions-row">
                  <Focusable
                    id="player-next-episode-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={0}
                    autoFocus={true}
                    className="tv-end-action-focusable"
                    onSelect={handlePlayNextEpisode}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-primary-btn ${isFocused ? 'focused' : ''}`}>
                        {isLoadingNext ? (
                          <Loader2 size={18} className="spin-animate" />
                        ) : (
                          <Play size={18} fill="currentColor" />
                        )}
                        <span>Play Next Episode</span>
                      </div>
                    )}
                  </Focusable>

                  <Focusable
                    id="player-replay-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={1}
                    className="tv-end-action-focusable"
                    onSelect={handleReplayCurrent}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-secondary-btn ${isFocused ? 'focused' : ''}`}>
                        <RotateCcw size={16} />
                        <span>Replay</span>
                      </div>
                    )}
                  </Focusable>

                  <Focusable
                    id="player-exit-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={2}
                    className="tv-end-action-focusable"
                    onSelect={onExit}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-secondary-btn ${isFocused ? 'focused' : ''}`}>
                        <ArrowLeft size={16} />
                        <span>Back</span>
                      </div>
                    )}
                  </Focusable>
                </div>
              </>
            ) : isEpisode && !nextEpisode ? (
              <>
                <span className="tv-end-eyebrow">Season Complete</span>
                <h2 className="tv-end-ep-title">{source.title}</h2>
                <p className="tv-end-ep-desc">You have finished the latest available episode.</p>
                <div className="tv-end-actions-row">
                  <Focusable
                    id="player-replay-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={0}
                    autoFocus={true}
                    className="tv-end-action-focusable"
                    onSelect={handleReplayCurrent}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-primary-btn ${isFocused ? 'focused' : ''}`}>
                        <RotateCcw size={18} />
                        <span>Replay Episode</span>
                      </div>
                    )}
                  </Focusable>

                  <Focusable
                    id="player-exit-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={1}
                    className="tv-end-action-focusable"
                    onSelect={onExit}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-secondary-btn ${isFocused ? 'focused' : ''}`}>
                        <ArrowLeft size={16} />
                        <span>Back</span>
                      </div>
                    )}
                  </Focusable>
                </div>
              </>
            ) : (
              <>
                <span className="tv-end-eyebrow">Finished</span>
                <h2 className="tv-end-ep-title">{source.title}</h2>
                {source.subtitle && <p className="tv-end-ep-desc">{source.subtitle}</p>}
                <div className="tv-end-actions-row">
                  <Focusable
                    id="player-replay-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={0}
                    autoFocus={true}
                    className="tv-end-action-focusable"
                    onSelect={handleReplayCurrent}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-primary-btn ${isFocused ? 'focused' : ''}`}>
                        <RotateCcw size={18} />
                        <span>Replay Movie</span>
                      </div>
                    )}
                  </Focusable>

                  <Focusable
                    id="player-exit-btn"
                    groupId="player-end-screen-group"
                    indexInGroup={1}
                    className="tv-end-action-focusable"
                    onSelect={onExit}
                  >
                    {(isFocused) => (
                      <div className={`tv-end-secondary-btn ${isFocused ? 'focused' : ''}`}>
                        <ArrowLeft size={16} />
                        <span>Back</span>
                      </div>
                    )}
                  </Focusable>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 9. Diagnostics Overlay (Press D to Toggle) */}
      {debugOverlayOpen && (
        <div className="tv-player-diagnostics-overlay">
          <div className="tv-diag-heading">PLAYER DIAGNOSTICS (D to close)</div>
          <div>Driver: {engineState.driverType.toUpperCase()}</div>
          <div>Status: {engineState.status.toUpperCase()}</div>
          <div>
            Time: {formatTime(engineState.currentTime)} / {formatTime(engineState.duration)}
          </div>
          <div>
            Volume: {Math.round(engineState.volume * 100)}% {engineState.isMuted ? '(Muted)' : ''}
          </div>
          <div>Subtitles: {availableSubtitles.length} tracks</div>
          <div>
            Intro: {introSegment ? `${formatTime(introSegment.start)} - ${formatTime(introSegment.end)}` : 'None'}
          </div>
          <div>Last Action: {lastAction}</div>
          <div className="tv-diag-url">URL: {currentStreamUrl}</div>
        </div>
      )}
    </div>
  );
};
