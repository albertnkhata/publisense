export type InboundStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'shipped' | 'closed';

export interface InboundTransition {
  postId: string;
  to: InboundStatus;
  note: string | null;
}

const VALID_STATUSES = new Set<string>([
  'open',
  'under_review',
  'planned',
  'in_progress',
  'shipped',
  'closed',
  'declined', // alias for 'closed'
]);

const POST_URL_RE = /\/post\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract unique Publisense post UUIDs from an issue description or PR body. */
export function extractPostIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  POST_URL_RE.lastIndex = 0;
  while ((m = POST_URL_RE.exec(text)) !== null) {
    if (m[1]) seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Parse an inbound webhook body from GitHub (`issues` / `pull_request`),
 * Linear (`Issue`), or a direct JSON payload (`{ post_id, status, note }`).
 */
export function parseInboundWebhook(payload: unknown, githubEvent?: string): InboundTransition[] {
  const root = asRecord(payload);
  if (!root) return [];

  // 1. Direct JSON payload: { post_id, status, note? }
  const directPostId = asString(root.post_id || root.postId);
  const rawStatus = asString(root.status).toLowerCase();
  if (UUID_RE.test(directPostId) && VALID_STATUSES.has(rawStatus)) {
    const directStatus: InboundStatus = rawStatus === 'declined' ? 'closed' : (rawStatus as InboundStatus);
    const note = asString(root.note) || null;
    return [{ postId: directPostId.toLowerCase(), to: directStatus, note }];
  }

  // 2. GitHub Issues webhook (`issue` object + `action`)
  const issue = asRecord(root.issue);
  const repo = asRecord(root.repository);
  const repoName = asString(repo?.full_name);
  const action = asString(root.action).toLowerCase();
  if (issue && (!githubEvent || githubEvent === 'issues')) {
    const body = asString(issue.body);
    const ids = extractPostIds(body);
    if (ids.length === 0) return [];
    const num = typeof issue.number === 'number' ? issue.number : null;
    const ref = repoName && num ? `${repoName}#${num}` : num ? `#${num}` : 'GitHub issue';
    const stateReason = asString(issue.state_reason).toLowerCase();

    if (action === 'closed') {
      const to: InboundStatus = stateReason === 'not_planned' ? 'closed' : 'shipped';
      const note = to === 'closed' ? `Closed as not planned in ${ref}` : `Resolved in ${ref}`;
      return ids.map((postId) => ({ postId, to, note }));
    }
    if (action === 'reopened') {
      return ids.map((postId) => ({ postId, to: 'open', note: `Reopened in ${ref}` }));
    }
    return [];
  }

  // 3. GitHub Pull Request webhook (`pull_request` object + `action === 'closed'` + `merged === true`)
  const pr = asRecord(root.pull_request);
  if (pr && (!githubEvent || githubEvent === 'pull_request')) {
    if (action === 'closed' && pr.merged === true) {
      const ids = extractPostIds(asString(pr.body));
      const num = typeof pr.number === 'number' ? pr.number : null;
      const ref = repoName && num ? `${repoName}#${num}` : num ? `PR #${num}` : 'GitHub PR';
      return ids.map((postId) => ({ postId, to: 'shipped', note: `Shipped in ${ref}` }));
    }
    return [];
  }

  // 4. Linear Issue webhook (`type === 'Issue'`, `data` object with `description`, `identifier`, `state`)
  const type = asString(root.type);
  const data = asRecord(root.data);
  if ((type === 'Issue' || data?.identifier) && data) {
    const ids = extractPostIds(asString(data.description));
    if (ids.length === 0) return [];
    const state = asRecord(data.state);
    const stateType = asString(state?.type).toLowerCase();
    const stateName = asString(state?.name);
    const identifier = asString(data.identifier) || 'Linear';

    let to: InboundStatus | null = null;
    if (stateType === 'completed') to = 'shipped';
    else if (stateType === 'started') to = 'in_progress';
    else if (stateType === 'canceled') to = 'closed';
    else if (stateType === 'unstarted' && stateName.toLowerCase().includes('plan')) to = 'planned';

    if (!to) return [];
    const label =
      to === 'shipped'
        ? `Completed in ${identifier}`
        : to === 'in_progress'
          ? `Started in ${identifier}`
          : to === 'closed'
            ? `Canceled in ${identifier}`
            : `Planned in ${identifier}`;
    return ids.map((postId) => ({ postId, to, note: label }));
  }

  return [];
}
