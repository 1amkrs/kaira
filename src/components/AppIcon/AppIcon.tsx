import React from 'react';
import { 
  Tv, 
  Film, 
  Music, 
  Gamepad2, 
  Globe, 
  PlaySquare, 
  Sparkles, 
  Flame, 
  Layers 
} from 'lucide-react';
import { AppItem } from '../../types';
import { Focusable } from '../Focusable/Focusable';
import './AppIcon.css';

interface AppIconProps {
  app: AppItem;
  groupId: string;
  indexInGroup: number;
  onSelect: (app: AppItem) => void;
}

export const AppIcon: React.FC<AppIconProps> = ({
  app,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  // Render clean vector icon representation for each brand
  const renderAppIconGraphics = () => {
    switch (app.id) {
      case 'youtube':
        return (
          <div className="tv-app-brand-logo youtube">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
        );
      case 'netflix':
        return (
          <div className="tv-app-brand-logo netflix">
            <span className="netflix-n">N</span>
          </div>
        );
      case 'spotify':
        return (
          <div className="tv-app-brand-logo spotify">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.308a.747.747 0 0 1-1.028.248c-2.812-1.718-6.353-2.107-10.523-1.155a.75.75 0 0 1-.336-1.462c4.564-1.042 8.487-.6 11.64 1.341a.748.748 0 0 1 .247 1.028zm1.47-3.267a.936.936 0 0 1-1.287.308c-3.22-1.979-8.128-2.55-11.936-1.394a.937.937 0 1 1-.546-1.792c4.356-1.321 9.774-.683 13.46 1.583a.937.937 0 0 1 .309 1.295zm.127-3.398c-3.86-2.293-10.224-2.505-13.889-1.392a1.124 1.124 0 1 1-.655-2.152c4.22-1.282 11.246-1.037 15.688 1.598a1.125 1.125 0 1 1-1.144 1.946z"/>
            </svg>
          </div>
        );
      case 'steam':
        return (
          <div className="tv-app-brand-logo steam">
            <Gamepad2 size={34} />
          </div>
        );
      case 'plex':
        return (
          <div className="tv-app-brand-logo plex">
            <PlaySquare size={34} />
          </div>
        );
      case 'browser':
        return (
          <div className="tv-app-brand-logo browser">
            <Globe size={34} />
          </div>
        );
      case 'disney':
        return (
          <div className="tv-app-brand-logo disney">
            <Sparkles size={34} />
          </div>
        );
      case 'prime-video':
        return (
          <div className="tv-app-brand-logo prime">
            <Film size={34} />
          </div>
        );
      case 'twitch':
        return (
          <div className="tv-app-brand-logo twitch">
            <Flame size={34} />
          </div>
        );
      case 'kodi':
        return (
          <div className="tv-app-brand-logo kodi">
            <Layers size={34} />
          </div>
        );
      default:
        return (
          <div className="tv-app-brand-logo generic">
            <Tv size={34} />
          </div>
        );
    }
  };

  return (
    <Focusable
      id={`app-tile-${app.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-app-tile-wrapper"
      onSelect={() => onSelect(app)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-app-tile ${isFocused ? 'focused' : ''}`}>
          <div
            className="tv-app-tile-body"
            style={{
              backgroundColor: app.bgColor || 'var(--bg-surface-card)',
            }}
          >
            {renderAppIconGraphics()}
          </div>
          <span className="tv-app-tile-label text-truncate">{app.name}</span>
        </div>
      )}
    </Focusable>
  );
};
