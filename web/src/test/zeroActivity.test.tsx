import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { BoardCard } from '../boards/parts';
import { ExplorePage } from '../pages/ExplorePage';
import { PostCard } from '../posts/PostCard';
import { RailBoards } from '../shell/RightRail';
import { CURSOR, FIGMA, makeBoard, makeSummary, SUPABASE } from './boardFixtures';
import { makePost } from './postFixtures';
import { renderWith } from './renderApp';

// #156: while the community is quiet, public surfaces say what their ordering
// really is and do not lead with zero counters. No manufactured activity.
const boardsApi = vi.hoisted(() => ({
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
  fetchTrending: vi.fn(),
  fetchFollowedScopes: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({ fetchWanted: vi.fn() }));
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

  it('reads "Trending this week" with each board’s new-post count when there is activity', async () => {
    boardsApi.fetchTrending.mockResolvedValue([{ ...SUPABASE, recent: 3 }]);
    boardsApi.fetchBoards.mockResolvedValue([SUPABASE, QUIET_OLD]);
    renderWith(<RailBoards />);
    expect(await screen.findByRole('heading', { name: 'Trending this week' })).toBeTruthy();
    expect(screen.getByText('3 new').getAttribute('title')).toBe('3 new posts this week');
  });
});

describe('explore while quiet', () => {
  const renderExplore = () =>
    renderWith(
      <Routes>
        <Route path="/explore" element={<ExplorePage />} />
      </Routes>,
      { path: '/explore' },
    );

  it('has no Trending section and no zero counters on cards', async () => {
    renderExplore();
    const all = await screen.findByRole('list', { name: 'All products' });
    expect(screen.queryByRole('heading', { name: /Trending/ })).toBeNull();
    expect(all.textContent).not.toMatch(/\b0 (posts|followers)\b/);
    expect(within(all).getByText('Added 2w ago')).toBeTruthy();
    expect(within(all).getByText('Added 2d ago')).toBeTruthy();
  });

  it('labels unvoted requests "Latest requests", not "Most wanted"', async () => {
    postsApi.fetchWanted.mockResolvedValue([makeSummary({ title: 'Offline mode', vote_count: 0 })]);
    renderExplore();
    expect(await screen.findByRole('heading', { name: 'Latest requests' })).toBeTruthy();
    expect(screen.getByText('Newest across all boards')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Most wanted' })).toBeNull();
    expect(screen.queryByLabelText('0 upvotes')).toBeNull();
  });

  it('keeps "Most wanted" once requests have upvotes', async () => {
    postsApi.fetchWanted.mockResolvedValue([makeSummary({ title: 'Offline mode', vote_count: 4 })]);
    renderExplore();
    expect(await screen.findByRole('heading', { name: 'Most wanted' })).toBeTruthy();
    expect(screen.getByLabelText('4 upvotes')).toBeTruthy();
  });
});

describe('cards at zero', () => {
  it('board card shows real counts, and recency instead of zeros', () => {
    renderWith(<BoardCard board={FIGMA} />);
    expect(screen.getByText('posts', { exact: false }).textContent).toContain('5');
    expect(screen.getByText(/followers/).textContent).toContain('30');
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
