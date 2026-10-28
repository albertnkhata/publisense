import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  categoryLabel,
  logoSrc,
  plural,
  shortAge,
  useCommandCentre,
  type CommandCentreDayPoint,
  type CommandCentreWindow,
  type PostStatus,
} from '../api';
import { cx } from '../lib/cx';
import { LoadError } from '../posts/PostList';
import { useAddProduct } from '../products/AddProductDialog';
import { BoardAvatar, Button, SkeletonBlock, STATUS_META } from '../ui';

const WINDOWS: Array<{ value: CommandCentreWindow; label: string }> = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

const STATUS_ORDER: PostStatus[] = ['open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed', 'merged'];

/** Raw usage events (and so search terms) are kept this many days before the nightly rollup (0054). */
const SEARCH_TERM_DAYS = 30;

function pct(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function Panel({ title, note, aside, children, className }: { title: string; note?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cx('rounded-md border border-line bg-card px-5 py-4 max-sm:p-4', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 text-md font-semibold text-ink">{title}</h2>
          {note ? <p className="mt-1 mb-0 text-sm text-ink-muted">{note}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'shipped';
}) {
  return (
    <div className="flex flex-col justify-between gap-1 rounded-md border border-line bg-subtle px-4 py-3">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <strong className={cx('font-mono text-xl font-bold tabular-nums', tone === 'shipped' ? 'text-success' : 'text-ink')}>{value}</strong>
      {sub ? <span className="text-xs text-ink-secondary">{sub}</span> : null}
    </div>
  );
}

function SeriesChart({
  label,
  total,
  points,
  pick,
}: {
  label: string;
  total: number;
  points: CommandCentreDayPoint[];
  pick: (p: CommandCentreDayPoint) => number;
}) {
  const values = points.map(pick);
  const max = Math.max(1, ...values);
  const count = Math.max(1, values.length);
  const width = 240;
  const height = 44;
  const step = width / count;
  const barWidth = Math.max(2, step - 2);
  const firstDay = points[0]?.day ?? '';
  const lastDay = points[points.length - 1]?.day ?? '';

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-secondary">{label}</span>
        <strong className="font-mono text-md font-semibold text-ink tabular-nums">{total}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${total}`} className="h-9 w-full overflow-visible">
        {values.map((v, i) => {
          const barHeight = v > 0 ? Math.max(3, Math.round((v / max) * (height - 4))) : 1;
          const x = Math.round(i * step * 10) / 10;
          const y = height - barHeight;
          return (
            <rect
              key={points[i]?.day ?? i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={1}
              className={v > 0 ? 'fill-brand' : 'fill-line-strong'}
            >
              <title>{`${points[i]?.day ?? ''}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
      {firstDay && lastDay ? (
        <div className="flex justify-between font-mono text-xs text-ink-muted tabular-nums">
          <span>{firstDay.slice(5)}</span>
          <span>{lastDay.slice(5)}</span>
        </div>
      ) : null}
    </div>
  );
}

function FunnelList({ title, rows }: { title: string; rows: Array<{ label: string; value: number; muted?: boolean }> }) {
  const top = Math.max(1, rows[0]?.value ?? 0);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle px-4 py-3">
      <h3 className="m-0 text-sm font-semibold text-ink">{title}</h3>
      <dl className="m-0 flex flex-col gap-2">
        {rows.map((r, idx) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
            <dt className={cx('text-xs', r.muted ? 'text-ink-muted' : 'text-ink-secondary')}>{r.label}</dt>
            <dd className="m-0 flex items-baseline gap-2 font-mono text-xs tabular-nums">
              <strong className={cx('font-semibold', r.muted ? 'text-ink-muted' : 'text-ink')}>{r.value}</strong>
              {idx > 0 && !r.muted && (rows[0]?.value ?? 0) > 0 ? <span className="text-ink-muted">({pct(r.value, top)})</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AdminOverview() {
  const [days, setDays] = useState<CommandCentreWindow>(30);
  const query = useCommandCentre(days);
  const addProduct = useAddProduct();

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBlock className="h-9 w-full" />
        <SkeletonBlock className="h-9 w-full" />
        <SkeletonBlock className="h-9 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <LoadError
        title="We couldn’t load the command centre"
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    );
  }

  const d = query.data;
  const { queues, traction, loop, traffic, funnels, series, hot_unclaimed_boards, empty_searches, referrers, auth_triggers } = d;
  const visiblePosts = Math.max(0, traction.member_posts_total + traction.imported_posts_total);

  const queueCards = [
    { label: 'New products', count: queues.pending_products, to: '/admin/products' },
    { label: 'Companies', count: queues.pending_companies, to: '/admin/companies' },
    { label: 'Reports', count: queues.open_reports, to: '/admin/reports' },
    { label: 'Ownership disputes', count: queues.open_disputes, to: '/admin/disputes' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">
          Window: last <strong className="font-mono font-semibold text-ink">{days}</strong> days
          {queues.pending_joins > 0 ? ` · ${plural(queues.pending_joins, 'team join request')} waiting on boards` : ''}
        </span>
        <div className="flex items-center gap-2">
          <div role="toolbar" aria-label="Time window" className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                aria-pressed={days === w.value}
                onClick={() => setDays(w.value)}
                className={cx(
                  'h-7 cursor-pointer rounded-pill border px-3 font-mono text-xs font-semibold transition-colors duration-120',
                  days === w.value
                    ? 'border-ink bg-ink text-card'
                    : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      <section aria-label="Action queues" className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        {queueCards.map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className={cx(
              'flex flex-col justify-between gap-1 rounded-md border px-4 py-3 no-underline transition-colors duration-120',
              q.count > 0
                ? 'border-brand bg-brand-soft text-ink hover:border-brand'
                : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
            )}
          >
            <span className="text-xs font-medium text-ink-muted">{q.label}</span>
            <span className="flex items-baseline justify-between gap-2">
              <strong className={cx('font-mono text-xl font-bold tabular-nums', q.count > 0 ? 'text-brand' : 'text-ink')}>{q.count}</strong>
              <span className="text-xs font-semibold text-brand">{q.count > 0 ? 'Review →' : 'Clear'}</span>
            </span>
          </Link>
        ))}
      </section>

      <Panel
        title="Traction & community activity"
        note="Member posts and imported seed posts are always reported separately (D-011)."
      >
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <StatTile
            label="Accounts"
            value={traction.users_total}
            sub={`+${traction.users_window} in ${days}d`}
          />
          <StatTile
            label="Member posts"
            value={traction.member_posts_total}
            sub={`+${traction.member_posts_window} in ${days}d · ${traction.imported_posts_total} imported`}
          />
          <StatTile
            label="Replies"
            value={traction.replies_total}
            sub={`${traction.official_replies_total} official · +${traction.replies_window} in ${days}d`}
          />
          <StatTile
            label="Votes & follows"
            value={traction.votes_total}
            sub={`+${traction.votes_window} votes in ${days}d · ${traction.follows_total} follows`}
          />
        </div>
      </Panel>

      <Panel
        title={`Traffic & daily pulse (${days}d)`}
        note="Cookieless first-party events grouped by temporary per-visit session token."
      >
        <div className="mb-3 grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <StatTile label={`Visits (${days}d)`} value={traffic.visits} sub="Visit tokens, counted per day" />
          <StatTile label={`Page views (${days}d)`} value={traffic.page_views} sub="Public routes & boards" />
          <StatTile label={`Share clicks (${days}d)`} value={traffic.share_clicks} sub="Copied or shared links" />
          <StatTile label={`Bot unfurls (${days}d)`} value={traffic.share_unfurls} sub="Slack, X, Discord previews" />
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <SeriesChart label="Daily visits" total={traffic.visits} points={series} pick={(p) => p.visits} />
          <SeriesChart label="Daily page views" total={traffic.page_views} points={series} pick={(p) => p.page_views} />
          <SeriesChart
            label="New member posts & votes"
            total={traction.member_posts_window + traction.votes_window}
            points={series}
            pick={(p) => p.posts + p.votes}
          />
          <SeriesChart
            label="Official replies & status updates"
            total={series.reduce((acc, p) => acc + p.responses, 0)}
            points={series}
            pick={(p) => p.responses}
          />
        </div>
      </Panel>

      <Panel
        title="Feedback-to-response loop"
        note="How many boards are claimed by verified product teams and how quickly posts get an official response."
      >
        <div className="mb-3 grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <StatTile
            label="Claimed boards"
            value={`${loop.claimed_boards}/${loop.live_boards}`}
            sub={`${pct(loop.claimed_boards, loop.live_boards)} claimed · ${loop.claimed_hubs}/${loop.live_hubs} hubs`}
          />
          <StatTile
            label="Responded posts"
            value={loop.responded_posts}
            sub={`${pct(loop.responded_posts, visiblePosts)} of ${visiblePosts} visible posts`}
          />
          <StatTile
            label="Shipped"
            value={loop.shipped_posts}
            tone="shipped"
            sub="Completed requests"
          />
          <StatTile
            label="Median first response"
            value={loop.median_first_response_hours !== null ? `${loop.median_first_response_hours}h` : '—'}
            sub="Post to first team action"
          />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Posts by status">
          {STATUS_ORDER.map((st) => {
            const count = loop.by_status?.[st] ?? 0;
            return (
              <span
                key={st}
                className="inline-flex h-7 items-center gap-2 rounded-pill border border-line bg-subtle px-3 text-xs text-ink-secondary"
              >
                <span>{STATUS_META[st].label}</span>
                <strong className={cx('font-mono font-semibold tabular-nums', st === 'shipped' ? 'text-success' : 'text-ink')}>
                  {count}
                </strong>
              </span>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={`Conversion funnels (${days}d)`}
        note="Step-by-step progression across board claiming, posting feedback, and command-palette search."
      >
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <FunnelList
            title="Builder claiming"
            rows={[
              { label: 'Claim modal opened', value: funnels.claim.open },
              { label: 'Board selected', value: funnels.claim.board_picked },
              { label: 'Sign-up prompt clicked', value: funnels.claim.auth_prompt },
              { label: 'Verification started', value: funnels.claim.verify_started },
              { label: 'Verification failed', value: funnels.claim.verify_failed, muted: true },
              { label: 'Claims completed', value: funnels.claim.completed },
            ]}
          />
          <FunnelList
            title="Feedback composer"
            rows={[
              { label: 'Composer opened', value: funnels.composer.open },
              { label: 'Similar post clicked (deflected)', value: funnels.composer.similar_click },
              { label: 'Member posts created', value: funnels.composer.posts_created },
            ]}
          />
          <FunnelList
            title="Search palette"
            rows={[
              { label: 'Search opened', value: funnels.search.open },
              { label: 'Result selected', value: funnels.search.click },
              { label: 'Zero-result queries', value: funnels.search.empty, muted: true },
            ]}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Panel
          title="Hot unclaimed boards"
          note="Unclaimed live boards ranked by views, claim clicks, posts and votes."
        >
          {hot_unclaimed_boards.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Every live board is claimed, or no unclaimed boards exist yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Hot unclaimed boards">
              {hot_unclaimed_boards.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                  <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="sm" decorative />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link to={`/b/${b.slug}`} className="truncate text-sm font-semibold text-ink no-underline hover:underline">
                      {b.name}
                    </Link>
                    <span className="truncate text-xs text-ink-muted">
                      {b.category ? `${categoryLabel(b.category)} · ` : ''}
                      {plural(b.post_count, 'post')} · {plural(b.vote_count, 'vote')}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end font-mono text-xs tabular-nums">
                    <span className="font-semibold text-ink">{plural(b.views, 'view')}</span>
                    <span className={b.claim_opens > 0 ? 'font-semibold text-brand' : 'text-ink-muted'}>
                      {plural(b.claim_opens, 'claim click')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={days > SEARCH_TERM_DAYS ? `Unmet search demand (last ${SEARCH_TERM_DAYS} days)` : 'Unmet search demand'}
          note={
            days > SEARCH_TERM_DAYS
              ? `Searches that returned zero matches—candidates to seed next. Search terms are kept for ${SEARCH_TERM_DAYS} days, so this list covers the last ${SEARCH_TERM_DAYS} days only.`
              : 'Searches that returned zero matches—candidates to seed next.'
          }
        >
          {empty_searches.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">No zero-result searches recorded in the last {Math.min(days, SEARCH_TERM_DAYS)} days.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Unmet search demand">
              {empty_searches.map((row) => (
                <li key={row.query} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate font-mono text-sm font-semibold text-ink">“{row.query}”</strong>
                    <span className="text-xs text-ink-muted">
                      {plural(row.count, 'search', 'searches')} · last {shortAge(row.last_at)} ago
                    </span>
                  </div>
                  {addProduct ? (
                    <Button size="sm" variant="secondary" onClick={() => addProduct.openAddProduct({ prefill: row.query })}>
                      Add product
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Panel
          title="Top external referrers"
          note="External domains sending visitors to Publisense (paths and query tokens stripped)."
        >
          {referrers.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">No external referrers recorded in the last {days} days.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Top external referrers">
              {referrers.map((r) => (
                <li key={r.host} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
                  <span className="truncate font-mono text-sm font-medium text-ink">{r.host}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-secondary tabular-nums">
                    {plural(r.visits, 'visit')} · {plural(r.views, 'view')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Sign-in triggers & email links"
          note={`Actions that opened the sign-in dialog · ${plural(auth_triggers.expired_links, 'expired email link')} hit in ${days}d.`}
        >
          {auth_triggers.triggers.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">No sign-in prompts recorded in the last {days} days.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Sign-in triggers">
              {auth_triggers.triggers.map((t) => (
                <li key={t.trigger} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
                  <span className="truncate text-sm text-ink-secondary">{t.trigger}</span>
                  <strong className="shrink-0 font-mono text-xs font-semibold text-ink tabular-nums">{t.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
