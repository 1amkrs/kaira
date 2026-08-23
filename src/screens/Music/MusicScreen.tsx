import React, { useState, useEffect } from 'react';
import { Play, Disc, Music as MusicIcon, Mic2 } from 'lucide-react';
import { Album, Artist, Track } from '../../types/media';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { AlbumCard } from '../../components/MediaCard/AlbumCard';
import { TrackRow } from '../../components/MediaCard/TrackRow';
import { Focusable } from '../../components/Focusable/Focusable';
import { Footer } from '../../components/Footer/Footer';
import { playbackService } from '../../services/playback/PlaybackService';
import './MusicScreen.css';

interface MusicScreenProps {
  onSelectAlbum: (album: Album) => void;
  onPlayTrack: (track: Track, allTracks: Track[]) => void;
}

export const MusicScreen: React.FC<MusicScreenProps> = ({ onSelectAlbum, onPlayTrack }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await mediaProvider.getMusic();
      setAlbums(data.albums);
      setArtists(data.artists);
      setTopTracks(data.topTracks);
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
      if (s.currentSource?.mediaId) {
        setActiveTrackId(s.currentSource.mediaId);
      }
    });
    return unsub;
  }, []);

  const featuredAlbum = albums.length > 0 ? albums[0] : null;
  const recentAlbums = albums.slice(1, 7);
  const popElectronic = albums.filter(a => a.genre?.includes('Electronic') || a.genre?.includes('Pop') || a.genre?.includes('Soundtrack'));

  return (
    <div className="tv-music-screen tv-scroll-container">
      {/* Featured Music Billboard */}
      {featuredAlbum && (
        <section className="tv-music-hero-billboard">
          <div
            className="tv-music-hero-bg"
            style={{ backgroundImage: `url(${featuredAlbum.artwork})` }}
          >
            <div className="tv-music-hero-scrim" />
          </div>

          <div className="tv-music-hero-content">
            <span className="tv-music-hero-badge">Featured Album</span>
            <h1 className="tv-music-hero-title">{featuredAlbum.title}</h1>
            <div className="tv-music-hero-meta">
              <span className="rating-pill">{featuredAlbum.genre || 'Electronic'}</span>
              <span>{featuredAlbum.year}</span>
              <span className="tv-meta-dot" aria-hidden="true" />
              <span>{featuredAlbum.artist}</span>
            </div>
            <p className="tv-music-hero-desc text-line-clamp-2">
              High-fidelity studio quality streaming, synced live karaoke lyrics, and iconic tracks.
            </p>

            <div className="tv-music-hero-actions">
              <Focusable
                id="hero-album-play"
                groupId="music-hero"
                indexInGroup={0}
                className="tv-hero-btn-focusable"
                onSelect={async () => {
                  let albumTracks = featuredAlbum.tracks;
                  if (!albumTracks || albumTracks.length === 0) {
                    const full = await mediaProvider.getAlbum(featuredAlbum.id);
                    if (full?.tracks && full.tracks.length > 0) {
                      albumTracks = full.tracks;
                    }
                  }
                  if (albumTracks && albumTracks.length > 0) {
                    onPlayTrack(albumTracks[0], albumTracks);
                  } else if (topTracks.length > 0) {
                    onPlayTrack(topTracks[0], topTracks);
                  }
                }}
              >
                {(isFocused) => (
                  <div className={`tv-hero-play-btn ${isFocused ? 'focused' : ''}`}>
                    <Play size={20} fill="currentColor" />
                    <span>Play Album</span>
                  </div>
                )}
              </Focusable>

              <Focusable
                id="hero-album-details"
                groupId="music-hero"
                indexInGroup={1}
                className="tv-hero-btn-focusable"
                onSelect={() => onSelectAlbum(featuredAlbum)}
              >
                {(isFocused) => (
                  <div className={`tv-hero-info-btn ${isFocused ? 'focused' : ''}`}>
                    <Disc size={20} />
                    <span>Album Details</span>
                  </div>
                )}
              </Focusable>
            </div>
          </div>
        </section>
      )}

      {/* Top Tracks Rail / Compact Preview */}
      {topTracks.length > 0 && (
        <div className="tv-music-top-tracks-section">
          <div className="tv-rail-header">
            <h3 className="tv-rail-title">Popular Tracks</h3>
            <span className="tv-rail-subtitle">Top stream preview</span>
          </div>
          <div className="tv-top-tracks-list" role="list">
            {topTracks.slice(0, 4).map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                groupId="music-top-tracks"
                indexInGroup={idx}
                isCurrent={track.id === activeTrackId}
                isPlaying={track.id === activeTrackId && playbackService.getState().status === 'playing'}
                onSelect={() => onPlayTrack(track, topTracks)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rails */}
      <div className="tv-music-rails-container">
        <ContentRail
          id="music-albums-top"
          title="Top Albums"
          isLoading={isLoading}
          error={error}
          onRetry={loadData}
          aspectRatio="1:1"
        >
          {albums.map((alb, idx) => (
            <AlbumCard
              key={alb.id}
              album={alb}
              groupId="music-albums-top"
              indexInGroup={idx}
              onSelect={onSelectAlbum}
            />
          ))}
        </ContentRail>

        <ContentRail
          id="music-recent-albums"
          title="Recently Added Albums"
          isLoading={isLoading}
          aspectRatio="1:1"
        >
          {recentAlbums.map((alb, idx) => (
            <AlbumCard
              key={`rec-${alb.id}`}
              album={alb}
              groupId="music-recent-albums"
              indexInGroup={idx}
              onSelect={onSelectAlbum}
            />
          ))}
        </ContentRail>

        <ContentRail
          id="music-electronic"
          title="Electronic & Soundtracks"
          isLoading={isLoading}
          aspectRatio="1:1"
        >
          {popElectronic.map((alb, idx) => (
            <AlbumCard
              key={`elec-${alb.id}`}
              album={alb}
              groupId="music-electronic"
              indexInGroup={idx}
              onSelect={onSelectAlbum}
            />
          ))}
        </ContentRail>
      </div>
      <Footer />
      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
