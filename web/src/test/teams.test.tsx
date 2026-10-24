import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { FeedPage, Post } from '../api/posts';
import type { Member } from '../api/teams';
import { ClaimProvider } from '../claim/ClaimDialog';
import { BoardManagePage, HubManagePage } from '../manage/ManagePage';
import { BoardPage } from '../pages/BoardPage';
import { HubPage } from '../pages/HubPage';
import { StatusDialog } from '../posts/StatusDialog';
import { ComposerProvider } from '../shell/composer';
import { CURSOR, FIGJAM, FIGMA, FIGMA_HUB, makeBoard } from './boardFixtures';
import { makePost, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

// The api layer's network calls are mocked; its pure helpers stay real.
const teamsApi = vi.hoisted(() => ({
  fetchVerifiedDomains: vi.fn(),
  fetchPendingDns: vi.fn(),
  startEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  startDnsCheck: vi.fn(),
  checkDns: vi.fn(),
  claimBoard: vi.fn(),
  claimHub: vi.fn(),
  fetchMyRequests: vi.fn(),
  requestJoin: vi.fn(),
  openDispute: vi.fn(),
  fetchTeam: vi.fn(),
  fetchScopeRole: vi.fn(),
  addMember: vi.fn(),
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
  fetchJoinRequests: vi.fn(),
  decideJoinRequest: vi.fn(),
  setPostStatus: vi.fn(),
  fetchManageStats: vi.fn(),
  updateBoardTagline: vi.fn(),
  updateHub: vi.fn(),
}));
const boardsApi = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  fetchBoards: vi.fn(),
  fetchHub: vi.fn(),
  fetchHubs: vi.fn(),
  fetchPostCounts: vi.fn(),
  fetchIsBoardTeam: vi.fn(),
  fetchFollowedScopes: vi.fn(),
  fetchTrending: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchPostList: vi.fn(),
  fetchRoadmap: vi.fn(),
  fetchChangelog: vi.fn(),
  createReply: vi.fn(),
  setPostFollow: vi.fn(),
}));
vi.mock('../api/teams', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/teams')>()), ...teamsApi }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));

const { TeamError } = await vi.importActual<typeof import('../api/teams')>('../api/teams');

const page = (items: Post[]): FeedPage => ({ items, next: null });
const CLAIMED = { ...CURSOR, claimed_at: new Date().toISOString() };
const FIGMA_SITE = { ...FIGMA, site: 'figma.com' };
const FIGJAM_SITE = { ...FIGJAM, site: 'figma.com/figjam' };
const HUB_SITES = { ...FIGMA_HUB, boards: [FIGJAM_SITE, FIGMA_SITE] };
const FIGMA_WITH_HUB = { ...FIGMA_SITE, hub: { id: FIGMA_HUB.id, slug: 'figma', name: 'Figma', claimed_at: null, primary_domain: 'figma.com' } };

function renderAt(path: string, signedIn = true) {
  return renderWith(
    <ComposerProvider>
      <ClaimProvider>
        <Routes>
          <Route path="/b/:board" element={<BoardPage />} />
          <Route path="/b/:board/manage" element={<BoardManagePage />} />
          <Route path="/h/:hub" element={<HubPage />} />
          <Route path="/h/:hub/manage" element={<HubManagePage />} />
          <Route path="/post/:id" element={<h1>Post page</h1>} />
        </Routes>
      </ClaimProvider>
    </ComposerProvider>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

const member = (over: Partial<Member>): Member => ({
  user_id: OTHER.id,
  scope: 'board',
  scope_id: CURSOR.id,
  role: 'member',
  created_at: new Date().toISOString(),
  profile: OTHER,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  boardsApi.fetchBoard.mockResolvedValue(CURSOR);
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGJAM, FIGMA]);
  boardsApi.fetchHub.mockResolvedValue(FIGMA_HUB);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  boardsApi.fetchPostCounts.mockResolvedValue({ posts: 1, roadmap: 0 });
  boardsApi.fetchIsBoardTeam.mockResolvedValue(false);
  boardsApi.fetchFollowedScopes.mockResolvedValue(new Set());
  boardsApi.fetchTrending.mockResolvedValue([]);
  postsApi.fetchPostList.mockResolvedValue(page([makePost({ title: 'Indexing stalls on monorepos' })]));
  postsApi.fetchRoadmap.mockResolvedValue({ planned: [], in_progress: [], shipped: [] });
  postsApi.fetchChangelog.mockResolvedValue([]);
  postsApi.setPostFollow.mockResolvedValue(undefined);
  teamsApi.fetchVerifiedDomains.mockResolvedValue([]);
  teamsApi.fetchPendingDns.mockResolvedValue([]);
  teamsApi.fetchMyRequests.mockResolvedValue({ join: null, dispute: null });
  teamsApi.startEmailCode.mockResolvedValue(undefined);
  teamsApi.verifyEmailCode.mockResolvedValue('cursor.com');
  teamsApi.claimBoard.mockResolvedValue({ hub: null });
  teamsApi.claimHub.mockResolvedValue(undefined);
  teamsApi.requestJoin.mockResolvedValue(undefined);
  teamsApi.openDispute.mockResolvedValue(undefined);
  teamsApi.fetchScopeRole.mockResolvedValue(null);
  teamsApi.fetchTeam.mockResolvedValue([]);
  teamsApi.fetchJoinRequests.mockResolvedValue([]);
  teamsApi.fetchManageStats.mockResolvedValue({ waiting: 1, newThisWeek: 1, upvotes: 10, shipped: 0 });
  teamsApi.setPostStatus.mockResolvedValue(undefined);
  teamsApi.setMemberRole.mockResolvedValue(undefined);
  teamsApi.decideJoinRequest.mockResolvedValue(undefined);
  teamsApi.addMember.mockResolvedValue({ handle: 'hank' });
});

describe('claim a board', () => {
  it('verifies a work email with a code, then claims the board', async () => {
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    expect(within(dialog).getByText('Set statuses, pin official replies and run the roadmap')).toBeTruthy();

    const email = within(dialog).getByLabelText('Your work email');
    fireEvent.change(email, { target: { value: 'me@gmail.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    expect(await within(dialog).findByText('That isn’t an @cursor.com address. Use your work email, or verify with DNS.')).toBeTruthy();
    expect(teamsApi.startEmailCode).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: 'Carol@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(teamsApi.startEmailCode).toHaveBeenCalledWith('Carol@cursor.com', 'cursor.com'));
    const code = await within(dialog).findByLabelText('Enter the 6-digit code');
    expect(within(dialog).getByText('carol@cursor.com')).toBeTruthy();
    fireEvent.change(code, { target: { value: '12a3456' } });

    await waitFor(() => expect(teamsApi.verifyEmailCode).toHaveBeenCalledWith('Carol@cursor.com', '123456', 'cursor.com'));
    await waitFor(() => expect(teamsApi.claimBoard).toHaveBeenCalledWith(CURSOR.id, { name: 'Cursor', domain: 'cursor.com' }));
    expect(await screen.findByRole('dialog', { name: 'Board claimed' })).toBeTruthy();
    expect(screen.getByText('You manage Cursor now')).toBeTruthy();
  });

  it('shows the server’s refusal when the code is wrong', async () => {
    teamsApi.verifyEmailCode.mockRejectedValue(new TeamError('wrong_code', 'That code isn’t right. Check the email and try again.'));
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.change(within(dialog).getByLabelText('Your work email'), { target: { value: 'carol@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    fireEvent.change(await within(dialog).findByLabelText('Enter the 6-digit code'), { target: { value: '000000' } });
    expect(await within(dialog).findByText('That code isn’t right. Check the email and try again.')).toBeTruthy();
    expect(teamsApi.claimBoard).not.toHaveBeenCalled();
  });

  it('offers DNS when there is no company email', async () => {
    teamsApi.startDnsCheck.mockResolvedValue('publisense-verify=abc123');
    teamsApi.checkDns.mockResolvedValue(undefined);
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'No company email? Verify with a DNS record' }));
    expect(await within(dialog).findByText('publisense-verify=abc123')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(teamsApi.checkDns).toHaveBeenCalledWith('cursor.com'));
    await waitFor(() => expect(teamsApi.claimBoard).toHaveBeenCalled());
  });

  it('offers the whole hub when its domain is proved, then claims it', async () => {
    boardsApi.fetchBoard.mockResolvedValue(FIGMA_WITH_HUB);
    boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGJAM_SITE, FIGMA_SITE]);
    boardsApi.fetchHubs.mockResolvedValue([HUB_SITES]);
    teamsApi.fetchVerifiedDomains.mockResolvedValue(['figma.com']);
    teamsApi.claimBoard.mockResolvedValue({ hub: 'figma' });
    renderAt('/b/figma');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Figma?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Figma' });
    expect(within(dialog).getByText('One check covers the Figma hub and all 2 products on figma.com')).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Claim Figma' }));
    expect(await screen.findByRole('dialog', { name: 'Claim all of Figma?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Claim all of Figma' }));
    await waitFor(() => expect(teamsApi.claimHub).toHaveBeenCalledWith(FIGMA_HUB.id, { name: 'Figma', domain: 'figma.com' }));
    expect(await screen.findByRole('dialog', { name: 'Figma hub claimed' })).toBeTruthy();
  });

  it('adds teammates after claiming, and keeps the ones that failed', async () => {
    teamsApi.fetchVerifiedDomains.mockResolvedValue(['cursor.com']);
    teamsApi.addMember.mockResolvedValueOnce({ handle: 'hank' }).mockRejectedValueOnce(new TeamError('not_found', 'No account uses that handle or email yet. Ask them to sign up, then add them.'));
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Claim Cursor' }));
    const done = await screen.findByRole('dialog', { name: 'Board claimed' });
    fireEvent.change(within(done).getByLabelText('Invite teammates'), { target: { value: 'hank@cursor.com, ivy@cursor.com' } });
    fireEvent.click(within(done).getByRole('button', { name: 'Add to team' }));
    expect(await within(done).findByText(/ivy@cursor.com: No account uses that handle or email yet/)).toBeTruthy();
    expect(teamsApi.addMember).toHaveBeenNthCalledWith(1, 'board', CURSOR.id, 'hank@cursor.com', 'cursor.com', undefined);
    expect((within(done).getByLabelText('Invite teammates') as HTMLInputElement).value).toBe('ivy@cursor.com');
  });
});

describe('"Work here?" on a claimed board', () => {
  it('sends a join request straight away when the domain is already proved', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    boardsApi.fetchBoards.mockResolvedValue([CLAIMED, FIGJAM, FIGMA]);
    teamsApi.fetchVerifiedDomains.mockResolvedValue(['cursor.com']);
    renderAt('/b/cursor');
    expect(await screen.findByText('Verified team')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Work here?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cursor is already claimed' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Request to join the team/ }));
    fireEvent.change(await screen.findByLabelText('Your work email'), { target: { value: 'dan@cursor.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(teamsApi.requestJoin).toHaveBeenCalledWith('board', CURSOR.id, 'dan@cursor.com', 'cursor.com'));
    expect(teamsApi.startEmailCode).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeTruthy();
    expect(screen.getByText('We’ve asked the Cursor admins')).toBeTruthy();
  });

  it('says a request is pending instead of offering another', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    teamsApi.fetchMyRequests.mockResolvedValue({ join: { id: 'r1', created_at: new Date().toISOString() }, dispute: null });
    renderAt('/b/cursor');
    expect(await screen.findByText('Request to join pending')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Work here?' })).toBeNull();
  });

  it('reports the wrong owner after confirming a work email by code', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    boardsApi.fetchBoards.mockResolvedValue([CLAIMED, FIGJAM, FIGMA]);
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work here?' }));
    fireEvent.click(await screen.findByRole('button', { name: /Report the wrong owner/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Report the wrong owner' });
    fireEvent.change(within(dialog).getByLabelText('Your work email'), { target: { value: 'dan@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await within(dialog).findByText('Tell us what’s wrong first (at least 10 characters).')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/What’s wrong/), { target: { value: 'A former contractor still controls the board.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(teamsApi.startEmailCode).toHaveBeenCalledWith('dan@cursor.com', 'cursor.com'));
    fireEvent.change(await screen.findByLabelText('Enter the 6-digit code'), { target: { value: '654321' } });
    await waitFor(() =>
      expect(teamsApi.openDispute).toHaveBeenCalledWith('board', CURSOR.id, 'A former contractor still controls the board.', 'dan@cursor.com', 'cursor.com'),
    );
    expect(await screen.findByRole('dialog', { name: 'Report sent' })).toBeTruthy();
    expect(teamsApi.claimBoard).not.toHaveBeenCalled();
  });
});

describe('hub claim', () => {
  it('claims the hub in one tap when its domain is verified', async () => {
    teamsApi.fetchVerifiedDomains.mockResolvedValue(['figma.com']);
    renderAt('/h/figma');
    fireEvent.click(await screen.findByRole('button', { name: 'Claim the Figma hub' }));
    await waitFor(() => expect(teamsApi.claimHub).toHaveBeenCalledWith(FIGMA_HUB.id, { name: 'Figma', domain: 'figma.com' }));
    expect(await screen.findByText('You manage the Figma hub now')).toBeTruthy();
  });

  it('shows Manage to the hub team', async () => {
    boardsApi.fetchHub.mockResolvedValue({ ...FIGMA_HUB, claimed_at: new Date().toISOString() });
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    renderAt('/h/figma');
    expect(await screen.findByText('You manage this hub')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe('/h/figma/manage');
  });
});

describe('Manage inbox', () => {
  it('is only for the team', async () => {
    renderAt('/b/cursor/manage');
    expect(await screen.findByText('Only the Cursor team can see this')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim Cursor' })).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in', async () => {
    renderAt('/b/cursor/manage', false);
    expect(await screen.findByText('Sign in to manage Cursor')).toBeTruthy();
  });

  it('triages: open posts, most upvoted first, status changed in place', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    teamsApi.fetchScopeRole.mockResolvedValue('admin');
    const post = makePost({ title: 'Indexing stalls on monorepos', vote_count: 33 });
    postsApi.fetchPostList.mockResolvedValue(page([post]));
    renderAt('/b/cursor/manage');
    expect(await screen.findByText('Waiting for a status')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Manage Cursor' })).toBeTruthy();
    await screen.findByText('Indexing stalls on monorepos');
    expect(postsApi.fetchPostList).toHaveBeenCalledWith(expect.objectContaining({ boardIds: [CURSOR.id], status: 'open', sort: 'top' }));
    fireEvent.change(screen.getByLabelText('Status for Indexing stalls on monorepos'), { target: { value: 'planned' } });
    await waitFor(() => expect(teamsApi.setPostStatus).toHaveBeenCalledWith(post.id, 'planned'));
    expect(await screen.findByText('Marked Planned · followers notified')).toBeTruthy();
  });

  it('says Inbox zero when every post has a status', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('member');
    postsApi.fetchPostList.mockResolvedValue(page([]));
    renderAt('/b/cursor/manage');
    expect(await screen.findByText('Inbox zero')).toBeTruthy();
    // Members don't get Settings.
    expect(screen.queryByRole('tab', { name: 'Settings' })).toBeNull();
  });

  it('filters the hub inbox by board', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    renderAt('/h/figma/manage');
    fireEvent.click(await screen.findByRole('button', { name: 'FigJam' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Manage Figma hub' })).toBeTruthy();
    await waitFor(() => expect(postsApi.fetchPostList).toHaveBeenLastCalledWith(expect.objectContaining({ boardIds: [FIGJAM.id], status: 'open' })));
  });
});

describe('status updates and official replies', () => {
  it('sets the status and posts the note as an official reply', async () => {
    const post = makePost({ title: 'Settings sync between machines' });
    postsApi.createReply.mockResolvedValue({
      id: 'c1', post_id: post.id, parent_id: null, author_id: ME.id, body: 'Live now.', is_official: true, hidden_at: null, edited_at: null, created_at: new Date().toISOString(), author: ME,
    });
    const onClose = vi.fn();
    renderWith(<StatusDialog post={post} open onClose={onClose} />, { viewer: TEST_VIEWER });
    const save = screen.getByRole('button', { name: 'Update status' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Shipped/ }));
    fireEvent.change(screen.getByLabelText(/Official reply/), { target: { value: 'Live now.' } });
    fireEvent.click(save);
    await waitFor(() => expect(teamsApi.setPostStatus).toHaveBeenCalledWith(post.id, 'shipped'));
    await waitFor(() => expect(postsApi.createReply).toHaveBeenCalledWith(post.id, 'Live now.', null, true));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('offers "Reply as {board} team" to team members', async () => {
    const post = makePost({});
    boardsApi.fetchIsBoardTeam.mockResolvedValue(true);
    const { ReplyComposer } = await import('../posts/Replies');
    renderWith(<ReplyComposer post={post} parentId={null} autoFocus />, { viewer: TEST_VIEWER });
    const as = await screen.findByLabelText('Reply as');
    fireEvent.change(as, { target: { value: 'team' } });
    postsApi.createReply.mockResolvedValue({ id: 'c2', post_id: post.id, parent_id: null, author_id: ME.id, body: 'On it', is_official: true, hidden_at: null, edited_at: null, created_at: new Date().toISOString(), author: ME });
    fireEvent.change(screen.getByLabelText('Add a reply'), { target: { value: 'On it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(postsApi.createReply).toHaveBeenCalledWith(post.id, 'On it', null, true));
  });
});

describe('team management', () => {
  const team = () => [member({ user_id: ME.id, role: 'owner', profile: ME }), member({ role: 'member' })];

  it('changes a role and shows the last-owner refusal', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    renderAt('/b/cursor/manage?tab=team');
    const select = await screen.findByLabelText('Role for J Mwamba');
    expect(screen.getByText('Alice Banda (you)')).toBeTruthy();
    // Owners may hand out ownership.
    expect(within(select as HTMLElement).getByRole('option', { name: 'Owner' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'admin' } });
    await waitFor(() => expect(teamsApi.setMemberRole).toHaveBeenCalledWith('board', CURSOR.id, OTHER.id, 'admin'));
    expect(await screen.findByText('Role updated')).toBeTruthy();
  });

  it('shows the last-owner refusal from the server', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue([member({ user_id: ME.id, role: 'owner', profile: ME }), member({ role: 'owner' })]);
    teamsApi.setMemberRole.mockRejectedValueOnce(new TeamError('last_owner', 'Add another owner first. A claimed board always keeps an owner.'));
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.change(await screen.findByLabelText('Role for J Mwamba'), { target: { value: 'admin' } });
    expect(await screen.findByText('Add another owner first. A claimed board always keeps an owner.')).toBeTruthy();
  });

  it('admins cannot touch owners or grant ownership', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('admin');
    teamsApi.fetchTeam.mockResolvedValue([member({ role: 'owner' }), member({ user_id: 'u2', role: 'member', profile: { ...OTHER, id: 'u2', handle: 'kim', name: 'Kim' } })]);
    renderAt('/b/cursor/manage?tab=team');
    const kim = await screen.findByLabelText('Role for Kim');
    expect(within(kim as HTMLElement).queryByRole('option', { name: 'Owner' })).toBeNull();
    expect(screen.queryByLabelText('Role for J Mwamba')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove J Mwamba' })).toBeNull();
  });

  it('approves a join request and adds a teammate by email', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([
      { id: 'jr1', user_id: 'u3', scope: 'board', scope_id: CURSOR.id, work_email: 'lee@cursor.com', created_at: new Date().toISOString(), profile: { id: 'u3', handle: 'lee', name: 'Lee', avatar_path: null } },
    ]);
    renderAt('/b/cursor/manage?tab=team');
    expect(await screen.findByText(/lee@cursor.com · verified/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(teamsApi.decideJoinRequest).toHaveBeenCalledWith('jr1', true));
    expect(await screen.findByText('Lee joined the team')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email or handle'), { target: { value: 'hank@cursor.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(teamsApi.addMember).toHaveBeenCalledWith('board', CURSOR.id, 'hank@cursor.com', 'cursor.com', undefined));
    await waitFor(() => expect((screen.getByLabelText('Email or handle') as HTMLInputElement).value).toBe(''));
  });

  it('saves the board description from Settings', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.updateBoardTagline.mockResolvedValue(undefined);
    boardsApi.fetchBoard.mockResolvedValue({ ...makeBoard(), hub: null });
    renderAt('/b/cursor/manage?tab=settings');
    const input = await screen.findByLabelText('Description');
    expect((screen.getByLabelText('Website') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'The AI code editor for teams' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(teamsApi.updateBoardTagline).toHaveBeenCalledWith(CURSOR.id, 'The AI code editor for teams'));
  });
});
