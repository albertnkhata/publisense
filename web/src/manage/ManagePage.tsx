import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  compactCount,
  covered,
  logoSrc,
  siteDomain,
  TAGLINE_MAX,
  HUB_DESC_MAX,
  HUB_NAME_MAX,
  useBoard,
  useBoardLogo,
  useHub,
  useManageStats,
  usePostCounts,
  useScopeRole,
  useTeam,
  useUpdateBoardTagline,
  useUpdateHub,
  useVerifiedDomains,
  type Board,
  type BoardWithHub,
  type Hub,
  type Role,
  type TypeFilter,
} from '../api';
import { BackLink } from '../boards/parts';
import { ScopeHeader } from '../boards/ScopeHeader';
import { useClaim } from '../claim/ClaimDialog';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import { HeaderSkeleton, ScopeNotFound, actionLink } from '../pages/BoardPage';
import { useAuthDialog } from '../shell/auth';
import { BoardAvatar, Button, EmptyState, Field, Icon, Input, TabPanel, Tabs, Textarea, useToast } from '../ui';
import { AddTeammate, BlockedList, canManage, Chips, Inbox, JoinRequests, ReleaseSection, Section, TeamList, Tiles, TYPE_OPTIONS } from './parts';

/**
 * Manage (FOUNDATION §9 `/b/:board/manage`, `/h/:hub/manage`), the mockup's team
 * dashboard: tiles, Triage / Inbox (new posts with no status, most upvoted first,
 * status change in place), All posts, Team (join requests, members and roles,
 * add teammates) and Settings. Only the team sees it; RLS and the RPCs are the guard.
 */

type BoardTab = 'triage' | 'posts' | 'team' | 'settings';
type HubTab = 'inbox' | 'boards' | 'team' | 'settings';

function useTabParam<T extends string>(allowed: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
  const set = (key: string, value: string, def: string) => {
    const next = new URLSearchParams(params);
    if (value === def) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key !== 'tab' });
  };
  return { tab, params, set };
}

const pickType = (v: string | null): TypeFilter => (v === 'bug' || v === 'feature' ? v : 'all');

// ------------------------------------------------------------------ gates

function Gate({ kind, name, back, children }: { kind: 'board' | 'hub'; name: string; back: string; children: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <BackLink to={back}>{kind === 'board' ? `${name} board` : `${name} hub`}</BackLink>
      <div className="rounded-md border border-line bg-card">
        <h1 id="page-title" className="sr-only">
          Manage {name}
        </h1>
        {children}
      </div>
    </section>
  );
}

function SignInGate({ kind, name, back }: { kind: 'board' | 'hub'; name: string; back: string }) {
  const { openAuth } = useAuthDialog();
  return (
    <Gate kind={kind} name={name} back={back}>
      <EmptyState icon="lock" title={`Sign in to manage ${name}`} action={<Button onClick={() => openAuth('signin', `manage ${name}`)}>Sign in</Button>}>
        Only the verified team sees this page.
      </EmptyState>
    </Gate>
  );
}

function NotTeamGate({ kind, name, back, unclaimed, slug }: { kind: 'board' | 'hub'; name: string; back: string; unclaimed: boolean; slug: string }) {
  const { openClaim } = useClaim();
  return (
    <Gate kind={kind} name={name} back={back}>
      <EmptyState
        icon="lock"
        title={`Only the ${name} team can see this`}
        action={
          unclaimed && kind === 'board' ? (
            <Button onClick={() => openClaim({ board: slug })}>Claim {name}</Button>
          ) : (
            <Link to={back} className={actionLink}>
              View {kind}
            </Link>
          )
        }
      >
        {unclaimed ? `No team has claimed this ${kind} yet.` : `If you work at ${name}, ask the team to add you.`}
      </EmptyState>
    </Gate>
  );
}

// ------------------------------------------------------------------ board

export function BoardManagePage() {
  const { board: slug } = useParams();
  const { viewer } = useViewer();
  const query = useBoard(slug);
  const board = query.data;
  const role = useScopeRole('board', board?.id, viewer?.id ?? null);
  usePageTitle(board ? `Manage ${board.name}` : query.isPending ? null : 'Board not found');

  if (query.isPending) return <HeaderSkeleton label="Loading board" />;
  if (!board) return <ScopeNotFound kind="board" />;
  const back = `/b/${board.slug}`;
  if (!viewer) return <SignInGate kind="board" name={board.name} back={back} />;
  if (role.isPending) return <HeaderSkeleton label={`Manage ${board.name}`} />;
  if (!role.data) return <NotTeamGate kind="board" name={board.name} back={back} slug={board.slug} unclaimed={!board.claimed_at && !board.hub?.claimed_at} />;
  return <BoardManage board={board} role={role.data} />;
}

function BoardManage({ board, role }: { board: BoardWithHub; role: Role }) {
  const { viewer } = useViewer();
  const viewerId = viewer?.id ?? null;
  const admin = canManage(role);
  const tabs = admin ? (['triage', 'posts', 'team', 'settings'] as const) : (['triage', 'posts', 'team'] as const);
  const { tab, params, set } = useTabParam<BoardTab>(tabs, 'triage');
  const ids = useMemo(() => [board.id], [board.id]);
  const stats = useManageStats(ids);
  const counts = usePostCounts(ids);
  const team = useTeam('board', board.id);
  const type = pickType(params.get('type'));
  const hubManaged = Boolean(board.hub?.claimed_at);

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4">
        <BackLink to={`/b/${board.slug}`}>{board.name} board</BackLink>
      </div>
      <ScopeHeader
        logo={<BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="xl" decorative />}
        title={`Manage ${board.name}`}
        description={
          <span className="text-sm text-ink-muted">
            {hubManaged && board.hub ? (
              <>
                <Link to={`/h/${board.hub.slug}/manage`} className="font-semibold text-ink-secondary underline underline-offset-2 hover:text-brand">
                  {board.hub.name} hub
                </Link>{' '}
                ·{' '}
              </>
            ) : (
              'Verified team · '
            )}
            only your team sees this
          </span>
        }
        actions={
          <Link to={`/b/${board.slug}`} className={actionLink}>
            View board
          </Link>
        }
      />
      <StatTiles stats={stats.data} />
      <Tabs
        idBase="manage"
        label={`Manage ${board.name}`}
        value={tab}
        onChange={(v) => set('tab', v, 'triage')}
        className="mb-4"
        items={[
          { value: 'triage', label: 'Triage', ...(stats.data ? { count: stats.data.waiting } : {}) },
          { value: 'posts', label: 'All posts', ...(counts.data ? { count: counts.data.posts } : {}) },
          { value: 'team', label: 'Team', ...(team.data ? { count: team.data.length } : {}) },
          ...(admin ? [{ value: 'settings' as const, label: 'Settings' }] : []),
        ]}
      />
      <TabPanel idBase="manage" value={tab}>
        {tab === 'triage' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-ink-muted">New posts with no status yet, most upvoted first.</span>
              <Chips label="Type" value={type} options={TYPE_OPTIONS} onChange={(v) => set('type', v, 'all')} />
            </div>
            <Inbox
              boardIds={ids}
              status="open"
              type={type}
              empty={
                <>
                  <b className="block font-semibold text-ink">Inbox zero</b>
                  Every post has a status. New ones land here first.
                </>
              }
            />
          </>
        ) : tab === 'posts' ? (
          <Inbox boardIds={ids} status="all" type="all" empty="No posts yet." />
        ) : tab === 'team' ? (
          <>
            {admin ? <JoinRequests scopes={[{ scope: 'board', id: board.id }]} /> : null}
            <Section
              title="Members"
              note={
                hubManaged && board.hub ? (
                  <>
                    This board is managed by the {board.hub.name} hub, whose team covers every board in it.{' '}
                    <Link to={`/h/${board.hub.slug}/manage?tab=team`} className="font-semibold text-ink-secondary underline underline-offset-2 hover:text-brand">
                      Hub team
                    </Link>
                  </>
                ) : (
                  'Members reply with the verified badge and can set statuses. Admins also manage settings and the team.'
                )
              }
            >
              <TeamList scope="board" scopeId={board.id} myRole={role} scopeName={board.name} />
            </Section>
            {admin ? (
              <Section title="Invite teammates" note={`They need an @${siteDomain(board.site) ?? 'company'} address and a Publisense account.`}>
                <AddTeammate scope="board" scopeId={board.id} domain={siteDomain(board.site)} />
              </Section>
            ) : null}
            {admin ? <BlockedList scope="board" scopeId={board.id} /> : null}
          </>
        ) : (
          <BoardSettings board={board} owner={Boolean(team.data?.some((m) => m.role === 'owner' && m.user_id === viewerId))} />
        )}
      </TabPanel>
    </section>
  );
}

function StatTiles({ stats }: { stats: { waiting: number; newThisWeek: number; upvotes: number; shipped: number } | undefined }) {
  const v = (n: number | undefined) => (n === undefined ? '–' : compactCount(n));
  return (
    <Tiles
      items={[
        { value: v(stats?.waiting), label: 'Waiting for a status' },
        { value: v(stats?.newThisWeek), label: 'New this week' },
        { value: v(stats?.upvotes), label: 'Total upvotes' },
        { value: v(stats?.shipped), label: 'Shipped' },
      ]}
    />
  );
}

function BoardSettings({ board, owner }: { board: Board; owner: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const save = useUpdateBoardTagline();
  const logo = useBoardLogo();
  const [tagline, setTagline] = useState(board.tagline);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate({ id: board.id, tagline }, { onSuccess: () => toast('Saved'), onError: (err) => setError(err instanceof Error ? err.message : 'We couldn’t save.') });
  };
  const setLogo = (f: File | null) => {
    setLogoError(null);
    logo.mutate(
      { id: board.id, file: f, previous: board.logo_path },
      { onSuccess: () => toast(f ? 'Logo updated' : 'Logo removed'), onError: (err) => setLogoError(err instanceof Error ? err.message : 'We couldn’t update the logo.') },
    );
  };

  return (
    <>
      <Section title="Board profile" note="Shown at the top of your board.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <BoardAvatar name={board.name} color={board.color} logoSrc={logoSrc(board)} size="xl" decorative />
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => file.current?.click()} loading={logo.isPending}>
                  {board.logo_path ? 'Change logo' : 'Upload logo'}
                </Button>
                {board.logo_path ? (
                  <Button size="sm" variant="ghost" onClick={() => setLogo(null)} disabled={logo.isPending}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <span className="text-sm text-ink-muted">PNG, JPG or WebP. We crop it to a square.</span>
              {logoError ? (
                <span role="alert" className="text-sm text-danger">
                  {logoError}
                </span>
              ) : null}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Board logo"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setLogo(f);
              }}
            />
          </div>
          <Field label="Description" error={error} aside={`${tagline.length}/${TAGLINE_MAX}`}>
            <Input value={tagline} maxLength={TAGLINE_MAX} onChange={(e) => setTagline(e.target.value)} />
          </Field>
          <Field label="Website" hint="Locked to the verified domain.">
            <Input value={board.site ?? ''} disabled readOnly />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={save.isPending} disabled={tagline.trim() === board.tagline}>
              Save
            </Button>
          </div>
        </form>
      </Section>
      {owner ? <ReleaseSection scope="board" scopeId={board.id} name={board.name} onReleased={() => void navigate(`/b/${board.slug}`)} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ hub

export function HubManagePage() {
  const { hub: slug } = useParams();
  const { viewer } = useViewer();
  const query = useHub(slug);
  const hub = query.data;
  const role = useScopeRole('hub', hub?.id, viewer?.id ?? null);
  usePageTitle(hub ? `Manage ${hub.name} hub` : query.isPending ? null : 'Hub not found');

  if (query.isPending) return <HeaderSkeleton label="Loading hub" />;
  if (!hub) return <ScopeNotFound kind="hub" />;
  const back = `/h/${hub.slug}`;
  if (!viewer) return <SignInGate kind="hub" name={hub.name} back={back} />;
  if (role.isPending) return <HeaderSkeleton label={`Manage ${hub.name} hub`} />;
  if (!role.data) return <NotTeamGate kind="hub" name={hub.name} back={back} slug={hub.slug} unclaimed={!hub.claimed_at} />;
  return <HubManage hub={hub} role={role.data} />;
}

function HubManage({ hub, role }: { hub: Hub; role: Role }) {
  const { viewer } = useViewer();
  const admin = canManage(role);
  const tabs = admin ? (['inbox', 'boards', 'team', 'settings'] as const) : (['inbox', 'boards', 'team'] as const);
  const { tab, params, set } = useTabParam<HubTab>(tabs, 'inbox');
  const ids = useMemo(() => hub.boards.map((b) => b.id), [hub.boards]);
  const stats = useManageStats(ids);
  const team = useTeam('hub', hub.id);
  const type = pickType(params.get('type'));
  const boardParam = params.get('board');
  const only = hub.boards.find((b) => b.slug === boardParam) ?? null;
  const inboxIds = useMemo(() => (only ? [only.id] : ids), [only, ids]);
  const first = hub.boards[0];
  const names = Object.fromEntries(hub.boards.map((b) => [b.id, b.name]));

  return (
    <section aria-labelledby="page-title" className="flex flex-col">
      <div className="mb-4">
        <BackLink to={`/h/${hub.slug}`}>{hub.name} hub</BackLink>
      </div>
      <ScopeHeader
        logo={<BoardAvatar name={hub.name} color={first?.color} logoSrc={logoSrc(first)} size="xl" decorative />}
        title={`Manage ${hub.name} hub`}
        description={<span className="text-sm text-ink-muted">{hub.boards.length} boards · only your team sees this</span>}
        actions={
          <Link to={`/h/${hub.slug}`} className={actionLink}>
            View hub
          </Link>
        }
      />
      <StatTiles stats={stats.data} />
      <Tabs
        idBase="hub-manage"
        label={`Manage ${hub.name} hub`}
        value={tab}
        onChange={(v) => set('tab', v, 'inbox')}
        className="mb-4"
        items={[
          { value: 'inbox', label: 'Inbox', ...(stats.data ? { count: stats.data.waiting } : {}) },
          { value: 'boards', label: 'Boards', count: hub.boards.length },
          { value: 'team', label: 'Team', ...(team.data ? { count: team.data.length } : {}) },
          ...(admin ? [{ value: 'settings' as const, label: 'Settings' }] : []),
        ]}
      />
      <TabPanel idBase="hub-manage" value={tab}>
        {tab === 'inbox' ? (
          <>
            <div className="mb-3 flex flex-col gap-2">
              <Chips
                label="Board"
                value={only?.slug ?? 'all'}
                options={[{ value: 'all', label: 'All boards' }, ...hub.boards.map((b) => ({ value: b.slug, label: b.name }))]}
                onChange={(v) => set('board', v, 'all')}
              />
              <Chips label="Type" value={type} options={TYPE_OPTIONS} onChange={(v) => set('type', v, 'all')} />
            </div>
            <Inbox
              boardIds={inboxIds}
              status="open"
              type={type}
              boards={hub.boards}
              empty={
                <>
                  <b className="block font-semibold text-ink">Inbox zero</b>
                  Every post across the {hub.name} hub has a status.
                </>
              }
            />
          </>
        ) : tab === 'boards' ? (
          <Section title="Boards" note="Each board keeps its own page, roadmap and changelog. Your team is shared across them.">
            <ul className="m-0 flex list-none flex-col p-0" aria-label={`${hub.name} boards`}>
              {hub.boards.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-base font-semibold text-ink">{b.name}</b>
                    <span className="truncate text-sm text-ink-muted">
                      {b.post_count} posts · {compactCount(b.follower_count)} followers
                    </span>
                  </span>
                  <Link to={`/b/${b.slug}/manage`} className={actionLink}>
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : tab === 'team' ? (
          <>
            {admin ? <JoinRequests scopes={[{ scope: 'hub', id: hub.id }, ...hub.boards.map((b) => ({ scope: 'board' as const, id: b.id }))]} names={names} /> : null}
            <Section title="Members" note="Members reply with the verified badge and set statuses on every board in the hub. Admins also manage settings and the team.">
              <TeamList scope="hub" scopeId={hub.id} myRole={role} scopeName={`${hub.name} hub`} />
            </Section>
            {admin ? (
              <Section title="Invite teammates" note={`They need an @${hub.primary_domain ?? 'company'} address and a Publisense account.`}>
                <AddTeammate scope="hub" scopeId={hub.id} domain={hub.primary_domain} />
              </Section>
            ) : null}
            {admin ? <BlockedList scope="hub" scopeId={hub.id} /> : null}
          </>
        ) : (
          <HubSettings hub={hub} owner={Boolean(team.data?.some((m) => m.role === 'owner' && m.user_id === viewer?.id))} />
        )}
      </TabPanel>
    </section>
  );
}

function HubSettings({ hub, owner }: { hub: Hub; owner: boolean }) {
  const navigate = useNavigate();
  const { viewer } = useViewer();
  const { toast } = useToast();
  const verified = useVerifiedDomains(viewer?.id ?? null);
  const save = useUpdateHub();
  const [name, setName] = useState(hub.name);
  const [description, setDescription] = useState(hub.description);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the hub a name.');
    setError(null);
    save.mutate({ id: hub.id, name, description }, { onSuccess: () => toast('Saved'), onError: (err) => setError(err instanceof Error ? err.message : 'We couldn’t save.') });
  };
  return (
    <>
      <Section title="Hub" note="Shown on the public hub page.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name" error={error}>
            <Input value={name} maxLength={HUB_NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" aside={`${description.length}/${HUB_DESC_MAX}`}>
            <Textarea rows={2} value={description} maxLength={HUB_DESC_MAX} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={save.isPending} disabled={name.trim() === hub.name && description.trim() === hub.description}>
              Save
            </Button>
          </div>
        </form>
      </Section>
      {hub.primary_domain ? (
        <Section title="Domain" note="Anyone with an email on this domain can be added, and its boards are covered by the hub team.">
          <p className="m-0 flex items-center gap-3 text-base">
            <code className="font-mono text-ink">{hub.primary_domain}</code>
            {covered(verified.data, hub.primary_domain) ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Icon name="check" size={13} strokeWidth={2.4} />
                Verified by you
              </span>
            ) : (
              <span className="text-sm text-ink-muted">Verified by the team</span>
            )}
          </p>
        </Section>
      ) : null}
      {owner ? <ReleaseSection scope="hub" scopeId={hub.id} name={hub.name} onReleased={() => void navigate(`/h/${hub.slug}`)} /> : null}
    </>
  );
}
