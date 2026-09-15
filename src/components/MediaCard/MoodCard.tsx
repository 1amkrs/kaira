import React from 'react';
import { Play } from 'lucide-react';
import { MoodCategoryItem } from '../../types/media';
import { Focusable } from '../Focusable/Focusable';
import './MoodCard.css';

interface MoodCardProps {
  item: MoodCategoryItem;
  groupId: string;
  indexInGroup: number;
  onSelect: (item: MoodCategoryItem) => void;
}

export const MoodCard: React.FC<MoodCardProps> = ({
  item,
  groupId,
  indexInGroup,
  onSelect,
}) => {
  return (
    <Focusable
      id={`mood-card-${item.id}`}
      groupId={groupId}
      indexInGroup={indexInGroup}
      className="tv-mood-card-wrapper"
      onSelect={() => onSelect(item)}
      scaleEffect={true}
    >
      {(isFocused) => (
        <div className={`tv-mood-card ${isFocused ? 'focused' : ''}`}>
          <div className="tv-mood-card-art-box">
            <img
              src={item.artwork}
              alt={item.title}
              className="tv-mood-card-img"
              loading="lazy"
            />
            <div className="tv-mood-card-scrim" />

            <div className="tv-mood-card-overlay-content">
              {item.tag && <span className="tv-mood-tag">{item.tag}</span>}
              <h4 className="tv-mood-title">{item.title}</h4>
              <p className="tv-mood-subtitle text-truncate-2">{item.subtitle}</p>
            </div>

            {isFocused && (
              <div className="tv-mood-play-overlay">
                <Play size={24} fill="currentColor" />
              </div>
            )}
          </div>
        </div>
      )}
    </Focusable>
  );
};
