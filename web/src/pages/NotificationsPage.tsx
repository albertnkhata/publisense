import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  avatarSrc,
  logoSrc,
  notificationGroup,
  notificationTab,
  shortAge,
  useMarkRead,
  useNotifications,
  type AppNotification,
  type NotificationGroup,
} from '../api';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { LoadError, PostListSkeleton } from '../posts/PostList';
import { useAuthDialog } from '../shell/auth';
import { BoardAvatar, Button, EmptyState, Icon, TabPanel, Tabs, UserAvatar, STATUS_META, useToast, type IconName, type PostStatus } from '../ui';
import { FollowPersonButton } from './UserPage';

/**
 * Notifications (FOUNDATION §9 `/notifications`, mockup #notifications): All,
 * Replies and Activity tabs, grouped Today / This week / Earlier, unread marked
 * with a dot. Opening one marks it read; "Mark all as read" clears the badge.
 * The gear opens Settings, where in-app and email preferences live (step 4).
 */
type Tab = 'all' | 'replies' | 'activity';
type Badge = 'reply' | 'up' | 'follow' | 'ship' | 'status' | 'team';

const BADGE_ICON: Record<Badge, IconName> = {
  reply: 'reply',
  up: 'arrow-up',
  follow: 'user-plus',
  ship: 'check',
  status: 'status-planned',
  team: 'shield',
};

interface Described {
  text: ReactNode;
  href: string;
  badge: Badge;
  quote?: string | null;
  followBack?: boolean;
  /** Show the board instead of a person (status changes, milestones, claims). */
  boardAvatar?: { name: string; color: string | null; logo: string | null } | null;
}

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink">{children}</b>;

export function describeNotification(n: AppNotification, viewerId: string | null): Described {
  const who = n.actor ? `@${n.actor.handle}` : 'Someone';
  const title = n.post?.title ?? 'a post';
  const postHref = n.post_id ? `/post/${n.post_id}` : '/';
  const board = n.post?.board ?? null;
  const boardAv = board ? { name: board.name, color: board.color, logo: logoSrc(board) } : null;
  const d = n.data as Record<string, string | number | undefined>;
  switch (n.kind) {
    case 'reply':
      return {
        text:
          n.post?.author_id === viewerId ? (
            <>
              <B>{who}</B> replied to your post <B>{title}</B>
            </>
          ) : (
            <>
              <B>{who}</B> replied to you on <B>{title}</B>
            </>
          ),
        href: `${postHref}#replies`,
        badge: 'reply',
        quote: n.quote,
      };
    case 'mention':
      return {
        text: (
          <>
            <B>{who}</B> mentioned you in a reply on <B>{title}</B>
          </>
        ),
        href: `${postHref}#replies`,
        badge: 'reply',
        quote: n.quote,
      };
    case 'upvote_milestone':
      return {
        text: (
          <>
            Your post <B>{title}</B> reached <B>{d.votes ?? 'more'} upvotes</B>
          </>
        ),
        href: postHref,
        badge: 'up',
        boardAvatar: boardAv,
      };
    case 'status_change': {
      const to = String(d.to ?? '') as PostStatus;
      if (to === 'merged') {
        return {
          text: (
            <>
              <B>{title}</B>, a post you follow, was merged into <B>{String(d.into_title ?? 'another post')}</B>
            </>
          ),
          href: d.into ? `/post/${String(d.into)}` : postHref,
          badge: 'status',
          boardAvatar: boardAv,
        };
      }
      if (to === 'shipped') {
        return {
          text: (
            <>
              <B>{title}</B>, a post you follow, is marked <B>Shipped</B>
              {board ? <> by the {board.name} team</> : null}
            </>
          ),
          href: postHref,
          badge: 'ship',
          boardAvatar: boardAv,
        };
      }
      const label = STATUS_META[to]?.label;
      return {
        text:
          to === 'open' || !label ? (
            <>
              The <B>{board?.name ?? 'board'}</B> team cleared the status on <B>{title}</B>
            </>
          ) : (
            <>
              The <B>{board?.name ?? 'board'}</B> team marked <B>{title}</B> as <B>{label}</B>
            </>
          ),
        href: postHref,
        badge: 'status',
        boardAvatar: boardAv,
      };
    }
    case 'followed_post':
      return {
        text: (
          <>
            New activity on <B>{title}</B>, a post you follow
          </>
        ),
        href: postHref,
        badge: 'reply',
      };
    case 'follow':
      return {
        text: (
          <>
            <B>{who}</B> started following you
          </>
        ),
        href: n.actor ? `/u/${n.actor.handle}` : '/',
        badge: 'follow',
        followBack: Boolean(n.actor),
      };
    case 'claim': {
      const scope = d.scope === 'hub' ? 'hub' : 'board';
      const name = String(d.name ?? n.scope?.name ?? 'the board');
      const slug = String(d.slug ?? n.scope?.slug ?? '');
      const href = slug ? `/${scope === 'hub' ? 'h' : 'b'}/${slug}` : '/';
      const av = { name, color: n.scope?.color ?? null, logo: null };
      if (d.dispute === 'approved') {
        return {
          text: (
            <>
              We upheld your report about <B>{name}</B>. You now manage it.
            </>
          ),
          href,
          badge: 'team',
          boardAvatar: av,
        };
      }
      if (d.dispute === 'rejected') {
        return {
          text: (
            <>
              We looked into your report about <B>{name}</B> and left its team as it is.
            </>
          ),
          href,
          badge: 'team',
          boardAvatar: av,
        };
      }
      return {
        text:
          scope === 'hub' ? (
            <>
              You’re now managing the <B>{name}</B> hub. Your replies show as verified.
            </>
          ) : (
            <>
              You’re now managing <B>{name}</B>’s board. Your replies show as verified.
            </>
          ),
        href,
        badge: 'ship',
        boardAvatar: av,
      };
    }
    case 'join': {
      const scope = n.target_type === 'hub' ? 'h' : 'b';
      const name = n.scope?.name ?? 'the';
      const home = n.scope ? `/${scope}/${n.scope.slug}` : '/';
      const status = String(d.status ?? '');
      if (status === 'pending') {
        return {
          text: (
            <>
              <B>{who}</B> asked to join the <B>{name}</B> team
            </>
          ),
          href: n.scope ? `${home}/manage?tab=team` : '/',
          badge: 'team',
        };
      }
      if (status === 'added') {
        return {
          text: (
            <>
              <B>{who}</B> added you to the <B>{name}</B> team
            </>
          ),
          href: home,
          badge: 'team',
        };
      }
      return {
        text:
          status === 'approved' ? (
            <>
              You joined the <B>{name}</B> team
            </>
          ) : (
            <>
              Your request to join the <B>{name}</B> team wasn’t approved
            </>
          ),
        href: home,
        badge: 'team',
      };
    }
    case 'product': {
      const name = String(d.name ?? n.scope?.name ?? 'Your product');
      const slug = String(d.slug ?? n.scope?.slug ?? '');
      const href = slug ? `/b/${slug}` : '/';
      const av = { name, color: n.scope?.color ?? null, logo: null };
      if (d.status === 'approved') {
        return {
          text: (
            <>
              <B>{name}</B> is live. Thanks for adding it: anyone can post on its board now.
            </>
          ),
          href,
          badge: 'ship',
          boardAvatar: av,
        };
      }
      return {
        text: (
          <>
            <B>{name}</B> wasn’t approved{d.reason ? <>: {String(d.reason)}</> : '.'}
          </>
        ),
        href,
        badge: 'status',
        boardAvatar: av,
      };
    }
    default:
      return { text: 'Something happened', href: '/', badge: 'status' };
  }
}

export function NotificationsPage() {
  usePageTitle('Notifications');
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  if (!viewer) {
    return (
      <section aria-labelledby="page-title">
        <h1 id="page-title" className="mt-0 mb-4 text-2xl font-bold text-ink">
          Notifications
        </h1>
        {ready ? (
          <div className="rounded-md border border-line bg-card">
            <EmptyState icon="bell" title="Sign in to see notifications" action={<Button onClick={() => openAuth('signin', 'see notifications')}>Sign in</Button>}>
              Replies, upvotes and new followers will show up here.
            </EmptyState>
          </div>
        ) : null}
      </section>
    );
  }
  return <NotificationList viewerId={viewer.id} />;
}

const GROUPS: NotificationGroup[] = ['Today', 'This week', 'Earlier'];

function NotificationList({ viewerId }: { viewerId: string }) {
  const { toast } = useToast();
  const list = useNotifications(viewerId);
  const markRead = useMarkRead(viewerId);
  const [tab, setTab] = useState<Tab>('all');
  const items = useMemo(() => (list.data ?? []).filter((n) => tab === 'all' || notificationTab(n.kind) === tab), [list.data, tab]);
  const unread = (t: Tab) => (list.data ?? []).filter((n) => !n.read_at && (t === 'all' || notificationTab(n.kind) === t)).length;
  const anyUnread = unread('all') > 0;

  return (
    <section aria-labelledby="page-title">
      <header className="mb-2 flex items-center gap-2">
        <h1 id="page-title" className="m-0 flex-1 text-2xl font-bold text-ink">
          Notifications
        </h1>
        <Button
          variant="ghost"
          size="sm"
          disabled={!anyUnread || markRead.isPending}
          onClick={() => markRead.mutate('all', { onSuccess: () => toast('All caught up'), onError: () => toast('Something went wrong. Try again.') })}
        >
          Mark all as read
        </Button>
        <Link
          to="/settings"
          aria-label="Notification settings"
          title="Notification settings"
          className="grid size-7 place-items-center rounded-md text-ink-secondary no-underline hover:bg-subtle hover:text-ink"
        >
          <Icon name="settings" size={16} />
        </Link>
      </header>
      <Tabs
        idBase="notifications"
        label="Notifications"
        value={tab}
        onChange={setTab}
        items={(['all', 'replies', 'activity'] as const).map((t) => {
          const c = unread(t);
          return { value: t, label: t === 'all' ? 'All' : t === 'replies' ? 'Replies' : 'Activity', ...(c ? { count: c } : {}) };
        })}
      />
      <TabPanel idBase="notifications" value={tab}>
        {list.isPending ? (
          <div className="mt-4">
            <PostListSkeleton count={2} />
          </div>
        ) : list.isError ? (
          <div className="mt-4">
            <LoadError title="We couldn’t load your notifications" onRetry={() => void list.refetch()} retrying={list.isRefetching} />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-md border border-line bg-card">
            <EmptyState icon="bell" title="You’re all caught up">
              Replies, upvotes and new followers will show up here.
            </EmptyState>
          </div>
        ) : (
          GROUPS.map((g) => {
            const inGroup = items.filter((n) => notificationGroup(n.created_at) === g);
            if (inGroup.length === 0) return null;
            return (
              <div key={g}>
                <h2 className="mt-5 mb-2 text-xs font-semibold text-ink-muted uppercase">{g}</h2>
                <ul className="m-0 list-none overflow-hidden rounded-md border border-line bg-card p-0" aria-label={g}>
                  {inGroup.map((n) => (
                    <li key={n.id} className="border-t border-line first:border-t-0">
                      <NotificationItem n={n} viewerId={viewerId} onOpen={() => (n.read_at ? undefined : markRead.mutate([n.id]))} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </TabPanel>
    </section>
  );
}

function NotificationItem({ n, viewerId, onOpen }: { n: AppNotification; viewerId: string; onOpen: () => void }) {
  const d = describeNotification(n, viewerId);
  const unread = !n.read_at;
  return (
    <div className={cx('relative flex items-start gap-3 py-3 pr-4 pl-5 transition-colors duration-120 hover:bg-subtle', unread && 'bg-brand-soft')}>
      {unread ? (
        <span aria-hidden="true" className="absolute top-6 left-2 size-2 rounded-pill bg-brand" />
      ) : null}
      <Link to={d.href} onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-ink no-underline">
        <span className="relative shrink-0">
          {d.boardAvatar ? (
            <BoardAvatar name={d.boardAvatar.name} color={d.boardAvatar.color} logoSrc={d.boardAvatar.logo} size="lg" decorative />
          ) : (
            <UserAvatar src={avatarSrc(n.actor)} size="lg" />
          )}
          <span
            aria-hidden="true"
            className={cx(
              'absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-pill bg-card ring-1 ring-line',
              d.badge === 'up' ? 'text-brand' : d.badge === 'ship' ? 'text-success' : 'text-ink-secondary',
            )}
          >
            <Icon name={BADGE_ICON[d.badge]} size={11} strokeWidth={2.4} />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base text-ink-secondary">
            {unread ? <span className="sr-only">Unread: </span> : null}
            {d.text}
          </span>
          {d.quote ? <span className="mt-1 line-clamp-2 border-0 border-l-2 border-solid border-line pl-3 text-base text-ink">{d.quote}</span> : null}
          <time dateTime={n.created_at} className="mt-1 text-sm text-ink-muted">
            {shortAge(n.created_at)}
          </time>
        </span>
      </Link>
      {d.followBack && n.actor ? (
        <span className="shrink-0 self-center">
          <FollowPersonButton person={n.actor} size="sm" />
        </span>
      ) : null}
    </div>
  );
}
