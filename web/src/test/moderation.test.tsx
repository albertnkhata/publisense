import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { Post, Reply, StatusEvent } from '../api/posts';
import { BlockedList, ReleaseSection } from '../manage/parts';
import { PostPage } from '../pages/PostPage';
import { PostCard } from '../posts/PostCard';
import { CURSOR } from './boardFixtures';
import { iso, makePost, makeReply, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

// The api layer's network calls are mocked; its pure helpers stay real.
const mod = vi.hoisted(() => ({
  fetchIsPlatformAdmin: vi.fn(),
  fetchMergeCandidates: vi.fn(),
  mergePost: vi.fn(),
  unmergePost: vi.fn(),
  setPostHidden: vi.fn(),
  setReplyHidden: vi.fn(),
  reportContent: vi.fn(),
  fetchBlocked: vi.fn(),
  setBlocked: vi.fn(),
  releaseScope: vi.fn(),
}));
const boards = vi.hoisted(() => ({ fetchIsBoardTeam: vi.fn(), fetchBoard: vi.fn(), fetchHub: vi.fn() }));
const teams = vi.hoisted(() => ({ fetchScopeRole: vi.fn() }));
const posts = vi.hoisted(() => ({
  fetchSimilar: vi.fn(),
  fetchPost: vi.fn(),
  fetchReplies: vi.fn(),
  fetchStatusEvents: vi.fn(),
  fetchRelated: vi.fn(),
  fetchPostTitle: vi.fn(),
}));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...mod }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boards }));
vi.mock('../api/teams', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/teams')>()), ...teams }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...posts }));

beforeEach(() => {
  vi.clearAllMocks();
  mod.fetchIsPlatformAdmin.mockResolvedValue(false);
  mod.fetchMergeCandidates.mockResolvedValue([]);
  mod.setPostHidden.mockResolvedValue(undefined);
  mod.setReplyHidden.mockResolvedValue(undefined);
  mod.reportContent.mockResolvedValue('filed');
  boards.fetchIsBoardTeam.mockResolvedValue(false);
  boards.fetchBoard.mockResolvedValue(CURSOR);
  teams.fetchScopeRole.mockResolvedValue(null);
  posts.fetchSimilar.mockResolvedValue([]);
  posts.fetchRelated.mockResolvedValue([]);
  posts.fetchReplies.mockResolvedValue([]);
  posts.fetchStatusEvents.mockResolvedValue([]);
  posts.fetchPostTitle.mockResolvedValue({ id: 'x', title: 'The original post' });
});

function renderCard(post: Post) {
  return renderWith(
    <Routes>
      <Route path="/" element={<PostCard post={post} />} />
      <Route path="/post/:id" element={<h1>Post page</h1>} />
    </Routes>,
    { viewer: TEST_VIEWER },
  );
}

const openMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  return screen.findByRole('menu', { name: 'Post options' });
};

describe('post menu', () => {
  it('shows Report to everyone but the author, and no team tools', async () => {
    renderCard(makePost());
    const menu = await openMenu();
    expect(within(menu).getByRole('menuitem', { name: /Report/ })).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: /Merge duplicate/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /Hide post/ })).toBeNull();
  });

  it('the author gets no Report on their own post', async () => {
    renderCard(makePost({ author: ME, author_id: ME.id }));
    const menu = await openMenu();
    expect(within(menu).queryByRole('menuitem', { name: /Report/ })).toBeNull();
  });

  it('the board team hides a post from the menu', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost();
    renderCard(post);
    await waitFor(() => expect(boards.fetchIsBoardTeam).toHaveBeenCalled());
    const menu = await openMenu();
    expect(await within(menu).findByRole('menuitem', { name: /Merge duplicate/ })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Hide post/ }));
    await waitFor(() => expect(mod.setPostHidden).toHaveBeenCalledWith(post.id, true));
    expect(await screen.findByText('Post hidden')).toBeTruthy();
  });

  it('platform admins can hide too, even off their own boards', async () => {
    mod.fetchIsPlatformAdmin.mockResolvedValue(true);
    renderCard(makePost({ hidden_at: iso(1) }));
    await waitFor(() => expect(mod.fetchIsPlatformAdmin).toHaveBeenCalled());
    const menu = await openMenu();
    fireEvent.click(await within(menu).findByRole('menuitem', { name: /Unhide post/ }));
    await waitFor(() => expect(mod.setPostHidden).toHaveBeenCalledWith(expect.any(String), false));
  });
});

describe('report dialog', () => {
  it('asks for a reason, then files the report and thanks you', async () => {
    const post = makePost({ title: 'Buy cheap followers here' });
    renderCard(post);
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Report/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Report post' });
    expect(within(dialog).getByText('Reports go to the Publisense team, not to the board’s team.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await within(dialog).findByText('Pick a reason.')).toBeTruthy();
    expect(mod.reportContent).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Spam or advertising' }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Same link in every post' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(mod.reportContent).toHaveBeenCalledWith('post', post.id, 'Spam or advertising: Same link in every post'));
    expect(await screen.findByText('Thanks, our team will review this post')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Report post' })).toBeNull();
  });

  it('a second report on the same thing is not an error', async () => {
    mod.reportContent.mockResolvedValue('already');
    renderCard(makePost());
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: /Report/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Report post' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harassment or hate' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('You already reported this post. Our team will review it.')).toBeTruthy();
  });
});

describe('merge', () => {
  it('the team picks the original; votes move and the toast offers Undo', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost({ title: 'Cursor jumps to top', vote_count: 4 });
    mod.fetchMergeCandidates.mockResolvedValue([
      { id: 'a0000000-0000-4000-8000-0000000000dd', board_id: post.board_id, title: 'Caret lost after apply', status: 'planned', vote_count: 40, reply_count: 3 },
    ]);
    mod.mergePost.mockResolvedValue({ moved: 4 });
    mod.unmergePost.mockResolvedValue({ status: 'open' });
    renderCard(post);
    await waitFor(() => expect(boards.fetchIsBoardTeam).toHaveBeenCalled());
    fireEvent.click(await within(await openMenu()).findByRole('menuitem', { name: /Merge duplicate/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Merge duplicate' });
    expect(within(dialog).getByText('Votes and followers move to the post you pick. This post closes and points to it.')).toBeTruthy();
    const merge = within(dialog).getByRole('button', { name: 'Merge' });
    expect(merge.hasAttribute('disabled')).toBe(true);
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Caret lost after apply/ }));
    fireEvent.click(merge);
    await waitFor(() => expect(mod.mergePost).toHaveBeenCalledWith(post.id, 'a0000000-0000-4000-8000-0000000000dd'));
    expect(await screen.findByText('Merged · 4 votes moved, voters notified')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mod.unmergePost).toHaveBeenCalledWith(post.id));
  });

  it('search narrows the candidates', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost();
    renderCard(post);
    await waitFor(() => expect(boards.fetchIsBoardTeam).toHaveBeenCalled());
    fireEvent.click(await within(await openMenu()).findByRole('menuitem', { name: /Merge duplicate/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Merge duplicate' });
    expect(await within(dialog).findByText('No posts match.')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'caret' } });
    await waitFor(() => expect(mod.fetchMergeCandidates).toHaveBeenCalledWith([post.board_id], 'caret', post.id, 8));
  });
});

describe('post page', () => {
  function renderPage(post: Post, { replies = [] as Reply[], events = [] as StatusEvent[] } = {}) {
    posts.fetchPost.mockResolvedValue(post);
    posts.fetchReplies.mockResolvedValue(replies);
    posts.fetchStatusEvents.mockResolvedValue(events);
    return renderWith(
      <Routes>
        <Route path="/post/:id" element={<PostPage />} />
      </Routes>,
      { viewer: TEST_VIEWER, path: `/post/${post.id}` },
    );
  }

  it('a fresh merge can be undone by the team from the notice', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    mod.unmergePost.mockResolvedValue({ status: 'open' });
    const post = makePost({ status: 'merged', merged_into: 'a0000000-0000-4000-8000-0000000000ee' });
    renderPage(post, { events: [{ id: 'e1', from: 'open', to: 'merged', note: null, actor_id: OTHER.id, at: new Date(Date.now() - 60_000).toISOString() }] });
    expect(await screen.findByText('The original post')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo merge' }));
    await waitFor(() => expect(mod.unmergePost).toHaveBeenCalledWith(post.id));
    expect(await screen.findByText('Merge undone')).toBeTruthy();
  });

  it('after 10 minutes the notice has no undo', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost({ status: 'merged', merged_into: 'a0000000-0000-4000-8000-0000000000ee' });
    renderPage(post, { events: [{ id: 'e1', from: 'open', to: 'merged', note: null, actor_id: OTHER.id, at: iso(1) }] });
    expect(await screen.findByText(/Votes and followers moved there/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo merge' })).toBeNull();
  });

  it('replies: the team hides one, others report it', async () => {
    boards.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost();
    const reply = makeReply(post, { body: 'Visit my site for free credits' });
    renderPage(post, { replies: [reply] });
    const item = await screen.findByRole('article', { name: `Reply by @${OTHER.handle}` });
    fireEvent.click(await within(item).findByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(mod.setReplyHidden).toHaveBeenCalledWith(reply.id, true));
    expect(await screen.findByText('Reply hidden')).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Report' }));
    expect(await screen.findByRole('dialog', { name: 'Report reply' })).toBeTruthy();
  });
});

describe('manage: blocked people and giving a board up', () => {
  it('lists blocked people and unblocks', async () => {
    mod.fetchBlocked.mockResolvedValue([{ user_id: OTHER.id, created_at: iso(2), profile: OTHER }]);
    mod.setBlocked.mockResolvedValue(undefined);
    renderWith(<BlockedList scope="board" scopeId={CURSOR.id} />, { viewer: TEST_VIEWER });
    const list = await screen.findByRole('list', { name: 'Blocked people' });
    fireEvent.click(within(list).getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(mod.setBlocked).toHaveBeenCalledWith('board', CURSOR.id, OTHER.id, false));
    expect(await screen.findByText(`Unblocked ${OTHER.name}`)).toBeTruthy();
  });

  it('nothing shows when nobody is blocked', async () => {
    mod.fetchBlocked.mockResolvedValue([]);
    renderWith(<BlockedList scope="board" scopeId={CURSOR.id} />, { viewer: TEST_VIEWER });
    await waitFor(() => expect(mod.fetchBlocked).toHaveBeenCalled());
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('the owner types the name to give the board up', async () => {
    mod.releaseScope.mockResolvedValue(undefined);
    const done = vi.fn();
    renderWith(<ReleaseSection scope="board" scopeId={CURSOR.id} name="Cursor" onReleased={done} />, { viewer: TEST_VIEWER });
    fireEvent.click(screen.getByRole('button', { name: 'Give up Cursor…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Give up Cursor?' });
    const confirm = within(dialog).getByRole('button', { name: 'Give up board' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Type Cursor to confirm'), { target: { value: 'cursor' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mod.releaseScope).toHaveBeenCalledWith('board', CURSOR.id));
    expect(await screen.findByText('You gave up Cursor. It’s unclaimed now.')).toBeTruthy();
    expect(done).toHaveBeenCalled();
  });
});
