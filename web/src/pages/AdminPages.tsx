import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import {
  avatarSrc,
  formatDate,
  plural,
  shortAge,
  useAdminEvents,
  useDecideDispute,
  useDecideReports,
  useDisputes,
  useFindUser,
  useGrantAdmin,
  useIsPlatformAdmin,
  usePlatformAdmins,
  useReportQueue,
  useRevokeAdmin,
  type DisputeRow,
  type FoundUser,
  type PersonRef,
  type ReportAction,
  type ReportGroup,
} from '../api';
import { cx } from '../lib/cx';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { ConfirmDialog } from '../posts/dialogs';
import { LoadError } from '../posts/PostList';
import { useAuthDialog } from '../shell/auth';
import { Button, EmptyState, Field, Input, SkeletonBlock, Tabs, UserAvatar, useToast } from '../ui';
import { NotFound } from './NotFound';

/**
 * Platform-admin screens (FOUNDATION §9): /admin/reports, /admin/disputes and
 * /admin/team. Only Publisense staff (platform_admin) see them; anyone else gets
 * the ordinary not-found page, so the screens do not announce themselves. RLS and
 * the 0022 RPCs are the real guard.
 */

function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const { viewer, ready } = useViewer();
  const { openAuth } = useAuthDialog();
  const admin = useIsPlatformAdmin(viewer?.id ?? null);
  usePageTitle(viewer && admin.data ? title : ready && (!viewer || admin.isSuccess) ? 'Page not found' : null);
  if (!ready || (viewer && admin.isPending)) return <SkeletonBlock className="h-8 w-1/2" />;
  if (!viewer) {
    return (
      <section aria-labelledby="page-title" className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          Sign in
        </h1>
        <EmptyState icon="lock" title="Sign in to continue" action={<Button onClick={() => openAuth('signin')}>Sign in</Button>} />
      </section>
    );
  }
  if (!admin.data) return <NotFound />;
  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <h1 id="page-title" className="mt-0 mb-1 text-2xl font-bold text-ink">
        {title}
      </h1>
      <p className="mt-0 mb-4 text-sm text-ink-muted">Publisense staff only.</p>
      <AdminNav />
      {children}
    </section>
  );
}

function AdminNav() {
  const item = ({ isActive }: { isActive: boolean }) =>
    cx(
      'h-7 shrink-0 rounded-pill border px-3 text-sm leading-7 font-medium no-underline transition-colors duration-120',
      isActive ? 'border-ink bg-ink text-card' : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
    );
  return (
    <nav aria-label="Admin" className="mb-4 flex flex-wrap gap-2">
      <NavLink to="/admin/reports" className={item}>
        Reports
      </NavLink>
      <NavLink to="/admin/disputes" className={item}>
        Ownership disputes
      </NavLink>
      <NavLink to="/admin/team" className={item}>
        Admin team
      </NavLink>
    </nav>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-md border border-line bg-card px-5 py-4 max-sm:p-4', className)}>{children}</div>;
}

function Person({ p, fallback = 'Deleted user' }: { p: PersonRef | null | undefined; fallback?: string }) {
  if (!p) return <span className="italic">{fallback}</span>;
  return (
    <Link to={`/u/${p.handle}`} className="font-semibold text-ink-secondary no-underline hover:underline">
      @{p.handle}
    </Link>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-line bg-card px-4 py-9 text-center text-base text-ink-muted">{children}</div>;
}

// ------------------------------------------------------------------ reports

export function AdminReportsPage() {
  return (
    <AdminGate title="Reports">
      <ReportsQueue />
    </AdminGate>
  );
}

function ReportsQueue() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const queue = useReportQueue(status);
  const list = queue.data ?? [];
  return (
    <>
      <Tabs
        idBase="reports"
        label="Report status"
        value={status}
        onChange={setStatus}
        className="mb-4"
        items={[
          { value: 'open', label: 'Open', ...(status === 'open' && queue.data ? { count: list.length } : {}) },
          { value: 'closed', label: 'Decided' },
        ]}
      />
      {queue.isPending ? (
        <SkeletonBlock className="h-8 w-full" />
      ) : queue.isError ? (
        <LoadError title="We couldn’t load the reports" onRetry={() => void queue.refetch()} retrying={queue.isRefetching} />
      ) : list.length === 0 ? (
        <Quiet>
          <b className="block font-semibold text-ink">{status === 'open' ? 'No open reports' : 'Nothing decided yet'}</b>
          {status === 'open' ? 'Reports from people land here.' : 'Decided reports show here.'}
        </Quiet>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={status === 'open' ? 'Open reports' : 'Decided reports'}>
          {list.map((g) => (
            <li key={g.key}>
              <ReportCard g={g} open={status === 'open'} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const TARGET_LABEL = { post: 'Post', reply: 'Reply', user: 'Account' } as const;

function ReportCard({ g, open }: { g: ReportGroup; open: boolean }) {
  const { toast } = useToast();
  const decide = useDecideReports();
  const act = (action: ReportAction) =>
    decide.mutate(
      { target: g.target, id: g.target_id, action },
      {
        onSuccess: (n) =>
          toast(action === 'dismiss' ? `Dismissed ${plural(n, 'report', 'reports')}` : action === 'hide' ? `Hidden · ${plural(n, 'report', 'reports')} resolved` : `Resolved ${plural(n, 'report', 'reports')}`),
        onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  const hidden = Boolean(g.post?.hidden_at || g.reply?.hidden_at);
  let subject: ReactNode;
  if (g.target === 'post') {
    subject = g.post ? (
      <>
        <Link to={`/post/${g.post.id}`} className="text-base font-semibold text-ink no-underline hover:underline">
          {g.post.title}
        </Link>
        <span className="text-sm text-ink-muted">
          {g.post.board?.name ?? 'Unknown board'} · by <Person p={g.post.author} fallback="a seeded or deleted author" />
        </span>
      </>
    ) : (
      <span className="text-base text-ink-muted italic">This post was deleted.</span>
    );
  } else if (g.target === 'reply') {
    subject = g.reply ? (
      <>
        <Link to={`/post/${g.reply.post_id}#replies`} className="line-clamp-3 text-base text-ink no-underline hover:underline">
          {g.reply.body}
        </Link>
        <span className="text-sm text-ink-muted">
          On {g.reply.post?.title ?? 'a post'} · by <Person p={g.reply.author} />
        </span>
      </>
    ) : (
      <span className="text-base text-ink-muted italic">This reply was deleted.</span>
    );
  } else {
    subject = g.user ? (
      <span className="flex items-center gap-2">
        <UserAvatar src={avatarSrc(g.user)} size="sm" />
        <Link to={`/u/${g.user.handle}`} className="text-base font-semibold text-ink no-underline hover:underline">
          {g.user.name || `@${g.user.handle}`}
        </Link>
        <span className="text-sm text-ink-muted">@{g.user.handle}</span>
      </span>
    ) : (
      <span className="text-base text-ink-muted italic">This account was deleted.</span>
    );
  }
  const decided = g.reports[0];
  return (
    <Card>
      <p className="mt-0 mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted uppercase">
        {TARGET_LABEL[g.target]}
        <span className="rounded-pill bg-subtle px-2 font-medium normal-case">{plural(g.reports.length, 'report', 'reports')}</span>
        {hidden ? <span className="rounded-pill bg-subtle px-2 font-medium normal-case">Hidden</span> : null}
        {!open && decided ? <span className="rounded-pill bg-subtle px-2 font-medium normal-case">{decided.status === 'dismissed' ? 'Dismissed' : 'Resolved'}</span> : null}
      </p>
      <div className="flex flex-col gap-1">{subject}</div>
      <ul className="mt-3 mb-0 flex list-none flex-col gap-1 border-0 border-t border-solid border-line p-0 pt-3" aria-label="Reasons">
        {g.reports.map((r) => (
          <li key={r.id} className="text-sm text-ink-secondary">
            <span className="text-ink">{r.reason}</span> · <Person p={r.reporter} /> · {shortAge(r.created_at)}
          </li>
        ))}
      </ul>
      {open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {g.target !== 'user' && !hidden && (g.post || g.reply) ? (
            <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => act('hide')}>
              Hide and resolve
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => act('resolve')}>
            {g.target === 'user' ? 'Mark resolved' : 'Resolve'}
          </Button>
          <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => act('dismiss')}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ disputes

export function AdminDisputesPage() {
  return (
    <AdminGate title="Ownership disputes">
      <DisputesQueue />
    </AdminGate>
  );
}

function DisputesQueue() {
  const [status, setStatus] = useState<'pending' | 'closed'>('pending');
  const disputes = useDisputes(status);
  const list = disputes.data ?? [];
  return (
    <>
      <Tabs
        idBase="disputes"
        label="Dispute status"
        value={status}
        onChange={setStatus}
        className="mb-4"
        items={[
          { value: 'pending', label: 'Open', ...(status === 'pending' && disputes.data ? { count: list.length } : {}) },
          { value: 'closed', label: 'Decided' },
        ]}
      />
      {disputes.isPending ? (
        <SkeletonBlock className="h-8 w-full" />
      ) : disputes.isError ? (
        <LoadError title="We couldn’t load the disputes" onRetry={() => void disputes.refetch()} retrying={disputes.isRefetching} />
      ) : list.length === 0 ? (
        <Quiet>
          <b className="block font-semibold text-ink">{status === 'pending' ? 'No open disputes' : 'Nothing decided yet'}</b>
          {status === 'pending' ? '“Report the wrong owner” requests land here. The board’s team never sees them.' : 'Decided disputes show here.'}
        </Quiet>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={status === 'pending' ? 'Open disputes' : 'Decided disputes'}>
          {list.map((d) => (
            <li key={d.id}>
              <DisputeCard d={d} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const DISPUTE_STATUS = { pending: 'Open', approved: 'Ownership transferred', rejected: 'Rejected', withdrawn: 'Withdrawn' } as const;

function DisputeCard({ d }: { d: DisputeRow }) {
  const { toast } = useToast();
  const decide = useDecideDispute();
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const where = d.scope === 'hub' ? `/h/${d.slug}` : `/b/${d.slug}`;
  const filer = d.filer ? `@${d.filer.handle}` : 'the filer';
  const run = () => {
    if (confirm === null) return;
    setError(null);
    decide.mutate(
      { id: d.id, approve: confirm },
      {
        onSuccess: () => {
          setConfirm(null);
          toast(confirm ? `${d.name} now belongs to ${filer}` : 'Dispute rejected');
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };
  return (
    <Card>
      <p className="mt-0 mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted uppercase">
        {d.scope === 'hub' ? 'Hub' : 'Board'}
        {d.status !== 'pending' ? <span className="rounded-pill bg-subtle px-2 font-medium normal-case">{DISPUTE_STATUS[d.status]}</span> : null}
      </p>
      <Link to={where} className="text-base font-semibold text-ink no-underline hover:underline">
        {d.name}
      </Link>
      <p className="mt-1 mb-0 text-sm text-ink-muted">
        Filed by <Person p={d.filer} /> · {d.work_email} (verified) · {shortAge(d.created_at)}
      </p>
      <p className="mt-1 mb-0 text-sm text-ink-muted">
        Current owners: {d.owners.length ? d.owners.map((o, i) => <span key={o.id}>{i ? ', ' : ''}<Person p={o} /></span>) : 'none'}
      </p>
      <p className="mt-3 mb-0 rounded-md bg-subtle px-3 py-2 text-base text-ink whitespace-pre-line wrap-break-word">{d.reason}</p>
      {d.status === 'pending' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
            Transfer ownership
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
            Reject
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? `Give ${d.name} to ${filer}?` : 'Reject this dispute?'}
        confirmLabel={confirm ? 'Transfer ownership' : 'Reject'}
        busy={decide.isPending}
        error={error}
        onConfirm={run}
        onClose={() => setConfirm(null)}
      >
        {confirm
          ? `${filer} becomes the only owner and the current team is removed. They can add teammates again, who still need an address on the domain. ${filer} is notified.`
          : `Nothing changes on ${d.name}. ${filer} is told the team stays as it is.`}
      </ConfirmDialog>
    </Card>
  );
}

// ------------------------------------------------------------------ admin team

export function AdminTeamPage() {
  return (
    <AdminGate title="Admin team">
      <AdminList />
      <Appoint />
      <AdminLog />
    </AdminGate>
  );
}

function AdminList() {
  const { viewer } = useViewer();
  const { toast } = useToast();
  const admins = usePlatformAdmins();
  const revoke = useRevokeAdmin();
  const [removing, setRemoving] = useState<PersonRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = admins.data ?? [];
  const only = list.length <= 1;
  return (
    <Card className="mb-4">
      <h2 className="mt-0 mb-1 text-md font-semibold text-ink">Admins</h2>
      <p className="mt-0 mb-3 text-sm text-ink-muted">Admins work the reports and disputes queues and appoint other admins. There is always at least one.</p>
      {admins.isPending ? (
        <SkeletonBlock className="h-8 w-full" />
      ) : admins.isError ? (
        <LoadError title="We couldn’t load the admins" onRetry={() => void admins.refetch()} retrying={admins.isRefetching} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Admins">
          {list.map((a) => {
            const you = a.user_id === viewer?.id;
            const name = a.profile?.name || (a.profile ? `@${a.profile.handle}` : 'Deleted user');
            return (
              <li key={a.user_id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <UserAvatar src={avatarSrc(a.profile)} size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-base font-semibold text-ink">
                    {name}
                    {you ? ' (you)' : ''}
                  </b>
                  <span className="truncate text-sm text-ink-muted">
                    {a.profile ? `@${a.profile.handle} · ` : ''}admin since {formatDate(a.granted_at, new Date(), true)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={only || revoke.isPending}
                  title={only ? 'Appoint another admin first' : undefined}
                  onClick={() => {
                    setError(null);
                    setRemoving(a.profile ?? { id: a.user_id, handle: '', name: 'Deleted user', avatar_path: null });
                  }}
                >
                  {you ? 'Step down' : 'Remove'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.id === viewer?.id ? 'Step down as admin?' : `Remove ${removing?.handle ? '@' + removing.handle : 'this admin'}?`}
        confirmLabel={removing?.id === viewer?.id ? 'Step down' : 'Remove admin'}
        busy={revoke.isPending}
        error={error}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          revoke.mutate(removing.id, {
            onSuccess: () => {
              toast(removing.id === viewer?.id ? 'You stepped down as admin' : `Removed @${removing.handle} as admin`);
              setRemoving(null);
            },
            onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
          })
        }
      >
        {removing?.id === viewer?.id
          ? 'You’ll lose the reports and disputes queues and this page straight away.'
          : 'They lose the reports and disputes queues straight away. This is recorded in the log.'}
      </ConfirmDialog>
    </Card>
  );
}

function Appoint() {
  const { toast } = useToast();
  const find = useFindUser();
  const grant = useGrantAdmin();
  const [who, setWho] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = who.trim();
    if (!v) return ref.current?.focus();
    setError(null);
    setFound(null);
    find.mutate(v, {
      onSuccess: (u) => setFound(u),
      onError: (err) => setError(err instanceof Error && 'code' in err && err.code === 'not_found' ? 'No account uses that handle or email.' : err instanceof Error ? err.message : 'Something went wrong.'),
    });
  };
  return (
    <Card className="mb-4">
      <h2 className="mt-0 mb-1 text-md font-semibold text-ink">Appoint an admin</h2>
      <p className="mt-0 mb-3 text-sm text-ink-muted">Find someone by handle or sign-in email. They need a Publisense account.</p>
      <form onSubmit={submit} className="flex items-start gap-2 max-sm:flex-col max-sm:items-stretch">
        <Field label="Handle or email" error={error} className="min-w-0 flex-1">
          <Input
            ref={ref}
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              setError(null);
              setFound(null);
            }}
            placeholder="@handle or name@company.com"
            autoComplete="off"
          />
        </Field>
        <Button type="submit" variant="secondary" loading={find.isPending} className="mt-7 max-sm:mt-0">
          Find
        </Button>
      </form>
      {found ? (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-line px-3 py-2">
          <UserAvatar src={avatarSrc(found)} size="md" />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-base font-semibold text-ink">{found.name || `@${found.handle}`}</b>
            <span className="truncate text-sm text-ink-muted">@{found.handle}</span>
          </span>
          {found.is_admin ? (
            <span className="rounded-pill bg-subtle px-2 text-xs font-medium text-ink-secondary">Already an admin</span>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setGrantError(null);
                setConfirming(true);
              }}
            >
              Make admin
            </Button>
          )}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming && Boolean(found)}
        title={`Make @${found?.handle ?? ''} an admin?`}
        confirmLabel="Make admin"
        busy={grant.isPending}
        error={grantError}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          found &&
          grant.mutate(found.id, {
            onSuccess: () => {
              toast(`@${found.handle} is now an admin`);
              setConfirming(false);
              setFound(null);
              setWho('');
            },
            onError: (e) => setGrantError(e instanceof Error ? e.message : 'Something went wrong. Try again.'),
          })
        }
      >
        They’ll see every report and ownership dispute, can hide content anywhere, and can appoint or remove admins. This is recorded in the log.
      </ConfirmDialog>
    </Card>
  );
}

function AdminLog() {
  const events = useAdminEvents();
  const list = events.data ?? [];
  return (
    <Card>
      <h2 className="mt-0 mb-1 text-md font-semibold text-ink">Log</h2>
      <p className="mt-0 mb-3 text-sm text-ink-muted">Every appointment and removal.</p>
      {events.isPending ? (
        <SkeletonBlock className="h-8 w-full" />
      ) : events.isError ? (
        <LoadError title="We couldn’t load the log" onRetry={() => void events.refetch()} retrying={events.isRefetching} />
      ) : list.length === 0 ? (
        <p className="m-0 text-sm text-ink-muted">No changes yet. The first admin was set up with the database.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Admin log">
          {list.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-t border-line py-2 text-sm text-ink-secondary first:border-t-0">
              <span>
                <Person p={e.actor} /> {e.action === 'grant' ? 'made' : 'removed'} <Person p={e.user} /> {e.action === 'grant' ? 'an admin' : 'as admin'}
              </span>
              <time dateTime={e.at} className="text-ink-muted">
                {formatDate(e.at, new Date(), true)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
