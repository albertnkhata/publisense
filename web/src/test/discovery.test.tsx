import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { rememberSearch } from '../api/boards';
import type { FeedPage, Post } from '../api/posts';
import { BoardPage } from '../pages/BoardPage';
import { ExplorePage } from '../pages/ExplorePage';
import { HubPage } from '../pages/HubPage';
import { SearchPage } from '../pages/SearchPage';
import { ClaimProvider } from '../claim/ClaimDialog';
import { ComposerProvider } from '../shell/composer';
import { SearchWell } from '../shell/SearchWell';
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
        <Route path="/well" element={<SearchWell />} />
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
  it('renders smart Back navigation falling back to home', async () => {
    postsApi.fetchPostList.mockResolvedValue(page([]));
    const { router } = renderAt('/b/cursor');
    const back = await screen.findByRole('link', { name: 'Back' });
    expect(back).toBeTruthy();
    expect(back.getAttribute('href')).toBe('/');
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('navigates back in history when history entries exist', async () => {
    const originalState = window.history.state;
    Object.defineProperty(window.history, 'state', {
      value: { idx: 2 },
      configurable: true,
    });
    try {
      const { router } = renderAt('/b/cursor');
      const back = await screen.findByRole('link', { name: 'Back' });
      const navSpy = vi.spyOn(router, 'navigate');
      fireEvent.click(back);
      expect(navSpy).toHaveBeenCalledWith(-1);
    } finally {
      Object.defineProperty(window.history, 'state', {
        value: originalState,
        configurable: true,
      });
    }
  });

  it('sets the tab title to the board name (#159)', async () => {
    renderAt('/b/cursor');
    await waitFor(() => expect(document.title).toBe(`${CURSOR.name} · Publisense`));
  });

  it('shows the header, tab counts and the board’s feed', async () => {
    renderAt('/b/cursor');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cursor' })).toBeTruthy();
    expect(screen.getByText('The AI code editor')).toBeTruthy();
    expect(screen.queryByText('92')).toBeNull(); // no post count, followers only
    expect(screen.getByText('4.1k')).toBeTruthy();
    expect(await screen.findByText('Composer drops edits')).toBeTruthy();
    // No tab bar: Roadmap and Changelog sit in the ⋯ menu.
    expect(screen.queryByRole('tab', { name: /Feedback/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: /Roadmap/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Changelog/ })).toBeTruthy();
    // Share is a quiet link on the meta line, not in the menu.
    expect(screen.queryByRole('menuitem', { name: /Share board/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Share board' })).toBeTruthy();
    expect(postsApi.fetchPostList).toHaveBeenCalledWith(expect.objectContaining({ boardIds: [CURSOR.id], type: 'all', status: 'all', sort: 'top' }));
    // No Manage for people outside the team; the claim way in instead.
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Work at Cursor?' })).toBeTruthy();
  });

  it('filters by type, then clears', async () => {
    const { router } = renderAt('/b/cursor');
    await screen.findByText('Composer drops edits');
    fireEvent.click(screen.getByRole('button', { name: 'Type: Feedback' }));
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
    expect(screen.getByRole('heading', { level: 2, name: 'Roadmap' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to feedback' })).toBeTruthy();
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
    expect(screen.getByRole('link', { name: 'Figma' }).getAttribute('href')).toBe('/h/figma');
    expect(screen.getByText('You manage this board')).toBeTruthy();
  });
});

describe('board header meta line', () => {
  const metaLine = async (name: string) => {
    await screen.findByRole('heading', { level: 1, name });
    const line = document.querySelector<HTMLElement>('[data-scope-meta]');
    expect(line).toBeTruthy();
    return line!;
  };

  it('links the product’s site under the tagline, with its icon, in a new tab', async () => {
    renderAt('/b/cursor');
    const line = await metaLine('Cursor');
    const site = within(line).getByRole('link', { name: 'cursor.com' });
    expect(site.getAttribute('href')).toBe('https://cursor.com/');
    expect(site.getAttribute('target')).toBe('_blank');
    expect(site.getAttribute('rel')).toBe('noopener noreferrer');
    expect(site.querySelector('svg')).toBeTruthy();
    // The line sits after the tagline, and the tagline no longer carries the domain.
    const tagline = screen.getByText('The AI code editor');
    expect(tagline.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tagline.textContent).not.toContain('cursor.com');
    // No hub link on a board without a hub.
    expect(screen.queryByRole('link', { name: /hub/ })).toBeNull();
  });

  it('adds the company (hub) link with its icon, as the company name, when the board belongs to a hub, once', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...FIGMA, site: 'figma.com', hub: { id: FIGMA_HUB.id, slug: 'figma', name: 'Figma' } });
    renderAt('/b/figma');
    const line = await metaLine('Figma');
    const hub = within(line).getByRole('link', { name: 'Figma' });
    expect(hub.getAttribute('title')).toBe('All Figma products');
    expect(hub.getAttribute('href')).toBe('/h/figma');
    expect(hub.querySelector('svg')).toBeTruthy();
    expect(within(line).getByRole('link', { name: 'figma.com' }).getAttribute('target')).toBe('_blank');
    // Neither link is duplicated anywhere on the page.
    expect(screen.getAllByRole('link', { name: 'Figma' }).filter((a) => a.getAttribute('href') === '/h/figma')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'figma.com' })).toHaveLength(1);
  });

  it('shows a GitHub repo as owner/repo, with "Added by" hidden for now', async () => {
    boardsApi.fetchBoard.mockResolvedValue({
      ...CURSOR,
      site: 'github.com/vercel/next.js',
      creator: { id: TEST_VIEWER.id, handle: 'kim', name: 'Kim', avatar_path: null },
    });
    renderAt('/b/cursor');
    const line = await metaLine('Cursor');
    expect(within(line).getByRole('link', { name: 'github.com/vercel/next.js' }).getAttribute('href')).toBe('https://github.com/vercel/next.js');
    expect(within(line).queryByRole('link', { name: '@kim' })).toBeNull();
    expect(screen.queryByText(/Added by/)).toBeNull();
  });

  it('leaves the line out when there is nothing to show', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, site: null, status: 'pending' });
    renderAt('/b/cursor');
    await screen.findByRole('heading', { level: 1, name: /Cursor/ });
    expect(document.querySelector('[data-scope-meta]')).toBeNull();
  });

  it('keeps Share on the line when the board has no site or company', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, site: null });
    renderAt('/b/cursor');
    await screen.findByRole('heading', { level: 1, name: 'Cursor' });
    expect(document.querySelector('[data-scope-meta]')?.textContent).toBe('Share');
  });
});

describe('hub page', () => {
  it('renders smart Back navigation', async () => {
    const { router } = renderAt('/h/figma');
    const back = await screen.findByRole('link', { name: 'Back' });
    expect(back).toBeTruthy();
    expect(back.getAttribute('href')).toBe('/');
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('sets the tab title to the hub name (#159)', async () => {
    renderAt('/h/figma');
    await waitFor(() => expect(document.title).toBe(`${FIGMA_HUB.name} hub · Publisense`));
  });

  it('shows the hub, its posts from every board, without closed ones', async () => {
    renderAt('/h/figma');
    expect(await screen.findByRole('heading', { level: 1, name: /Figma/ })).toBeTruthy();
    expect(screen.getByText('No team has claimed this hub yet. Anyone can follow and post here.')).toBeTruthy();
    expect(screen.getByText('Posts from every Figma board')).toBeTruthy();
    await screen.findByText('Composer drops edits');
    expect(postsApi.fetchPostList).toHaveBeenCalledWith(expect.objectContaining({ boardIds: [FIGJAM.id, FIGMA.id], excludeClosed: true }));
  });

  it('shares the hub from the ⋯ menu, like boards and profiles', async () => {
    renderAt('/h/figma');
    await screen.findByRole('heading', { level: 1, name: /Figma/ });
    expect(screen.queryByRole('button', { name: /^Share / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: /Share hub/ })).toBeTruthy();
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

// Board and hub headers hide a zero follower count, as the cards do (#156),
// and show it with the right plural from 1 up. Nothing else on the line moves.
describe('header follower count', () => {
  const header = async (name: RegExp | string) =>
    (await screen.findByRole('heading', { level: 1, name })).closest('header') as HTMLElement;

  it('board header: no "0 followers", and no stray stat left behind', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, follower_count: 0 });
    renderAt('/b/cursor');
    const h = await header('Cursor');
    expect(h.textContent).not.toMatch(/follower/);
    expect(within(h).getByRole('button', { name: 'Work at Cursor?' })).toBeTruthy();
  });

  it('board header: "1 follower" singular, then "N followers"', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, follower_count: 1 });
    const first = renderAt('/b/cursor');
    expect((await header('Cursor')).textContent).toMatch(/(?<!\d)1 follower(?!s)/);
    first.unmount();
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, follower_count: 2 });
    renderAt('/b/cursor');
    expect((await header('Cursor')).textContent).toMatch(/(?<!\d)2 followers/);
  });

  it('board header: following a zero board shows "1 follower" at once', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, follower_count: 0 });
    renderAt('/b/cursor', true);
    const h = await header('Cursor');
    expect(h.textContent).not.toMatch(/follower/);
    fireEvent.click(within(h).getByRole('button', { name: 'Follow Cursor' }));
    await waitFor(() => expect(h.textContent).toMatch(/(?<!\d)1 follower(?!s)/));
  });

  it('hub header: boards stay, followers hidden at zero', async () => {
    boardsApi.fetchHub.mockResolvedValue({ ...FIGMA_HUB, follower_count: 0 });
    renderAt('/h/figma');
    const h = await header(/Figma/);
    expect(h.textContent).toMatch(/(?<!\d)2 boards/);
    expect(h.textContent).not.toMatch(/follower/);
  });

  it('hub header: "1 follower" singular, "210 followers" plural', async () => {
    boardsApi.fetchHub.mockResolvedValue({ ...FIGMA_HUB, follower_count: 1 });
    const first = renderAt('/h/figma');
    expect((await header(/Figma/)).textContent).toMatch(/(?<!\d)1 follower(?!s)/);
    first.unmount();
    boardsApi.fetchHub.mockResolvedValue(FIGMA_HUB);
    renderAt('/h/figma');
    expect((await header(/Figma/)).textContent).toMatch(/(?<!\d)210 followers/);
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

  it('has no search field of its own: the site search covers products', async () => {
    renderAt('/explore');
    await screen.findByRole('list', { name: 'All products' });
    expect(screen.queryByRole('searchbox', { name: 'Search products' })).toBeNull();
  });

  it('filters by category', async () => {
    renderAt('/explore');
    fireEvent.click(await screen.findByRole('button', { name: 'Dev platforms' }));
    expect(await screen.findByText('1 product')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dev platforms' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('an old /explore?q= link still filters, as a chip you can clear', async () => {
    const { router } = renderAt('/explore?q=fig');
    expect(await screen.findByText('2 products')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search “fig”' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByRole('button', { name: /Clear search/ })).toBeNull();
  });

  it('shows only category chips that have products, plus the one in the URL', async () => {
    renderAt('/explore?cat=travel');
    expect(await screen.findByText('No products in this category yet.')).toBeTruthy();
    const chips = within(screen.getByRole('toolbar', { name: 'Categories' }));
    expect(chips.getByRole('button', { name: 'Code editors' })).toBeTruthy();
    expect(chips.getByRole('button', { name: 'Travel' }).getAttribute('aria-pressed')).toBe('true');
    expect(chips.queryByRole('button', { name: 'Shopping' })).toBeNull();
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

describe('search modal', () => {
  const trigger = () => screen.getByRole('button', { name: 'Search products, posts, hubs' });

  it('opens on Ctrl+K with boards to browse, no recent searches, hints or counters, and closes on Escape', async () => {
    rememberSearch('dark mode');
    renderAt('/well');
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    // The shortcut works but isn’t advertised on screen.
    expect(trigger().textContent).not.toMatch(/⌘|Ctrl/);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    expect(await within(modal).findByRole('option', { name: /Cursor/ })).toBeTruthy();
    expect(within(modal).queryByRole('option', { name: /dark mode/ })).toBeNull();
    expect(within(modal).queryByText(/Navigate/)).toBeNull();
    expect(within(modal).queryByText(/^\+\d+ this week$/)).toBeNull();
    expect(within(modal).queryByRole('button', { name: 'Clear' })).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });

  it('returns focus to the trigger on Escape and on Close, without reopening', async () => {
    renderAt('/well');
    const button = trigger();
    button.focus();
    fireEvent.click(button);
    let modal = await screen.findByRole('dialog', { name: 'Search' });
    expect(document.activeElement).toBe(within(modal).getByRole('combobox', { name: /Search products/ }));
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    modal = await screen.findByRole('dialog', { name: 'Search' });
    // The close button’s accessible name is its visible label.
    const close = within(modal).getByRole('button', { name: 'Close' });
    expect(close.textContent).toBe('Close');
    fireEvent.click(close);
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('clears the query whenever the modal closes: Escape, Close and outside click', async () => {
    renderAt('/well');
    const typeAndReopen = async (close: (modal: HTMLElement) => void) => {
      fireEvent.click(trigger());
      let modal = await screen.findByRole('dialog', { name: 'Search' });
      fireEvent.change(within(modal).getByRole('combobox', { name: /Search products/ }), { target: { value: 'figma' } });
      close(modal);
      expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
      fireEvent.click(trigger());
      modal = await screen.findByRole('dialog', { name: 'Search' });
      expect((within(modal).getByRole('combobox', { name: /Search products/ }) as HTMLInputElement).value).toBe('');
      fireEvent.keyDown(document, { key: 'Escape' });
    };
    await typeAndReopen(() => fireEvent.keyDown(document, { key: 'Escape' }));
    await typeAndReopen((modal) => fireEvent.click(within(modal).getByRole('button', { name: 'Close' })));
    await typeAndReopen((modal) => fireEvent.click(modal.parentElement!.querySelector('[aria-hidden="true"]')!));
  });

  it('closes and clears the query when the page navigates', async () => {
    const { router } = renderWith(
      <>
        <SearchWell />
        <Routes>
          <Route path="*" element={<h1>Page</h1>} />
        </Routes>
      </>,
      { path: '/explore' },
    );
    fireEvent.click(trigger());
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.change(within(modal).getByRole('combobox', { name: /Search products/ }), { target: { value: 'figma' } });
    await act(async () => {
      await router.navigate('/notifications');
    });
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    fireEvent.click(trigger());
    const again = await screen.findByRole('dialog', { name: 'Search' });
    expect((within(again).getByRole('combobox', { name: /Search products/ }) as HTMLInputElement).value).toBe('');
  });

  it('opens empty on the search page instead of carrying the page’s query', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [], hubs: [], posts: [] });
    renderWith(
      <>
        <SearchWell />
        <Routes>
          <Route path="/search" element={<h1>Search page</h1>} />
        </Routes>
      </>,
      { path: '/search?q=figma' },
    );
    fireEvent.click(trigger());
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    expect((within(modal).getByRole('combobox', { name: /Search products/ }) as HTMLInputElement).value).toBe('');
  });

  it('keeps the listbox to options and labelled groups', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [FIGMA, FIGJAM], hubs: [FIGMA_HUB], posts: [makePost({ title: 'Figma variables export' })] });
    renderAt('/well');
    fireEvent.click(trigger());
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.change(within(modal).getByRole('combobox', { name: /Search products/ }), { target: { value: 'fig' } });
    const list = within(modal).getByRole('listbox', { name: 'Search suggestions' });
    expect(await within(list).findByRole('option', { name: /Figma variables export/ })).toBeTruthy();
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    expect(within(list).getByRole('group', { name: 'Product boards' })).toBeTruthy();
    expect(within(list).getByRole('group', { name: 'Feedback & bugs' })).toBeTruthy();
    expect(within(within(list).getByRole('group', { name: 'Company hubs' })).getByRole('option', { name: /Figma hub/ })).toBeTruthy();
    // Scope filters carry no counts.
    const filters = within(modal).getByRole('group', { name: 'Filter search results' });
    expect(within(filters).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Product boards', 'Feedback & bugs', 'Company hubs', 'People']);
  });

  it('filters live results by scope and navigates with the keyboard', async () => {
    boardsApi.searchAll.mockResolvedValue({
      boards: [FIGMA, FIGJAM],
      hubs: [FIGMA_HUB],
      posts: [makePost({ title: 'Figma variables export', status: 'planned' })],
    });
    const { router } = renderAt('/well');
    fireEvent.click(trigger());
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    const input = within(modal).getByRole('combobox', { name: /Search products/ });

    fireEvent.change(input, { target: { value: 'fig' } });
    expect(await within(modal).findByRole('option', { name: /Figma variables export/ })).toBeTruthy();
    expect(within(modal).getByRole('option', { name: /Figma hub/ })).toBeTruthy();

    // Filter to Feedback & bugs only
    const filters = within(modal).getByRole('group', { name: 'Filter search results' });
    fireEvent.click(within(filters).getByRole('button', { name: 'Feedback & bugs' }));
    expect(within(modal).queryByRole('option', { name: /Figma hub/ })).toBeNull();
    expect(within(modal).getByRole('option', { name: /Figma variables export/ })).toBeTruthy();

    // Back to Product boards: ArrowDown highlights the first option (aria-activedescendant follows),
    // ArrowUp wraps to the last, ArrowDown wraps back to the first, Enter opens it.
    fireEvent.click(within(filters).getByRole('button', { name: 'Product boards' }));
    const options = within(modal).getAllByRole('option');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1]!.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/b/figma'));
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });
});

/*
 * 0030: a company that changed its name still owns the address it used to publish under.
 * Following an old link lands on the current one instead of "Hub not found".
 */
describe('old company addresses', () => {
  it('redirects a former slug to the page that owns it', async () => {
    const { router } = renderAt('/h/xai');
    expect(await screen.findByRole('heading', { level: 1, name: /Figma/ })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe('/h/figma'));
    // Resolved twice: the old address, then the current one after the redirect.
    expect(boardsApi.fetchHub.mock.calls.map((c) => c[0])).toEqual(['xai', 'figma']);
  });

  it('leaves a current slug where it is', async () => {
    const { router } = renderAt('/h/figma');
    expect(await screen.findByRole('heading', { level: 1, name: /Figma/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/h/figma');
    expect(boardsApi.fetchHub).toHaveBeenCalledTimes(1);
  });
});
