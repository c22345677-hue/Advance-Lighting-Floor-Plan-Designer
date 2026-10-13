import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ConfirmHost } from './app/confirm';
import { ErrorBoundary } from './app/ErrorBoundary';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfirmHost>
        <App />
      </ConfirmHost>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support for the installed app (not in dev, and not in the single-file test build,
// which runs inside a sandboxed frame).
if (import.meta.env.PROD && !__SINGLE_FILE__ && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
