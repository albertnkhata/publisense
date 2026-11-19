import { Link, NavLink, useLocation } from 'react-router';
import { useDmUnread, useMessagesEnabled, useUnreadCount } from '../api';
import { cx } from '../lib/cx';
import { useShortcut } from '../lib/useShortcut';
import { useViewer } from '../lib/viewer';
import { Button, Icon } from '../ui';
import { BrandSymbol } from './BrandMark';
import { SearchWell } from './SearchWell';
import { UserMenu } from './UserMenu';
import { useAuthDialog, useRequireAuth } from './auth';
import { useComposer } from './composer';
import type { ShellNav, ShellWidth } from './layout';

/**
 * Global TopBar.
 * - `nav === 'top'` (browsing & consumer routes): always visible sticky navigation
 *   bar with Brand, primary nav links (Home / Feed / Categories), SearchWell,
 *   Post feedback, Messages, Notifications, and UserMenu / Sign in.
 * - `nav === 'rail'` (workspaces with NavRail): shown below lg (unless `always`)
 *   to provide brand, search, notification bell, and sign in.
 */
export function TopBar({
  nav = 'rail',
  always = false,
  width = 'narrow',
  fill = false,
}: {
  nav?: ShellNav;
  always?: boolean;
  width?: ShellWidth;
  fill?: boolean;
}) {
  const { pathname } = useLocation();
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const requireAuth = useRequireAuth();
  const { openComposer } = useComposer();
  const unread = useUnreadCount(viewer?.id ?? null).data ?? 0;
  const messages = useMessagesEnabled(viewer?.id ?? null);
  const dmUnread = useDmUnread(viewer?.id ?? null);
  const isTopNav = nav === 'top';

  const onPost = () => {
    if (requireAuth('post feedback')) openComposer();
  };
  useShortcut('c', onPost, { enabled: isTopNav });

  const isHome = pathname === '/';
  const isFeed = pathname === '/feed';
  const isCategories = pathname === '/categories' || pathname.startsWith('/c/');
  const showSearch = pathname !== '/search' && (!isTopNav || pathname !== '/');

  const navLinkClass = (active: boolean) =>
    cx(
      'inline-flex h-7 shrink-0 items-center rounded-sm px-2 text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120',
      active ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-secondary hover:bg-subtle hover:text-ink',
    );

  return (
    <header
      className={cx(
        'sticky top-0 z-20 h-9 border-b border-line bg-glass backdrop-blur-md',
        !isTopNav && (fill ? 'px-5 max-sm:px-3' : 'px-7 max-sm:px-3'),
        isTopNav || always ? 'flex items-center' : 'hidden items-center max-lg:flex',
      )}
    >
      <div
        className={cx(
          'mx-auto flex w-full items-center gap-3 max-sm:gap-2',
          isTopNav
            ? 'max-w-landing px-7 max-sm:px-3'
            : !fill && (width === 'narrow' ? 'max-w-content' : width === 'landing' ? 'max-w-landing' : 'max-w-wide'),
        )}
      >
        <Link
          to="/"
          aria-label="Publisense home"
          className={cx(
            'shrink-0 items-center gap-2 text-md font-bold text-ink no-underline',
            isTopNav ? 'flex' : 'hidden max-sm:flex',
          )}
        >
          <BrandSymbol />
          <span className={isTopNav ? 'hidden max-sm:inline md:inline' : undefined}>Publisense</span>
        </Link>

        {isTopNav ? (
          <nav aria-label="Primary" className="flex items-center gap-1 max-sm:hidden">
            <NavLink to="/" end className={() => navLinkClass(isHome)}>
              Home
            </NavLink>
            <NavLink to="/feed" className={() => navLinkClass(isFeed)}>
              Feed
            </NavLink>
            <NavLink to="/categories" className={() => navLinkClass(isCategories)}>
              Categories
            </NavLink>
          </nav>
        ) : null}

        {showSearch ? (
          <SearchWell
            className="min-w-0 max-w-dialog flex-1 max-sm:hidden"
            triggerClassName={isTopNav ? 'h-7 text-sm' : undefined}
          />
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-2 max-sm:gap-1">
          {isTopNav ? (
            <span className="contents max-sm:hidden">
              <Button size="sm" icon="plus" aria-label="Post feedback" onClick={onPost}>
                <span className="max-lg:hidden">Post feedback</span>
                <span className="hidden max-lg:inline">Post</span>
              </Button>
            </span>
          ) : null}
          {isTopNav && viewer && messages ? <MessagesLink count={dmUnread} /> : null}
          {viewer ? <NotificationBell count={unread} desktop={isTopNav} /> : null}
          {isTopNav && viewer ? (
            <span className="max-sm:hidden">
              <UserMenu viewer={viewer} placement="topbar" />
            </span>
          ) : null}
          {!viewer && ready ? (
            <span className={isTopNav ? 'contents' : 'contents lg:hidden'}>
              <Button size="sm" variant={isTopNav ? 'secondary' : 'primary'} onClick={() => openAuth('signin')}>
                Sign in
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/** The top-bar bell: visible from sm up in `nav === 'top'`, or below lg in `nav === 'rail'`. */
function NotificationBell({ count, desktop }: { count: number; desktop: boolean }) {
  return (
    <NavLink
      to="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
      title="Notifications"
      className={({ isActive }) =>
        cx(
          'relative grid size-8 place-items-center rounded-md no-underline transition-colors duration-120 hover:bg-subtle hover:text-ink max-sm:hidden',
          !desktop && 'lg:hidden',
          isActive ? 'text-brand' : 'text-ink-secondary',
        )
      }
    >
      <Icon name="bell" size={18} strokeWidth={1.75} />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0 min-w-4 rounded-pill bg-brand px-1 text-center font-mono text-xs leading-4 font-semibold text-on-brand tabular-nums ring-2 ring-card"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  );
}

function MessagesLink({ count }: { count: number }) {
  return (
    <NavLink
      to="/messages"
      aria-label={count > 0 ? `Messages, ${count} unread` : 'Messages'}
      title="Messages"
      className={({ isActive }) =>
        cx(
          'relative grid size-8 place-items-center rounded-md no-underline transition-colors duration-120 hover:bg-subtle hover:text-ink max-sm:hidden',
          isActive ? 'text-brand' : 'text-ink-secondary',
        )
      }
    >
      <Icon name="mail" size={18} strokeWidth={1.75} />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0 min-w-4 rounded-pill bg-brand px-1 text-center font-mono text-xs leading-4 font-semibold text-on-brand tabular-nums ring-2 ring-card"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  );
}
