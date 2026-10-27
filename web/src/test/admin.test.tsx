import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { DisputeRow, ReportGroup } from '../api/moderation';
import { AdminDisputesPage, AdminReportsPage, AdminTeamPage } from '../pages/AdminPages';
import { iso, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const mod = vi.hoisted(() => ({
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

beforeEach(() => {
  vi.clearAllMocks();
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
