import { Link, NavLink, useLocation } from 'react-router';
import { useDmUnread, useMessagesEnabled, useUnreadCount } from '../api';
import { cx } from '../lib/cx';
import { useShortcut } from '../lib/useShortcut';
import { useViewer } from '../lib/viewer';
import { Button, Icon, Tooltip } from '../ui';
import { BrandSymbol } from './BrandMark';
import { useNavCollapsed } from './NavRail';
import { SearchWell } from './SearchWell';
import { UserMenu } from './UserMenu';
import { useAuthDialog, useRequireAuth } from './auth';
import { useComposer } from './composer';

/**
 * Full-width sticky TopBar seated above the left NavRail and main column.
 * - Left: Sidebar toggle (aligned over the NavRail's 40px icon column) + BrandSymbol + wordmark.
 * - Center: SearchWell (omitted on `/` and `/search` where the page has its own top search bar).
 * - Right: Post feedback (C), Messages, Notifications, and UserMenu / Sign in.
 */
export function TopBar() {
  const { pathname } = useLocation();
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const requireAuth = useRequireAuth();
  const { openComposer } = useComposer();
  const { collapsed, belowXl, toggle } = useNavCollapsed();
  const unread = useUnreadCount(viewer?.id ?? null).data ?? 0;
  const messages = useMessagesEnabled(viewer?.id ?? null);
  const dmUnread = useDmUnread(viewer?.id ?? null);

  const onPost = () => {
    if (requireAuth('post feedback')) openComposer();
  };
  useShortcut('c', onPost);
  useShortcut('[', toggle, { enabled: !belowXl });

  const showSearch = pathname !== '/search' && pathname !== '/';

  return (
    <header className="sticky top-0 z-30 flex h-9 w-full shrink-0 items-center border-b border-line bg-glass px-3 backdrop-blur-md">
      <div className="flex w-full items-center gap-3 max-sm:gap-2">
        <span className="flex flex-1 items-center gap-1">
          {!belowXl ? (
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="bottom" delay={0}>
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                aria-keyshortcuts="["
                className="grid h-8 w-gutter shrink-0 place-items-center rounded-md border-0 bg-transparent text-ink-secondary transition-colors duration-120 hover:bg-subtle hover:text-ink focus-visible:opacity-100 max-sm:hidden"
              >
                <Icon name="sidebar" size={18} strokeWidth={1.75} />
              </button>
            </Tooltip>
          ) : null}
          <Link
            to="/"
            aria-label="Publisense home"
            className="flex h-8 shrink-0 items-center gap-2 overflow-hidden rounded-md px-1 text-ink no-underline"
          >
            <BrandSymbol />
            <span className="text-lg font-bold whitespace-nowrap">Publisense</span>
          </Link>
        </span>

        {showSearch ? (
          <SearchWell
            className="w-full min-w-0 max-w-dialog max-sm:hidden"
            triggerClassName="h-7 text-sm"
          />
        ) : null}

        <span className="flex flex-1 items-center justify-end gap-2 pr-1 max-sm:gap-1">
          <span className="contents max-sm:hidden">
            <Button size="sm" icon="plus" aria-label="Post feedback" onClick={onPost}>
              <span className="max-lg:hidden">Post feedback</span>
              <span className="hidden max-lg:inline">Post</span>
            </Button>
          </span>
          {viewer && messages ? <MessagesLink count={dmUnread} /> : null}
          {viewer ? <NotificationBell count={unread} /> : null}
          {viewer ? (
            <span className="max-sm:hidden">
              <UserMenu viewer={viewer} placement="topbar" />
            </span>
          ) : null}
          {!viewer && ready ? (
            <Button size="sm" variant="secondary" onClick={() => openAuth('signin')}>
              Sign in
            </Button>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/** The top-bar bell: visible from sm up (TabBar owns Notifications at sm). */
function NotificationBell({ count }: { count: number }) {
  return (
    <NavLink
      to="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
      title="Notifications"
      className={({ isActive }) =>
        cx(
          'relative grid size-8 place-items-center rounded-md no-underline transition-colors duration-120 hover:bg-subtle hover:text-ink max-sm:hidden',
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
