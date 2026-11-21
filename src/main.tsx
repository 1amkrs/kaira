import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { detectAndroidEnvironment } from './platform/android/androidDetection';
import './styles/globals.css';

const CompanionRemoteApp = lazy(() => import('./remote/CompanionRemoteApp'));

const isRemoteMode =
  window.location.pathname.startsWith('/remote') ||
  window.location.search.includes('mode=remote') ||
  window.location.hash.includes('remote') ||
  window.location.hash.startsWith('#/remote');

if (isRemoteMode) {
  document.body.classList.remove('tv-mode');
  document.body.classList.add('mobile-remote-mode');
} else {
  const androidEnv = detectAndroidEnvironment();
  if (androidEnv.isAndroid) {
    document.body.classList.add('android-mode');
    if (androidEnv.isAndroidTV) {
      document.body.classList.add('android-tv-mode');
    } else {
      document.body.classList.remove('tv-mode');
      document.body.classList.add('android-mobile-mode');
    }
  }
}

if ('serviceWorker' in navigator && !window.AndroidBridge && !window.Capacitor?.isNativePlatform?.()) {
  if (import.meta.env.PROD) {
    const swUrl = new URL('sw.js', window.location.href).toString();
    fetch(swUrl, { method: 'GET', redirect: 'manual', cache: 'no-store' })
      .then((res) => {
        if (res.type === 'opaqueredirect' || res.redirected || !res.ok) {
          return;
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('javascript')) {
          return;
        }
        return import('virtual:pwa-register').then(({ registerSW }) => {
          registerSW({
            immediate: true,
            onRegisterError: () => {
              // Service worker registration skipped if disallowed by host environment
            },
          });
        });
      })
      .catch(() => {
        // Service worker registration skipped if unsupported or blocked
      });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          const scriptUrl =
            registration.active?.scriptURL ||
            registration.installing?.scriptURL ||
            registration.waiting?.scriptURL ||
            '';
          if (scriptUrl.includes('dev-sw')) {
            registration.unregister().catch(() => {});
          }
        });
      })
      .catch(() => {
        // Ignore if serviceWorker access is restricted
      });
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isRemoteMode ? (
      <Suspense fallback={null}>
        <CompanionRemoteApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
