import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/globals.css';
import { App } from './app/App';
import { applyPreferences } from './lib/preferences';

// Theme and text size before the first paint, so there's no flash of the wrong theme.
applyPreferences();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Installable app and offline start-up (Section 10). Not in development, where it would
// serve stale files while editing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
