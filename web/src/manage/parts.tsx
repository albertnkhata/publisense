import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  avatarSrc,
  dedupePosts,
  plural,
  ROLE_LABEL,
  shortAge,
  sortMembers,
  useAddMember,
  useDecideJoin,
  useJoinRequests,
  usePostList,
  useRemoveMember,
  useSetMemberRole,
  useSetPostStatus,
  useTeam,
  type Board,
  type Member,
  type Post,
  type PostStatus,
  type Role,
  type Scope,
  type TypeFilter,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { LoadError } from '../posts/PostList';
import { statusToast, TEAM_STATUSES } from '../posts/StatusDialog';
import { Button, Field, IconButton, Input, Select, SkeletonBlock, STATUS_META, TYPE_META, UserAvatar, useToast } from '../ui';

/*
 * Pieces of the Manage screens (FOUNDATION §5 ManageInbox, TeamPanel): stat
 * tiles, triage rows with a status select, the team list with roles, adding
 * teammates, and join requests. Merge, hide and block arrive in step 8.
 */

// ------------------------------------------------------------------ layout

export function Tiles({ items }: { items: Array<{ value: ReactNode; label: string }> }) {
  return (
    <dl className="m-0 mb-5 grid grid-cols-4 gap-3 max-md:grid-cols-2">
      {items.map((t) => (
        <div key={t.label} className="flex flex-col-reverse gap-1 rounded-md border border-line bg-card px-4 py-3">
          <dt className="text-sm text-ink-muted">{t.label}</dt>
          <dd className="m-0 font-mono text-xl font-semibold text-ink tabular-nums">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-md border border-line bg-card px-5 py-4 max-sm:p-4">
      <h2 className="mt-0 mb-1 text-md font-semibold text-ink">{title}</h2>
      {note ? <p className="mt-0 mb-3 text-sm text-ink-muted">{note}</p> : null}
      {children}
    </section>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 shrink-0 rounded-pill border px-3 text-sm font-medium transition-colors duration-120',
            value === o.value ? 'border-ink bg-ink text-card' : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'bug', label: 'Bugs' },
  { value: 'feature', label: 'Feature requests' },
];

// ------------------------------------------------------------------ inbox

/** Triage rows: votes, title (opens the post), meta, and a status select. */
export function Inbox({
  boardIds,
  status,
  type,
  boards,
  empty,
}: {
  boardIds: string[];
  status: 'open' | 'all';
  type: TypeFilter;
  /** Show each row's board (hub inbox). */
  boards?: Board[];
  empty: ReactNode;
}) {
  const { viewer } = useViewer();
  const list = usePostList({ boardIds, status, type, sort: 'top', viewerId: viewer?.id ?? null });
  const posts = useMemo(() => dedupePosts(list.data?.pages ?? []), [list.data]);

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-4" aria-busy="true">
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
    );
  }
  if (list.isError && posts.length === 0) return <LoadError title="We couldn’t load the posts" onRetry={() => void list.refetch()} retrying={list.isRefetching} />;
  if (posts.length === 0) return <div className="rounded-md border border-line bg-card px-4 py-9 text-center text-base text-ink-muted">{empty}</div>;
  return (
    <>
      <ul className="m-0 list-none rounded-md border border-line bg-card p-0" aria-label="Posts">
        {posts.map((p) => (
          <li key={p.id} className="border-t border-line first:border-t-0">
            <InboxRow post={p} board={boards?.find((b) => b.id === p.board_id) ?? null} />
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Show more
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function InboxRow({ post, board }: { post: Post; board: Board | null }) {
  const { toast } = useToast();
  const setStatus = useSetPostStatus();
  const change = (to: PostStatus) => {
    if (to === post.status) return;
    setStatus.mutate(
      { postId: post.id, to },
      {
        onSuccess: () => toast(to === 'shipped' ? 'Marked Shipped · upvoters notified' : statusToast(to)),
        onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t update the status. Try again.'),
      },
    );
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3 max-sm:flex-wrap max-sm:px-3">
      <span className="flex w-9 shrink-0 flex-col items-center font-mono text-base font-semibold text-ink tabular-nums" aria-label={`${post.vote_count} votes`}>
        {post.vote_count}
        <small className="font-sans text-xs font-normal text-ink-muted">votes</small>
      </span>
      <Link to={`/post/${post.id}`} className="flex min-w-0 flex-1 flex-col text-ink no-underline hover:text-brand">
        <b className="truncate text-base font-semibold">{post.title}</b>
        <span className="flex flex-wrap items-center gap-x-1 text-sm text-ink-muted">
          <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true" className={TYPE_META[post.type].dot}>
            <circle cx="3" cy="3" r="3" fill="currentColor" />
          </svg>
          {TYPE_META[post.type].label}
          {board ? <> · {board.name}</> : null} · {post.author ? `@${post.author.handle}` : post.source_url ? 'Imported' : 'Deleted user'} · {shortAge(post.created_at)} · {plural(post.reply_count, 'reply', 'replies')}
        </span>
      </Link>
      <span className="w-select shrink-0 max-sm:w-full">
        <Select
          value={post.status === 'merged' ? 'open' : post.status}
          onChange={(e) => change(e.target.value as PostStatus)}
          disabled={setStatus.isPending || post.status === 'merged'}
          aria-label={`Status for ${post.title}`}
         
        >
          {TEAM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ team

export function canManage(role: Role | null | undefined) {
  return role === 'owner' || role === 'admin';
}

/** Members of one scope, with role selects and remove for admins (owners for owners). */
export function TeamList({ scope, scopeId, myRole, scopeName }: { scope: Scope; scopeId: string; myRole: Role | null; scopeName: string }) {
  const { viewer } = useViewer();
  const team = useTeam(scope, scopeId);
  const members = useMemo(() => sortMembers(team.data ?? [], viewer?.id ?? null), [team.data, viewer?.id]);
  if (team.isPending) return <SkeletonBlock className="h-8 w-full" />;
  if (team.isError) return <LoadError title="We couldn’t load the team" onRetry={() => void team.refetch()} retrying={team.isRefetching} />;
  if (members.length === 0) return <p className="m-0 text-sm text-ink-muted">Nobody here yet.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label={`${scopeName} team`}>
      {members.map((m) => (
        <li key={m.user_id} className="border-t border-line first:border-t-0">
          <MemberRow member={m} myRole={myRole} />
        </li>
      ))}
    </ul>
  );
}

function MemberRow({ member, myRole }: { member: Member; myRole: Role | null }) {
  const { viewer } = useViewer();
  const { toast } = useToast();
  const setRole = useSetMemberRole();
  const remove = useRemoveMember();
  const you = member.user_id === viewer?.id;
  const p = member.profile;
  const name = p?.name || p?.handle || 'Deleted user';
  // Admins change members and admins; only owners touch owners or grant ownership.
  const editable = !you && canManage(myRole) && (member.role !== 'owner' || myRole === 'owner');
  const roles: Role[] = myRole === 'owner' ? ['member', 'admin', 'owner'] : ['member', 'admin'];

  const onRole = (role: Role) =>
    setRole.mutate(
      { scope: member.scope, id: member.scope_id, userId: member.user_id, role },
      { onSuccess: () => toast('Role updated'), onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t change the role.') },
    );
  const onRemove = () =>
    remove.mutate(
      { scope: member.scope, id: member.scope_id, userId: member.user_id },
      { onSuccess: () => toast(`Removed ${name}`), onError: (e) => toast(e instanceof Error ? e.message : 'We couldn’t remove them.') },
    );

  return (
    <div className="flex items-center gap-3 py-3">
      <UserAvatar src={avatarSrc(p)} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-base font-semibold text-ink">
          {name}
          {you ? ' (you)' : ''}
        </b>
        <span className="truncate text-sm text-ink-muted">{p ? `@${p.handle}` : ''}</span>
      </span>
      {editable ? (
        <>
          <span className="w-select shrink-0">
            <Select value={member.role} onChange={(e) => onRole(e.target.value as Role)} disabled={setRole.isPending} aria-label={`Role for ${name}`}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </span>
          <IconButton icon="close" label={`Remove ${name}`} size="sm" onClick={onRemove} disabled={remove.isPending} />
        </>
      ) : (
        <span className="rounded-pill bg-subtle px-2 text-xs font-medium text-ink-secondary">{ROLE_LABEL[member.role]}</span>
      )}
    </div>
  );
}

/** "Invite teammates": adds existing accounts on the verified domain. */
export function AddTeammate({ scope, scopeId, domain }: { scope: Scope; scopeId: string; domain: string | null }) {
  const { toast } = useToast();
  const add = useAddMember();
  const [who, setWho] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = who.trim();
    if (!v) return ref.current?.focus();
    setError(null);
    add.mutate(
      { scope, id: scopeId, who: v, domain },
      {
        onSuccess: (r) => {
          toast(`Added @${r.handle} to the team`);
          setWho('');
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'We couldn’t add them.');
          ref.current?.focus();
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="flex items-start gap-2 max-sm:flex-col max-sm:items-stretch">
      <Field label="Email or handle" error={error} className="min-w-0 flex-1">
        <Input
          ref={ref}
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            setError(null);
          }}
          placeholder={domain ? `name@${domain} or @handle` : '@handle'}
          autoComplete="off"
        />
      </Field>
      <Button type="submit" loading={add.isPending} className="mt-7 max-sm:mt-0">
        Add
      </Button>
    </form>
  );
}

/** Pending "Work here?" requests with Approve / Deny. */
export function JoinRequests({ scopes, names }: { scopes: Array<{ scope: Scope; id: string }>; names?: Record<string, string> }) {
  const { toast } = useToast();
  const requests = useJoinRequests(scopes);
  const decide = useDecideJoin();
  const list = requests.data ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Join requests" note="People who confirmed a work email on your domain and asked to join. Requests expire after 14 days.">
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Join requests">
        {list.map((r) => {
          const name = r.profile?.name || r.profile?.handle || 'Someone';
          return (
            <li key={r.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 max-sm:flex-wrap">
              <UserAvatar src={avatarSrc(r.profile)} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-base font-semibold text-ink">{name}</b>
                <span className="truncate text-sm text-ink-muted">
                  {r.work_email} · verified{names?.[r.scope_id] ? ` · ${names[r.scope_id]}` : ''} · {shortAge(r.created_at)}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate(
                    { id: r.id, approve: false },
                    { onSuccess: () => toast(`Declined ${name}`), onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.') },
                  )
                }
              >
                Deny
              </Button>
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate(
                    { id: r.id, approve: true },
                    { onSuccess: () => toast(`${name} joined the team`), onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.') },
                  )
                }
              >
                Approve
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
