import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { StoreProvider } from './context/StoreContext';
import { AppShell } from './components/AppShell';
import { AuthModal } from './components/AuthModal';
import { CreateProductModal } from './components/CreateProductModal';

// Home stays eager: it is the landing route, and making it lazy would trade a
// smaller first bundle for an extra round-trip before anything appears.
import { HomePage } from './pages/HomePage';

// Every other screen was imported eagerly, so all nine routes — and every
// component they pull in — shipped in the first chunk whether or not the
// visitor ever left the homepage. Split them so each is fetched on navigation.
const PostDetailPage = lazy(() =>
  import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const ExplorePage = lazy(() =>
  import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage }))
);
const OrgPage = lazy(() =>
  import('./pages/OrgPage').then((m) => ({ default: m.OrgPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
// Legal pages are lazy for the same reason as any other route, but they matter
// beyond tidiness: the SPA catch-all used to send /privacy and /terms to the
// homepage, which returns 200 and is still a broken promise.
const PrivacyPage = lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.TermsPage }))
);

const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

// Deliberately blank, not a spinner. These chunks are 2-10 kB and resolve in a
// few milliseconds on any real connection; a spinner that flashes for one frame
// is worse than a brief gap. If this ever needs a visual, keep it text-free.
function RouteFallback() {
  return <div aria-busy="true" className="min-h-[40vh]" />;
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <BrowserRouter>
          <AppShell>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/p/:slug" element={<HomePage />} />
                <Route path="/post/:id" element={<PostDetailPage />} />
                <Route path="/u/:handle" element={<ProfilePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/org/:slug" element={<OrgPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </AppShell>
          <AuthModal />
          <CreateProductModal />
        </BrowserRouter>
      </StoreProvider>
    </ThemeProvider>
  );
}
