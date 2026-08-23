import React from 'react';
import { Delete, CornerDownLeft, Space } from 'lucide-react';
import { Focusable } from '../Focusable/Focusable';
import './OnScreenKeyboard.css';

interface OnScreenKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
}

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '_', '@'],
];

export const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onSubmit,
}) => {
  return (
    <div className="tv-virtual-keyboard" role="region" aria-label="On-Screen Keyboard">
      {KEYBOARD_ROWS.map((row, rowIdx) => (
        <div key={`row-${rowIdx}`} className="tv-keyboard-row">
          {row.map((keyChar, keyIdx) => (
            <Focusable
              key={`key-${keyChar}`}
              id={`osk-key-${rowIdx}-${keyIdx}`}
              groupId={`osk-row-${rowIdx}`}
              indexInGroup={keyIdx}
              className="tv-keyboard-key-focusable"
              onSelect={() => onKeyPress(keyChar.toLowerCase())}
              scaleEffect={true}
            >
              {(isFocused) => (
                <div className={`tv-keyboard-key ${isFocused ? 'focused' : ''}`}>
                  {keyChar}
                </div>
              )}
            </Focusable>
          ))}
        </div>
      ))}

      {/* Action Row: Space, Backspace, Clear, Search */}
      <div className="tv-keyboard-row tv-keyboard-actions-row">
        <Focusable
          id="osk-action-space"
          groupId="osk-row-actions"
          indexInGroup={0}
          className="tv-keyboard-key-focusable space-key"
          onSelect={() => onKeyPress(' ')}
          scaleEffect={true}
        >
          {(isFocused) => (
            <div className={`tv-keyboard-key action-key ${isFocused ? 'focused' : ''}`}>
              <Space size={22} />
              <span>Space</span>
            </div>
          )}
        </Focusable>

        <Focusable
          id="osk-action-backspace"
          groupId="osk-row-actions"
          indexInGroup={1}
          className="tv-keyboard-key-focusable"
          onSelect={onBackspace}
          scaleEffect={true}
        >
          {(isFocused) => (
            <div className={`tv-keyboard-key action-key ${isFocused ? 'focused' : ''}`}>
              <Delete size={22} />
              <span>Delete</span>
            </div>
          )}
        </Focusable>

        <Focusable
          id="osk-action-clear"
          groupId="osk-row-actions"
          indexInGroup={2}
          className="tv-keyboard-key-focusable"
          onSelect={onClear}
          scaleEffect={true}
        >
          {(isFocused) => (
            <div className={`tv-keyboard-key action-key ${isFocused ? 'focused' : ''}`}>
              <span>Clear</span>
            </div>
          )}
        </Focusable>

        <Focusable
          id="osk-action-submit"
          groupId="osk-row-actions"
          indexInGroup={3}
          className="tv-keyboard-key-focusable submit-key"
          onSelect={onSubmit}
          scaleEffect={true}
        >
          {(isFocused) => (
            <div className={`tv-keyboard-key action-key ${isFocused ? 'focused' : ''}`}>
              <CornerDownLeft size={22} />
              <span>Search</span>
            </div>
          )}
        </Focusable>
      </div>
    </div>
  );
};
