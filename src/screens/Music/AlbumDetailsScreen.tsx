import React, { useState, useEffect } from 'react';
import { Play, Heart, ArrowLeft, Disc, Clock, Music } from 'lucide-react';
import { Album, Track } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { playbackService } from '../../services/playback/PlaybackService';
import { Focusable } from '../../components/Focusable/Focusable';
import { TrackRow } from '../../components/MediaCard/TrackRow';
import './AlbumDetailsScreen.css';

interface AlbumDetailsScreenProps {
  album: Album;
  onPlayTrack: (track: Track, allTracks: Track[]) => void;
  onBack: () => void;
}

export const AlbumDetailsScreen: React.FC<AlbumDetailsScreenProps> = ({
  album,
  onPlayTrack,
  onBack,
}) => {
  const [fullAlbum, setFullAlbum] = useState<Album>(album);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(!!album.isFavorite);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingTracks(true);
    mediaProvider.getAlbum(album.id).then((res) => {
      if (res) {
        setFullAlbum(res);
      }
      setIsLoadingTracks(false);
    });
  }, [album.id]);

  useEffect(() => {
    const unsub = playbackService.subscribe((state) => {
      if (state.currentSource?.mediaId) {
        setActiveTrackId(state.currentSource.mediaId);
      }
    });
    return unsub;
  }, []);

  const handleToggleFavorite = async () => {
    const next = await mediaProvider.toggleFavorite(album.id, 'album');
    setIsFavorite(next);
  };

  const tracks = fullAlbum.tracks || [];

  return (
    <div className="tv-album-details-screen tv-scroll-container">
      {/* Dynamic Ambient Blur Backdrop */}
      <div
        className="tv-album-backdrop-glow"
        style={{ backgroundImage: `url(${fullAlbum.artwork})` }}
      />
      <div className="tv-album-details-scrim" />

      {/* Top Bar */}
      <div className="tv-album-top-bar">
        <Focusable
          id="album-details-back"
          groupId="album-details-nav"
          indexInGroup={0}
          scaleEffect={false}
          className="tv-back-focusable"
          onSelect={onBack}
        >
          {(isFocused) => (
            <div className={`tv-back-btn ${isFocused ? 'focused' : ''}`}>
              <ArrowLeft size={20} />
              <span>Back (B)</span>
            </div>
          )}
        </Focusable>
      </div>

      {/* Album Header Block */}
      <div className="tv-album-header-block">
        <div className="tv-album-art-large-box">
          <img
            src={fullAlbum.artwork}
            alt={fullAlbum.title}
            className="tv-album-art-large"
          />
        </div>

        <div className="tv-album-info-col">
          <span className="tv-album-type-tag">Album</span>
          <h1 className="tv-album-details-title">{fullAlbum.title}</h1>
          <h2 className="tv-album-artist-name">{fullAlbum.artist}</h2>

          <div className="tv-album-meta-row">
            <span>{fullAlbum.year}</span>
            <span className="tv-meta-dot" aria-hidden="true" />
            <span>{tracks.length} Songs</span>
            {fullAlbum.genre && (
              <>
                <span className="tv-meta-dot" aria-hidden="true" />
                <span>{fullAlbum.genre}</span>
              </>
            )}
          </div>

          {/* Action Row */}
          <div className="tv-album-actions-row">
            {tracks.length > 0 && (
              <Focusable
                id="album-play-all-btn"
                groupId="album-details-actions"
                indexInGroup={0}
                className="tv-action-btn-focusable"
                onSelect={() => onPlayTrack(tracks[0], tracks)}
              >
                {(isFocused) => (
                  <div className={`tv-details-play-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>Play Album</span>
                  </div>
                )}
              </Focusable>
            )}

            <Focusable
              id="album-fav-btn"
              groupId="album-details-actions"
              indexInGroup={1}
              className="tv-action-btn-focusable"
              onSelect={handleToggleFavorite}
            >
              {(isFocused) => (
                <div className={`tv-details-fav-btn ${isFocused ? 'focused' : ''}`}>
                  <Heart size={20} fill={isFavorite ? '#ea4335' : 'none'} color={isFavorite ? '#ea4335' : 'currentColor'} />
                  <span>{isFavorite ? 'In Favorites' : 'Add to Favorites'}</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="tv-album-tracks-section">
        <h3 className="tv-tracks-heading">Tracklist</h3>

        {isLoadingTracks ? (
          <div className="tv-tracks-loading-list" role="status" aria-label="Loading tracklist">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`track-skel-${idx}`} className="tv-track-skel shimmer" />
            ))}
          </div>
        ) : (
          <div className="tv-tracks-vertical-list" role="list">
            {tracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                groupId="album-tracklist"
                indexInGroup={idx}
                isCurrent={track.id === activeTrackId}
                isPlaying={track.id === activeTrackId && playbackService.getState().status === 'playing'}
                onSelect={() => onPlayTrack(track, tracks)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
