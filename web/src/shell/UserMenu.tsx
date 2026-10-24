import { useTheme } from '../lib/ThemeProvider';
import { MQ, useMediaQuery } from '../lib/useMediaQuery';
import type { Viewer } from '../lib/viewer';
import { cx } from '../lib/cx';
import { Icon, Menu, MenuItem, MenuSeparator, UserAvatar } from '../ui';

/**
 * The avatar menu at the foot of the nav rail. Holds the theme toggle.
 * Sign out is disabled until auth exists (step 4).
 */
export function UserMenu({ viewer, collapsed }: { viewer: Viewer; collapsed: boolean }) {
  const { theme, pref, toggle, setPref } = useTheme();
  const belowLg = useMediaQuery(MQ.lg);
  return (
    <Menu
      side="top"
      align="start"
      label="Account"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Account menu for ${viewer.name}`}
          className="flex h-row w-full items-center overflow-hidden rounded-md border-0 bg-transparent text-left text-ink-secondary transition-colors duration-120 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle"
        >
          <span className="grid h-row w-gutter shrink-0 place-items-center">
            <UserAvatar size="md" src={viewer.avatarUrl ?? null} />
          </span>
          <span className={cx('flex min-w-0 flex-1 flex-col gap-1 leading-none transition-opacity duration-120', collapsed && 'opacity-0')}>
            <b className="truncate text-sm font-semibold text-ink">{viewer.name}</b>
            <small className="truncate text-xs text-ink-muted">@{viewer.handle}</small>
          </span>
          <span className={cx('grid place-items-center pr-2 text-ink-muted', collapsed && 'opacity-0')}>
            <Icon name="chevrons-up-down" size={14} />
          </span>
        </button>
      )}
    >
      <MenuItem icon="user" to={`/u/${viewer.handle}`}>
        Profile
      </MenuItem>
      <MenuItem icon="settings" to="/settings">
        Settings
      </MenuItem>
      <MenuItem icon={theme === 'dark' ? 'sun' : 'moon'} kbd="⌃D" onSelect={toggle}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </MenuItem>
      {pref !== 'system' ? (
        <MenuItem icon="settings" onSelect={() => setPref('system')} description="Follow your device setting">
          Use system theme
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem icon="sign-out" danger disabled description="Available once sign-in exists">
        Sign out
      </MenuItem>
      {belowLg ? (
        <>
          <MenuSeparator />
          <MenuItem to="/terms">Terms</MenuItem>
          <MenuItem to="/privacy">Privacy</MenuItem>
        </>
      ) : null}
    </Menu>
  );
}
