import { useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { recordEvent } from '../api/analytics';
import { cx } from '../lib/cx';
import { AuthProvider } from './auth';
import { AuthLinkErrorWatcher } from './AuthLinkErrorWatcher';
import { RecoveryWatcher } from './RecoveryWatcher';
import { HandleTakenNotice } from './HandleTakenNotice';
import { ChooseHandleDialog } from './ChooseHandleDialog';
import { useTheme } from '../lib/ThemeProvider';
import { useShortcut } from '../lib/useShortcut';
import { ClaimProvider } from '../claim/ClaimDialog';
import { ComposerProvider } from './composer';
import { AddProductHost, AddProductProvider } from '../products/AddProductDialog';
import { NavRail } from './NavRail';
import { RightRail } from './RightRail';
import { SiteFooter, SiteHeader } from './SiteHeader';
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
 * `chrome: 'site'` (the legal pages) swaps all of that for a website header
 * and footer around the reading column.
 */
export function AppShell() {
  const { toggle } = useTheme();
  const onTheme = useCallback(() => toggle(), [toggle]);
  useShortcut('d', onTheme, { ctrl: true });
  const { pathname } = useLocation();
  const { rail, width, chrome, topBar } = useShellLayout();

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
      <HandleTakenNotice />
      <ChooseHandleDialog />
      <AddProductHost />
      <a
        href="#main"
        className="sr-only z-80 rounded-md bg-card px-3 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {chrome === 'site' ? (
        <div className="flex min-h-dvh flex-col bg-page text-ink">
          <SiteHeader />
          <div className="mx-auto flex w-full flex-1 justify-center px-7 pt-8 pb-9 max-sm:px-3 max-sm:pt-5">
            <main id="main" tabIndex={-1} className="w-full max-w-content min-w-0 outline-none">
              <Outlet />
            </main>
          </div>
          <SiteFooter />
        </div>
      ) : (
        <div className="flex min-h-dvh bg-page text-ink">
          <NavRail />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar always={!rail && topBar} />
            <div className="mx-auto flex w-full justify-center gap-6 px-7 pt-6 pb-10 max-sm:px-3 max-sm:pt-4 max-sm:pb-10">
              <main id="main" tabIndex={-1} className={cx('w-full min-w-0 flex-1 outline-none', width === 'narrow' ? 'max-w-content' : 'max-w-wide')}>
                <Outlet />
              </main>
              {rail ? <RightRail /> : null}
            </div>
          </div>
          <TabBar />
        </div>
      )}
    </ClaimProvider>
    </ComposerProvider>
    </AddProductProvider>
    </AuthProvider>
  );
}
