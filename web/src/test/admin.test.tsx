import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { DisputeRow, ReportGroup } from '../api/moderation';
import type { CommandCentreData } from '../api/analytics';
import { CLAIM_VERIFY_FAIL_REASONS, claimFailReason, externalReferrerHost, getVisitId, loggableSearchTerm, looksPersonal } from '../api/analytics';
import { AdminDisputesPage, AdminOverviewPage, AdminReportsPage, AdminTeamPage } from '../pages/AdminPages';
import { iso, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const mod = vi.hoisted(() => ({
  fetchCommandCentre: vi.fn(),
  fetchIsPlatformAdmin: vi.fn(),
  fetchReportQueue: vi.fn(),
  decideReports: vi.fn(),
  fetchDisputes: vi.fn(),
  decideDispute: vi.fn(),
  fetchPlatformAdmins: vi.fn(),
  fetchAdminEvents: vi.fn(),
  findUser: vi.fn(),
  grantPlatformAdmin: vi.fn(),
  revokePlatformAdmin: vi.fn(),
}));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...mod }));

const { ModerationError } = await vi.importActual<typeof import('../api/moderation')>('../api/moderation');

function renderAt(path: string, signedIn = true) {
  return renderWith(
    <Routes>
      <Route path="/admin" element={<AdminOverviewPage />} />
      <Route path="/admin/reports" element={<AdminReportsPage />} />
      <Route path="/admin/disputes" element={<AdminDisputesPage />} />
      <Route path="/admin/team" element={<AdminTeamPage />} />
    </Routes>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

const GROUP: ReportGroup = {
  key: 'post:p1',
  target: 'post',
  target_id: 'p1',
  latest: iso(1),
  reports: [
    { id: 'r1', target: 'post', target_id: 'p1', reason: 'Spam or advertising', status: 'open', created_at: iso(1), decided_at: null, reporter: OTHER },
    { id: 'r2', target: 'post', target_id: 'p1', reason: 'Harassment or hate: rude', status: 'open', created_at: iso(2), decided_at: null, reporter: ME },
  ],
  post: { id: 'p1', title: 'Buy followers cheap', body: '', type: 'bug', hidden_at: null, author: OTHER, board: { id: 'b1', slug: 'cursor', name: 'Cursor', color: '' } },
};

const DISPUTE: DisputeRow = {
  id: 'd1',
  user_id: OTHER.id,
  scope: 'board',
  scope_id: 'b2',
  reason: 'A former contractor still controls the board.',
  work_email: 'jm@linear.app',
  status: 'pending',
  created_at: iso(3),
  decided_at: null,
  filer: OTHER,
  name: 'Linear',
  slug: 'linear',
  owners: [ME],
};

const COMMAND_CENTRE: CommandCentreData = {
  days: 30,
  generated_at: iso(0),
  queues: { pending_products: 3, pending_companies: 1, open_reports: 2, open_disputes: 0, pending_joins: 1 },
  traction: {
    users_total: 42,
    users_window: 12,
    member_posts_total: 18,
    member_posts_window: 7,
    imported_posts_total: 11,
    replies_total: 25,
    replies_window: 9,
    official_replies_total: 6,
    official_replies_window: 4,
    votes_total: 94,
    votes_window: 31,
    follows_total: 19,
  },
  loop: {
    live_boards: 30,
    claimed_boards: 9,
    live_hubs: 6,
    claimed_hubs: 2,
    responded_posts: 14,
    shipped_posts: 5,
    median_first_response_hours: 4.2,
    by_status: { open: 15, under_review: 4, planned: 3, in_progress: 2, shipped: 5, closed: 0, merged: 0 },
  },
  traffic: { page_views: 640, visits: 210, share_unfurls: 14, share_clicks: 9 },
  funnels: {
    claim: {
      open: 20,
      board_picked: 15,
      auth_prompt: 6,
      verify_started: 10,
      verify_failed: 3,
      completed: 4,
      verify_methods: { email: 7, dns: 3 },
      verify_fail_reasons: [
        { reason: 'wrong_code', count: 2 },
        { reason: 'dns_slow', count: 1 },
      ],
    },
    composer: { open: 28, similar_click: 5, posts_created: 7 },
    search: { open: 85, click: 44, empty: 6 },
  },
  series: [
    { day: '2026-10-27', visits: 100, page_views: 300, signups: 5, posts: 3, votes: 14, responses: 2 },
    { day: '2026-10-28', visits: 110, page_views: 340, signups: 7, posts: 4, votes: 17, responses: 3 },
  ],
  hot_unclaimed_boards: [
    { id: 'b-lin', slug: 'linear', name: 'Linear', color: '#5E6AD2', logo_path: null, category: 'prod', views: 88, claim_opens: 4, post_count: 6, vote_count: 29 },
  ],
  empty_searches: [
    { query: 'raycast', count: 4, last_at: iso(1) },
  ],
  referrers: [
    { host: 'news.ycombinator.com', visits: 54, views: 130 },
  ],
  auth_triggers: {
    expired_links: 2,
    triggers: [{ trigger: 'vote', count: 11 }, { trigger: 'post feedback', count: 6 }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mod.fetchCommandCentre.mockResolvedValue(COMMAND_CENTRE);
  mod.fetchIsPlatformAdmin.mockResolvedValue(true);
  mod.fetchReportQueue.mockResolvedValue([GROUP]);
  mod.decideReports.mockResolvedValue(2);
  mod.fetchDisputes.mockResolvedValue([DISPUTE]);
  mod.decideDispute.mockResolvedValue(undefined);
  mod.fetchPlatformAdmins.mockResolvedValue([{ user_id: TEST_VIEWER.id, granted_at: iso(100), profile: ME }]);
  mod.fetchAdminEvents.mockResolvedValue([]);
  mod.grantPlatformAdmin.mockResolvedValue(undefined);
  mod.revokePlatformAdmin.mockResolvedValue(undefined);
});

describe('admin gate', () => {
  it('people who are not platform admins get the ordinary not-found page', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(false);
    renderAt('/admin/reports');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(mod.fetchReportQueue).not.toHaveBeenCalled();
  });

  it('signed out asks you to sign in, and loads nothing', async () => {
    renderAt('/admin/team', false);
    expect(await screen.findByText('Sign in to continue')).toBeTruthy();
    expect(mod.fetchPlatformAdmins).not.toHaveBeenCalled();
  });
});

describe('reports queue', () => {
  it('shows each reported thing once with every reason, and hides-and-resolves', async () => {
    renderAt('/admin/reports');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    expect(await screen.findByText('Buy followers cheap')).toBeTruthy();
    expect(screen.getByText('2 reports')).toBeTruthy();
    expect(screen.getByText('Spam or advertising')).toBeTruthy();
    expect(screen.getByText('Harassment or hate: rude')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide and resolve' }));
    await waitFor(() => expect(mod.decideReports).toHaveBeenCalledWith('post', 'p1', 'hide'));
    expect(await screen.findByText('Hidden · 2 reports resolved')).toBeTruthy();
  });

  it('dismisses', async () => {
    renderAt('/admin/reports');
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(mod.decideReports).toHaveBeenCalledWith('post', 'p1', 'dismiss'));
  });

  it('an empty queue says so', async () => {
    mod.fetchReportQueue.mockResolvedValue([]);
    renderAt('/admin/reports');
    expect(await screen.findByText('No reports waiting')).toBeTruthy();
    expect(screen.getByText('Posts and replies people report wait here for a moderator.')).toBeTruthy();
  });
});

describe('disputes queue', () => {
  it('transfers ownership after a confirmation', async () => {
    renderAt('/admin/disputes');
    expect(await screen.findByText('A former contractor still controls the board.')).toBeTruthy();
    expect(screen.getByText(/jm@linear\.app/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    const dialog = await screen.findByRole('dialog', { name: 'Give Linear to @jmwamba?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() => expect(mod.decideDispute).toHaveBeenCalledWith('d1', true));
    expect(await screen.findByText('Linear now belongs to @jmwamba')).toBeTruthy();
  });

  it('rejects', async () => {
    renderAt('/admin/disputes');
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject this dispute?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(mod.decideDispute).toHaveBeenCalledWith('d1', false));
  });
});

describe('empty queues', () => {
  it('disputes: a headline and one sentence', async () => {
    mod.fetchDisputes.mockResolvedValue([]);
    renderAt('/admin/disputes');
    expect(await screen.findByText('No disputes waiting')).toBeTruthy();
    expect(screen.getByText('“Report the wrong owner” requests wait here, and the board’s team never sees them.')).toBeTruthy();
  });
});

describe('admin team', () => {
  it('the only admin cannot step down', async () => {
    renderAt('/admin/team');
    const list = await screen.findByRole('list', { name: 'Admins' });
    expect(within(list).getByText(/\(you\)/)).toBeTruthy();
    expect(within(list).getByRole('button', { name: 'Step down' }).hasAttribute('disabled')).toBe(true);
  });

  it('finds someone and appoints them after confirming who was found', async () => {
    mod.findUser.mockResolvedValue({ ...OTHER, is_admin: false });
    renderAt('/admin/team');
    const field = await screen.findByLabelText('Handle or email');
    expect(field.getAttribute('placeholder')).toBe('Handle or email');
    fireEvent.change(field, { target: { value: 'jm@linear.app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appoint' }));
    await waitFor(() => expect(mod.findUser).toHaveBeenCalledWith('jm@linear.app'));
    const dialog = await screen.findByRole('dialog', { name: 'Appoint @jmwamba as an admin?' });
    expect(within(dialog).getByText('@jmwamba')).toBeTruthy();
    expect(mod.grantPlatformAdmin).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appoint' }));
    await waitFor(() => expect(mod.grantPlatformAdmin).toHaveBeenCalledWith(OTHER.id));
    expect(await screen.findByText('@jmwamba is now an admin')).toBeTruthy();
  });

  it('says when nobody matches', async () => {
    mod.findUser.mockRejectedValue(new ModerationError('not_found', 'We couldn’t find that.'));
    renderAt('/admin/team');
    fireEvent.change(await screen.findByLabelText('Handle or email'), { target: { value: '@ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appoint' }));
    expect(await screen.findByText('No account uses that handle or email.')).toBeTruthy();
  });

  it('says when the person is already an admin, without a confirm', async () => {
    mod.findUser.mockResolvedValue({ ...OTHER, is_admin: true });
    renderAt('/admin/team');
    fireEvent.change(await screen.findByLabelText('Handle or email'), { target: { value: '@jmwamba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appoint' }));
    expect(await screen.findByText('@jmwamba is already an admin.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before stepping down', async () => {
    mod.fetchPlatformAdmins.mockResolvedValue([
      { user_id: TEST_VIEWER.id, granted_at: iso(100), profile: ME },
      { user_id: OTHER.id, granted_at: iso(10), profile: OTHER },
    ]);
    renderAt('/admin/team');
    const list = await screen.findByRole('list', { name: 'Admins' });
    fireEvent.click(within(list).getByRole('button', { name: 'Step down' }));
    const dialog = await screen.findByRole('dialog', { name: 'Step down as admin?' });
    expect(mod.revokePlatformAdmin).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mod.revokePlatformAdmin).not.toHaveBeenCalled();
  });

  it('removes another admin and shows the log', async () => {
    mod.fetchPlatformAdmins.mockResolvedValue([
      { user_id: TEST_VIEWER.id, granted_at: iso(100), profile: ME },
      { user_id: OTHER.id, granted_at: iso(10), profile: OTHER },
    ]);
    mod.fetchAdminEvents.mockResolvedValue([{ id: 'e1', action: 'grant', at: iso(10), user: OTHER, actor: ME }]);
    renderAt('/admin/team');
    const log = await screen.findByRole('list', { name: 'Admin log' });
    expect(log.textContent).toContain('@alice made @jmwamba an admin');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove @jmwamba?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove admin' }));
    await waitFor(() => expect(mod.revokePlatformAdmin).toHaveBeenCalledWith(OTHER.id));
  });
});

describe('command centre (/admin)', () => {
  it('renders action queues, D-011 member vs imported split, funnels, hot boards and unmet search demand', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Command centre' })).toBeTruthy();

    const queues = await screen.findByRole('region', { name: 'Action queues' });
    expect(within(queues).getByText('New products')).toBeTruthy();
    expect(within(queues).getByText('3')).toBeTruthy();

    // D-011: member posts and imported seed posts are shown separately
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText(/\+7 in 30d · 11 imported/)).toBeTruthy();

    // Feedback-to-response loop
    expect(screen.getByText('9/30')).toBeTruthy();
    expect(screen.getByText('4.2h')).toBeTruthy();

    // Hot unclaimed boards & unmet search demand
    const hot = screen.getByRole('list', { name: 'Hot unclaimed boards' });
    expect(within(hot).getByText('Linear')).toBeTruthy();
    expect(within(hot).getByText('4 claim clicks')).toBeTruthy();

    const empty = screen.getByRole('list', { name: 'Unmet search demand' });
    expect(within(empty).getByText('“raycast”')).toBeTruthy();
    expect(within(empty).getByText(/4 searches/)).toBeTruthy();

    // External referrers
    const refs = screen.getByRole('list', { name: 'Top external referrers' });
    expect(within(refs).getByText('news.ycombinator.com')).toBeTruthy();
  });

  it('splits claim verification by email vs DNS and lists failure reasons', async () => {
    renderAt('/admin');
    const method = await screen.findByRole('region', { name: 'Claim verification method' });
    expect(within(method).getByText('Work email code')).toBeTruthy();
    expect(within(method).getByText('7')).toBeTruthy();
    expect(within(method).getByText('(70%)')).toBeTruthy();
    expect(within(method).getByText('DNS TXT record')).toBeTruthy();
    expect(within(method).getByText('(30%)')).toBeTruthy();
    const failed = screen.getByRole('region', { name: 'Why verification failed' });
    expect(within(failed).getByText('Wrong code')).toBeTruthy();
    expect(within(failed).getByText('2')).toBeTruthy();
    expect(within(failed).getByText('DNS still propagating')).toBeTruthy();
  });

  it('shows an empty failure-reason state and a zero split when there is no claim verify detail', async () => {
    mod.fetchCommandCentre.mockResolvedValue({
      ...COMMAND_CENTRE,
      funnels: { ...COMMAND_CENTRE.funnels, claim: { ...COMMAND_CENTRE.funnels.claim, verify_methods: { email: 0, dns: 0 }, verify_fail_reasons: [] } },
    });
    renderAt('/admin');
    const failed = await screen.findByRole('region', { name: 'Why verification failed' });
    expect(within(failed).getByText('No failed verifications in the last 30 days.')).toBeTruthy();
  });

  it('maps claim verify errors to the fixed reason enum, never free text', () => {
    expect(claimFailReason({ code: 'wrong_code' })).toBe('wrong_code');
    expect(claimFailReason({ code: 'dns_slow' })).toBe('dns_slow');
    expect(claimFailReason({ code: 'network' })).toBe('network');
    expect(claimFailReason({ code: 'unknown' })).toBe('other');
    expect(claimFailReason({ code: 'Could not verify jane@example.com' })).toBe('other');
    expect(claimFailReason(new Error('boom'))).toBe('other');
    expect(claimFailReason(null)).toBe('other');
    expect(CLAIM_VERIFY_FAIL_REASONS).toContain('other');
  });

  it('switches the time window between 7d, 30d and 90d', async () => {
    renderAt('/admin');
    await screen.findByRole('region', { name: 'Action queues' });
    expect(mod.fetchCommandCentre).toHaveBeenCalledWith(30);

    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() => expect(mod.fetchCommandCentre).toHaveBeenCalledWith(7));

    fireEvent.click(await screen.findByRole('button', { name: '90d' }));
    await waitFor(() => expect(mod.fetchCommandCentre).toHaveBeenCalledWith(90));
  });

  it('labels unmet search demand as the last 30 days when 90d is selected (search terms are raw-only)', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Unmet search demand' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '90d' }));
    expect(await screen.findByRole('heading', { name: 'Unmet search demand (last 30 days)' })).toBeTruthy();
    expect(screen.getByText(/Search terms are kept for 30 days/)).toBeTruthy();
  });

  it('never logs search terms that look like an email or phone number, or are under 3 characters', () => {
    expect(looksPersonal('jane@example.com')).toBe(true);
    expect(looksPersonal('jane (at) example.com')).toBe(true);
    expect(looksPersonal('call +260 97 640 4079')).toBe(true);
    expect(looksPersonal('0976-404-079')).toBe(true);
    expect(looksPersonal('ipad 2024 vs 2025')).toBe(false);
    expect(looksPersonal('linear')).toBe(false);
    expect(loggableSearchTerm('  linear   app ')).toBe('linear app');
    expect(loggableSearchTerm('ab')).toBeNull();
    expect(loggableSearchTerm('x@y')).toBeNull();
    expect(loggableSearchTerm('a'.repeat(80))).toHaveLength(60);
  });

  it('keeps a stable per-tab visit UUID and strips referrers to external hostnames only', () => {
    const first = getVisitId();
    const second = getVisitId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);

    expect(externalReferrerHost('https://www.News.YCombinator.com/item?id=1', 'publisense.app')).toBe('news.ycombinator.com');
    expect(externalReferrerHost('https://publisense.app/explore', 'publisense.app')).toBeNull();
    expect(externalReferrerHost('https://localhost:3001/b/cursor', 'localhost')).toBeNull();
    expect(externalReferrerHost('not-a-url', 'publisense.app')).toBeNull();
  });
});
