import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { BoardCard } from '../boards/parts';
import { CategoryPage } from '../pages/CategoryPage';
import { HomePage } from '../pages/HomePage';
import { PostCard } from '../posts/PostCard';
import { ClaimLine, RailBoards } from '../shell/RightRail';
import { ClaimProvider } from '../claim/ClaimDialog';
import { CURSOR, FIGMA, makeBoard, makeSummary, SUPABASE } from './boardFixtures';
import { makePost } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

// #156: while the community is quiet, public surfaces say what their ordering
// really is and do not lead with zero counters. No manufactured activity.
const boardsApi = vi.hoisted(() => ({
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
  fetchTrending: vi.fn(),
  fetchFollowedScopes: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchWanted: vi.fn(),
  fetchPopularByStatus: vi.fn(),
}));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));

const DAY = 86400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const QUIET_OLD = makeBoard({ id: 'b0000000-0000-4000-8000-0000000000a1', slug: 'linear', name: 'Linear', post_count: 0, follower_count: 0, created_at: ago(20) });
const QUIET_NEW = makeBoard({ id: 'b0000000-0000-4000-8000-0000000000a2', slug: 'notion', name: 'Notion', post_count: 0, follower_count: 0, created_at: ago(2) });

beforeEach(() => {
  vi.clearAllMocks();
  boardsApi.fetchBoards.mockResolvedValue([QUIET_OLD, QUIET_NEW]);
  boardsApi.fetchHubs.mockResolvedValue([]);
  boardsApi.fetchTrending.mockResolvedValue([]);
  boardsApi.fetchFollowedScopes.mockResolvedValue(new Set());
  postsApi.fetchWanted.mockResolvedValue([]);
  postsApi.fetchPopularByStatus.mockResolvedValue([]);
});

describe('right rail boards card', () => {
  it('reads "Recently added", newest first, when nothing is trending', async () => {
    renderWith(<RailBoards />);
    expect(await screen.findByRole('heading', { name: 'Recently added' })).toBeTruthy();
    expect(screen.queryByText(/Trending/)).toBeNull();
    const list = screen.getByRole('list', { name: 'Recently added boards' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/b/notion', '/b/linear']);
    expect(rows.map((a) => a.textContent?.slice(-2))).toEqual(['2d', '2w']);
  });

  it('reads "New this week" with each board’s new-post count when only one board is active', async () => {
    boardsApi.fetchTrending.mockResolvedValue([{ ...SUPABASE, recent: 3 }]);
    boardsApi.fetchBoards.mockResolvedValue([SUPABASE, QUIET_OLD]);
    renderWith(<RailBoards />);
    // One row is not a ranking, so the card does not claim to rank (look-and-feel item 5b).
    expect(await screen.findByRole('heading', { name: 'New this week' })).toBeTruthy();
    expect(screen.getByText('3 new').getAttribute('title')).toBe('3 new posts this week');
  });

  it('reads "Trending this week" once there are enough rows to be a ranking', async () => {
    boardsApi.fetchTrending.mockResolvedValue([
      { ...SUPABASE, recent: 3 },
      { ...QUIET_OLD, recent: 2 },
      { ...QUIET_NEW, recent: 1 },
    ]);
    boardsApi.fetchBoards.mockResolvedValue([SUPABASE, QUIET_OLD, QUIET_NEW]);
    renderWith(<RailBoards />);
    expect(await screen.findByRole('heading', { name: 'Trending this week' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'New this week' })).toBeNull();
  });

  it('shows Recently added beside the activity card, without repeating a trending board', async () => {
    boardsApi.fetchTrending.mockResolvedValue([{ ...SUPABASE, recent: 3 }]);
    boardsApi.fetchBoards.mockResolvedValue([SUPABASE, QUIET_OLD, QUIET_NEW]);
    renderWith(<RailBoards />);
    expect(await screen.findByRole('heading', { name: 'New this week' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recently added' })).toBeTruthy();
    const recent = within(screen.getByRole('list', { name: 'Recently added boards' })).getAllByRole('link');
    expect(recent.map((a) => a.getAttribute('href'))).toEqual(['/b/notion', '/b/linear']);
  });

  it('falls back to activity-ordered Trending when boards have posts older than a week, without repeating them in Recently added', async () => {
    boardsApi.fetchTrending.mockResolvedValue([]);
    boardsApi.fetchBoards.mockResolvedValue([CURSOR, SUPABASE, QUIET_NEW]);
    renderWith(<RailBoards />);
    expect(await screen.findByRole('heading', { name: 'Trending' })).toBeTruthy();
    const trending = within(screen.getByRole('list', { name: 'Trending boards' })).getAllByRole('link');
    expect(trending.map((a) => a.getAttribute('href'))).toEqual(['/b/cursor', '/b/supabase']);
    expect(screen.getByText('92 posts')).toBeTruthy();
    const recent = within(screen.getByRole('list', { name: 'Recently added boards' })).getAllByRole('link');
    expect(recent.map((a) => a.getAttribute('href'))).toEqual(['/b/notion']);
  });
});

describe('discovery home while quiet', () => {
  const renderHome = (path = '/') =>
    renderWith(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/c/:category" element={<CategoryPage />} />
      </Routes>,
      { path, viewer: TEST_VIEWER },
    );

  it('has no Trending section, summarises categories without product counts, and hides Popular posts when empty', async () => {
    renderHome();
    const cats = await screen.findByRole('list', { name: 'Categories' });
    expect(screen.queryByRole('heading', { name: /Trending/ })).toBeNull();
    expect(within(cats).getByText('Code editors')).toBeTruthy();
    expect(cats.textContent).not.toMatch(/\b\d+\s+products?\b/);
    expect(within(cats).getByText('Linear, Notion')).toBeTruthy();
    expect(cats.textContent).not.toMatch(/\b0 (posts|followers)\b/);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Recent feedback' })).toBeNull());
    expect(screen.queryByText(/No .* posts yet/)).toBeNull();
  });

  it('shows Added recency instead of zero counters on quiet category results', async () => {
    renderHome('/c/code');
    const results = await screen.findByRole('list', { name: 'Code editors' });
    expect(results.textContent).not.toMatch(/\b0 (posts|followers)\b/);
    expect(within(results).getByText('Added 2w ago')).toBeTruthy();
    expect(within(results).getByText('Added 2d ago')).toBeTruthy();
  });

  it('hides zero vote numbers in Popular posts and shows counts once upvoted', async () => {
    postsApi.fetchPopularByStatus.mockResolvedValue([
      { ...makeSummary({ title: 'Offline mode', status: 'under_review', vote_count: 0 }), has_official_reply: false, voted: false, following: false },
      { ...makeSummary({ title: 'Keyboard nav', status: 'under_review', vote_count: 4 }), has_official_reply: false, voted: false, following: false },
    ]);
    renderHome();
    expect(await screen.findByText('Offline mode')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upvote, 0 votes' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Upvote, 4 votes' }).textContent).toBe('4');
  });
});

describe('claim line', () => {
  it('offers "Claim this product" on generic pages or boards', async () => {
    renderWith(<ClaimProvider><ClaimLine /></ClaimProvider>);
    expect(screen.getByText('Maintain a product?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim this product' })).toBeTruthy();
  });

  it('offers "Claim this hub" on hub pages', async () => {
    boardsApi.fetchHubs.mockResolvedValue([{ id: 'h1', slug: 'figma', name: 'Figma', claimed_at: null }]);
    renderWith(<ClaimProvider><ClaimLine /></ClaimProvider>, { path: '/h/figma' });
    expect(await screen.findByText('Maintain these products?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim this hub' })).toBeTruthy();
  });

  it('a hub that is already claimed gets the generic line', async () => {
    boardsApi.fetchHubs.mockResolvedValue([{ id: 'h1', slug: 'figma', name: 'Figma', claimed_at: '2026-10-01T00:00:00Z' }]);
    renderWith(<ClaimProvider><ClaimLine /></ClaimProvider>, { path: '/h/figma' });
    await waitFor(() => expect(boardsApi.fetchHubs).toHaveBeenCalled());
    expect(await screen.findByText('Maintain a product?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Claim this hub' })).toBeNull();
  });
});

describe('cards at zero', () => {
  it('board card stretches full height and shows post counts without follower counts', () => {
    renderWith(<BoardCard board={FIGMA} />);
    const card = screen.getByRole('article');
    expect(card.className).toContain('h-full');
    expect(screen.getByText('posts', { exact: false }).textContent).toContain('5');
    expect(screen.queryByText(/follower/)).toBeNull();
  });

  it('a big board keeps its counts without an "Added" line', () => {
    renderWith(<BoardCard board={{ ...CURSOR, created_at: ago(60) }} />);
    expect(screen.queryByText(/^Added/)).toBeNull();
  });

  it('post card shows Upvote and Reply, not 0 and 0', () => {
    renderWith(<PostCard post={makePost({ vote_count: 0, reply_count: 0 })} />);
    const vote = screen.getByRole('button', { name: 'Upvote, 0 votes' });
    expect(vote.textContent).toBe('Upvote');
    expect(screen.getByRole('link', { name: '0 replies' }).textContent).toBe('Reply');
  });

  it('post card shows counts once there are some', () => {
    renderWith(<PostCard post={makePost({ vote_count: 7, reply_count: 2 })} />);
    expect(screen.getByRole('button', { name: 'Upvote, 7 votes' }).textContent).toBe('7');
    expect(screen.getByRole('link', { name: '2 replies' }).textContent).toBe('2');
  });
});
