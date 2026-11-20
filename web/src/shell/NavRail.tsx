import { useCallback, useEffect, useMemo, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  followKey,
  isLive,
  isProductFamily,
  logoSrc,
  summarizeCategories,
  useBoards,
  useFollowedScopes,
  useHubs,
  useIsPlatformAdmin,
  type Board,
  type Hub,
} from '../api';
import { cx } from '../lib/cx';
import { MQ, useMediaQuery } from '../lib/useMediaQuery';
import { useViewer } from '../lib/viewer';
import { BoardAvatar, HubAvatar, Icon, Tooltip, type IconName } from '../ui';

const NAV_KEY = 'publisense:nav-collapsed';
const FOLLOWED_RAIL_LIMIT = 8;
const TOPIC_RAIL_LIMIT = 6;
const navListeners = new Set<() => void>();
let drawerOpenState = false;

function notifyNav(): void {
  for (const fn of navListeners) fn();
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeNav(onStoreChange: () => void): () => void {
  navListeners.add(onStoreChange);
  return () => navListeners.delete(onStoreChange);
}

export function useNavCollapsed() {
  const belowXl = useMediaQuery(MQ.xl);
  const manual = useSyncExternalStore(subscribeNav, readCollapsed, () => false);
  const drawerOpen = useSyncExternalStore(subscribeNav, () => drawerOpenState, () => false);

  const collapsed = belowXl ? !drawerOpen : manual;
  const overlay = belowXl && drawerOpen;

  const closeOverlay = useCallback(() => {
    if (!drawerOpenState) return;
    drawerOpenState = false;
    notifyNav();
  }, []);

  const toggle = useCallback(() => {
    if (belowXl) {
      drawerOpenState = !drawerOpenState;
      notifyNav();
      return;
    }
    try {
      const next = !readCollapsed();
      window.localStorage.setItem(NAV_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    notifyNav();
  }, [belowXl]);

  return { collapsed, belowXl, overlay, toggle, closeOverlay };
}

/**
 * Left navigation rail seated beneath the global TopBar. Every row shares one
 * 40px icon column (aligned directly under the sidebar toggle in TopBar), so
 * collapsing only hides labels: icons never move.
 * 240px wide at xl+ (1280px+); defaults to 64px below xl and expands as a
 * left-edge overlay drawer when toggled so the main column never squishes.
 * Hidden at sm, where the TabBar takes over.
 */
export function NavRail() {
  const { pathname } = useLocation();
  const { viewer } = useViewer();
  const { collapsed, belowXl, overlay, closeOverlay } = useNavCollapsed();
  const staff = useIsPlatformAdmin(viewer?.id ?? null).data ?? false;
  const isCategories = collapsed ? pathname === '/categories' || pathname.startsWith('/c/') : pathname === '/categories';

  // Close the below-xl overlay drawer whenever the user navigates or presses Escape.
  useEffect(() => {
    closeOverlay();
  }, [pathname, closeOverlay]);

  useEffect(() => {
    if (!overlay) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay, closeOverlay]);

  return (
    <>
      {belowXl ? (
        /* Permanently reserve the 64px rail slot below xl so expanding/collapsing the fixed drawer never causes body reflow or jitter. */
        <div aria-hidden="true" className="w-nav-collapsed shrink-0 max-sm:hidden" />
      ) : null}
      {overlay ? (
        <div
          aria-hidden="true"
          onClick={closeOverlay}
          className="fixed inset-x-0 top-9 bottom-0 z-20 animate-fade-in bg-overlay max-sm:hidden"
        />
      ) : null}
      <aside
        aria-label="Main navigation"
        data-collapsed={collapsed || undefined}
        data-overlay={overlay || undefined}
        className={cx(
          'group flex h-nav-height shrink-0 flex-col border-r border-line px-3 pt-3 pb-3 select-none',
          'transition-all duration-180 ease-out max-sm:hidden',
          belowXl
            ? cx('fixed top-9 left-0 z-30 bg-page', overlay ? 'w-nav shadow-overlay' : 'w-nav-collapsed')
            : cx('sticky top-9 z-20 bg-transparent', collapsed ? 'w-nav-collapsed' : 'w-nav'),
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-none">
          <nav aria-label="Primary" className="mb-3 flex flex-col gap-1">
            <NavRow to="/" icon="home" label="Home" collapsed={collapsed} end />
            <NavRow to="/feed" icon="feed" label="Feed" collapsed={collapsed} />
            <NavRow to="/categories" icon="hub" label="Categories" collapsed={collapsed} active={isCategories} />
          </nav>

          {viewer ? <FollowedProducts viewerId={viewer.id} collapsed={collapsed} /> : null}

          <RailTopics collapsed={collapsed} />

          {staff ? <AdminSections collapsed={collapsed} /> : null}
        </div>
      </aside>
    </>
  );
}

type FollowedEntry = { kind: 'board'; board: Board } | { kind: 'hub'; hub: Hub };

function FollowedProducts({ viewerId, collapsed }: { viewerId: string; collapsed: boolean }) {
  const boards = useBoards();
  const hubs = useHubs();
  const followed = useFollowedScopes(viewerId).data;

  const items = useMemo<FollowedEntry[]>(() => {
    if (!followed || followed.size === 0) return [];
    const liveBoards = (boards.data ?? []).filter(isLive);
    const followedBoards: FollowedEntry[] = liveBoards
      .filter((b) => followed.has(followKey('board', b.id)))
      .sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((board) => ({ kind: 'board', board }));
    const followedHubs: FollowedEntry[] = (hubs.data ?? [])
      .filter((h) => isProductFamily(h.boards.length) && followed.has(followKey('hub', h.id)))
      .slice()
      .sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
      .map((hub) => ({ kind: 'hub', hub }));
    return [...followedBoards, ...followedHubs].slice(0, FOLLOWED_RAIL_LIMIT);
  }, [boards.data, hubs.data, followed]);

  if (collapsed || items.length === 0) return null;

  return (
    <nav aria-label="Your products" className="mb-3 flex flex-col gap-1 border-t border-line pt-3">
      <div className="px-3 pb-1 text-xs font-semibold text-ink-muted uppercase">Your products</div>
      {items.map((item) => {
        const to = item.kind === 'board' ? `/b/${item.board.slug}` : `/h/${item.hub.slug}`;
        const label = item.kind === 'board' ? item.board.name : `${item.hub.name} hub`;
        return (
          <NavLink
            key={`${item.kind}:${item.kind === 'board' ? item.board.id : item.hub.id}`}
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
                  max={2}
                  boards={item.hub.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))}
                />
              )}
            </span>
            <Label collapsed={false}>{label}</Label>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Populated categories as direct topic jumps in the expanded rail (never duplicates RightRail's Trending products). */
function RailTopics({ collapsed }: { collapsed: boolean }) {
  const boards = useBoards();
  const topics = useMemo(() => summarizeCategories(boards.data ?? []).slice(0, TOPIC_RAIL_LIMIT), [boards.data]);

  if (collapsed || topics.length === 0) return null;

  return (
    <nav aria-label="Topics" className="mb-3 flex flex-col gap-1 border-t border-line pt-3">
      <div className="px-3 pb-1 text-xs font-semibold text-ink-muted uppercase">Topics</div>
      {topics.map((t) => (
        <NavLink
          key={t.category}
          to={`/c/${t.category}`}
          className={({ isActive }) =>
            cx(
              'flex h-row w-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap no-underline transition-colors duration-120',
              isActive ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-secondary hover:bg-subtle hover:text-ink',
            )
          }
        >
          <span className="min-w-0 flex-1 truncate">{t.label}</span>
        </NavLink>
      ))}
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
