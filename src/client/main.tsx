import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/globals.css';
import { App } from './app/App';
import { applyPreferences } from './lib/preferences';

// Theme and text size before the first paint, so there's no flash of the wrong theme.
applyPreferences();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
