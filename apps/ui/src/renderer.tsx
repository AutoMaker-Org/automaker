import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';

// Initialize i18n before rendering
import './i18n';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <Suspense fallback={<div>Loading...</div>}>
      <App />
    </Suspense>
  </StrictMode>
);
