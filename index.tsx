import './game-motion.css';
import './tailwind.css';
import './game-theme.css'; // build-time Tailwind (replaces the CDN play script)
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { armCampusArtGate } from './game/artGate';
import { bootPwa } from './pwa/boot';

armCampusArtGate(); // returning players get campus art at once; new players after naming
bootPwa(); // install capture, connection tracking, worker registration (production only)

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
