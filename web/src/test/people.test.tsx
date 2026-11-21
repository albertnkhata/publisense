import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { followKey } from '../api/boards';
import type { PublicProfile } from '../api/people';
import { ClaimProvider } from '../claim/ClaimDialog';
import { UserPage } from '../pages/UserPage';
import { SearchPage } from '../pages/SearchPage';
import { ComposerProvider } from '../shell/composer';
import { CURSOR, SUPABASE } from './boardFixtures';
import { iso, makePost, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const people = vi.hoisted(() => ({
  fetchProfileByHandle: vi.fn(),
  fetchUserStats: vi.fn(),
  fetchUserReplies: vi.fn(),
  fetchFollowedUsers: vi.fn(),
  fetchProfileFollowingCount: vi.fn(),
  fetchProfileFollowers: vi.fn(),
  fetchProfileFollowingUsers: vi.fn(),
  fetchProfileFollowingScopes: vi.fn(),
  setUserFollow: vi.fn(),
  fetchManaged: vi.fn(),
  searchPeople: vi.fn(),
}));
const posts = vi.hoisted(() => ({ fetchUserPosts: vi.fn(), fetchUpvotedPosts: vi.fn(), searchPosts: vi.fn() }));
const mod = vi.hoisted(() => ({ fetchAdminScopes: vi.fn(), fetchBlocksFor: vi.fn(), setBlocked: vi.fn(), reportContent: vi.fn(), fetchIsPlatformAdmin: vi.fn() }));
const boards = vi.hoisted(() => ({
  fetchIsBoardTeam: vi.fn(),
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
  fetchFollowedScopes: vi.fn(),
  setScopeFollow: vi.fn(),
}));
vi.mock('../api/people', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/people')>()), ...people }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...posts }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...mod }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boards }));

const JM: PublicProfile = { ...OTHER, bio: 'Backend engineer. Mostly Postgres.', created_at: '2026-03-02T10:00:00Z', follower_count: 14 };
const SELF: PublicProfile = { ...ME, bio: '', created_at: '2026-01-05T10:00:00Z', follower_count: 3 };

function renderAt(path: string, signedIn = true) {
  return renderWith(
    <ComposerProvider>
      <ClaimProvider>
        <Routes>
          <Route path="/u/:handle" element={<UserPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<h1>Settings page</h1>} />
        </Routes>
      </ClaimProvider>
    </ComposerProvider>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  people.fetchProfileByHandle.mockImplementation(async (h: string) => (h === JM.handle ? JM : h === SELF.handle ? SELF : null));
  people.fetchUserStats.mockResolvedValue({ posts: 2, upvotes: 57 });
  people.fetchUserReplies.mockResolvedValue([
    { id: 'r1', body: 'Pin the working directory, then restart.', created_at: iso(5), post: { id: 'p1', title: 'Terminal loses cwd', board: { id: CURSOR.id, slug: 'cursor', name: 'Cursor', color: CURSOR.color, logo_path: null } } },
  ]);
  people.fetchFollowedUsers.mockResolvedValue(new Set());
  people.fetchProfileFollowingCount.mockResolvedValue(0);
  people.fetchProfileFollowers.mockResolvedValue([]);
  people.fetchProfileFollowingUsers.mockResolvedValue([]);
  people.fetchProfileFollowingScopes.mockResolvedValue([]);
  people.setUserFollow.mockResolvedValue(undefined);
  people.fetchManaged.mockResolvedValue([]);
  people.searchPeople.mockResolvedValue([]);
  posts.fetchUserPosts.mockResolvedValue({ items: [makePost({ title: 'Ghost preview in split windows' })], next: null });
  posts.fetchUpvotedPosts.mockResolvedValue([]);
  posts.searchPosts.mockResolvedValue([]);
  mod.fetchAdminScopes.mockResolvedValue([]);
  mod.fetchBlocksFor.mockResolvedValue(new Set());
  mod.setBlocked.mockResolvedValue(undefined);
  mod.reportContent.mockResolvedValue('filed');
  mod.fetchIsPlatformAdmin.mockResolvedValue(false);
  boards.fetchIsBoardTeam.mockResolvedValue(false);
  boards.fetchBoards.mockResolvedValue([]);
  boards.fetchHubs.mockResolvedValue([]);
  boards.fetchFollowedScopes.mockResolvedValue(new Set());
  boards.setScopeFollow.mockResolvedValue(undefined);
});

describe('user page', () => {
  it('shows who they are, interactive followers/following stats, posts and replies', async () => {
    people.fetchProfileFollowingCount.mockResolvedValue(5);
    renderAt('/u/jmwamba');
    expect((await screen.findByRole('heading', { level: 1, name: 'J Mwamba' })).textContent).toBe('J Mwamba');
    expect(screen.getByText('@jmwamba')).toBeTruthy();
    expect(screen.getByText('Backend engineer. Mostly Postgres.')).toBeTruthy();
    expect(await screen.findByText('upvotes received')).toBeTruthy();
    expect(screen.getByText('57')).toBeTruthy();
    expect(screen.getByText('Joined Mar 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: '14 followers' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: '5 following' })).toBeTruthy();
    expect(await screen.findByText('Ghost preview in split windows')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Upvoted/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Replies/ }));
    expect(await screen.findByText('Pin the working directory, then restart.')).toBeTruthy();
    expect(screen.getByText('Terminal loses cwd')).toBeTruthy();
  });

  it('opens Followers and Following (Products + People) dialogs from the stat row', async () => {
    people.fetchProfileFollowingCount.mockResolvedValue(2);
    people.fetchProfileFollowers.mockResolvedValue([{ ...ME, bio: '', follower_count: 3 }]);
    people.fetchProfileFollowingScopes.mockResolvedValue([
      { scope: 'board', id: CURSOR.id, slug: CURSOR.slug, name: CURSOR.name, color: CURSOR.color, logo_path: null, follower_count: 120 },
    ]);
    people.fetchProfileFollowingUsers.mockResolvedValue([{ id: 'u9', handle: 'lin', name: 'Lin Wu', avatar_path: null, bio: '', follower_count: 8 }]);
    boards.fetchFollowedScopes.mockResolvedValue(new Set([followKey('board', CURSOR.id)]));

    renderAt('/u/jmwamba');
    fireEvent.click(await screen.findByRole('button', { name: '14 followers' }));
    const followersDialog = await screen.findByRole('dialog', { name: 'Followers' });
    expect(await within(followersDialog).findByRole('link', { name: /Alice/ })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    fireEvent.click(await screen.findByRole('button', { name: '2 following' }));
    const followingDialog = await screen.findByRole('dialog', { name: 'Following' });
    const productsList = await within(followingDialog).findByRole('list', { name: 'Followed products' });
    expect(within(productsList).getByRole('link', { name: /Cursor/ }).getAttribute('href')).toBe('/b/cursor');
    fireEvent.click(await within(productsList).findByRole('button', { name: 'Following' }));
    await waitFor(() => expect(boards.setScopeFollow).toHaveBeenCalledWith('board', CURSOR.id, TEST_VIEWER.id, false));

    fireEvent.click(within(followingDialog).getByRole('tab', { name: /People/ }));
    const peopleList = await within(followingDialog).findByRole('list', { name: 'Followed people' });
    expect(within(peopleList).getByRole('link', { name: /Lin Wu/ }).getAttribute('href')).toBe('/u/lin');
  });

  it('counts followed products and people together under following on your own profile and hides zero noise', async () => {
    people.fetchUserStats.mockResolvedValue({ posts: 0, upvotes: 0 });
    people.fetchUserReplies.mockResolvedValue([]);
    posts.fetchUserPosts.mockResolvedValue({ items: [], next: null });
    boards.fetchBoards.mockResolvedValue([CURSOR, SUPABASE]);
    boards.fetchFollowedScopes.mockResolvedValue(new Set([followKey('board', CURSOR.id), followKey('board', SUPABASE.id)]));
    people.fetchFollowedUsers.mockResolvedValue(new Set([OTHER.id]));

    renderAt(`/u/${ME.handle}`);
    // 2 live followed boards + 1 followed user = 3 following
    expect(await screen.findByRole('button', { name: '3 following' })).toBeTruthy();
    expect(screen.queryByText(/upvotes received/)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Posts' }).textContent).toBe('Posts');
    expect(screen.getByRole('tab', { name: 'Replies' }).textContent).toBe('Replies');
    expect(screen.getByRole('tab', { name: 'Upvoted' }).textContent).toBe('Upvoted');

    // Fallback shows followed products even if the RPC hasn't returned rows yet.
    fireEvent.click(screen.getByRole('button', { name: '3 following' }));
    const dialog = await screen.findByRole('dialog', { name: 'Following' });
    expect(await within(dialog).findByRole('link', { name: /Cursor/ })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: /Supabase/ })).toBeTruthy();
  });

  it('follows and unfollows; the count moves at once', async () => {
    renderAt('/u/jmwamba');
    const follow = await screen.findByRole('button', { name: 'Follow' });
    fireEvent.click(follow);
    await waitFor(() => expect(people.setUserFollow).toHaveBeenCalledWith(JM.id, TEST_VIEWER.id, true));
    expect(await screen.findByText('Following @jmwamba')).toBeTruthy();
    expect(screen.getByRole('button', { name: '15 followers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Following' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('signed out, Follow asks you to sign in', async () => {
    renderAt('/u/jmwamba', false);
    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(await screen.findByRole('dialog', { name: /Sign in/ })).toBeTruthy();
    expect(people.setUserFollow).not.toHaveBeenCalled();
  });

  it('board admins block someone from their board; anyone can report the account', async () => {
    mod.fetchAdminScopes.mockResolvedValue([{ scope: 'board', scope_id: CURSOR.id, role: 'owner', name: 'Cursor', slug: 'cursor' }]);
    renderAt('/u/jmwamba');
    fireEvent.click(await screen.findByRole('button', { name: 'Profile options' }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(await within(menu).findByRole('menuitem', { name: /Block from Cursor/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Block @jmwamba from Cursor?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(mod.setBlocked).toHaveBeenCalledWith('board', CURSOR.id, JM.id, true));
    expect(await screen.findByText('Blocked @jmwamba from Cursor')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Profile options' }));
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Report account/ }));
    const report = await screen.findByRole('dialog', { name: 'Report account' });
    fireEvent.click(within(report).getByRole('radio', { name: 'Spam or advertising' }));
    fireEvent.click(within(report).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(mod.reportContent).toHaveBeenCalledWith('user', JM.id, 'Spam or advertising'));
  });

  it('people without a board see no block options', async () => {
    renderAt('/u/jmwamba');
    fireEvent.click(await screen.findByRole('button', { name: 'Profile options' }));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(mod.fetchAdminScopes).toHaveBeenCalled());
    expect(within(menu).queryByRole('menuitem', { name: /Block/ })).toBeNull();
    // Share lives in the ⋯ menu, not as its own button.
    expect(within(menu).getByRole('menuitem', { name: /Share profile/ })).toBeTruthy();
  });

  it('your own page: Edit profile, what you manage, and a private Upvoted tab', async () => {
    people.fetchManaged.mockResolvedValue([
      { scope: 'board', scope_id: CURSOR.id, role: 'owner', name: 'Cursor', slug: 'cursor', color: CURSOR.color, logo_path: null, boards: [], waiting: 3 },
    ]);
    posts.fetchUpvotedPosts.mockResolvedValue([makePost({ title: 'Sync settings across machines' })]);
    people.fetchFollowedUsers.mockResolvedValue(new Set([OTHER.id]));
    renderAt(`/u/${ME.handle}`);
    expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Profile options' }));
    expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Share profile/ })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(await screen.findByText(/3 posts waiting for a status/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe('/b/cursor/manage');
    expect(await screen.findByRole('button', { name: '1 following' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Upvoted/ }));
    expect(await screen.findByText('Only you can see this')).toBeTruthy();
    expect(await screen.findByText('Sync settings across machines')).toBeTruthy();
  });

  it('managing nothing: no claim prompt on the profile', async () => {
    renderAt(`/u/${ME.handle}`);
    expect(await screen.findByRole('tab', { name: /Upvoted/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Claim this product/ })).toBeNull();
  });

  it('an unknown handle says so', async () => {
    renderAt('/u/nobody_here');
    expect(await screen.findByText('No one goes by that name')).toBeTruthy();
  });

  it('shows Your profile pill, Account settings menu link, and Explore products CTA on empty self posts', async () => {
    posts.fetchUserPosts.mockResolvedValue({ items: [], next: null });
    renderAt(`/u/${ME.handle}`);
    expect(await screen.findByText('Your profile')).toBeTruthy();
    expect(await screen.findByText('You haven’t posted yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse products' }).getAttribute('href')).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Profile options' }));
    const settingsItem = await within(await screen.findByRole('menu')).findByRole('menuitem', { name: /Account settings/ });
    expect(settingsItem.getAttribute('href')).toBe('/settings');
  });
});

describe('people in search', () => {
  it('lists matching people on the Top tab', async () => {
    people.searchPeople.mockResolvedValue([OTHER]);
    renderAt('/search?q=mwamba');
    const list = await screen.findByRole('list', { name: 'People' });
    expect(within(list).getByRole('link', { name: /J Mwamba/ }).getAttribute('href')).toBe('/u/jmwamba');
  });
});
