import { useIsPlatformAdmin } from '../api';
import { useTheme } from '../lib/ThemeProvider';
import { useViewer, type Viewer } from '../lib/viewer';
import { cx } from '../lib/cx';
import { Icon, Menu, MenuItem, MenuSeparator, Tooltip, UserAvatar, useToast } from '../ui';

/**
 * Account menu rendered either at the foot of the workspace NavRail or as a
 * compact avatar trigger in the browsing TopBar.
 */
export function UserMenu({
  viewer,
  collapsed = false,
  placement = 'rail',
}: {
  viewer: Viewer;
  collapsed?: boolean;
  placement?: 'rail' | 'topbar';
}) {
  const { theme, pref, toggle, setPref } = useTheme();
  const { signOut } = useViewer();
  const { toast } = useToast();
  const staff = useIsPlatformAdmin(viewer.id).data ?? false;
  const topbar = placement === 'topbar';
  return (
    <Menu
      side={topbar ? 'bottom' : 'top'}
      align={topbar ? 'end' : 'start'}
      label="Account"
      trigger={(props) =>
        topbar ? (
          <button
            type="button"
            {...props}
            aria-label={`Account menu for ${viewer.name}`}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent transition-colors duration-120 hover:bg-subtle aria-expanded:bg-subtle"
          >
            <UserAvatar size="sm" src={viewer.avatarUrl ?? null} />
          </button>
        ) : (
          <Tooltip content="Account menu" side="right" disabled={!collapsed} delay={0}>
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
          </Tooltip>
        )
      }
    >
      <MenuItem icon="user" to={`/u/${viewer.handle}`}>
        Profile
      </MenuItem>
      <MenuItem icon="settings" to="/settings">
        Settings
      </MenuItem>
      {staff ? (
        <MenuItem icon="shield" to="/admin" description="Command centre, new products, reports, disputes and the admin team">
          Admin
        </MenuItem>
      ) : null}
      <MenuItem icon={theme === 'dark' ? 'sun' : 'moon'} kbd="⌃D" onSelect={toggle}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </MenuItem>
      {pref !== 'system' ? (
        <MenuItem icon="settings" onSelect={() => setPref('system')} description="Follow your device setting">
          Use system theme
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem to="/about">About</MenuItem>
      <MenuItem to="/terms">Terms</MenuItem>
      <MenuItem to="/privacy">Privacy</MenuItem>
      <MenuSeparator />
      <MenuItem
        icon="sign-out"
        danger
        onSelect={async () => {
          await signOut();
          toast('Signed out');
        }}
      >
        Sign out
      </MenuItem>
    </Menu>
  );
}
