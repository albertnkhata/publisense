import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useUnreadCount } from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { Button, Icon, IconButton } from '../ui';
import { BrandSymbol } from './BrandMark';
import { SearchWell } from './SearchWell';
import { useAuthDialog } from './auth';

/**
 * Top bar below lg, where the right rail (and its search) is hidden.
 * At sm the search collapses behind an icon and expands with a Cancel.
 */
export function TopBar() {
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const [searching, setSearching] = useState(false);
  const unread = useUnreadCount(viewer?.id ?? null).data ?? 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  return (
    <header className="sticky top-0 z-20 hidden h-9 items-center gap-3 border-b border-line bg-glass px-5 backdrop-blur-md max-lg:flex max-sm:px-3">
      <Link
        to="/"
        aria-label="Publisense home"
        className={cx('hidden items-center gap-2 text-md font-bold text-ink no-underline', !searching && 'max-sm:flex')}
      >
        <BrandSymbol />
        <span>Publisense</span>
      </Link>
      <SearchWell
        ref={inputRef}
        onSubmitted={() => setSearching(false)}
        className={cx('max-w-dialog flex-1', searching ? 'max-sm:block max-sm:max-w-none' : 'max-sm:hidden')}
      />
      {searching ? (
        <button
          type="button"
          onClick={() => setSearching(false)}
          className="hidden border-0 bg-transparent px-1 text-base font-medium text-ink-secondary max-sm:block"
        >
          Cancel
        </button>
      ) : null}
      <span className={cx('ml-auto flex items-center gap-2', searching && 'max-sm:hidden')}>
        <span className="hidden max-sm:contents">
          <IconButton icon="search" label="Search" onClick={() => setSearching(true)} />
        </span>
        {viewer ? <NotificationBell count={unread} /> : null}
        {!viewer && ready ? (
          <Button size="sm" onClick={() => openAuth('signin')}>
            Sign in
          </Button>
        ) : null}
      </span>
    </header>
  );
}

/** The top-bar bell below lg (the nav rail's Notifications row has the count above it). */
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
