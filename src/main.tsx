import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ConfirmHost } from './app/confirm';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmHost>
      <App />
    </ConfirmHost>
  </StrictMode>,
);
