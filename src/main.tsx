import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CompanionRemoteApp from './remote/CompanionRemoteApp';
import './styles/globals.css';

const isRemoteMode =
  window.location.pathname.startsWith('/remote') ||
  window.location.search.includes('mode=remote') ||
  window.location.hash.includes('remote') ||
  window.location.hash.startsWith('#/remote');

if (isRemoteMode) {
  document.body.classList.remove('tv-mode');
  document.body.classList.add('mobile-remote-mode');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isRemoteMode ? <CompanionRemoteApp /> : <App />}
  </React.StrictMode>,
);
