import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  avatarSrc,
  dedupePosts,
  isHandle,
  joinedLabel,
  logoSrc,
  plural,
  compactCount,
  shortAge,
  useAdminScopes,
  useBlocksFor,
  useFollowedUsers,
  useFollowUser,
  useManaged,
  usePerson,
  usePersonStats,
  useSetBlocked,
  useUpvotedPosts,
  useUserPosts,
  useUserReplies,
  type AdminScope,
  type Managed,
  type PublicProfile,
} from '../api';
import { BackLink } from '../boards/parts';
import { useClaim } from '../claim/ClaimDialog';
import { shareLink } from '../lib/share';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { ConfirmDialog } from '../posts/dialogs';
import { PostCard } from '../posts/PostCard';
import { FEED_LIST, LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { ReportDialog } from '../posts/ReportDialog';
import { useRequireAuth } from '../shell/auth';
import { BoardAvatar, Button, EmptyState, HubAvatar, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Skeleton, TabPanel, Tabs, UserAvatar, useToast } from '../ui';
import { actionLink } from './BoardPage';
import { useSetUrlParams } from '../lib/useUrlParam';

/**
 * A person's page (FOUNDATION §9 `/u/:handle`, mockup #user/<handle>): who they
 * are, their posts and replies, and for yourself the boards you manage and what
 * you upvoted (private). Follow, Share, and in the ⋯ menu Report and, for the
 * owners and admins of a board or hub, Block from it (FOUNDATION §6).
 *
 * Left out because nothing backs them (FOUNDATION §10): "Follows you" and other
 * people's following lists (follow rows are private to their owner), Saved, and
 * reply upvotes.
 */
type UserTab = 'posts' | 'replies' | 'upvoted';

export function UserPage() {
  const { handle: raw } = useParams();
  const handle = (raw ?? '').replace(/^@/, '').toLowerCase();
  const valid = isHandle(handle);
  const person = usePerson(valid ? handle : undefined);
  usePageTitle(person.data ? `${person.data.name || '@' + person.data.handle}` : valid && person.isPending ? null : 'Person not found');

  if (!valid || (person.isSuccess && !person.data)) return <PersonNotFound />;
  if (person.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">@{handle}</h1>
        <BackLink to="/">Back</BackLink>
        <Skeleton />
      </div>
    );
  }
  if (person.isError || !person.data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">@{handle}</h1>
        <BackLink to="/">Back</BackLink>
        <LoadError title="We couldn’t load this profile" onRetry={() => void person.refetch()} retrying={person.isRefetching} />
      </div>
    );
  }
  return <Profile person={person.data} />;
}

function Profile({ person }: { person: PublicProfile }) {
  const { viewer } = useViewer();
  const self = viewer?.id === person.id;
  const stats = usePersonStats(person.id);
  const replies = useUserReplies(person.id);
  const upvoted = useUpvotedPosts(viewer?.id ?? null, self);
  const [params] = useSearchParams();
  const setUrl = useSetUrlParams();
  const allowed: UserTab[] = self ? ['posts', 'replies', 'upvoted'] : ['posts', 'replies'];
  const raw = params.get('tab') as UserTab | null;
  const tab: UserTab = raw && allowed.includes(raw) ? raw : 'posts';
  const setTab = (t: UserTab) => setUrl([['tab', t, 'posts']]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4">
        <BackLink to="/">Back</BackLink>
      </div>
      <header className="mb-4 flex flex-wrap items-center gap-4 max-md:gap-3">
        <UserAvatar src={avatarSrc(person)} size="2xl" />
        <div className="min-w-0 flex-1">
          <h1 id="page-title" className="m-0 text-2xl font-bold text-ink wrap-break-word">
            {person.name || `@${person.handle}`}
          </h1>
          <p className="m-0 text-base text-ink-muted">@{person.handle}</p>
        </div>
        <ProfileActions person={person} self={self} />
        {person.bio ? <p className="m-0 basis-full text-base text-ink whitespace-pre-line wrap-break-word">{person.bio}</p> : null}
        <ProfileStats person={person} stats={stats.data} self={self} />
        {self ? <Manages /> : null}
      </header>
      <Tabs
        idBase="user"
        label="Profile sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: 'posts', label: 'Posts', ...(stats.data ? { count: stats.data.posts } : {}) },
          { value: 'replies', label: 'Replies', ...(replies.data ? { count: replies.data.length } : {}) },
          ...(self ? [{ value: 'upvoted' as const, label: 'Upvoted', ...(upvoted.data ? { count: upvoted.data.length } : {}) }] : []),
        ]}
      />
      <TabPanel idBase="user" value={tab}>
        {tab === 'posts' ? <UserPosts person={person} self={self} /> : tab === 'replies' ? <UserReplies replies={replies} self={self} /> : <Upvoted query={upvoted} />}
      </TabPanel>
    </section>
  );
}

function ProfileStats({ person, stats, self }: { person: PublicProfile; stats: { posts: number; upvotes: number } | undefined; self: boolean }) {
  const { viewer } = useViewer();
  const followed = useFollowedUsers(self ? (viewer?.id ?? null) : null);
  return (
    <p className="m-0 flex basis-full flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
      <span>
        <b className="font-semibold text-ink">{compactCount(person.follower_count)}</b> {person.follower_count === 1 ? 'follower' : 'followers'}
      </span>
      {self && followed.data ? (
        <span>
          <b className="font-semibold text-ink">{followed.data.size}</b> following
        </span>
      ) : null}
      {stats ? (
        <>
          <span>
            <b className="font-semibold text-ink">{compactCount(stats.posts)}</b> {stats.posts === 1 ? 'post' : 'posts'}
          </span>
          <span>
            <b className="font-semibold text-ink">{compactCount(stats.upvotes)}</b> upvotes received
          </span>
        </>
      ) : null}
      <span>{joinedLabel(person.created_at)}</span>
    </p>
  );
}

// ------------------------------------------------------------------ actions

function ProfileActions({ person, self }: { person: PublicProfile; self: boolean }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const share = () => {
    void shareLink(`/u/${person.handle}`, person.name || `@${person.handle}`, 'Profile link copied').then((msg) => msg && toast(msg));
  };
  if (self) {
    return (
      <div className="flex shrink-0 gap-2 max-md:order-3 max-md:w-full">
        <Button variant="secondary" onClick={() => void navigate('/settings')} className="max-md:flex-1">
          Edit profile
        </Button>
        <Button variant="secondary" onClick={share} className="max-md:flex-1">
          Share
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 max-md:order-3 max-md:w-full">
      <FollowPersonButton person={person} />
      <Button variant="secondary" onClick={share} className="max-md:flex-1">
        Share
      </Button>
      <PersonMenu person={person} />
    </div>
  );
}

export function FollowPersonButton({ person, size = 'md' }: { person: { id: string; handle: string }; size?: 'sm' | 'md' }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const followed = useFollowedUsers(viewer?.id ?? null);
  const follow = useFollowUser(viewer?.id ?? null);
  const on = Boolean(followed.data?.has(person.id));
  return (
    <Button
      size={size}
      variant={on ? 'secondary' : 'primary'}
      aria-pressed={on}
      className="max-md:flex-1"
      onClick={() => {
        if (!requireAuth('follow people')) return;
        follow.mutate(
          { userId: person.id, on: !on },
          {
            onSuccess: () => toast(on ? `Unfollowed @${person.handle}` : `Following @${person.handle}`),
            onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
          },
        );
      }}
    >
      {on ? 'Following' : size === 'sm' ? 'Follow back' : 'Follow'}
    </Button>
  );
}

/** Report the account, and Block/Unblock from each board or hub the viewer runs. */
function PersonMenu({ person }: { person: PublicProfile }) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const scopes = useAdminScopes(viewer?.id ?? null);
  const ids = useMemo(() => (scopes.data ?? []).map((s) => s.scope_id), [scopes.data]);
  const blocks = useBlocksFor(person.id, ids);
  const setBlocked = useSetBlocked();
  const [reporting, setReporting] = useState(false);
  const [confirm, setConfirm] = useState<{ scope: AdminScope; on: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = person.name || `@${person.handle}`;

  const apply = () => {
    if (!confirm) return;
    setError(null);
    const { scope, on } = confirm;
    setBlocked.mutate(
      { scope: scope.scope, id: scope.scope_id, userId: person.id, on },
      {
        onSuccess: () => {
          setConfirm(null);
          toast(on ? `Blocked @${person.handle} from ${scope.name}` : `Unblocked @${person.handle} on ${scope.name}`);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };

  return (
    <>
      <Menu label={`Options for ${name}`} align="end" trigger={(p) => <IconButton {...p} icon="more" label="Profile options" />}>
        <MenuItem
          icon="flag"
          danger
          onSelect={() => {
            if (!requireAuth('report accounts')) return;
            setReporting(true);
          }}
        >
          Report account
        </MenuItem>
        {(scopes.data ?? []).length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Your boards</MenuLabel>
            {(scopes.data ?? []).map((s) => {
              const blocked = Boolean(blocks.data?.has(`${s.scope}:${s.scope_id}`));
              return (
                <MenuItem
                  key={`${s.scope}:${s.scope_id}`}
                  icon="lock"
                  description={blocked ? 'Let them post, vote and reply again' : 'They can still read, but can’t post, vote or reply'}
                  disabled={!blocks.data}
                  onSelect={() => {
                    setError(null);
                    setConfirm({ scope: s, on: !blocked });
                  }}
                >
                  {blocked ? `Unblock on ${s.name}` : `Block from ${s.name}`}
                </MenuItem>
              );
            })}
          </>
        ) : null}
      </Menu>
      {reporting ? <ReportDialog target="user" id={person.id} subject={`@${person.handle}`} open onClose={() => setReporting(false)} /> : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.on ? `Block @${person.handle} from ${confirm.scope.name}?` : `Unblock @${person.handle}?`}
        confirmLabel={confirm?.on ? 'Block' : 'Unblock'}
        busy={setBlocked.isPending}
        error={error}
        onConfirm={apply}
        onClose={() => setConfirm(null)}
      >
        {confirm?.on
          ? `They can still read ${confirm.scope.name}, but can’t post, vote or reply on it${confirm.scope.scope === 'hub' ? ' or any of its boards' : ''}. Their existing posts stay. You can unblock them from Manage.`
          : `They’ll be able to post, vote and reply on ${confirm?.scope.name ?? 'it'} again.`}
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------ manages (yourself)

function Manages() {
  const { viewer } = useViewer();
  const managed = useManaged(viewer?.id ?? null);
  const { openClaim } = useClaim();
  if (managed.isPending || managed.isError) return null;
  const list = managed.data ?? [];
  if (list.length === 0) {
    return (
      <div className="basis-full">
        <button
          type="button"
          onClick={() => openClaim()}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-line-strong bg-transparent px-3 py-2 text-sm text-ink-secondary hover:bg-subtle"
        >
          <Icon name="hub" size={16} />
          <span>
            Run a product? <b className="font-semibold text-ink">Claim its board</b>
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="basis-full">
      <p className="mt-1 mb-2 text-xs font-semibold text-ink-muted uppercase">Manages</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Boards you manage">
        {list.map((m) => (
          <li key={`${m.scope}:${m.scope_id}`}>
            <ManagedRow m={m} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManagedRow({ m }: { m: Managed }) {
  const hub = m.scope === 'hub';
  const home = hub ? `/h/${m.slug}` : `/b/${m.slug}`;
  const logo = logoSrc({ logo_path: m.logo_path });
  return (
    <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
      {hub ? <HubAvatar name={m.name} boards={m.boards.map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))} size="md" /> : <BoardAvatar name={m.name} color={m.color} logoSrc={logo} size="lg" decorative />}
      <Link to={home} className="flex min-w-0 flex-1 flex-col text-ink no-underline hover:text-brand">
        <b className="flex items-center gap-2 truncate text-base font-semibold">
          {m.name}
          {hub ? <span className="text-xs font-medium text-ink-muted">Hub</span> : null}
        </b>
        <span className="truncate text-sm text-ink-muted">
          {hub ? m.boards.map((b) => b.name).join(', ') : 'Board'} · {plural(m.waiting, 'post', 'posts')} waiting for a status
        </span>
      </Link>
      <Link to={`${home}/manage`} className={actionLink}>
        Manage
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ tabs

function UserPosts({ person, self }: { person: PublicProfile; self: boolean }) {
  const { viewer } = useViewer();
  const list = useUserPosts(person.id, viewer?.id ?? null);
  const posts = useMemo(() => dedupePosts(list.data?.pages ?? []), [list.data]);
  if (list.isPending) return <PostListSkeleton />;
  if (list.isError && posts.length === 0) return <LoadError title="We couldn’t load the posts" onRetry={() => void list.refetch()} retrying={list.isRefetching} />;
  if (posts.length === 0) return <Empty>{self ? 'You haven’t posted yet.' : 'No posts yet.'}</Empty>;
  return (
    <PostList
      posts={posts}
      hasNextPage={Boolean(list.hasNextPage)}
      isFetchingNextPage={list.isFetchingNextPage}
      isError={list.isError}
      fetchNextPage={() => void list.fetchNextPage()}
      label={`Posts by @${person.handle}`}
      endText={null}
    />
  );
}

function UserReplies({ replies, self }: { replies: ReturnType<typeof useUserReplies>; self: boolean }) {
  if (replies.isPending) return <PostListSkeleton count={2} />;
  if (replies.isError) return <LoadError title="We couldn’t load the replies" onRetry={() => void replies.refetch()} retrying={replies.isRefetching} />;
  const list = replies.data ?? [];
  if (list.length === 0) return <Empty>{self ? 'You haven’t replied to anything yet.' : 'No replies yet.'}</Empty>;
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Replies">
      {list.map((r) => (
        <li key={r.id}>
          <Link
            to={`/post/${r.post?.id ?? ''}#replies`}
            className="block rounded-md border border-line bg-card px-4 py-3 text-ink no-underline transition-colors duration-120 hover:border-line-strong"
          >
            <span className="mb-1 flex min-w-0 items-center gap-2 text-sm text-ink-muted">
              {r.post?.board ? <BoardAvatar name={r.post.board.name} color={r.post.board.color} logoSrc={logoSrc(r.post.board)} size="xs" decorative /> : null}
              <span className="truncate">
                Replied on <b className="font-semibold text-ink-secondary">{r.post?.title}</b>
              </span>
            </span>
            <span className="line-clamp-3 block text-base whitespace-pre-line wrap-break-word">{r.body}</span>
            <span className="mt-1 block text-sm text-ink-muted">{shortAge(r.created_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Upvoted({ query }: { query: ReturnType<typeof useUpvotedPosts> }) {
  return (
    <>
      <p className="mt-0 mb-3 flex items-center gap-2 text-sm text-ink-muted">
        <Icon name="lock" size={13} />
        Only you can see this
      </p>
      {query.isPending ? (
        <PostListSkeleton count={2} />
      ) : query.isError ? (
        <LoadError title="We couldn’t load your upvotes" onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      ) : (query.data ?? []).length === 0 ? (
        <Empty>Nothing here yet.</Empty>
      ) : (
        <ul className={FEED_LIST} aria-label="Posts you upvoted">
          {(query.data ?? []).map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="m-0 rounded-md border border-line bg-card px-4 py-9 text-center text-base text-ink-muted">{children}</p>;
}

function PersonNotFound() {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <BackLink to="/">Back</BackLink>
      <div className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          Person not found
        </h1>
        <EmptyState
          icon="user"
          title="No one goes by that name"
          action={
            <Link to="/explore" className={actionLink}>
              Explore boards
            </Link>
          }
        >
          The handle may have changed, or the link is wrong.
        </EmptyState>
      </div>
    </section>
  );
}
