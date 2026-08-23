import React, { useState, useEffect } from 'react';
import { Gamepad, Play, Flame, Layers, Sparkles, MonitorPlay } from 'lucide-react';
import { Focusable } from '../../components/Focusable/Focusable';
import { spatialNav } from '../../services/spatialNav/spatialNavEngine';
import { appService } from '../../services/apps/AppService';
import { POPULAR_GAMES } from '../../data/games/mockGames';
import { MediaItem } from '../../types';
import './GamesScreen.css';

interface GamesScreenProps {
  onSelectGame?: (game: MediaItem) => void;
}

export const GamesScreen: React.FC<GamesScreenProps> = () => {
  const [selectedGame, setSelectedGame] = useState<MediaItem>(POPULAR_GAMES[0]);

  useEffect(() => {
    spatialNav.pushScope('games-screen');
    return () => {
      spatialNav.popScope('games-screen');
    };
  }, []);

  const handleLaunch = (game: MediaItem) => {
    console.log(`[GamesScreen] Launching game: ${game.title}`);
    appService.launchMedia(game);
  };

  const LAUNCHERS = [
    {
      id: 'steam-bigpicture',
      name: 'Steam Big Picture',
      desc: 'Full TV controller gaming interface',
      color: '#171a21',
      accent: '#66c0f4',
      target: 'steam://open/bigpicture',
    },
    {
      id: 'retroarch',
      name: 'RetroArch Emulation',
      desc: 'All-in-one classic retro gaming hub',
      color: '#2a2a2a',
      accent: '#da3b3b',
      target: 'retroarch',
    },
    {
      id: 'xbox-cloud',
      name: 'Xbox Cloud Gaming',
      desc: 'Stream PC & Console titles over cloud',
      color: '#107c10',
      accent: '#ffffff',
      target: 'https://www.xbox.com/play',
    },
  ];

  return (
    <div className="tv-games-screen">
      {/* Dynamic Hero Banner */}
      <div className="tv-games-hero" style={{ backgroundImage: `url(${selectedGame.backdropUrl})` }}>
        <div className="tv-games-hero-overlay" />
        <div className="tv-games-hero-content">
          <div className="tv-games-badge">
            <Gamepad size={16} color="#ff453a" />
            <span>TV Gaming Hub • Controller Optimized</span>
          </div>

          <h1 className="tv-games-hero-title">{selectedGame.title}</h1>
          <p className="tv-games-hero-desc">{selectedGame.description}</p>

          <div className="tv-games-hero-meta">
            <span className="tv-games-meta-tag">{selectedGame.rating}</span>
            <span>•</span>
            <span>{selectedGame.genre?.join(', ')}</span>
            <span>•</span>
            <span className="tv-games-source-tag">{selectedGame.source}</span>
          </div>

          <div className="tv-games-hero-actions">
            <Focusable
              id="hero-launch-game-btn"
              groupId="games-hero"
              indexInGroup={0}
              className="tv-game-launch-btn-focusable"
              onSelect={() => handleLaunch(selectedGame)}
            >
              {(isFocused) => (
                <div className={`tv-game-hero-btn primary ${isFocused ? 'focused' : ''}`}>
                  <Play size={20} fill="#000" color="#000" />
                  <span>Launch Game (A)</span>
                </div>
              )}
            </Focusable>
          </div>
        </div>
      </div>

      {/* Featured Games Rail */}
      <div className="tv-games-rail-section">
        <div className="tv-games-rail-header">
          <Flame size={20} color="#f28b82" />
          <h2 className="tv-games-rail-title">Popular Games</h2>
        </div>

        <div className="tv-games-cards-row tv-scroll-container">
          {POPULAR_GAMES.map((game, idx) => (
            <Focusable
              key={game.id}
              id={`game-card-${game.id}`}
              groupId="games-rail"
              indexInGroup={idx}
              className="tv-game-card-focusable"
              onFocus={() => setSelectedGame(game)}
              onSelect={() => handleLaunch(game)}
            >
              {(isFocused) => (
                <div className={`tv-game-card ${isFocused ? 'focused' : ''}`}>
                  <img src={game.posterUrl || game.backdropUrl} alt={game.title} className="tv-game-card-img" />
                  <div className="tv-game-card-info">
                    <span className="tv-game-card-title">{game.title}</span>
                    <span className="tv-game-card-genre">{game.genre?.[0]} • {game.year}</span>
                  </div>
                </div>
              )}
            </Focusable>
          ))}
        </div>
      </div>

      {/* Gaming Launchers Rail */}
      <div className="tv-games-rail-section" style={{ marginTop: '28px', marginBottom: '60px' }}>
        <div className="tv-games-rail-header">
          <Layers size={20} color="#81c995" />
          <h2 className="tv-games-rail-title">Game Launchers & Emulation</h2>
        </div>

        <div className="tv-launchers-row tv-scroll-container">
          {LAUNCHERS.map((launcher, idx) => (
            <Focusable
              key={launcher.id}
              id={`launcher-card-${launcher.id}`}
              groupId="games-launchers"
              indexInGroup={idx}
              className="tv-launcher-card-focusable"
              onSelect={() => appService.launchApp({
                id: launcher.id,
                name: launcher.name,
                category: 'gaming',
                iconType: 'svg',
                launchType: launcher.target.startsWith('http') ? 'web' : 'executable',
                target: launcher.target,
              })}
            >
              {(isFocused) => (
                <div className={`tv-launcher-card ${isFocused ? 'focused' : ''}`} style={{ background: launcher.color }}>
                  <MonitorPlay size={32} color={launcher.accent} />
                  <div className="tv-launcher-text">
                    <span className="tv-launcher-name">{launcher.name}</span>
                    <span className="tv-launcher-desc">{launcher.desc}</span>
                  </div>
                </div>
              )}
            </Focusable>
          ))}
        </div>
      </div>
    </div>
  );
};
