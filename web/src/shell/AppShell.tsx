import { useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { recordEvent } from '../api/analytics';
import { cx } from '../lib/cx';
import { AuthProvider } from './auth';
import { AuthLinkErrorWatcher } from './AuthLinkErrorWatcher';
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
import { useShellLayout } from './layout';

/**
 * AppShell (FOUNDATION §5): NavRail · TopBar (below lg) · content ·
 * RightRail (above lg) · TabBar (sm).
 *
 * A route can drop the right rail with `handle: { rail: false }` (see
 * shell/layout.ts). Without it the top bar stays on at every width, so search
 * keeps a visible way in, and the column is `max-w-wide` or, with
 * `width: 'narrow'`, stays `max-w-content` and centres. Terms · Privacy live
 * at the foot of the nav rail (TabBar sheet at sm), not in the right rail.
 */
export function AppShell() {
  const { toggle } = useTheme();
  const onTheme = useCallback(() => toggle(), [toggle]);
  useShortcut('d', onTheme, { ctrl: true });
  const { pathname } = useLocation();
  const { rail, width } = useShellLayout();

  useEffect(() => {
    // Board pages (/b/:slug) log their own page_view with boardId once the board loads;
    // staff /admin pages are excluded from public traffic counts.
    if (pathname.startsWith('/admin') || pathname.startsWith('/b/')) return;
    recordEvent('page_view', { path: pathname });
  }, [pathname]);

  return (
    <AuthProvider>
    <AddProductProvider>
    <ComposerProvider>
    <ClaimProvider>
      <RecoveryWatcher />
      <AuthLinkErrorWatcher />
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
          <TopBar always={!rail} />
          <div className="mx-auto flex w-full justify-center gap-6 px-7 pt-6 pb-10 max-sm:px-3 max-sm:pt-4 max-sm:pb-10">
            <main id="main" tabIndex={-1} className={cx('w-full min-w-0 flex-1 outline-none max-sm:pb-10', width === 'narrow' ? 'max-w-content' : 'max-w-wide')}>
              <Outlet />
            </main>
            {rail ? <RightRail /> : null}
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
