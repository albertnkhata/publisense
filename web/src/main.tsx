import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getSupabase, hasSupabaseConfig } from './api';
import { App } from './App';
import { Providers } from './Providers';
import { initMonitoring, rootErrorOptions } from './lib/monitoring';
import { Analytics } from '@vercel/analytics/react';
import './styles/app.css';

initMonitoring();

// Create the client before React mounts, so a reset link's #type=recovery is seen
// while it is still in the URL (docs/deferred.md D-014).
if (hasSupabaseConfig) getSupabase();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root, rootErrorOptions).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
    <Analytics />
  </StrictMode>,
);
