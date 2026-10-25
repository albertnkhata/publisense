import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import {
  avatarSrc,
  categoryLabel,
  formatDate,
  logoSrc,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_MAX,
  PRODUCT_TAGLINE_MAX,
  useAdminCompanies,
  useDecideBoard,
  useHubDomain,
  useProductQueue,
  useRenameHub,
  type AdminCompany,
  type BoardCategory,
  type BoardDecision,
  type CompanyChoice,
  type QueuedBoard,
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
import { CompanyPicker } from '../products/CompanyPicker';
import { BoardAvatar, Button, Dialog, EmptyState, Field, Icon, IconButton, Input, Select, SkeletonBlock, Tabs, Textarea, UserAvatar, useToast } from '../ui';
import { NotFound } from './NotFound';

/**
 * Platform-admin screens (FOUNDATION §9): /admin/products (0024), /admin/companies (0026), /admin/reports,
 * /admin/disputes and /admin/team. Only Publisense staff (platform_admin) see them; anyone else gets
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
      <NavLink to="/admin/products" className={item}>
        New products
      </NavLink>
      <NavLink to="/admin/companies" className={item}>
        Companies
      </NavLink>
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

// ------------------------------------------------------------------ new products (0024)

export function AdminProductsPage() {
  return (
    <AdminGate title="New products">
      <ProductQueue />
    </AdminGate>
  );
}

function ProductQueue() {
  const [status, setStatus] = useState<'pending' | 'decided'>('pending');
  const queue = useProductQueue(status);
  const list = queue.data ?? [];
  return (
    <>
      <Tabs
        idBase="products"
        label="Review status"
        value={status}
        onChange={setStatus}
        className="mb-4"
        items={[
          { value: 'pending', label: 'Waiting', ...(status === 'pending' && queue.data ? { count: list.length } : {}) },
          { value: 'decided', label: 'Decided' },
        ]}
      />
      {queue.isPending ? (
        <SkeletonBlock className="h-8 w-full" />
      ) : queue.isError ? (
        <LoadError title="We couldn’t load new products" onRetry={() => void queue.refetch()} retrying={queue.isRefetching} />
      ) : list.length === 0 ? (
        <Quiet>
          <b className="block font-semibold text-ink">{status === 'pending' ? 'Nothing to review' : 'Nothing decided yet'}</b>
          {status === 'pending' ? 'Products people add wait here until someone approves them.' : 'Approved and rejected products show here.'}
        </Quiet>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={status === 'pending' ? 'Products waiting for review' : 'Decided products'}>
          {list.map((b) => (
            <li key={b.id}>
              <ProductCard b={b} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProductCard({ b }: { b: QueuedBoard }) {
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const pending = b.status === 'pending';
  return (
    <Card>
      <p className="mt-0 mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted uppercase">
        {b.site?.startsWith('github.com/') ? 'GitHub repo' : 'Website'}
        <span className="rounded-pill bg-subtle px-2 font-medium normal-case">{categoryLabel(b.category)}</span>
        {!pending ? <span className="rounded-pill bg-subtle px-2 font-medium normal-case">{b.status === 'live' ? 'Approved' : 'Rejected'}</span> : null}
      </p>
      <div className="flex items-center gap-3">
        <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="lg" decorative />
        <span className="flex min-w-0 flex-1 flex-col">
          <Link to={`/b/${b.slug}`} className="truncate text-base font-semibold text-ink no-underline hover:underline">
            {b.name}
          </Link>
          <span className="truncate text-sm text-ink-muted">{b.tagline || 'No description'}</span>
        </span>
      </div>
      <p className="mt-2 mb-0 text-sm text-ink-muted">
        {b.site ? (
          <a href={`https://${b.site}`} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-ink-secondary no-underline hover:underline">
            {b.site}
          </a>
        ) : (
          'No link'
        )}{' '}
        · added by <Person p={b.creator} /> · {shortAge(b.created_at)}
        {b.post_count ? ` · ${plural(b.post_count, 'post', 'posts')}` : ''}
      </p>
      <p className="mt-1 mb-0 flex flex-wrap items-center gap-2 text-sm text-ink-muted" data-company>
        <Icon name="hub" size={13} />
        {b.hub ? (
          <>
            <span className="font-semibold text-ink-secondary">{b.hub.name}</span>
            {b.hub.status === 'pending' ? <span className="rounded-pill bg-subtle px-2 text-xs font-medium">New company</span> : null}
            {b.hub.domains?.length ? <span>{b.hub.domains.join(', ')}</span> : null}
          </>
        ) : (
          <span>No company</span>
        )}
      </p>
      {!pending && b.review_note ? <p className="mt-3 mb-0 rounded-md bg-subtle px-3 py-2 text-sm text-ink">{b.review_note}</p> : null}
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDeciding('approve')}>
            Approve…
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDeciding('reject')}>
            Reject…
          </Button>
        </div>
      ) : null}
      {deciding === 'approve' ? <ApproveDialog b={b} onClose={() => setDeciding(null)} /> : null}
      {deciding === 'reject' ? <RejectDialog b={b} onClose={() => setDeciding(null)} /> : null}
    </Card>
  );
}

function ApproveDialog({ b, onClose }: { b: QueuedBoard; onClose: () => void }) {
  const { toast } = useToast();
  const decide = useDecideBoard();
  const original = b.hub;
  const [name, setName] = useState(b.name);
  const [tagline, setTagline] = useState(b.tagline);
  const [category, setCategory] = useState<BoardCategory>(b.category ?? 'prod');
  const [company, setCompany] = useState<CompanyChoice | null>(
    original ? { kind: 'hub', id: original.id, slug: original.slug, name: original.name, ...(original.status ? { status: original.status } : {}) } : null,
  );
  const [companyText, setCompanyText] = useState('');
  const [companyName, setCompanyName] = useState(original?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const formId = `approve-${b.id}`;
  const keepsNew = Boolean(original && original.status === 'pending' && company?.kind === 'hub' && company.id === original.id);

  const hubDecision = (): BoardDecision['hub'] | 'unpicked' => {
    if (!company) {
      if (companyText.trim()) return 'unpicked';
      return original ? { mode: 'none' } : undefined;
    }
    if (company.kind !== 'hub') return 'unpicked';
    if (original && company.id === original.id) {
      return keepsNew && companyName.trim() && companyName.trim() !== original.name ? { mode: 'keep', name: companyName.trim() } : undefined;
    }
    return { mode: 'set', id: company.id };
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name.');
    if (keepsNew && !companyName.trim()) return setError('Give the company a name, or remove it.');
    const hub = hubDecision();
    if (hub === 'unpicked') return setError('Pick a company from the list, or clear the field.');
    setError(null);
    decide.mutate(
      { id: b.id, approve: true, name: name.trim(), tagline: tagline.trim(), category, ...(hub ? { hub } : {}) },
      {
        onSuccess: () => {
          toast(`${name.trim()} is live`);
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'),
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve ${b.name}?`}
      description="It goes public with these details, and its posts become visible. The person who added it is notified."
      dismissable={!decide.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={decide.isPending}>
            Approve
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" aside={`${name.length}/${PRODUCT_NAME_MAX}`}>
          <Input value={name} maxLength={PRODUCT_NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <CompanyPicker
          value={company}
          onChange={setCompany}
          text={companyText}
          onText={setCompanyText}
          allowNew={false}
          hint={
            keepsNew
              ? 'New company. Approving the product approves it too.'
              : original?.status === 'pending'
                ? `The new company ${original.name} is dropped if no other product uses it.`
                : undefined
          }
        />
        {keepsNew && original ? (
          <div className="flex flex-col gap-4 rounded-md border border-line bg-subtle px-4 py-3">
            <Field label="Company name" aside={`${companyName.length}/60`}>
              <Input value={companyName} maxLength={60} onChange={(e) => setCompanyName(e.target.value)} autoComplete="off" />
            </Field>
            <DomainEditor hubId={original.id} name={companyName.trim() || original.name} domains={original.domains ?? []} />
          </div>
        ) : null}
        <Field label="Description" optional aside={`${tagline.length}/${PRODUCT_TAGLINE_MAX}`}>
          <Input value={tagline} maxLength={PRODUCT_TAGLINE_MAX} onChange={(e) => setTagline(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as BoardCategory)}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {error ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** A company's domains: remove one, or add one (platform admins; saved straight away). */
function DomainEditor({ hubId, name, domains }: { hubId: string; name: string; domains: string[] }) {
  const change = useHubDomain();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const d = draft.trim();
    if (!d) return;
    setError(null);
    change.mutate(
      { hubId, domain: d },
      { onSuccess: () => setDraft(''), onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') },
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">Domains</span>
      {domains.length ? (
        <ul aria-label={`${name} domains`} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {domains.map((d) => (
            <li key={d} className="inline-flex h-7 items-center gap-1 rounded-pill border border-line bg-card pr-1 pl-3 font-mono text-sm text-ink">
              {d}
              <IconButton
                icon="close"
                size="sm"
                label={`Remove ${d}`}
                disabled={change.isPending}
                onClick={() => {
                  setError(null);
                  change.mutate({ hubId, domain: d, remove: true }, { onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') });
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-ink-muted">No domains yet. Products on a company’s domains join it automatically.</p>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={`Add a domain to ${name}`}
          value={draft}
          placeholder="acme.com"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} loading={change.isPending && Boolean(draft.trim())} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ companies (0026)

export function AdminCompaniesPage() {
  return (
    <AdminGate title="Companies">
      <CompanyList />
    </AdminGate>
  );
}

function CompanyList() {
  const list = useAdminCompanies();
  if (list.isPending) return <SkeletonBlock className="h-8 w-full" />;
  if (list.isError) return <LoadError title="We couldn’t load companies" onRetry={() => void list.refetch()} retrying={list.isRefetching} />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <Quiet>
        <b className="block font-semibold text-ink">No companies yet</b>
        Companies appear when someone adds a product with one, or approves one here.
      </Quiet>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Companies">
      {rows.map((h) => (
        <li key={h.id}>
          <CompanyCard h={h} />
        </li>
      ))}
    </ul>
  );
}

function CompanyCard({ h }: { h: AdminCompany }) {
  return (
    <Card>
      <p className="mt-0 mb-3 flex flex-wrap items-center gap-2">
        {h.status === 'live' ? (
          <Link to={`/h/${h.slug}`} className="text-base font-semibold text-ink no-underline hover:underline">
            {h.name}
          </Link>
        ) : (
          <span className="text-base font-semibold text-ink">{h.name}</span>
        )}
        {h.status === 'pending' ? <span className="rounded-pill bg-subtle px-2 text-xs font-medium text-ink-muted">Waiting for review</span> : null}
        <span className="text-sm text-ink-muted">{plural(h.board_count, 'product')}</span>
      </p>
      {h.former_names.length ? (
        <p className="mt-0 mb-3 text-sm text-ink-muted">Formerly {h.former_names.join(', ')}.</p>
      ) : null}
      <DomainEditor hubId={h.id} name={h.name} domains={h.domains} />
      <RenameEditor h={h} />
    </Card>
  );
}

/**
 * A company that changes its name keeps the old one (0030): the rename records history, and
 * the address it used to have resolves to it for good. Leaving the slug blank derives one
 * no other company has used.
 */
function RenameEditor({ h }: { h: AdminCompany }) {
  const rename = useRenameHub();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(h.name);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) return;
    setError(null);
    rename.mutate(
      { hubId: h.id, name: next, slug: slug.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setSlug('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'),
      },
    );
  };
  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => { setName(h.name); setOpen(true); }}>
          Rename
        </Button>
      </div>
    );
  }
  return (
    <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
      <span className="text-sm font-semibold text-ink">Rename company</span>
      <Input
        aria-label={`New name for ${h.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />
      <Input
        aria-label={`New address for ${h.name} (optional)`}
        value={slug}
        placeholder={`${h.slug} — leave blank to derive one`}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setSlug(e.target.value)}
      />
      <p className="m-0 text-sm text-ink-muted">
        The name it uses now stays on record, and /h/{h.slug} keeps pointing here.
      </p>
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={rename.isPending} disabled={!name.trim()}>
          Save
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RejectDialog({ b, onClose }: { b: QueuedBoard; onClose: () => void }) {
  const { toast } = useToast();
  const decide = useDecideBoard();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setError(null);
    decide.mutate(
      { id: b.id, approve: false, reason },
      {
        onSuccess: () => {
          toast(`${b.name} rejected`);
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'),
      },
    );
  };
  const who = b.creator ? `@${b.creator.handle}` : 'The person who added it';
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reject ${b.name}?`}
      description={`It stays hidden, and so do its posts. ${who} is told, with your reason if you give one.`}
      dismissable={!decide.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} loading={decide.isPending}>
            Reject
          </Button>
        </>
      }
    >
      <Field label="Reason" optional hint="Shown to the person who added it." aside={`${reason.length}/500`}>
        <Textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Already on Publisense as …, or not a product people can give feedback on" />
      </Field>
      {error ? (
        <p role="alert" className="mt-3 mb-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
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
