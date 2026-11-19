import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  followKey,
  isLive,
  isProductFamily,
  logoSrc,
  useBoards,
  useFollowedScopes,
  useHubs,
  useIsPlatformAdmin,
  type Board,
  type Hub,
} from '../api';
import { cx } from '../lib/cx';
import { MQ, useMediaQuery } from '../lib/useMediaQuery';
import { useShortcut } from '../lib/useShortcut';
import { useViewer } from '../lib/viewer';
import { BoardAvatar, HubAvatar, Icon, Tooltip, type IconName } from '../ui';

const NAV_KEY = 'publisense:nav-collapsed';
const FOLLOWED_RAIL_LIMIT = 8;

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Left navigation rail seated beneath the global TopBar. Every row shares one
 * 40px icon column (aligned directly under the BrandSymbol in TopBar), so
 * collapsing only hides labels: icons never move.
 * 248px wide; 64px when collapsed by the user ("[") or below xl (1336px), so it
 * gives up its width before the right rail (hidden below lg) or the feed do.
 * Hidden at sm, where the TabBar takes over.
 */
export function NavRail() {
  const { pathname } = useLocation();
  const { viewer } = useViewer();
  const belowXl = useMediaQuery(MQ.xl);
  const [manual, setManual] = useState<boolean>(readCollapsed);
  const collapsed = manual || belowXl;
  const staff = useIsPlatformAdmin(viewer?.id ?? null).data ?? false;
  const isCategories = pathname === '/categories' || pathname.startsWith('/c/');

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
  useShortcut('[', toggle, { enabled: !belowXl });

  return (
    <aside
      aria-label="Main navigation"
      data-collapsed={collapsed || undefined}
      className={cx(
        'group sticky top-9 z-20 flex h-nav-height shrink-0 flex-col border-r border-line bg-transparent px-3 pt-3 pb-3 select-none',
        'transition-all duration-180 ease-out max-sm:hidden',
        collapsed ? 'w-nav-collapsed' : 'w-nav',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <nav aria-label="Primary" className="mb-3 flex flex-col gap-1">
          <NavRow to="/" icon="home" label="Home" collapsed={collapsed} end />
          <NavRow to="/feed" icon="feed" label="Feed" collapsed={collapsed} />
          <NavRow to="/categories" icon="hub" label="Categories" collapsed={collapsed} active={isCategories} />
        </nav>

        {viewer ? <FollowedProducts viewerId={viewer.id} collapsed={collapsed} /> : null}

        {staff ? <AdminSections collapsed={collapsed} /> : null}
      </div>

      {/* Placed after primary links in the DOM so keyboard users reach Home, Feed, and
          Categories before the sidebar toggle (#141). */}
      {!belowXl ? (
        <div className="border-t border-line pt-2">
          {collapsed ? (
            <Tooltip content="Expand sidebar" kbd="[" side="right" delay={0}>
              <button
                type="button"
                onClick={toggle}
                aria-label="Expand sidebar"
                aria-expanded={false}
                aria-keyshortcuts="["
                className="flex h-row w-full items-center overflow-hidden rounded-md border-0 bg-transparent text-left text-sm font-medium text-ink-muted transition-colors duration-120 hover:bg-subtle hover:text-ink focus-visible:opacity-100"
              >
                <span className="grid h-row w-gutter shrink-0 place-items-center">
                  <Icon name="sidebar" size={18} strokeWidth={1.75} />
                </span>
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              aria-expanded={true}
              aria-keyshortcuts="["
              title="Collapse sidebar  ["
              className="flex h-row w-full items-center overflow-hidden rounded-md border-0 bg-transparent text-left text-sm font-medium text-ink-muted transition-colors duration-120 hover:bg-subtle hover:text-ink focus-visible:opacity-100"
            >
              <span className="grid h-row w-gutter shrink-0 place-items-center">
                <Icon name="sidebar" size={18} strokeWidth={1.75} />
              </span>
              <Label collapsed={collapsed}>Collapse</Label>
              <span className="pr-3 font-mono text-xs text-ink-muted">[</span>
            </button>
          )}
        </div>
      ) : null}
    </aside>
  );
}

type FollowedEntry = { kind: 'board'; board: Board } | { kind: 'hub'; hub: Hub };

function FollowedProducts({ viewerId, collapsed }: { viewerId: string; collapsed: boolean }) {
  const boards = useBoards();
  const hubs = useHubs();
  const followed = useFollowedScopes(viewerId).data;

  const items = useMemo<FollowedEntry[]>(() => {
    if (!followed || followed.size === 0) return [];
    const followedBoards: FollowedEntry[] = (boards.data ?? [])
      .filter((b) => isLive(b) && followed.has(followKey('board', b.id)))
      .slice()
      .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((board) => ({ kind: 'board', board }));
    const followedHubs: FollowedEntry[] = (hubs.data ?? [])
      .filter((h) => isProductFamily(h.boards.length) && followed.has(followKey('hub', h.id)))
      .slice()
      .sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((hub) => ({ kind: 'hub', hub }));
    return [...followedBoards, ...followedHubs].slice(0, FOLLOWED_RAIL_LIMIT);
  }, [boards.data, hubs.data, followed]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Your products" className="mb-3 flex flex-col gap-1 border-t border-line pt-3">
      {collapsed ? null : <div className="px-3 pb-1 text-xs font-semibold text-ink-muted uppercase">Your products</div>}
      {items.map((item) => {
        const to = item.kind === 'board' ? `/b/${item.board.slug}` : `/h/${item.hub.slug}`;
        const label = item.kind === 'board' ? item.board.name : `${item.hub.name} hub`;
        return (
          <Tooltip key={`${item.kind}:${item.kind === 'board' ? item.board.id : item.hub.id}`} content={label} side="right" disabled={!collapsed} delay={0}>
            <NavLink
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                cx(
                  'relative flex h-row w-full items-center overflow-hidden rounded-md text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120',
                  isActive ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-secondary hover:bg-subtle hover:text-ink',
                )
              }
            >
              <span className="relative grid h-row w-gutter shrink-0 place-items-center">
                {item.kind === 'board' ? (
                  <BoardAvatar name={item.board.name} color={item.board.color} logoSrc={logoSrc(item.board)} size="xs" decorative />
                ) : (
                  <HubAvatar
                    name={`${item.hub.name} hub`}
                    size="xs"
                    boards={item.hub.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))}
                    reserve
                  />
                )}
              </span>
              <Label collapsed={collapsed}>{label}</Label>
            </NavLink>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/**
 * Staff only: the /admin sections as rows under the primary links, so they are one
 * click from anywhere. On phones (no rail) the pills at the top of /admin stay.
 */
const ADMIN_SECTIONS: Array<{ to: string; icon: IconName; label: string; end?: boolean }> = [
  { to: '/admin', icon: 'gauge', label: 'Overview', end: true },
  { to: '/admin/products', icon: 'box', label: 'New products' },
  { to: '/admin/companies', icon: 'building', label: 'Companies' },
  { to: '/admin/reports', icon: 'flag', label: 'Reports' },
  { to: '/admin/disputes', icon: 'scale', label: 'Ownership disputes' },
  { to: '/admin/team', icon: 'users', label: 'Admin team' },
];

function AdminSections({ collapsed }: { collapsed: boolean }) {
  return (
    <nav aria-label="Admin" className="mb-3 flex flex-col gap-1 border-t border-line pt-3">
      {collapsed ? null : <div className="px-3 pb-1 text-xs font-semibold text-ink-muted uppercase">Admin</div>}
      {ADMIN_SECTIONS.map((s) => (
        <NavRow key={s.to} to={s.to} icon={s.icon} label={s.label} collapsed={collapsed} end={s.end} />
      ))}
    </nav>
  );
}

function Label({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span className={cx('min-w-0 flex-1 truncate transition-opacity duration-120', collapsed && 'pointer-events-none opacity-0')}>
      {children}
    </span>
  );
}

function NavRow({
  to,
  icon,
  label,
  collapsed,
  end,
  count = 0,
  active,
  muted,
  tipSuffix,
  onClick,
}: {
  to: string;
  icon: IconName;
  label: string;
  collapsed: boolean;
  end?: boolean;
  count?: number;
  active?: boolean;
  muted?: boolean;
  tipSuffix?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const tip = count > 0 ? `${label} · ${count} new` : tipSuffix ? `${label} · ${tipSuffix}` : label;
  return (
    // Collapsed, this tip is the row's only visible label, so it opens with no delay; the
    // accessible name is explicit at every width rather than relying on the hidden text.
    <Tooltip content={tip} side="right" disabled={!collapsed} delay={0}>
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        aria-label={count > 0 ? `${label}, ${count} new` : label}
        className={({ isActive }) => {
          const isRowActive = active !== undefined ? active : isActive;
          return cx(
            'relative flex h-row w-full items-center overflow-hidden rounded-md text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120',
            isRowActive
              ? 'bg-brand-soft font-semibold text-brand'
              : muted
                ? 'text-ink-muted hover:bg-subtle hover:text-ink'
                : 'text-ink-secondary hover:bg-subtle hover:text-ink',
          );
        }}
      >
        <span className="relative grid h-row w-gutter shrink-0 place-items-center">
          <Icon name={icon} size={18} strokeWidth={1.75} />
          {count > 0 && collapsed ? <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-pill bg-brand ring-2 ring-page" /> : null}
        </span>
        <Label collapsed={collapsed}>{label}</Label>
        {count > 0 && !collapsed ? (
          <span
            aria-hidden="true"
            className="mr-2 min-w-5 rounded-pill bg-brand px-2 text-center font-mono text-xs leading-4 font-semibold text-on-brand tabular-nums"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </NavLink>
    </Tooltip>
  );
}
