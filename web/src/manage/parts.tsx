import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  APPROVE_ROLES,
  avatarSrc,
  dedupePosts,
  plural,
  ROLE_LABEL,
  shortAge,
  sortMembers,
  useAddMember,
  useApproveJoin,
  useBlocked,
  useDecideJoin,
  useJoinRequests,
  usePostList,
  useReleaseScope,
  useRemoveMember,
  useSetBlocked,
  useSetMemberRole,
  useSetPostStatus,
  useTeam,
  type ApproveRole,
  type Board,
  type JoinRequest,
  type Member,
  type Post,
  type PostStatus,
  type Role,
  type Scope,
  type TypeFilter,
} from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { ConfirmDialog } from '../posts/dialogs';
import { MergeDialog } from '../posts/MergeDialog';
import { LoadError } from '../posts/PostList';
import { statusToast, TEAM_STATUSES } from '../posts/StatusDialog';
import { Button, Dialog, Field, IconButton, Input, Select, SkeletonBlock, STATUS_META, TYPE_META, UserAvatar, useToast } from '../ui';

/*
 * Pieces of the Manage screens (FOUNDATION §5 ManageInbox, TeamPanel): stat
 * tiles, triage rows with a status select, the team list with roles, adding
 * teammates, join requests, merge from a triage row, blocked people, and
 * giving a board or hub up (release).
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
  { value: 'friction', label: 'Friction' },
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
  const [merging, setMerging] = useState(false);
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
      <span className="flex shrink-0 items-center gap-2 max-sm:w-full">
        {post.status !== 'merged' ? (
          <Button size="sm" variant="secondary" onClick={() => setMerging(true)} className="shrink-0" aria-label={`Merge ${post.title}`}>
            Merge
          </Button>
        ) : null}
        {merging ? <MergeDialog post={post} open onClose={() => setMerging(false)} onMerged={() => {}} /> : null}
        <span className="w-select shrink-0 max-sm:w-auto max-sm:flex-1">
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
  // One mis-click used to drop a teammate instantly (#142): ask first.
  const [confirming, setConfirming] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const askRemove = () => {
    setRemoveError(null);
    setConfirming(true);
  };
  const onRemove = () =>
    remove.mutate(
      { scope: member.scope, id: member.scope_id, userId: member.user_id },
      {
        onSuccess: () => {
          setConfirming(false);
          toast(`Removed ${name}`);
        },
        onError: (e) => setRemoveError(e instanceof Error ? e.message : 'We couldn’t remove them.'),
      },
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
          <IconButton icon="close" label={`Remove ${name}`} size="sm" onClick={askRemove} disabled={remove.isPending} />
          <ConfirmDialog
            open={confirming}
            title={`Remove ${name} from the team?`}
            confirmLabel="Remove"
            busy={remove.isPending}
            error={removeError}
            onConfirm={onRemove}
            onClose={() => setConfirming(false)}
          >
            {`${name} loses team access straight away. You can add them back later.`}
          </ConfirmDialog>
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

/** Pending "Work here?" requests with a role, Approve and Deny (#188). */
export function JoinRequests({ scopes, names }: { scopes: Array<{ scope: Scope; id: string }>; names?: Record<string, string> }) {
  const requests = useJoinRequests(scopes);
  const list = requests.data ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Join requests" note="People who confirmed a work email on your domain and asked to join. Requests expire after 14 days.">
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Join requests">
        {list.map((r) => (
          <JoinRequestRow key={r.id} request={r} scopeName={names?.[r.scope_id]} />
        ))}
      </ul>
    </Section>
  );
}

function JoinRequestRow({ request: r, scopeName }: { request: JoinRequest; scopeName?: string }) {
  const { toast } = useToast();
  const decide = useDecideJoin();
  const approve = useApproveJoin();
  const [role, setRole] = useState<ApproveRole>('member');
  const busy = decide.isPending || approve.isPending;
  const p = r.profile;
  const name = p?.name || p?.handle || 'Someone';
  const onApprove = () =>
    approve.mutate(
      { request: r, role },
      {
        onSuccess: ({ roleSet }) =>
          toast(
            !roleSet
              ? `${name} joined as Member, but we couldn’t make them ${ROLE_LABEL[role]}. Change it in Members.`
              : role === 'member'
                ? `${name} joined the team`
                : `${name} joined the team as ${ROLE_LABEL[role]}`,
          ),
        onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.'),
      },
    );
  return (
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 max-sm:flex-wrap">
      {p ? (
        <Link to={`/u/${p.handle}`} tabIndex={-1} aria-hidden="true">
          <UserAvatar src={avatarSrc(p)} size="md" />
        </Link>
      ) : (
        <UserAvatar src={avatarSrc(p)} size="md" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        {p ? (
          <Link to={`/u/${p.handle}`} className="truncate text-base font-semibold text-ink no-underline hover:underline">
            {name}
          </Link>
        ) : (
          <b className="truncate text-base font-semibold text-ink">{name}</b>
        )}
        <span className="truncate text-sm text-ink-muted">
          {p ? `@${p.handle} · ` : ''}
          {r.work_email} · verified{scopeName ? ` · ${scopeName}` : ''} · {shortAge(r.created_at)}
        </span>
        {r.message ? (
          <span data-join-message className="mt-1 border-0 border-l-2 border-solid border-line pl-3 text-sm whitespace-pre-line wrap-break-word text-ink">
            {r.message}
          </span>
        ) : null}
      </span>
      <span className="w-select shrink-0">
        <Select value={role} onChange={(e) => setRole(e.target.value as ApproveRole)} disabled={busy} aria-label={`Role for ${name}`}>
          {APPROVE_ROLES.map((x) => (
            <option key={x} value={x}>
              {ROLE_LABEL[x]}
            </option>
          ))}
        </Select>
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          decide.mutate(
            { id: r.id, approve: false },
            { onSuccess: () => toast(`Declined ${name}`), onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.') },
          )
        }
      >
        Deny
      </Button>
      <Button size="sm" disabled={busy} onClick={onApprove}>
        Approve
      </Button>
    </li>
  );
}

// ------------------------------------------------------------------ blocked people

/** People blocked from posting, voting and replying on this scope's boards (FOUNDATION §6). */
export function BlockedList({ scope, scopeId }: { scope: Scope; scopeId: string }) {
  const { toast } = useToast();
  const blocked = useBlocked(scope, scopeId);
  const unblock = useSetBlocked();
  const list = blocked.data ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Blocked" note="Blocked people can still read, but can’t post, vote or reply here. Block someone from their profile.">
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Blocked people">
        {list.map((b) => {
          const name = b.profile?.name || b.profile?.handle || 'Deleted user';
          return (
            <li key={b.user_id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
              <UserAvatar src={avatarSrc(b.profile)} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                {b.profile ? (
                  <Link to={`/u/${b.profile.handle}`} className="truncate text-base font-semibold text-ink no-underline hover:underline">
                    {name}
                  </Link>
                ) : (
                  <b className="truncate text-base font-semibold text-ink">{name}</b>
                )}
                <span className="truncate text-sm text-ink-muted">
                  {b.profile ? `@${b.profile.handle} · ` : ''}blocked {shortAge(b.created_at)}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={unblock.isPending}
                onClick={() =>
                  unblock.mutate(
                    { scope, id: scopeId, userId: b.user_id, on: false },
                    { onSuccess: () => toast(`Unblocked ${name}`), onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong.') },
                  )
                }
              >
                Unblock
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ------------------------------------------------------------------ release

/**
 * "Give up this board" (owners of this exact scope). It goes back to unclaimed:
 * the whole team is removed, open requests are withdrawn and blocks are lifted.
 * The owner types the name to confirm, since it can't be undone from here.
 */
export function ReleaseSection({ scope, scopeId, name, onReleased }: { scope: Scope; scopeId: string; name: string; onReleased: () => void }) {
  const { toast } = useToast();
  const release = useReleaseScope();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const what = scope === 'hub' ? 'hub' : 'board';
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const confirm = () => {
    if (!matches) return setError(`Type ${name} to confirm.`);
    setError(null);
    release.mutate(
      { scope, id: scopeId },
      {
        onSuccess: () => {
          setOpen(false);
          toast(`You gave up ${name}. It’s unclaimed now.`);
          onReleased();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };
  return (
    <Section
      title={`Give up this ${what}`}
      note={
        scope === 'hub'
          ? 'The hub and its boards go back to unclaimed. Everyone on the hub team loses access, and someone at the company can claim it again.'
          : 'The board goes back to unclaimed. Everyone on its team loses access, and someone at the company can claim it again.'
      }
    >
      <Button
        variant="danger"
        onClick={() => {
          setTyped('');
          setError(null);
          setOpen(true);
        }}
      >
        Give up {name}…
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Give up ${name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={release.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} loading={release.isPending} disabled={!matches}>
              Give up {what}
            </Button>
          </>
        }
      >
        <p className="mt-0 mb-4 text-base text-ink-secondary">
          Your team loses access, open join requests are withdrawn and blocks are lifted. Posts, votes and replies stay.
        </p>
        <Field label={`Type ${name} to confirm`} error={error}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      </Dialog>
    </Section>
  );
}
