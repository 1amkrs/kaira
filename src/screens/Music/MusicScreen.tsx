import React, { useState, useEffect, useMemo } from 'react';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Album, Track, MusicVideo, CommunityPlaylist, MoodCategoryItem } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { AlbumCard } from '../../components/MediaCard/AlbumCard';
import { QuickPickRow } from '../../components/MediaCard/QuickPickRow';
import { MusicVideoCard } from '../../components/MediaCard/MusicVideoCard';
import { CommunityPlaylistCard } from '../../components/MediaCard/CommunityPlaylistCard';
import { MoodCard } from '../../components/MediaCard/MoodCard';
import { Focusable } from '../../components/Focusable/Focusable';
import { Footer } from '../../components/Footer/Footer';
import { playbackService } from '../../services/playback/PlaybackService';
import { YOUTUBE_MOOD_CHIPS } from '../../data/media/youtubeMusicData';
import './MusicScreen.css';

interface MusicScreenProps {
  onSelectAlbum: (album: Album) => void;
  onPlayTrack: (track: Track, allTracks: Track[]) => void;
}

export const MusicScreen: React.FC<MusicScreenProps> = ({ onSelectAlbum, onPlayTrack }) => {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [quickPicks, setQuickPicks] = useState<Track[]>([]);
  const [musicVideos, setMusicVideos] = useState<MusicVideo[]>([]);
  const [communityPlaylists, setCommunityPlaylists] = useState<CommunityPlaylist[]>([]);
  const [moodDecades, setMoodDecades] = useState<MoodCategoryItem[]>([]);
  const [quickPickPage, setQuickPickPage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const ytData = await mediaProvider.getYoutubeMusicData();
      setAlbums(ytData.albums);
      setQuickPicks(ytData.quickPicks);
      setMusicVideos(ytData.musicVideos);
      setCommunityPlaylists(ytData.communityPlaylists);
      setMoodDecades(ytData.moodDecades);
    } catch (e) {
      setError('Unable to load music library');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsub = playbackService.subscribe((s) => {
      setActiveTrackId(s.currentSource?.mediaId || null);
      setIsPlaying(s.status === 'playing');
    });
    return unsub;
  }, []);

  // Quick picks pagination (items displayed in columns x rows)
  const pageSize = 12; // 3 columns x 4 rows
  const totalQuickPickPages = Math.ceil(quickPicks.length / pageSize) || 1;
  const currentQuickPicks = useMemo(() => {
    const start = quickPickPage * pageSize;
    return quickPicks.slice(start, start + pageSize);
  }, [quickPicks, quickPickPage]);

  // Filter albums according to active chip if selected
  const displayedAlbums = useMemo(() => {
    if (!selectedChip) return albums;
    const lower = selectedChip.toLowerCase();
    const filtered = albums.filter(
      (a) =>
        a.genre?.toLowerCase().includes(lower) ||
        a.title.toLowerCase().includes(lower) ||
        a.artist.toLowerCase().includes(lower)
    );
    return filtered.length > 0 ? filtered : albums;
  }, [albums, selectedChip]);

  return (
    <div className="tv-yt-music-screen tv-scroll-container">
      {/* 1. Top Mood / Activity Filter Chips */}
      <section className="tv-yt-chips-container" aria-label="Music Moods and Activities">
        <div className="tv-yt-chips-scroll">
          {YOUTUBE_MOOD_CHIPS.map((chip, idx) => {
            const isSelected = selectedChip === chip;
            return (
              <Focusable
                key={chip}
                id={`yt-chip-${idx}`}
                groupId="yt-mood-chips"
                indexInGroup={idx}
                className="tv-yt-chip-focusable"
                onSelect={() => setSelectedChip(isSelected ? null : chip)}
              >
                {(isFocused) => (
                  <button
                    type="button"
                    className={`tv-yt-chip-btn ${isSelected ? 'selected' : ''} ${
                      isFocused ? 'focused' : ''
                    }`}
                  >
                    {chip}
                  </button>
                )}
              </Focusable>
            );
          })}
        </div>
      </section>

      {/* 2. "Albums for you" Rail */}
      <div className="tv-yt-section">
        <ContentRail
          id="yt-albums-for-you"
          title="Albums for you"
          isLoading={isLoading}
          error={error}
          onRetry={loadData}
          aspectRatio="1:1"
        >
          {displayedAlbums.map((alb, idx) => (
            <AlbumCard
              key={alb.id}
              album={alb}
              groupId="yt-albums-for-you"
              indexInGroup={idx}
              onSelect={onSelectAlbum}
            />
          ))}
        </ContentRail>
      </div>

      {/* 3. "Quick picks" 3-4 Column x 4 Row Grid with "Play all" */}
      {quickPicks.length > 0 && (
        <section className="tv-yt-quick-picks-section">
          <div className="tv-yt-qp-header">
            <div className="tv-yt-qp-header-left">
              <h3 className="tv-yt-section-title">Quick picks</h3>
              <Focusable
                id="yt-qp-play-all"
                groupId="yt-quick-picks-header"
                indexInGroup={0}
                className="tv-yt-play-all-focusable"
                onSelect={() => {
                  if (quickPicks.length > 0) {
                    onPlayTrack(quickPicks[0], quickPicks);
                  }
                }}
              >
                {(isFocused) => (
                  <div className={`tv-yt-play-all-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={16} fill="currentColor" />
                    <span>Play all</span>
                  </div>
                )}
              </Focusable>
            </div>

            {totalQuickPickPages > 1 && (
              <div className="tv-yt-qp-header-right">
                <Focusable
                  id="yt-qp-page-prev"
                  groupId="yt-quick-picks-header"
                  indexInGroup={1}
                  className="tv-yt-arrow-focusable"
                  onSelect={() => setQuickPickPage((p) => (p > 0 ? p - 1 : totalQuickPickPages - 1))}
                >
                  {(isFocused) => (
                    <button
                      type="button"
                      aria-label="Previous Quick Picks"
                      className={`tv-yt-arrow-btn ${isFocused ? 'focused' : ''}`}
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                </Focusable>
                <Focusable
                  id="yt-qp-page-next"
                  groupId="yt-quick-picks-header"
                  indexInGroup={2}
                  className="tv-yt-arrow-focusable"
                  onSelect={() => setQuickPickPage((p) => (p < totalQuickPickPages - 1 ? p + 1 : 0))}
                >
                  {(isFocused) => (
                    <button
                      type="button"
                      aria-label="Next Quick Picks"
                      className={`tv-yt-arrow-btn ${isFocused ? 'focused' : ''}`}
                    >
                      <ChevronRight size={20} />
                    </button>
                  )}
                </Focusable>
              </div>
            )}
          </div>

          <div className="tv-yt-qp-grid" role="list">
            {currentQuickPicks.map((trk, idx) => (
              <QuickPickRow
                key={trk.id}
                track={trk}
                groupId="yt-quick-picks-grid"
                indexInGroup={idx}
                isCurrent={trk.id === activeTrackId}
                isPlaying={trk.id === activeTrackId && isPlaying}
                onSelect={() => onPlayTrack(trk, quickPicks)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. "Top music videos" Rail */}
      {musicVideos.length > 0 && (
        <div className="tv-yt-section">
          <ContentRail
            id="yt-music-videos"
            title="Top music videos"
            isLoading={isLoading}
            aspectRatio="16:9"
          >
            {musicVideos.map((mv, idx) => (
              <MusicVideoCard
                key={mv.id}
                video={mv}
                groupId="yt-music-videos"
                indexInGroup={idx}
                onSelect={() => {
                  const trackEquivalent: Track = {
                    id: mv.id,
                    title: mv.title,
                    artist: mv.artist,
                    album: 'Music Video',
                    duration: mv.duration,
                    durationSeconds: mv.durationSeconds,
                    trackNumber: idx + 1,
                    artwork: mv.thumbnail,
                    audioUrl: mv.ytVideoId ? `https://www.youtube.com/watch?v=${mv.ytVideoId}` : '',
                    ytVideoId: mv.ytVideoId,
                  };
                  onPlayTrack(trackEquivalent, [trackEquivalent]);
                }}
              />
            ))}
          </ContentRail>
        </div>
      )}

      {/* 5. "Trending community playlists" Rail */}
      {communityPlaylists.length > 0 && (
        <div className="tv-yt-section">
          <ContentRail
            id="yt-community-playlists"
            title="Trending community playlists"
            isLoading={isLoading}
            aspectRatio="1:1"
          >
            {communityPlaylists.map((pl, idx) => (
              <CommunityPlaylistCard
                key={pl.id}
                playlist={pl}
                groupId="yt-community-playlists"
                indexInGroup={idx}
                onSelect={() => {
                  if (quickPicks.length > 0) {
                    onPlayTrack(quickPicks[0], quickPicks);
                  }
                }}
              />
            ))}
          </ContentRail>
        </div>
      )}

      {/* 6. "Moods & Decades" Rail */}
      {moodDecades.length > 0 && (
        <div className="tv-yt-section">
          <ContentRail
            id="yt-moods-decades"
            title="Moods & Decades"
            isLoading={isLoading}
            aspectRatio="16:9"
          >
            {moodDecades.map((m, idx) => (
              <MoodCard
                key={m.id}
                item={m}
                groupId="yt-moods-decades"
                indexInGroup={idx}
                onSelect={() => {
                  if (quickPicks.length > 0) {
                    onPlayTrack(quickPicks[0], quickPicks);
                  }
                }}
              />
            ))}
          </ContentRail>
        </div>
      )}

      <Footer />
      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
