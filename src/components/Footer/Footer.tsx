import React from 'react';
import { Heart } from 'lucide-react';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="tv-app-footer" aria-label="Application Footer">
      <div className="tv-footer-content">
        <span className="tv-footer-text">
          made with <span className="tv-footer-heart" aria-label="love">❤️</span> by <span className="tv-footer-author">i.am.krs</span>
        </span>
      </div>
    </footer>
  );
};
