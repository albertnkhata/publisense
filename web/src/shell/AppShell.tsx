import { useCallback } from 'react';
import { Outlet } from 'react-router';
import { AuthProvider } from './auth';
import { RecoveryWatcher } from './RecoveryWatcher';
import { useTheme } from '../lib/ThemeProvider';
import { useShortcut } from '../lib/useShortcut';
import { ClaimProvider } from '../claim/ClaimDialog';
import { ComposerProvider } from './composer';
import { AddProductHost, AddProductProvider } from '../products/AddProductDialog';
import { NavRail } from './NavRail';
import { RightRail } from './RightRail';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * AppShell (FOUNDATION §5): NavRail · TopBar (below lg) · content ·
 * RightRail (above lg) · TabBar (sm).
 */
export function AppShell() {
  const { toggle } = useTheme();
  const onTheme = useCallback(() => toggle(), [toggle]);
  useShortcut('d', onTheme, { ctrl: true });

  return (
    <AuthProvider>
    <AddProductProvider>
    <ComposerProvider>
    <ClaimProvider>
      <RecoveryWatcher />
      <AddProductHost />
      <a
        href="#main"
        className="sr-only z-80 rounded-md bg-card px-3 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh bg-page text-ink">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="mx-auto flex w-full justify-center gap-6 px-7 pt-6 pb-10 max-sm:px-3 max-sm:pt-4 max-sm:pb-10">
            <main id="main" tabIndex={-1} className="w-full min-w-0 max-w-content flex-1 outline-none max-sm:pb-10">
              <Outlet />
            </main>
            <RightRail />
          </div>
        </div>
        <TabBar />
      </div>
    </ClaimProvider>
    </ComposerProvider>
    </AddProductProvider>
    </AuthProvider>
  );
}
