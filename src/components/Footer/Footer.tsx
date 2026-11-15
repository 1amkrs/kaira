import React from 'react';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="tv-app-footer" aria-label="Application Footer">
      <div className="tv-footer-content">
        <span className="tv-footer-text">
          Kaira <span aria-hidden="true">·</span> Crafted by <span className="tv-footer-author">i.am.krs</span>
        </span>
      </div>
    </footer>
  );
};
