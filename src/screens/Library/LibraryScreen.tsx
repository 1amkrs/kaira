import React, { useState, useEffect } from 'react';
import { MediaItem } from '../../types';
import { mediaProvider } from '../../services/media/LiveMediaProvider';
import { profileService } from '../../services/profile/ProfileService';
import { POPULAR_GAMES } from '../../data/games/mockGames';
import { POPULAR_MOVIES } from '../../data/media/mockMedia';
import { ContentRail } from '../../components/ContentRail/ContentRail';
import { MediaCard } from '../../components/MediaCard/MediaCard';
import { Bookmark, Clock } from 'lucide-react';
import { Footer } from '../../components/Footer/Footer';
import './LibraryScreen.css';

interface LibraryScreenProps {
  onSelectMedia: (item: MediaItem) => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ onSelectMedia }) => {
  const [continueItems, setContinueItems] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<MediaItem[]>([]);

  useEffect(() => {
    const loadLibrary = async () => {
      const cw = await mediaProvider.getContinueWatching();
      const cwMapped: MediaItem[] = cw.map((c) => {
        const isEpisode = 'seasonNumber' in c.media;
        const med = c.media as any;
        return {
          id: med.id,
          title: med.title,
          subtitle: isEpisode ? `S${med.seasonNumber}E${med.number}` : `${med.year || ''}`,
          backdropUrl: isEpisode ? med.thumbnail : (med.backdrop || med.poster),
          posterUrl: med.poster || med.thumbnail,
          type: isEpisode ? 'show' : 'movie',
          progress: c.progress,
        };
      });
      setContinueItems(cwMapped);

      const favs = await mediaProvider.getFavorites();
      const favsMapped: MediaItem[] = [
        ...favs.movies.map((m) => ({
          id: m.id,
          title: m.title,
          subtitle: `${m.year} • ${m.genres?.[0] || 'Movie'}`,
          backdropUrl: m.backdrop || m.poster,
          posterUrl: m.poster,
          type: 'movie' as const,
        })),
        ...favs.shows.map((s) => ({
          id: s.id,
          title: s.title,
          subtitle: `${s.year} • ${s.genres?.[0] || 'Series'}`,
          backdropUrl: s.backdrop || s.poster,
          posterUrl: s.poster,
          type: 'show' as const,
        })),
      ];
      setFavorites(favsMapped);
    };

    loadLibrary();
  }, []);

  return (
    <div className="tv-scroll-container tv-library-screen" role="main" aria-label="Library Screen">
      <div className="tv-screen-page-header">
        <h2 className="tv-screen-page-title">Library</h2>
        <p className="tv-screen-page-subtitle">Your personal watchlist, continue watching list, and installed game titles</p>
      </div>

      {/* Continue Watching Rail */}
      {continueItems.length > 0 && (
        <ContentRail
          id="rail-lib-continue"
          title="Continue Watching"
          subtitle="Resume your active media sessions"
          aspectRatio="16:9"
        >
          {continueItems.map((item, idx) => (
            <MediaCard
              key={item.id}
              item={item}
              groupId="rail-lib-continue"
              indexInGroup={idx}
              aspectRatio="16:9"
              onSelect={onSelectMedia}
            />
          ))}
        </ContentRail>
      )}

      {/* Watchlist / Favorites Rail */}
      {favorites.length > 0 ? (
        <ContentRail
          id="rail-lib-watchlist"
          title="Your Favorites & Watchlist"
          subtitle="Saved across all streaming services"
          aspectRatio="16:9"
        >
          {favorites.map((item, idx) => (
            <MediaCard
              key={item.id}
              item={item}
              groupId="rail-lib-watchlist"
              indexInGroup={idx}
              aspectRatio="16:9"
              onSelect={onSelectMedia}
            />
          ))}
        </ContentRail>
      ) : (
        <ContentRail
          id="rail-lib-watchlist-fallback"
          title="Recommended For Your Watchlist"
          subtitle="Popular titles you might like"
          aspectRatio="16:9"
        >
          {POPULAR_MOVIES.slice(0, 4).map((item, idx) => (
            <MediaCard
              key={item.id}
              item={item}
              groupId="rail-lib-watchlist-fallback"
              indexInGroup={idx}
              aspectRatio="16:9"
              onSelect={onSelectMedia}
            />
          ))}
        </ContentRail>
      )}

      {/* Installed Games */}
      <ContentRail
        id="rail-lib-games"
        title="Installed PC Games"
        subtitle="Ready to play with Xbox Controller"
        aspectRatio="16:9"
      >
        {POPULAR_GAMES.map((item, idx) => (
          <MediaCard
            key={item.id}
            item={item}
            groupId="rail-lib-games"
            indexInGroup={idx}
            aspectRatio="16:9"
            onSelect={onSelectMedia}
          />
        ))}
      </ContentRail>

      <Footer />

      <div className="tv-screen-bottom-spacer" />
    </div>
  );
};
