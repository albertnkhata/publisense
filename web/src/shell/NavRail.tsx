import { useCallback, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { MQ, useMediaQuery } from '../lib/useMediaQuery';
import { useShortcut } from '../lib/useShortcut';
import { useViewer } from '../lib/viewer';
import { Button, Icon, Tooltip, type IconName } from '../ui';
import { BrandSymbol } from './BrandMark';
import { useComposer } from './composer';
import { UserMenu } from './UserMenu';

const NAV_KEY = 'publisense:nav-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Left navigation rail (mockup "vertical-nav"). Every row shares one 40px
 * icon column, so collapsing only hides labels: icons never move.
 * 248px wide; 64px when collapsed by the user ("[") or below lg (1060px).
 * Hidden at sm, where the TabBar takes over.
 */
export function NavRail() {
  const { viewer } = useViewer();
  const { openComposer } = useComposer();
  const belowLg = useMediaQuery(MQ.lg);
  const [manual, setManual] = useState<boolean>(readCollapsed);
  const collapsed = manual || belowLg;

  const toggle = useCallback(() => {
    setManual((c) => {
      try {
        window.localStorage.setItem(NAV_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);
  useShortcut('[', toggle, { enabled: !belowLg });
  useShortcut('c', openComposer, { enabled: Boolean(viewer) });

  return (
    <aside
      aria-label="Main navigation"
      data-collapsed={collapsed || undefined}
      className={cx(
        'group sticky top-0 z-30 flex h-dvh shrink-0 flex-col border-r border-line bg-card px-3 pt-4 pb-3 select-none',
        'transition-all duration-180 ease-out max-sm:hidden',
        collapsed ? 'w-nav-collapsed' : 'w-nav',
      )}
    >
      <div className="relative mb-5">
        {collapsed && !belowLg ? (
          <Tooltip content="Expand sidebar" kbd="[" side="right">
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className="group/brand flex h-8 w-full items-center rounded-md border-0 bg-transparent text-ink hover:bg-subtle"
            >
              <span className="relative grid h-8 w-gutter place-items-center">
                <BrandSymbol className="group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0" />
                <span className="absolute inset-0 hidden place-items-center text-ink-secondary group-hover/brand:grid group-focus-visible/brand:grid">
                  <Icon name="sidebar" size={18} strokeWidth={1.75} />
                </span>
              </span>
            </button>
          </Tooltip>
        ) : (
          <Link to="/" aria-label="Publisense home" className="flex h-8 items-center rounded-md text-ink no-underline">
            <span className="grid h-8 w-gutter shrink-0 place-items-center">
              <BrandSymbol />
            </span>
            <span className={cx('text-lg font-bold transition-opacity duration-120', collapsed && 'opacity-0')}>Publisense</span>
          </Link>
        )}
        {!collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            aria-expanded={true}
            title="Collapse sidebar  ["
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-ink-muted opacity-0 transition-opacity duration-120 group-hover:opacity-100 hover:bg-subtle hover:text-ink focus-visible:opacity-100"
          >
            <Icon name="sidebar" size={17} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="mb-4 flex flex-col gap-1">
        <NavRow to="/" icon="home" label="Home" collapsed={collapsed} end />
        <NavRow to="/explore" icon="explore" label="Explore" collapsed={collapsed} />
        {viewer ? <NavRow to="/notifications" icon="bell" label="Notifications" collapsed={collapsed} /> : null}
      </nav>

      {viewer ? (
        <Tooltip content="Post feedback" kbd="C" side="right" disabled={!collapsed}>
          <button
            type="button"
            onClick={openComposer}
            className="flex h-row w-full items-center overflow-hidden rounded-md border-0 bg-brand text-left text-sm font-semibold whitespace-nowrap text-on-brand transition-colors duration-120 hover:bg-brand-hover"
          >
            <span className="grid h-row w-gutter shrink-0 place-items-center">
              <Icon name="plus" size={18} strokeWidth={1.75} />
            </span>
            <Label collapsed={collapsed}>Post feedback</Label>
            <span className={cx('pr-3 font-mono text-xs opacity-70 transition-opacity duration-120', collapsed && 'opacity-0')}>C</span>
          </button>
        </Tooltip>
      ) : null}

      <div className="flex-1" />

      {viewer ? (
        <UserMenu viewer={viewer} collapsed={collapsed} />
      ) : (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {/* Sign-in arrives in step 4 (AuthDialog). Disabled rather than faked. */}
          <Tooltip content="Sign in" side="right" disabled={!collapsed}>
            <button
              type="button"
              disabled
              className="flex h-row w-full items-center overflow-hidden rounded-md border-0 bg-transparent text-left text-sm font-medium text-ink-secondary disabled:opacity-45"
            >
              <span className="grid h-row w-gutter shrink-0 place-items-center">
                <Icon name="sign-in" size={18} strokeWidth={1.75} />
              </span>
              <Label collapsed={collapsed}>Sign in</Label>
            </button>
          </Tooltip>
          {!collapsed ? (
            <Button block disabled>
              Create account
            </Button>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function Label({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span className={cx('min-w-0 flex-1 truncate transition-opacity duration-120', collapsed && 'pointer-events-none opacity-0')}>
      {children}
    </span>
  );
}

function NavRow({ to, icon, label, collapsed, end }: { to: string; icon: IconName; label: string; collapsed: boolean; end?: boolean }) {
  return (
    <Tooltip content={label} side="right" disabled={!collapsed}>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cx(
            'relative flex h-row w-full items-center overflow-hidden rounded-md text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120',
            isActive
              ? 'bg-brand-soft font-semibold text-brand before:absolute before:top-2 before:bottom-2 before:left-0 before:w-1 before:rounded-r-sm before:bg-brand'
              : 'text-ink-secondary hover:bg-subtle hover:text-ink',
          )
        }
      >
        <span className="grid h-row w-gutter shrink-0 place-items-center">
          <Icon name={icon} size={18} strokeWidth={1.75} />
        </span>
        <Label collapsed={collapsed}>{label}</Label>
      </NavLink>
    </Tooltip>
  );
}
