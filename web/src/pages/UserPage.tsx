import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  avatarSrc,
  compactCount,
  dedupePosts,
  followKey,
  isHandle,
  isLive,
  joinedLabel,
  logoSrc,
  plural,
  shortAge,
  useAdminScopes,
  useBlocksFor,
  useBoards,
  useDmPolicy,
  useFollowedScopes,
  useFollowedUsers,
  useFollowUser,
  useHubs,
  useManaged,
  useMessagesEnabled,
  usePerson,
  usePersonStats,
  useProfileFollowers,
  useProfileFollowingCount,
  useProfileFollowingScopes,
  useProfileFollowingUsers,
  useScopeFollow,
  useSetBlocked,
  useUpvotedPosts,
  useUserPosts,
  useUserReplies,
  type AdminScope,
  type FollowedProduct,
  type Managed,
  type ProfilePerson,
  type PublicProfile,
} from '../api';
import { cx } from '../lib/cx';
import { shareLink } from '../lib/share';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { ConfirmDialog } from '../posts/dialogs';
import { PostCard } from '../posts/PostCard';
import { FEED_LIST, LoadError, PostList, PostListSkeleton } from '../posts/PostList';
import { ReportDialog } from '../posts/ReportDialog';
import { useRequireAuth } from '../shell/auth';
import {
  BoardAvatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  HubAvatar,
  Icon,
  IconButton,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Skeleton,
  Spinner,
  TabPanel,
  Tabs,
  UserAvatar,
  useToast,
  type IconName,
} from '../ui';
import { actionLink } from './BoardPage';
import { useSetUrlParams } from '../lib/useUrlParam';

/**
 * A person's page (FOUNDATION §9 `/u/:handle`): who they are, interactive
 * followers & following (products + people) lists, their posts and replies,
 * and for yourself the boards you manage and what you upvoted (private).
 */
type UserTab = 'posts' | 'replies' | 'upvoted';
type ConnectionsView = 'followers' | 'following';

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
        <Card>
          <Skeleton variant="header" className="pb-0" />
        </Card>
        <PostListSkeleton count={2} />
      </div>
    );
  }
  if (person.isError || !person.data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">@{handle}</h1>
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
  const [connections, setConnections] = useState<ConnectionsView | null>(null);
  const allowed: UserTab[] = self ? ['posts', 'replies', 'upvoted'] : ['posts', 'replies'];
  const raw = params.get('tab') as UserTab | null;
  const tab: UserTab = raw && allowed.includes(raw) ? raw : 'posts';
  const setTab = (t: UserTab) => setUrl([['tab', t, 'posts']]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <Card className="mb-5">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 max-md:gap-3">
            <UserAvatar src={avatarSrc(person)} size="2xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="page-title" className="m-0 text-2xl font-bold text-ink wrap-break-word">
                  {person.name || `@${person.handle}`}
                </h1>
                {self ? (
                  <span className="inline-flex h-5 items-center rounded-pill border border-line bg-subtle px-2 text-xs font-medium text-ink-muted">
                    Your profile
                  </span>
                ) : null}
              </div>
              <p className="m-0 text-base text-ink-muted">@{person.handle}</p>
            </div>
            <ProfileActions person={person} self={self} />
          </div>
          {person.bio ? <p className="m-0 text-base text-ink whitespace-pre-line wrap-break-word">{person.bio}</p> : null}
          <ProfileStats person={person} stats={stats.data} self={self} onOpenConnections={setConnections} />
          {self ? <Manages /> : null}
        </header>
      </Card>
      <Tabs
        idBase="user"
        label="Profile sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: 'posts', label: 'Posts', ...(stats.data && stats.data.posts > 0 ? { count: stats.data.posts } : {}) },
          { value: 'replies', label: 'Replies', ...(replies.data && replies.data.length > 0 ? { count: replies.data.length } : {}) },
          ...(self ? [{ value: 'upvoted' as const, label: 'Upvoted', ...(upvoted.data && upvoted.data.length > 0 ? { count: upvoted.data.length } : {}) }] : []),
        ]}
      />
      <TabPanel idBase="user" value={tab}>
        {tab === 'posts' ? <UserPosts person={person} self={self} /> : tab === 'replies' ? <UserReplies replies={replies} self={self} /> : <Upvoted query={upvoted} />}
      </TabPanel>
      {connections ? (
        <ConnectionsDialog person={person} self={self} view={connections} onClose={() => setConnections(null)} />
      ) : null}
    </section>
  );
}

const statButton =
  'cursor-pointer border-0 bg-transparent p-0 text-sm text-ink-muted transition-colors duration-120 hover:text-ink hover:underline';

function ProfileStats({
  person,
  stats,
  self,
  onOpenConnections,
}: {
  person: PublicProfile;
  stats: { posts: number; upvotes: number } | undefined;
  self: boolean;
  onOpenConnections: (view: ConnectionsView) => void;
}) {
  const { viewer } = useViewer();
  const followedUsers = useFollowedUsers(self ? (viewer?.id ?? null) : null);
  const followedScopes = useFollowedScopes(self ? (viewer?.id ?? null) : null);
  const boards = useBoards();
  const hubs = useHubs();
  const rpcCount = useProfileFollowingCount(person.id);

  // On your own profile, compute following live from local sets (people + live boards/hubs)
  // so it updates optimistically at 0ms and stays accurate even before RPC 0068 is deployed.
  const selfFollowingCount = useMemo(() => {
    if (!self) return null;
    if (!followedUsers.data && !followedScopes.data) return null;
    const peopleCount = followedUsers.data?.size ?? 0;
    const scopes = followedScopes.data;
    if (!scopes || scopes.size === 0) return peopleCount;
    const liveBoards = (boards.data ?? []).filter(isLive);
    const liveHubs = hubs.data ?? [];
    if (liveBoards.length > 0 || liveHubs.length > 0) {
      const boardCount = liveBoards.filter((b) => scopes.has(followKey('board', b.id))).length;
      const hubCount = liveHubs.filter((h) => scopes.has(followKey('hub', h.id))).length;
      return peopleCount + boardCount + hubCount;
    }
    return peopleCount + scopes.size;
  }, [self, followedUsers.data, followedScopes.data, boards.data, hubs.data]);

  const followingCount = self ? (selfFollowingCount ?? rpcCount.data ?? null) : (rpcCount.data ?? null);

  return (
    <div className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-ink-muted">
      <button type="button" onClick={() => onOpenConnections('followers')} className={statButton}>
        <b className="font-semibold text-ink tabular-nums">{compactCount(person.follower_count)}</b>{' '}
        {person.follower_count === 1 ? 'follower' : 'followers'}
      </button>
      {followingCount !== null ? (
        <button type="button" onClick={() => onOpenConnections('following')} className={statButton}>
          <b className="font-semibold text-ink tabular-nums">{compactCount(followingCount)}</b> following
        </button>
      ) : null}
      {stats && stats.upvotes > 0 ? (
        <span>
          <b className="font-semibold text-ink tabular-nums">{compactCount(stats.upvotes)}</b> upvotes received
        </span>
      ) : null}
      <span>{joinedLabel(person.created_at)}</span>
    </div>
  );
}

function ConnectionsDialog({
  person,
  self,
  view,
  onClose,
}: {
  person: PublicProfile;
  self: boolean;
  view: ConnectionsView;
  onClose: () => void;
}) {
  const { viewer } = useViewer();
  const [subTab, setSubTab] = useState<'products' | 'people'>('products');
  const [pickedSubTab, setPickedSubTab] = useState(false);

  const followers = useProfileFollowers(person.id, view === 'followers');
  const followingScopes = useProfileFollowingScopes(person.id, view === 'following');
  const followingUsers = useProfileFollowingUsers(person.id, view === 'following');

  // Load viewer's followed scopes in parallel so product Follow/Following state resolves immediately
  // (and serves as a pre-migration 0068 fallback on your own profile).
  const ownScopes = useFollowedScopes(view === 'following' ? (viewer?.id ?? null) : null);
  const boards = useBoards();
  const hubs = useHubs();

  const products = useMemo<FollowedProduct[]>(() => {
    const rpc = followingScopes.data ?? [];
    if (rpc.length > 0) return rpc;
    if (!self || !ownScopes.data || ownScopes.data.size === 0) return [];
    const out: FollowedProduct[] = [];
    for (const b of (boards.data ?? []).filter(isLive)) {
      if (ownScopes.data.has(followKey('board', b.id))) {
        out.push({ scope: 'board', id: b.id, slug: b.slug, name: b.name, color: b.color, logo_path: b.logo_path, follower_count: b.follower_count });
      }
    }
    for (const h of hubs.data ?? []) {
      if (ownScopes.data.has(followKey('hub', h.id))) {
        out.push({ scope: 'hub', id: h.id, slug: h.slug, name: h.name, color: '', logo_path: null, follower_count: h.follower_count });
      }
    }
    return out;
  }, [followingScopes.data, self, ownScopes.data, boards.data, hubs.data]);

  const people = followingUsers.data ?? [];

  // Default to People if they follow people and no products.
  useEffect(() => {
    if (view !== 'following' || pickedSubTab) return;
    if (!followingScopes.isPending && !followingUsers.isPending && products.length === 0 && people.length > 0) {
      setSubTab('people');
    }
  }, [view, pickedSubTab, followingScopes.isPending, followingUsers.isPending, products.length, people.length]);

  const hubsById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h])), [hubs.data]);

  return (
    <Dialog open onClose={onClose} title={view === 'followers' ? 'Followers' : 'Following'}>
      {view === 'followers' ? (
        followers.isPending ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : followers.isError ? (
          <LoadError title="We couldn’t load followers" onRetry={() => void followers.refetch()} retrying={followers.isRefetching} />
        ) : (followers.data ?? []).length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-ink-muted">No followers yet.</p>
        ) : (
          <ul className="-mx-2 m-0 flex list-none flex-col gap-1 p-0" aria-label="Followers">
            {(followers.data ?? []).map((p) => (
              <li key={p.id}>
                <ConnectionPersonRow person={p} isSelf={p.id === viewer?.id} onNavigate={onClose} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <Tabs
            idBase="following"
            label="Following categories"
            value={subTab}
            onChange={(next) => {
              setPickedSubTab(true);
              setSubTab(next);
            }}
            className="-mt-2 mb-3"
            items={[
              { value: 'products', label: 'Products', ...(products.length > 0 ? { count: products.length } : {}) },
              { value: 'people', label: 'People', ...(people.length > 0 ? { count: people.length } : {}) },
            ]}
          />
          <TabPanel idBase="following" value={subTab}>
            {subTab === 'products' ? (
              followingScopes.isPending && products.length === 0 ? (
                <div className="grid place-items-center py-8">
                  <Spinner />
                </div>
              ) : followingScopes.isError && products.length === 0 ? (
                <LoadError title="We couldn’t load followed products" onRetry={() => void followingScopes.refetch()} retrying={followingScopes.isRefetching} />
              ) : products.length === 0 ? (
                <p className="m-0 py-6 text-center text-sm text-ink-muted">
                  {self ? 'You aren’t following any products yet.' : 'Not following any products yet.'}
                </p>
              ) : (
                <ul className="-mx-2 m-0 flex list-none flex-col gap-1 p-0" aria-label="Followed products">
                  {products.map((item) => (
                    <li key={`${item.scope}:${item.id}`}>
                      <ConnectionProductRow item={item} hubBoards={hubsById.get(item.id)?.boards} onNavigate={onClose} />
                    </li>
                  ))}
                </ul>
              )
            ) : followingUsers.isPending ? (
              <div className="grid place-items-center py-8">
                <Spinner />
              </div>
            ) : followingUsers.isError ? (
              <LoadError title="We couldn’t load followed people" onRetry={() => void followingUsers.refetch()} retrying={followingUsers.isRefetching} />
            ) : people.length === 0 ? (
              <p className="m-0 py-6 text-center text-sm text-ink-muted">
                {self ? 'You aren’t following anyone yet.' : 'Not following anyone yet.'}
              </p>
            ) : (
              <ul className="-mx-2 m-0 flex list-none flex-col gap-1 p-0" aria-label="Followed people">
                {people.map((p) => (
                  <li key={p.id}>
                    <ConnectionPersonRow person={p} isSelf={p.id === viewer?.id} onNavigate={onClose} />
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>
        </>
      )}
    </Dialog>
  );
}

function ConnectionPersonRow({
  person,
  isSelf,
  onNavigate,
}: {
  person: ProfilePerson;
  isSelf: boolean;
  onNavigate: () => void;
}) {
  const name = person.name || `@${person.handle}`;
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-120 hover:bg-subtle">
      <Link to={`/u/${person.handle}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline">
        <UserAvatar size="md" name={name} src={avatarSrc(person)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-semibold text-ink">{name}</span>
          <span className="truncate text-sm text-ink-muted">@{person.handle}</span>
        </span>
      </Link>
      {!isSelf ? <FollowPersonButton person={person} size="sm" /> : null}
    </div>
  );
}

function ConnectionProductRow({
  item,
  hubBoards,
  onNavigate,
}: {
  item: FollowedProduct;
  hubBoards?: Array<{ name: string; color: string; logo_path: string | null }>;
  onNavigate: () => void;
}) {
  const { viewer } = useViewer();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const followedScopes = useFollowedScopes(viewer?.id ?? null);
  const scopeFollow = useScopeFollow(viewer?.id ?? null);
  const on = Boolean(followedScopes.data?.has(followKey(item.scope, item.id)));
  const to = item.scope === 'hub' ? `/h/${item.slug}` : `/b/${item.slug}`;

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-120 hover:bg-subtle">
      <Link to={to} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline">
        {item.scope === 'hub' ? (
          <HubAvatar
            name={`${item.name} hub`}
            size="md"
            boards={(hubBoards ?? []).map((b) => ({ name: b.name, color: b.color, logoSrc: logoSrc(b) }))}
          />
        ) : (
          <BoardAvatar name={item.name} color={item.color} logoSrc={logoSrc(item)} size="md" decorative />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-semibold text-ink">{item.name}</span>
          <span className="truncate text-sm text-ink-muted">
            {item.scope === 'hub' ? 'Hub' : 'Product'}
            {item.follower_count > 0 ? ` · ${compactCount(item.follower_count)} ${item.follower_count === 1 ? 'follower' : 'followers'}` : ''}
          </span>
        </span>
      </Link>
      <Button
        size="sm"
        variant={on ? 'secondary' : 'primary'}
        aria-pressed={on}
        onClick={() => {
          if (!requireAuth('follow products')) return;
          scopeFollow.mutate(
            { target: item.scope, id: item.id, on: !on },
            {
              onSuccess: () => toast(on ? `Unfollowed ${item.name}` : `Following ${item.name}`),
              onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
            },
          );
        }}
      >
        {on ? 'Following' : 'Follow'}
      </Button>
    </div>
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
      <div className="flex shrink-0 items-center gap-2 max-md:w-full">
        <Button variant="secondary" onClick={() => void navigate('/settings')} className="max-md:flex-1">
          Edit profile
        </Button>
        <Menu label="Profile options" align="end" trigger={(p) => <IconButton {...p} icon="more" label="Profile options" />}>
          <MenuItem icon="share" description="Copy or send your profile link" onSelect={share}>
            Share profile
          </MenuItem>
          <MenuItem icon="settings" to="/settings">
            Account settings
          </MenuItem>
        </Menu>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 max-md:w-full">
      <FollowPersonButton person={person} className="max-md:flex-1" />
      <MessagePersonButton person={person} />
      <PersonMenu person={person} onShare={share} />
    </div>
  );
}

/** Message (0058): for signed-in viewers (useMessagesEnabled). */
function MessagePersonButton({ person }: { person: PublicProfile }) {
  const { viewer } = useViewer();
  const enabled = useMessagesEnabled(viewer?.id ?? null);
  const policy = useDmPolicy(enabled ? person.id : null);
  const navigate = useNavigate();
  // Hidden on your own profile and for people who take no messages. "People they follow"
  // is left to the server, which says so clearly if you can't message them.
  if (!enabled || viewer?.id === person.id || policy.data === 'nobody') return null;
  return <IconButton icon="mail" variant="secondary" label={`Message @${person.handle}`} onClick={() => void navigate(`/messages/to/${person.handle}`)} />;
}

export function FollowPersonButton({
  person,
  size = 'md',
  className,
}: {
  person: { id: string; handle: string };
  size?: 'sm' | 'md';
  className?: string;
}) {
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
      className={cx(className)}
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

/** Share the profile, report the account, and Block/Unblock from each board or hub the viewer runs. */
function PersonMenu({ person, onShare }: { person: PublicProfile; onShare: () => void }) {
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
        <MenuItem icon="share" description="Copy or send their profile link" onSelect={onShare}>
          Share profile
        </MenuItem>
        <MenuSeparator />
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
  if (managed.isPending || managed.isError) return null;
  const list = managed.data ?? [];
  // No claim prompt on profiles: claiming lives on boards and the right rail.
  if (list.length === 0) return null;
  return (
    <div className="basis-full border-t border-line pt-3">
      <p className="mt-0 mb-2 text-xs font-semibold text-ink-muted uppercase">Manages</p>
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
    <div className="flex items-center gap-3 rounded-md border border-line bg-subtle px-3 py-2">
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
  if (posts.length === 0) {
    return (
      <Empty
        icon="edit"
        action={
          self ? (
            <Link to="/" className={actionLink}>
              Browse products
            </Link>
          ) : undefined
        }
      >
        {self ? 'You haven’t posted yet.' : 'No posts yet.'}
      </Empty>
    );
  }
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
  if (list.length === 0) return <Empty icon="reply">{self ? 'You haven’t replied to anything yet.' : 'No replies yet.'}</Empty>;
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
        <Empty icon="arrow-up">Nothing here yet.</Empty>
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

function Empty({ icon, action, children }: { icon: IconName; action?: ReactNode; children: string }) {
  return (
    <Card padding="none">
      <EmptyState icon={icon} title={children} action={action} />
    </Card>
  );
}

function PersonNotFound() {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          Person not found
        </h1>
        <EmptyState
          icon="user"
          title="No one goes by that name"
          action={
            <Link to="/" className={actionLink}>
              Browse products
            </Link>
          }
        >
          The handle may have changed, or the link is wrong.
        </EmptyState>
      </div>
    </section>
  );
}
