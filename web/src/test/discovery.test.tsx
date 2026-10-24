import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { FeedPage, Post } from '../api/posts';
import { BoardPage } from '../pages/BoardPage';
import { ExplorePage } from '../pages/ExplorePage';
import { HubPage } from '../pages/HubPage';
import { SearchPage } from '../pages/SearchPage';
import { ClaimProvider } from '../claim/ClaimDialog';
import { ComposerProvider } from '../shell/composer';
import { CURSOR, FIGJAM, FIGMA, FIGMA_HUB, makeSummary, SUPABASE } from './boardFixtures';
import { makePost } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

// Mock the api layer's network calls; keep its pure helpers real.
const boardsApi = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  fetchBoards: vi.fn(),
  fetchHub: vi.fn(),
  fetchHubs: vi.fn(),
  fetchPostCounts: vi.fn(),
  fetchTrending: vi.fn(),
  fetchIsBoardTeam: vi.fn(),
  fetchFollowedScopes: vi.fn(),
  setScopeFollow: vi.fn(),
  searchAll: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchPostList: vi.fn(),
  fetchRoadmap: vi.fn(),
  fetchChangelog: vi.fn(),
  fetchWanted: vi.fn(),
  fetchSimilar: vi.fn(),
  createPost: vi.fn(),
  setVote: vi.fn(),
  setPostFollow: vi.fn(),
}));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));

const page = (items: Post[], next: number | null = null): FeedPage => ({ items, next });
const emptyRoadmap = { planned: [], in_progress: [], shipped: [] };

function renderAt(path: string, signedIn = false) {
  return renderWith(
    <ComposerProvider>
      <ClaimProvider>
      <Routes>
        <Route path="/b/:board" element={<BoardPage />} />
        <Route path="/b/:board/manage" element={<h1>Manage page</h1>} />
        <Route path="/h/:hub" element={<HubPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/post/:id" element={<h1>Post page</h1>} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes>
      </ClaimProvider>
    </ComposerProvider>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  boardsApi.fetchBoard.mockResolvedValue(CURSOR);
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGJAM, FIGMA, SUPABASE]);
  boardsApi.fetchHub.mockResolvedValue(FIGMA_HUB);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  boardsApi.fetchPostCounts.mockResolvedValue({ posts: 2, roadmap: 1 });
  boardsApi.fetchTrending.mockResolvedValue([]);
  boardsApi.fetchIsBoardTeam.mockResolvedValue(false);
  boardsApi.fetchFollowedScopes.mockResolvedValue(new Set());
  boardsApi.setScopeFollow.mockResolvedValue(undefined);
  postsApi.fetchPostList.mockResolvedValue(page([makePost({ title: 'Composer drops edits' }), makePost({ title: 'Tab completion lag' })]));
  postsApi.fetchRoadmap.mockResolvedValue(emptyRoadmap);
  postsApi.fetchChangelog.mockResolvedValue([]);
  postsApi.fetchWanted.mockResolvedValue([]);
  postsApi.fetchSimilar.mockResolvedValue([]);
});

describe('board page', () => {
  it('shows the header, tab counts and the board’s feed', async () => {
    renderAt('/b/cursor');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cursor' })).toBeTruthy();
    expect(screen.getByText('The AI code editor · cursor.com')).toBeTruthy();
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('4.1k')).toBeTruthy();
    expect(await screen.findByText('Composer drops edits')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Feedback\s*2/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Roadmap\s*1/ })).toBeTruthy();
    expect(postsApi.fetchPostList).toHaveBeenCalledWith(expect.objectContaining({ boardIds: [CURSOR.id], type: 'all', status: 'all', sort: 'top' }));
    // No Manage for people outside the team; the claim way in instead.
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Work at Cursor?' })).toBeTruthy();
  });

  it('filters by type, then clears', async () => {
    const { router } = renderAt('/b/cursor');
    await screen.findByText('Composer drops edits');
    fireEvent.click(screen.getByRole('button', { name: 'Type: All types' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Bugs' }));
    await waitFor(() => expect(postsApi.fetchPostList).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'bug' })));
    expect(router.state.location.search).toBe('?type=bug');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('says when filters match nothing, and offers to post on an empty board', async () => {
    postsApi.fetchPostList.mockResolvedValue(page([]));
    renderAt('/b/cursor?status=shipped', true);
    expect(await screen.findByText('No posts match these filters.')).toBeTruthy();
  });

  it('opens the composer with the board chosen', async () => {
    postsApi.fetchPostList.mockResolvedValue(page([]));
    renderAt('/b/cursor', true);
    expect(await screen.findByText('No posts yet')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Post feedback' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Post feedback' });
    expect(await within(dialog).findByText('Cursor')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('shows the roadmap columns from ?tab=roadmap', async () => {
    postsApi.fetchRoadmap.mockResolvedValue({
      planned: [makeSummary({ title: 'Inline diff review' })],
      in_progress: [makeSummary({ title: 'Faster indexing', status: 'in_progress', vote_count: 40 })],
      shipped: [],
    });
    renderAt('/b/cursor?tab=roadmap');
    expect(await screen.findByText('Inline diff review')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Planned/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /In progress/ })).toBeTruthy();
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Faster indexing/ }).getAttribute('href')).toMatch(/^\/post\//);
    expect(postsApi.fetchPostList).not.toHaveBeenCalled();
  });

  it('shows the changelog, or says nothing shipped yet', async () => {
    renderAt('/b/cursor?tab=changelog');
    expect(await screen.findByText('Nothing shipped yet')).toBeTruthy();
  });

  it('lists shipped requests by day', async () => {
    const at = '2026-10-21T10:00:00Z';
    postsApi.fetchChangelog.mockResolvedValue([
      { day: '2026-10-21', at, posts: [{ ...makeSummary({ title: 'Split view', status: 'shipped', vote_count: 12 }), shipped_at: at }, { ...makeSummary({ title: 'Billing page', status: 'shipped', vote_count: 1 }), shipped_at: at }] },
    ]);
    renderAt('/b/cursor?tab=changelog');
    expect(await screen.findByText('2 requests shipped')).toBeTruthy();
    expect(screen.getByText('12 upvotes')).toBeTruthy();
    expect(screen.getByText('1 upvote')).toBeTruthy();
  });

  it('answers an unknown board', async () => {
    boardsApi.fetchBoard.mockResolvedValue(null);
    renderAt('/b/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Board not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Explore boards' }).getAttribute('href')).toBe('/explore');
  });

  it('asks a signed-out visitor to sign in to follow', async () => {
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Cursor' }));
    expect(await screen.findByText(/Sign in to follow boards/)).toBeTruthy();
    expect(boardsApi.setScopeFollow).not.toHaveBeenCalled();
  });

  it('follows the board and moves the follower count', async () => {
    renderAt('/b/cursor', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Cursor' }));
    await waitFor(() => expect(boardsApi.setScopeFollow).toHaveBeenCalledWith('board', CURSOR.id, TEST_VIEWER.id, true));
    expect(await screen.findByText('Following Cursor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Following Cursor' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('4.1k')).toBeTruthy(); // 4101 still prints as 4.1k
  });

  it('shows Manage to the team and links the hub', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...FIGJAM, claimed_at: '2026-10-01T00:00:00Z', hub: { id: FIGMA_HUB.id, slug: 'figma', name: 'Figma' } });
    boardsApi.fetchIsBoardTeam.mockResolvedValue(true);
    renderAt('/b/figjam', true);
    expect((await screen.findByRole('link', { name: 'Manage' })).getAttribute('href')).toBe('/b/figjam/manage');
    expect(screen.getByRole('link', { name: /Figma hub/ }).getAttribute('href')).toBe('/h/figma');
    expect(screen.getByText('You manage this board')).toBeTruthy();
  });
});

describe('hub page', () => {
  it('shows the hub, its posts from every board, without closed ones', async () => {
    renderAt('/h/figma');
    expect(await screen.findByRole('heading', { level: 1, name: /Figma/ })).toBeTruthy();
    expect(screen.getByText('No team has claimed this hub yet. Anyone can follow and post here.')).toBeTruthy();
    expect(screen.getByText('Posts from every Figma board')).toBeTruthy();
    await screen.findByText('Composer drops edits');
    expect(postsApi.fetchPostList).toHaveBeenCalledWith(expect.objectContaining({ boardIds: [FIGJAM.id, FIGMA.id], excludeClosed: true }));
  });

  it('lists its boards with Follow buttons', async () => {
    renderAt('/h/figma?tab=boards', true);
    const list = await screen.findByRole('list', { name: 'Figma boards' });
    expect(within(list).getByRole('link', { name: /FigJam/ }).getAttribute('href')).toBe('/b/figjam');
    fireEvent.click(within(list).getByRole('button', { name: 'Follow FigJam' }));
    await waitFor(() => expect(boardsApi.setScopeFollow).toHaveBeenCalledWith('board', FIGJAM.id, TEST_VIEWER.id, true));
  });

  it('follows the hub with the mockup’s message', async () => {
    renderAt('/h/figma', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Figma hub' }));
    expect(await screen.findByText('Following the Figma hub · all 2 boards, plus any added later')).toBeTruthy();
    expect(boardsApi.setScopeFollow).toHaveBeenCalledWith('hub', FIGMA_HUB.id, TEST_VIEWER.id, true);
  });

  it('names each item’s board on the hub roadmap', async () => {
    postsApi.fetchRoadmap.mockResolvedValue({ ...emptyRoadmap, planned: [makeSummary({ title: 'Sticky notes', board: { id: FIGJAM.id, slug: 'figjam', name: 'FigJam', color: FIGJAM.color, logo_path: null } })] });
    renderAt('/h/figma?tab=roadmap');
    const item = await screen.findByRole('link', { name: /Sticky notes/ });
    expect(within(item).getByText('FigJam')).toBeTruthy();
  });

  it('offers the hub’s products in the composer', async () => {
    renderAt('/h/figma', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Post feedback' }));
    const dialog = await screen.findByRole('dialog', { name: 'Post feedback' });
    expect(await within(dialog).findByText('Which Figma product is this about?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'FigJam' }));
    expect(await within(dialog).findByRole('button', { name: 'Change' })).toBeTruthy();
  });
});

describe('explore', () => {
  it('shows trending, hubs and every product', async () => {
    boardsApi.fetchTrending.mockResolvedValue([{ ...SUPABASE, recent: 3 }]);
    postsApi.fetchWanted.mockResolvedValue([makeSummary({ title: 'Branching for preview databases', status: 'open', type: 'feature', vote_count: 80 })]);
    renderAt('/explore');
    expect(await screen.findByRole('heading', { name: 'Trending this week' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Figma hub/ }).getAttribute('href')).toBe('/h/figma');
    expect(await screen.findByText('Branching for preview databases')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fresh bugs' })).toBeNull(); // no bugs to show
    const all = screen.getByRole('list', { name: 'All products' });
    expect(within(all).getAllByRole('article').map((a) => within(a).getAllByRole('link')[0]?.textContent)).toEqual(['Cursor', 'FigJam', 'Figma', 'Supabase']);
  });

  it('filters by search and by category', async () => {
    const { router } = renderAt('/explore');
    const input = await screen.findByRole('searchbox', { name: 'Search products' });
    fireEvent.change(input, { target: { value: 'fig' } });
    expect(await screen.findByRole('heading', { name: 'Results' })).toBeTruthy();
    expect(screen.getByText('2 products')).toBeTruthy();
    expect(router.state.location.search).toBe('?q=fig');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dev platforms' }));
    expect(await screen.findByText('1 product')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dev platforms' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says when nothing matches', async () => {
    renderAt('/explore?q=zzz');
    expect(await screen.findByText('No products match “zzz”.')).toBeTruthy();
  });
});

describe('search', () => {
  it('shows hubs, products and posts under Top, with full lists in tabs', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [FIGMA, FIGJAM], hubs: [FIGMA_HUB], posts: [makePost({ title: 'Figma variables export' })] });
    const { router } = renderAt('/search?q=fig');
    expect(await screen.findByText('Figma variables export')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hubs' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Products' })).toBeTruthy();
    expect(boardsApi.searchAll).toHaveBeenCalledWith('fig', expect.objectContaining({ postLimit: 30 }));
    fireEvent.click(screen.getByRole('tab', { name: /Products/ }));
    expect(router.state.location.search).toContain('tab=products');
    expect(await screen.findByRole('link', { name: /FigJam/ })).toBeTruthy();
  });

  it('offers to post about a search with no results', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [], hubs: [], posts: [] });
    renderAt('/search?q=offline%20mode', true);
    expect(await screen.findByText('No results for “offline mode”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Post about it' }));
    const dialog = await screen.findByRole('dialog', { name: 'Post feedback' });
    expect((within(dialog).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Offline mode');
  });

  it('remembers searches on this device', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [SUPABASE], hubs: [], posts: [] });
    const first = renderAt('/search?q=supabase');
    await screen.findByRole('link', { name: /Supabase/ });
    first.unmount();
    renderAt('/search');
    expect(await screen.findByRole('heading', { name: 'Recent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'supabase' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull();
  });

  it('waits for two characters', async () => {
    renderAt('/search?q=a');
    expect(await screen.findByText('Keep typing to search.')).toBeTruthy();
    expect(boardsApi.searchAll).not.toHaveBeenCalled();
  });
});

