import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Mic,
  MicOff,
  Send,
  X,
  CornerDownLeft,
  Sparkles,
  Flame,
  Tv,
  Film,
  Music
} from 'lucide-react';
import { remoteClient } from '../remoteClient';

const QUICK_SEARCH_CHIPS = [
  { label: 'Trending Movies', query: 'Trending Movies', icon: Flame },
  { label: '4K Sci-Fi', query: 'Sci-Fi', icon: Film },
  { label: 'Top Hits Music', query: 'Top Hits', icon: Music },
  { label: 'Anime Series', query: 'Anime', icon: Tv },
  { label: 'Action & Adventure', query: 'Action', icon: Sparkles },
  { label: 'Comedy', query: 'Comedy', icon: Sparkles },
];

export const KeyboardVoiceRemote: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Tap microphone to speak');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech Recognition if available
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceStatus('Listening... Speak now');
        remoteClient.triggerHaptic(25);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInputText(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceStatus('Tap microphone to speak');
        if (inputRef.current && inputRef.current.value.trim()) {
          handleSendQuery(inputRef.current.value.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[KeyboardVoiceRemote] Speech error:', event.error);
        setIsListening(false);
        setVoiceStatus('Voice recognition error. Try typing.');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    // Real-time keystroke push to TV search
    remoteClient.sendCommand('SEARCH_QUERY', { query: text });
  };

  const handleSendQuery = (queryToSend?: string) => {
    const text = queryToSend || inputText;
    if (!text.trim()) return;
    remoteClient.sendCommand('SEARCH_QUERY', { query: text.trim() });
    remoteClient.sendCommand('SELECT');
  };

  const handleClear = () => {
    setInputText('');
    remoteClient.sendCommand('SEARCH_QUERY', { query: '' });
    inputRef.current?.focus();
  };

  const handleToggleVoice = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported by this browser. Please type your search.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
      }
    }
  };

  const handleSelectChip = (chipQuery: string) => {
    setInputText(chipQuery);
    remoteClient.sendCommand('SEARCH_QUERY', { query: chipQuery });
    remoteClient.triggerHaptic(15);
  };

  return (
    <div className="keyboard-voice-container">
      {/* Search Input Card */}
      <div className="input-card">
        <div className="remote-text-input-wrap">
          <Search size={18} color="rgba(255,255,255,0.6)" />
          <input
            ref={inputRef}
            type="text"
            className="remote-text-input"
            placeholder="Type on TV keyboard..."
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSendQuery();
              }
            }}
            autoFocus
          />
          {inputText && (
            <button
              type="button"
              onClick={handleClear}
              style={{ background: 'transparent', border: 'none', color: '#9aa0a6', cursor: 'pointer', padding: 2 }}
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSendQuery()}
            style={{
              background: '#1a73e8',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Search"
          >
            <Send size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
            Live synced to Kaira TV Search
          </span>
          <button
            type="button"
            onClick={() => remoteClient.sendCommand('KEY_PRESS', { key: 'Enter' })}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '11px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer'
            }}
          >
            <CornerDownLeft size={12} />
            <span>Enter</span>
          </button>
        </div>
      </div>

      {/* Voice Dictation Call-to-Action */}
      <div className="voice-search-cta">
        <button
          type="button"
          className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
          onClick={handleToggleVoice}
          aria-label="Voice Search"
        >
          {isListening ? <MicOff size={34} /> : <Mic size={34} />}
        </button>
        <span className="voice-status-label">{voiceStatus}</span>
      </div>

      {/* Quick Search Chips */}
      <div>
        <div className="suggestions-title">Quick Search Categories</div>
        <div className="suggestions-chips-grid">
          {QUICK_SEARCH_CHIPS.map((chip, idx) => {
            const IconComponent = chip.icon;
            return (
              <button
                key={idx}
                type="button"
                className="suggestion-chip"
                onClick={() => handleSelectChip(chip.query)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconComponent size={13} color="#8ab4f8" />
                  {chip.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
