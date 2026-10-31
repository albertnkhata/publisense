import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  compactCount,
  logoSrc,
  plural,
  shortAge,
  useIsFollowing,
  useScopeFollow,
  type Board,
  type FollowTarget,
  type Hub,
  type PostSummary,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { useRequireAuth } from '../shell/auth';
import { BoardAvatar, HubAvatar, Icon, Menu, MenuItemRadio, MenuLabel, TYPE_META, useToast } from '../ui';

/*
 * Pieces shared by the board, hub, Explore and search screens: the follow
 * button, filter menus, board and hub rows and cards, and compact post rows.
 */

// ------------------------------------------------------------------ follow

export function FollowScopeButton({
  target,
  id,
  name,
  boardCount,
  size = 'md',
  className,
}: {
  target: FollowTarget;
  id: string;
  name: string;
  /** For the hub toast: "all 3 boards, plus any added later". */
  boardCount?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const on = useIsFollowing(viewer?.id ?? null, target, id);
  const follow = useScopeFollow(viewer?.id ?? null);
  const idle = target === 'hub' ? 'Follow hub' : 'Follow';
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${on ? 'Following' : 'Follow'} ${name}${target === 'hub' ? ' hub' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!requireAuth(target === 'hub' ? 'follow hubs' : 'follow boards')) return;
        const next = !on;
        follow.mutate(
          { target, id, on: next },
          {
            onSuccess: () =>
              toast(
                target === 'hub'
                  ? next
                    ? `Following the ${name} hub · all ${plural(boardCount ?? 0, 'board')}, plus any added later`
                    : `Unfollowed the ${name} hub`
                  : next
                    ? `Following ${name}`
                    : `Unfollowed ${name}`,
              ),
            onError: (err) => toast(err instanceof Error ? err.message : 'Something went wrong. Try again.'),
          },
        );
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-semibold whitespace-nowrap transition-colors duration-120 hover:bg-subtle',
        size === 'sm' ? 'h-7 px-3 text-sm' : 'h-8 px-4 text-base',
        on ? 'border-line bg-subtle font-medium text-ink-secondary' : 'border-line-strong bg-card text-ink',
        className,
      )}
    >
      {on ? 'Following' : idle}
    </button>
  );
}

// ------------------------------------------------------------------ filter menus

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** A small dropdown (type, status, sort) in the mockup's filter bar. `set` highlights a non-default choice. */
export function ChoiceMenu<T extends string>({
  label,
  value,
  choices,
  onChange,
  align = 'start',
  set,
  heading,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (v: T) => void;
  align?: 'start' | 'end';
  set?: boolean;
  heading?: string;
}) {
  const current = choices.find((c) => c.value === value) ?? choices[0];
  return (
    <Menu
      align={align}
      label={label}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={`${label}: ${current?.label ?? ''}`}
          className={cx(
            'inline-flex items-center gap-1 rounded-sm border-0 py-1 pr-1 pl-2 text-sm font-semibold hover:bg-subtle hover:text-ink aria-expanded:bg-subtle',
            set ? 'bg-subtle text-ink' : 'bg-transparent text-ink-secondary',
          )}
        >
          {current?.label}
          <Icon name="chevron-down" size={14} />
        </button>
      )}
    >
      {heading ? <MenuLabel>{heading}</MenuLabel> : null}
      {choices.map((c) => (
        <MenuItemRadio key={c.value} checked={c.value === value} description={c.hint} onSelect={() => onChange(c.value)}>
          {c.label}
        </MenuItemRadio>
      ))}
    </Menu>
  );
}

// ------------------------------------------------------------------ rows and cards

/** The upvote count box used in roadmap items and compact rows (not a button). */
/** Upvotes on a compact row. Left out at zero (#156): an empty counter is not the row's lead. */
export function VoteCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${count === 1 ? 'upvote' : 'upvotes'}`}
      className="inline-flex min-w-8 shrink-0 flex-col items-center rounded-sm border border-line px-1 py-1 font-mono text-xs font-semibold text-ink-secondary"
    >
      <Icon name="arrow-up" size={12} />
      {count}
    </span>
  );
}

export const rowLink =
  'flex w-full items-center gap-3 border-0 bg-transparent px-1 py-3 text-left text-ink no-underline transition-colors duration-120 hover:text-brand';

/** A list wrapped in the mockup's bordered card (ex-list). */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 list-none rounded-md border border-line bg-card px-3 py-1">
      {children}
    </ul>
  );
}

export function RowItem({ children }: { children: ReactNode }) {
  return <li className="border-t border-line first:border-t-0">{children}</li>;
}

/** Board as a row: tile, name, tagline and follower count. */
export function BoardRow({ board, extra }: { board: Board; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Link to={`/b/${board.slug}`} className={cx(rowLink, 'min-w-0 flex-1')}>
        <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="md" decorative />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold">{board.name}</span>
          <span className="truncate text-sm text-ink-muted">
            {[board.tagline, board.follower_count > 0 ? plural(board.follower_count, 'follower') : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
      {extra}
    </div>
  );
}

/** Hub as a row: stacked tiles, "{name} hub", its boards and followers. */
export function HubRow({ hub }: { hub: Hub }) {
  return (
    <Link to={`/h/${hub.slug}`} className={rowLink}>
      <HubAvatar
        name={`${hub.name} hub`}
        size="md"
        boards={hub.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))}
        reserve
        className="min-w-10"
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold">{hub.name} hub</span>
        <span className="truncate text-sm text-ink-muted">
          {hub.boards.map((b) => b.name).join(', ')}
          {hub.follower_count > 0 ? ` · ${compactCount(hub.follower_count)} ${hub.follower_count === 1 ? 'follower' : 'followers'}` : ''}
        </span>
      </span>
    </Link>
  );
}

/** A post as a compact row: board tile, title, board · type · age, upvotes. */
export function PostRow({ post }: { post: PostSummary }) {
  const b = post.board;
  return (
    <Link to={`/post/${post.id}`} className={rowLink}>
      <BoardAvatar name={b?.name ?? '?'} color={b?.color} logoSrc={logoSrc(b)} size="sm" decorative />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold">{post.title}</span>
        <span className="text-sm text-ink-muted">
          {b?.name ?? 'Unknown board'} · {TYPE_META[post.type].label} · {shortAge(post.created_at)}
        </span>
      </span>
      <VoteCount count={post.vote_count} />
    </Link>
  );
}

/**
 * Explore's board card: tile, name, tagline, Follow, and stats. Post and
 * follower counts show only above zero (#156); a board with neither shows when
 * it was added instead, so the card never leads with "0 posts · 0 followers".
 */
export function BoardCard({ board, now = new Date() }: { board: Board; now?: Date }) {
  const addedDays = Math.floor((now.getTime() - new Date(board.created_at).getTime()) / 86400_000);
  const quiet = board.post_count <= 0 && board.follower_count <= 0;
  const age = shortAge(board.created_at, now);
  const added =
    addedDays >= 0 && addedDays <= 7
      ? `Added ${addedDays === 0 ? 'today' : `${addedDays}d ago`}`
      : quiet
        ? `Added ${/^\d+w$/.test(age) ? `${age} ago` : age}`
        : null;
  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-md border border-line bg-card p-4 transition-colors duration-120 hover:border-line-strong">
      <div className="flex min-w-0 items-center gap-3">
        <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="xl" decorative />
        <span className="flex min-w-0 flex-1 flex-col">
          <Link
            to={`/b/${board.slug}`}
            className="truncate text-md font-semibold text-ink no-underline after:absolute after:inset-0"
          >
            {board.name}
          </Link>
          <span className="truncate text-sm text-ink-muted">{board.tagline}</span>
        </span>
        <FollowScopeButton target="board" id={board.id} name={board.name} size="sm" className="relative z-1" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
        {board.post_count > 0 ? (
          <span>
            <b className="font-semibold text-ink">{compactCount(board.post_count)}</b> {board.post_count === 1 ? 'post' : 'posts'}
          </span>
        ) : null}
        {board.follower_count > 0 ? (
          <span>
            <b className="font-semibold text-ink">{compactCount(board.follower_count)}</b> {board.follower_count === 1 ? 'follower' : 'followers'}
          </span>
        ) : null}
        {board.claimed_at ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-success">
              <Icon name="check" size={12} strokeWidth={2.2} />
            </span>
            Verified team
          </span>
        ) : null}
        {added ? <span>{added}</span> : null}
      </div>
    </article>
  );
}

/** Section with the mockup's heading row (title left, note right). */
export function Section({ title, note, children, id }: { title: string; note?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="m-0 text-md font-semibold text-ink">
          {title}
        </h2>
        {note ? <span className="text-sm text-ink-muted">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function CardGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-md:grid-cols-1">
      {children}
    </ul>
  );
}

export function BackLink({
  to = '/',
  children = 'Back',
  smart = to === '/',
  fallbackLabel = to === '/' ? 'Home' : undefined,
  onClick,
  className,
}: {
  to?: string;
  children?: ReactNode;
  /** When true (default when `to` is '/'), uses browser history if available; otherwise falls back to `to`. */
  smart?: boolean;
  /**
   * What a smart link says when there is no history to go back to, so it names where it
   * actually goes (Home, or the board's company) instead of "Back". Defaults to Home for '/'.
   */
  fallbackLabel?: string;
  onClick?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const canGoBack = smart && typeof window !== 'undefined' && Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const named = smart && !canGoBack && fallbackLabel ? fallbackLabel : null;
  return (
    <Link
      to={to}
      aria-label={named ? `Back to ${named}` : undefined}
      onClick={(e) => {
        onClick?.();
        if (canGoBack) {
          e.preventDefault();
          void navigate(-1);
        }
      }}
      className={cx('inline-flex items-center gap-2 self-start text-sm font-medium text-ink-muted no-underline hover:text-ink', className)}
    >
      <Icon name="arrow-left" size={14} />
      {named ?? children}
    </Link>
  );
}
