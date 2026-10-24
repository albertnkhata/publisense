import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getSupabase, hasSupabaseConfig } from './api';
import { App } from './App';
import { Providers } from './Providers';
import './styles/app.css';

// Create the client before React mounts, so a reset link's #type=recovery is seen
// while it is still in the URL (docs/deferred.md D-014).
if (hasSupabaseConfig) getSupabase();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
