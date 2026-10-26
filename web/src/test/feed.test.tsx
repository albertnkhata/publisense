import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { FeedPage, Post } from '../api/posts';
import { ClaimProvider } from '../claim/ClaimDialog';
import { HomePage, PITCH } from '../pages/HomePage';
import { ComposerProvider } from '../shell/composer';
import { CURSOR } from './boardFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';
import { BOARD, makePost, SUPA } from './postFixtures';

// Mock the api layer's network calls; keep its pure helpers real.
const api = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  setVote: vi.fn(),
  setPostFollow: vi.fn(),
}));
const boardsApi = vi.hoisted(() => ({
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
}));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...api }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));

const page = (items: Post[], next: number | null = null): FeedPage => ({ items, next });

function renderHome(opts: { signedIn?: boolean; path?: string } = {}) {
  return renderWith(
    <ComposerProvider>
      <ClaimProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/post/:id" element={<h1>Post page</h1>} />
        </Routes>
      </ClaimProvider>
    </ComposerProvider>,
    { viewer: opts.signedIn ? TEST_VIEWER : null, path: opts.path ?? '/' },
  );
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.setVote.mockResolvedValue(undefined);
  api.setPostFollow.mockResolvedValue(undefined);
  boardsApi.fetchBoards.mockResolvedValue([CURSOR]);
  boardsApi.fetchHubs.mockResolvedValue([]);
});

describe('home feed', () => {
  it('renders community, seeded and deleted-author posts', async () => {
    api.fetchFeed.mockResolvedValue(
      page([
        makePost({ title: 'Composer swallows git conflicts', status: 'in_progress', reply_count: 14, vote_count: 92 }),
        makePost({
          title: 'Edge Functions cold starts',
          author: null,
          author_id: null,
          source_url: 'https://github.com/supabase/supabase/issues/1',
          board: SUPA,
          board_id: SUPA.id,
        }),
        makePost({ title: 'Orphaned post', author: null, author_id: null }),
      ]),
    );
    renderHome();
    const list = await screen.findByRole('list', { name: 'Posts' });
    const cards = within(list).getAllByRole('article');
    expect(cards).toHaveLength(3);

    const first = cards[0]!;
    expect(within(first).getByRole('link', { name: '@jmwamba' }).getAttribute('href')).toBe('/u/jmwamba');
    expect(within(first).getByRole('link', { name: 'Cursor' }).getAttribute('href')).toBe('/b/cursor');
    expect(within(first).getByText('In progress')).toBeTruthy();
    expect(within(first).getByRole('button', { name: /Upvote, 92 votes/ })).toBeTruthy();
    expect(within(first).getByRole('link', { name: '14 replies' })).toBeTruthy();

    const seeded = cards[1]!;
    const source = within(seeded).getByRole('link', { name: /from GitHub/ });
    expect(source.getAttribute('href')).toBe('https://github.com/supabase/supabase/issues/1');
    expect(within(seeded).getByRole('link', { name: 'Supabase' })).toBeTruthy();

    expect(within(cards[2]!).getByText('deleted user')).toBeTruthy();
    expect(api.fetchFeed).toHaveBeenCalledWith({ scope: 'all', sort: 'top', offset: 0, viewerId: null });
  });

  it('hides the Following tab when signed out and offers it when signed in', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    const { unmount } = renderHome();
    await screen.findByRole('list', { name: 'Posts' });
    expect(screen.queryByRole('tab', { name: 'Following' })).toBeNull();
    unmount();

    renderHome({ signedIn: true });
    fireEvent.click(await screen.findByRole('tab', { name: 'Following' }));
    await waitFor(() =>
      expect(api.fetchFeed).toHaveBeenLastCalledWith({ scope: 'following', sort: 'top', offset: 0, viewerId: TEST_VIEWER.id }),
    );
  });

  it('sorts by New from the sort menu', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    const { router } = renderHome();
    await screen.findByRole('list', { name: 'Posts' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort feed: Top' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /New/ }));
    await waitFor(() => expect(api.fetchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'new', offset: 0 })));
    expect(router.state.location.search).toBe('?sort=new');
    expect(screen.getByRole('button', { name: 'Sort feed: New' })).toBeTruthy();
  });

  it('loads the next page and says when it is caught up', async () => {
    const first = Array.from({ length: 3 }, (_, i) => makePost({ title: `First page ${i}` }));
    const second = [makePost({ title: 'Second page post' }), first[0]!];
    api.fetchFeed.mockImplementation(async ({ offset }: { offset: number }) => (offset === 0 ? page(first, 20) : page(second, null)));
    renderHome();
    await screen.findByText('First page 0');
    expect(screen.queryByText('You’re all caught up')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await screen.findByText('Second page post');
    expect(api.fetchFeed).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
    // The repeat from page one is shown once.
    expect(screen.getAllByText('First page 0')).toHaveLength(1);
    expect(screen.getByText('You’re all caught up')).toBeTruthy();
  });

  it('shows empty states for an empty feed and an empty Following', async () => {
    api.fetchFeed.mockResolvedValue(page([]));
    renderHome({ signedIn: true });
    expect(await screen.findByText('No posts yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post feedback' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Following' }));
    expect(await screen.findByText(/Nothing from what you follow yet/)).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    api.fetchFeed.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(page([makePost({ title: 'Back online' })]));
    renderHome();
    expect(await screen.findByText('We couldn’t load the feed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back online')).toBeTruthy();
  });

  it('opens the post when the card is clicked, not when a control is', async () => {
    const post = makePost({ title: 'Click me' });
    api.fetchFeed.mockResolvedValue(page([post]));
    const { router } = renderHome();
    const card = (await screen.findByText('Body text')).closest('article')!;
    fireEvent.click(within(card).getByRole('link', { name: 'Cursor' }));
    expect(router.state.location.pathname).toBe('/b/cursor');
    await router.navigate('/');
    fireEvent.click((await screen.findByText('Body text')).closest('article')!.querySelector('p')!);
    expect(router.state.location.pathname).toBe(`/post/${post.id}`);
  });
});

describe('signed-out pitch', () => {
  it('shows one pitch card above the composer when signed out', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    renderHome();
    const pitch = await screen.findByRole('region', { name: PITCH.title });
    expect(within(pitch).getByText(PITCH.body)).toBeTruthy();
    expect(screen.getAllByRole('region', { name: PITCH.title })).toHaveLength(1);
    // Very top of Home: before the composer bar.
    const composer = screen.getByRole('button', { name: /What’s slowing you down/ });
    expect(pitch.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Not dismissible.
    expect(within(pitch).getAllByRole('button')).toHaveLength(2);
  });

  it('is never shown to a signed-in viewer', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    renderHome({ signedIn: true });
    await screen.findByRole('tab', { name: 'All' });
    expect(screen.queryByRole('region', { name: PITCH.title })).toBeNull();
    expect(screen.queryByRole('button', { name: PITCH.join })).toBeNull();
    expect(screen.queryByRole('button', { name: PITCH.claim })).toBeNull();
  });

  it('Join Publisense opens sign-up', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: PITCH.join }));
    const dialog = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(dialog).queryByText(/to claim your product’s board/)).toBeNull();
  });

  it('Claim your board opens the claim dialog before sign-up', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost()]));
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: PITCH.claim }));
    const picker = await screen.findByRole('dialog', { name: 'Claim a board' });
    fireEvent.click(await within(picker).findByRole('button', { name: /Cursor/ }));
    const intro = await screen.findByRole('dialog', { name: 'Claim Cursor' });
    expect(within(intro).getByText('Set statuses, pin official replies and run the roadmap')).toBeTruthy();
    fireEvent.click(within(intro).getByRole('button', { name: 'Create an account to claim' }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(auth).getByText('Create an account to claim your product’s board. It takes a few seconds.')).toBeTruthy();
  });
});

describe('voting', () => {
  it('signed out, upvoting asks you to sign in and writes nothing', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost({ vote_count: 5 })]));
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Upvote, 5 votes/ }));
    expect(await screen.findByText(/Sign in to upvote/)).toBeTruthy();
    expect(api.setVote).not.toHaveBeenCalled();
  });

  it('updates the count at once and keeps it when the write lands', async () => {
    const post = makePost({ vote_count: 5 });
    api.fetchFeed.mockResolvedValue(page([post]));
    const write = deferred<void>();
    api.setVote.mockReturnValue(write.promise);
    renderHome({ signedIn: true });
    const btn = await screen.findByRole('button', { name: /Upvote, 5 votes/ });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    const on = await screen.findByRole('button', { name: /Upvote, 6 votes/ });
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(api.setVote).toHaveBeenCalledWith(post.id, TEST_VIEWER.id, true);
    write.resolve();
    expect(await screen.findByText('Upvoted · you’ll get updates on this post')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upvote, 6 votes/ })).toBeTruthy();
  });

  it('removes an upvote', async () => {
    const post = makePost({ vote_count: 7, voted: true, following: true });
    api.fetchFeed.mockResolvedValue(page([post]));
    renderHome({ signedIn: true });
    fireEvent.click(await screen.findByRole('button', { name: /Upvote, 7 votes/ }));
    const off = await screen.findByRole('button', { name: /Upvote, 6 votes/ });
    expect(off.getAttribute('aria-pressed')).toBe('false');
    expect(api.setVote).toHaveBeenCalledWith(post.id, TEST_VIEWER.id, false);
  });

  it('rolls back and says so when the write is refused', async () => {
    api.fetchFeed.mockResolvedValue(page([makePost({ vote_count: 5 })]));
    const write = deferred<void>();
    api.setVote.mockReturnValue(write.promise);
    renderHome({ signedIn: true });
    fireEvent.click(await screen.findByRole('button', { name: /Upvote, 5 votes/ }));
    await screen.findByRole('button', { name: /Upvote, 6 votes/ });
    write.reject(new Error('We couldn’t save your upvote. Try again.'));
    expect(await screen.findByText('We couldn’t save your upvote. Try again.')).toBeTruthy();
    const back = await screen.findByRole('button', { name: /Upvote, 5 votes/ });
    expect(back.getAttribute('aria-pressed')).toBe('false');
  });

  it('follows a post from the ⋯ menu', async () => {
    const post = makePost({ board: BOARD });
    api.fetchFeed.mockResolvedValue(page([post]));
    renderHome({ signedIn: true });
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Follow post/ }));
    await waitFor(() => expect(api.setPostFollow).toHaveBeenCalledWith(post.id, TEST_VIEWER.id, true));
    expect(await screen.findByText('You’ll get updates on this post')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: /Unfollow post/ })).toBeTruthy();
  });
});
