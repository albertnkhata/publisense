import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { FeedPage, Post } from '../api/posts';
import type { Member } from '../api/teams';
import { ClaimProvider, useClaim } from '../claim/ClaimDialog';
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
const authApi = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('../api/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/auth')>()), ...authApi }));
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
const analyticsApi = vi.hoisted(() => ({ recordEvent: vi.fn() }));
vi.mock('../api/analytics', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/analytics')>()), ...analyticsApi }));

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

function GenericClaimButton() {
  const { openClaim } = useClaim();
  return <button onClick={() => openClaim()}>Claim your board</button>;
}

function renderGeneric(signedIn = true) {
  return renderWith(<ClaimProvider><GenericClaimButton /></ClaimProvider>, { viewer: signedIn ? TEST_VIEWER : null });
}

describe('generic claim overview', () => {
  it('explains before search, supports Back and preserves the query', async () => {
    renderGeneric();
    fireEvent.click(screen.getByRole('button', { name: 'Claim your board' }));
    const overview = await screen.findByRole('dialog', { name: 'Claim your board' });
    expect(within(overview).getByText('How it works')).toBeTruthy();
    expect(within(overview).queryByRole('searchbox')).toBeNull();
    fireEvent.click(within(overview).getByRole('button', { name: 'Get started' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose your board' });
    fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'Cursor' } });
    fireEvent.click(within(picker).getByRole('button', { name: 'Back to overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Cursor');
    fireEvent.click(await screen.findByRole('button', { name: /Cursor/ }));
    const intro = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    expect(within(intro).queryByText('Your selected board')).toBeNull();
    expect(within(intro).queryByRole('button', { name: 'Choose a different board' })).toBeNull();
    fireEvent.click(within(intro).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Choose your board' })).toBeTruthy();
    expect(teamsApi.startEmailCode).not.toHaveBeenCalled();
    expect(teamsApi.claimBoard).not.toHaveBeenCalled();
  });

  it('signed out, Get started on the overview goes to sign-up for claiming, with no second explanation', async () => {
    renderGeneric(false);
    const opener = screen.getByRole('button', { name: 'Claim your board' });
    opener.focus();
    fireEvent.click(opener);
    const overview = await screen.findByRole('dialog', { name: 'Claim your board' });
    expect(within(overview).queryByText('Choose your product’s board.')).toBeNull();
    fireEvent.click(within(overview).getByRole('button', { name: 'Get started' }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(auth).getByText('Create an account to claim your product’s board. It takes a few seconds.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Claim your board' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('dialog', { name: 'Claim your board' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('remembers where a signed-out visitor was heading and resumes at product search after they return signed in', async () => {
    localStorage.clear();
    renderGeneric(false);
    fireEvent.click(screen.getByRole('button', { name: 'Claim your board' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }));
    await screen.findByRole('dialog', { name: 'Create your account' });
    expect(JSON.parse(localStorage.getItem('publisense:claim-intent') ?? '{}').at).toBeTypeOf('number');
    cleanup();
    renderGeneric(true);
    const picker = await screen.findByRole('dialog', { name: 'Choose your board' });
    expect(await within(picker).findByRole('searchbox')).toBeTruthy();
    expect(localStorage.getItem('publisense:claim-intent')).toBeNull();
  });

  it('forgets the claim when the visitor backs out of sign-up, so a later sign-in doesn’t reopen it', async () => {
    localStorage.clear();
    renderGeneric(false);
    fireEvent.click(screen.getByRole('button', { name: 'Claim your board' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(localStorage.getItem('publisense:claim-intent')).not.toBeNull();
    fireEvent.click(within(auth).getByRole('button', { name: 'Close' }));
    expect(localStorage.getItem('publisense:claim-intent')).toBeNull();
    // Later, an unrelated sign-in: no claim dialog.
    cleanup();
    renderGeneric(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('forgets a product-scoped claim when sign-up is dismissed with Escape', async () => {
    localStorage.clear();
    renderAt('/b/cursor', false);
    fireEvent.click(await screen.findByRole('button', { name: /Work at Cursor/ }));
    const intro = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.click(within(intro).getByRole('button', { name: 'Get started' }));
    await screen.findByRole('dialog', { name: 'Create your account' });
    expect(JSON.parse(localStorage.getItem('publisense:claim-intent') ?? '{}').board).toBe('cursor');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(localStorage.getItem('publisense:claim-intent')).toBeNull();
  });

  it('keeps the claim through a completed sign-up and resumes it after the email is confirmed', async () => {
    localStorage.clear();
    authApi.signUp.mockResolvedValue({ error: null, needsConfirmation: true });
    renderGeneric(false);
    fireEvent.click(screen.getByRole('button', { name: 'Claim your board' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    fireEvent.change(within(auth).getByRole('textbox', { name: 'Name' }), { target: { value: 'Nia' } });
    fireEvent.change(within(auth).getByRole('textbox', { name: 'Email address' }), { target: { value: 'nia@cursor.com' } });
    fireEvent.change(within(auth).getByLabelText('Password'), { target: { value: 'Long-enough-1' } });
    fireEvent.click(within(auth).getByRole('button', { name: 'Create account' }));
    const confirm = await screen.findByRole('dialog', { name: 'Confirm your email' });
    // Closing the “Confirm your email” screen is not backing out: the email is on its way.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Close' }));
    expect(localStorage.getItem('publisense:claim-intent')).not.toBeNull();
    // The confirmation link signs them in (here, a fresh tab): the claim picks up at product search.
    cleanup();
    renderGeneric(true);
    expect(await screen.findByRole('dialog', { name: 'Choose your board' })).toBeTruthy();
    expect(localStorage.getItem('publisense:claim-intent')).toBeNull();
  });

  it('ignores an expired remembered claim', async () => {
    localStorage.setItem('publisense:claim-intent', JSON.stringify({ at: Date.now() - 2 * 60 * 60 * 1000 }));
    renderGeneric(true);
    await waitFor(() => expect(localStorage.getItem('publisense:claim-intent')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the overview even if the board list fails and offers a retry in selection', async () => {
    boardsApi.fetchBoards.mockRejectedValue(new Error('Offline'));
    renderGeneric();
    fireEvent.click(screen.getByRole('button', { name: 'Claim your board' }));
    expect(await screen.findByText('How it works')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('claim a board', () => {
  it('explains claiming and verification in-place before asking a signed-out visitor to sign up (#157)', async () => {
    renderAt('/b/cursor', false);
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    expect(within(dialog).getByText('Get a verified badge on your board and your team’s replies')).toBeTruthy();
    expect(within(dialog).getByText('Set statuses, reply as the team and run the roadmap')).toBeTruthy();
    expect(within(dialog).getByText(/Verify with a 6-digit code sent to your/)).toBeTruthy();
    expect(within(dialog).getByText('@cursor.com')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Your work email')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Get started' }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(auth).getByText('Create an account to claim your product’s board. It takes a few seconds.')).toBeTruthy();
  });

  it('lets a signed-out visitor on a claimed board see both options before signing in (#157)', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    boardsApi.fetchBoards.mockResolvedValue([CLAIMED, FIGJAM, FIGMA]);
    renderAt('/b/cursor', false);
    fireEvent.click(await screen.findByRole('button', { name: 'Work here?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cursor is already claimed' });
    expect(within(dialog).getByRole('button', { name: /Request to join the team/ })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Report the wrong owner/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /Request to join the team/ }));
    const auth = await screen.findByRole('dialog', { name: 'Sign in to Publisense' });
    expect(within(auth).getByText('Sign in to claim your product’s board. It takes a few seconds.')).toBeTruthy();
  });

  it('verifies a work email with a code, then claims the board', async () => {
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    expect(within(dialog).getByText('Set statuses, reply as the team and run the roadmap')).toBeTruthy();

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
    expect(analyticsApi.recordEvent).toHaveBeenCalledWith('claim_verify_started', { boardId: CURSOR.id, meta: { method: 'email' } });
    expect(analyticsApi.recordEvent).not.toHaveBeenCalledWith('claim_verify_failed', expect.anything());
  });

  it('counts down a minute before a new code can be sent', async () => {
    localStorage.clear();
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.change(within(dialog).getByLabelText('Your work email'), { target: { value: 'carol@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    await within(dialog).findByLabelText('Enter the 6-digit code');
    expect(within(dialog).getByText(/Resend code in/)).toBeTruthy();
    expect(within(dialog).getByText(/^(1:00|0:59)$/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Resend code' })).toBeNull();
    const real = Date.now;
    const later = real() + 61_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => later);
    try {
      expect(await within(dialog).findByRole('button', { name: 'Resend code' }, { timeout: 2500 })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('a sent code can still be entered after the dialog is closed and reopened (#183)', async () => {
    localStorage.clear();
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    let dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.change(within(dialog).getByLabelText('Your work email'), { target: { value: 'carol@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    await within(dialog).findByLabelText('Enter the 6-digit code');
    expect(teamsApi.startEmailCode).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Claim Cursor' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Work at Cursor?' }));
    dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    const code = await within(dialog).findByLabelText('Enter the 6-digit code');
    expect(within(dialog).getByText(/We already sent a code to/)).toBeTruthy();
    // Still inside the minute: a countdown instead of the resend button.
    expect(within(dialog).getByText(/Resend code in/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Send a new code' })).toBeNull();
    // Reopening neither sends nor voids a code.
    expect(teamsApi.startEmailCode).toHaveBeenCalledTimes(1);
    fireEvent.change(code, { target: { value: '123456' } });
    await waitFor(() => expect(teamsApi.verifyEmailCode).toHaveBeenCalledWith('carol@cursor.com', '123456', 'cursor.com'));
    await waitFor(() => expect(teamsApi.claimBoard).toHaveBeenCalled());
    expect(localStorage.getItem('publisense:claim-code')).toBeNull();
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
    expect(analyticsApi.recordEvent).toHaveBeenCalledWith('claim_verify_failed', { boardId: CURSOR.id, meta: { reason: 'wrong_code' } });
  });

  it('logs an unknown verify error as reason other, never its text', async () => {
    teamsApi.verifyEmailCode.mockRejectedValue(new TeamError('something_new', 'Detail mentioning carol@cursor.com'));
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.change(within(dialog).getByLabelText('Your work email'), { target: { value: 'carol@cursor.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    fireEvent.change(await within(dialog).findByLabelText('Enter the 6-digit code'), { target: { value: '000000' } });
    await waitFor(() => expect(analyticsApi.recordEvent).toHaveBeenCalledWith('claim_verify_failed', { boardId: CURSOR.id, meta: { reason: 'other' } }));
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
    expect(analyticsApi.recordEvent).toHaveBeenCalledWith('claim_verify_started', { boardId: CURSOR.id, meta: { method: 'dns' } });
  });

  it('logs a DNS check that times out as reason dns_slow', async () => {
    teamsApi.startDnsCheck.mockResolvedValue('publisense-verify=abc123');
    teamsApi.checkDns.mockRejectedValue(new TeamError('dns_slow', 'DNS hasn’t answered yet. Changes can take a few minutes; check again soon.'));
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work at Cursor?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'No company email? Verify with a DNS record' }));
    await within(dialog).findByText('publisense-verify=abc123');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(analyticsApi.recordEvent).toHaveBeenCalledWith('claim_verify_failed', { boardId: CURSOR.id, meta: { reason: 'dns_slow' } }));
    expect(teamsApi.claimBoard).not.toHaveBeenCalled();
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
    await waitFor(() => expect(teamsApi.requestJoin).toHaveBeenCalledWith('board', CURSOR.id, 'dan@cursor.com', 'cursor.com', ''));
    expect(teamsApi.startEmailCode).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeTruthy();
    expect(screen.getByText('We’ve asked the Cursor admins')).toBeTruthy();
  });

  it('sends an optional message with the request (#189)', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    boardsApi.fetchBoards.mockResolvedValue([CLAIMED, FIGJAM, FIGMA]);
    teamsApi.fetchVerifiedDomains.mockResolvedValue(['cursor.com']);
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Work here?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cursor is already claimed' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Request to join the team/ }));
    fireEvent.change(await screen.findByLabelText('Your work email'), { target: { value: 'dan@cursor.com' } });
    const message = screen.getByLabelText(/^Message/) as HTMLTextAreaElement;
    expect(message.maxLength).toBe(280);
    fireEvent.change(message, { target: { value: 'I run support and want to answer bug reports.' } });
    expect(screen.getByText('45/280')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(teamsApi.requestJoin).toHaveBeenCalledWith('board', CURSOR.id, 'dan@cursor.com', 'cursor.com', 'I run support and want to answer bug reports.'),
    );
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
  it('sets the status with the note in ONE call; the note goes on the timeline, not into a reply (0044)', async () => {
    const post = makePost({ title: 'Settings sync between machines' });
    const onClose = vi.fn();
    renderWith(<StatusDialog post={post} open onClose={onClose} />, { viewer: TEST_VIEWER });
    const save = screen.getByRole('button', { name: 'Update status' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    const note = screen.getByLabelText(/Note \(shown on the timeline\)/);
    expect(screen.getByText(/Saved with this change on the post’s status timeline\. For a team reply, reply on the post as Cursor team\./)).toBeTruthy();
    // A note on its own is not a status change: Save stays off and says why.
    fireEvent.change(note, { target: { value: 'Live now.' } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pick a new status to save a note with it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Shipped/ }));
    expect(screen.getByText('Followers and upvoters get one notification with the new status and your note.')).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(teamsApi.setPostStatus).toHaveBeenCalledWith(post.id, 'shipped', 'Live now.'));
    expect(teamsApi.setPostStatus).toHaveBeenCalledTimes(1);
    expect(postsApi.createReply).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('Marked Shipped · followers notified')).toBeTruthy();
  });

  it('a status change without a note sends no note', async () => {
    const post = makePost({ status: 'planned' });
    renderWith(<StatusDialog post={post} open onClose={vi.fn()} />, { viewer: TEST_VIEWER });
    fireEvent.click(screen.getByRole('radio', { name: /In progress/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(teamsApi.setPostStatus).toHaveBeenCalledWith(post.id, 'in_progress'));
    expect(postsApi.createReply).not.toHaveBeenCalled();
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

  it('asks before removing a teammate, and Cancel keeps them (#142)', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.removeMember.mockResolvedValue(undefined);
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove J Mwamba' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove J Mwamba from the team?' });
    expect(within(dialog).getByText(/loses team access straight away/)).toBeTruthy();
    expect(teamsApi.removeMember).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(teamsApi.removeMember).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove J Mwamba' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(teamsApi.removeMember).toHaveBeenCalledWith('board', CURSOR.id, OTHER.id));
    expect(await screen.findByText('Removed J Mwamba')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the confirm open with the reason when removing fails', async () => {
    boardsApi.fetchBoard.mockResolvedValue(CLAIMED);
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.removeMember.mockRejectedValueOnce(new TeamError('last_owner', 'Add another owner first. A claimed board always keeps an owner.'));
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove J Mwamba' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Add another owner first. A claimed board always keeps an owner.');
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

  const LEE_REQUEST = { id: 'jr1', user_id: 'u3', scope: 'board' as const, scope_id: CURSOR.id, work_email: 'lee@cursor.com', message: null as string | null, created_at: new Date().toISOString(), profile: { id: 'u3', handle: 'lee', name: 'Lee', avatar_path: null } };

  it('offers Member (default) and Admin, never Owner, when approving (#188)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([LEE_REQUEST]);
    renderAt('/b/cursor/manage?tab=team');
    const select = (await screen.findByLabelText('Role for Lee')) as HTMLSelectElement;
    expect(select.value).toBe('member');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Member', 'Admin']);
  });

  it('approves as Admin with the existing RPCs: approve, then set the role (#188)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('admin');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([LEE_REQUEST]);
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.change(await screen.findByLabelText('Role for Lee'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(teamsApi.setMemberRole).toHaveBeenCalledWith('board', CURSOR.id, 'u3', 'admin'));
    expect(teamsApi.decideJoinRequest).toHaveBeenCalledWith('jr1', true);
    expect(teamsApi.decideJoinRequest.mock.invocationCallOrder[0]!).toBeLessThan(teamsApi.setMemberRole.mock.invocationCallOrder[0]!);
    expect(await screen.findByText('Lee joined the team as Admin')).toBeTruthy();
  });

  it('says they joined as Member when the role change is refused (#188)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([LEE_REQUEST]);
    teamsApi.setMemberRole.mockRejectedValueOnce(new TeamError('not_allowed', 'Only admins can do that.'));
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.change(await screen.findByLabelText('Role for Lee'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Lee joined as Member, but we couldn’t make them Admin. Change it in Members.')).toBeTruthy();
  });

  it('does not set a role when the approve itself fails (#188)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([LEE_REQUEST]);
    teamsApi.decideJoinRequest.mockRejectedValueOnce(new TeamError('decided', 'Someone already answered this request.'));
    renderAt('/b/cursor/manage?tab=team');
    fireEvent.change(await screen.findByLabelText('Role for Lee'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Someone already answered this request.')).toBeTruthy();
    expect(teamsApi.setMemberRole).not.toHaveBeenCalled();
  });

  it('shows the requester’s message on the row (#189)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([{ ...LEE_REQUEST, message: 'I run support here.' }, { ...LEE_REQUEST, id: 'jr2', user_id: 'u4', message: null, profile: { id: 'u4', handle: 'mo', name: 'Mo', avatar_path: null } }]);
    renderAt('/b/cursor/manage?tab=team');
    expect((await screen.findByText('I run support here.')).hasAttribute('data-join-message')).toBe(true);
    expect(document.querySelectorAll('[data-join-message]').length).toBe(1);
  });

  it('links the requester to their profile (#188)', async () => {
    teamsApi.fetchScopeRole.mockResolvedValue('owner');
    teamsApi.fetchTeam.mockResolvedValue(team());
    teamsApi.fetchJoinRequests.mockResolvedValue([LEE_REQUEST, { ...LEE_REQUEST, id: 'jr2', user_id: 'gone', work_email: 'old@cursor.com', profile: null }]);
    renderAt('/b/cursor/manage?tab=team');
    const link = await screen.findByRole('link', { name: 'Lee' });
    expect(link.getAttribute('href')).toBe('/u/lee');
    expect(screen.getByText(/@lee · lee@cursor.com · verified/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Someone' })).toBeNull();
    expect(screen.getByText('Someone')).toBeTruthy();
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
