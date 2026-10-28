import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import {
  buildThreads,
  postKind,
  shortAge,
  sourceLabel,
  validatePost,
  validateReply,
  type Post,
  type Reply,
  type StatusEvent,
} from '../api/posts';
import { PostPage } from '../pages/PostPage';
import { renderWith, TEST_VIEWER } from './renderApp';
import { BOARD, iso, makePost, makeReply, ME, OTHER } from './postFixtures';

const api = vi.hoisted(() => ({
  fetchPost: vi.fn(),
  fetchReplies: vi.fn(),
  fetchStatusEvents: vi.fn(),
  fetchRelated: vi.fn(),
  fetchPostTitle: vi.fn(),
  setVote: vi.fn(),
  setPostFollow: vi.fn(),
  createReply: vi.fn(),
  updateReply: vi.fn(),
  deleteReply: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  editSeededPost: vi.fn(),
  deleteSeededPost: vi.fn(),
}));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...api }));
const modApi = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn(async () => false) }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...modApi }));
const boardsApi = vi.hoisted(() => ({ fetchIsBoardTeam: vi.fn(async () => false) }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));

function renderPost(post: Post, { replies = [] as Reply[], events = [] as StatusEvent[], signedIn = true, found = true, at = '' } = {}) {
  api.fetchPost.mockResolvedValue(found ? post : null);
  api.fetchReplies.mockResolvedValue(replies);
  api.fetchStatusEvents.mockResolvedValue(events);
  return renderWith(
    <Routes>
      <Route path="/" element={<h1>Home page</h1>} />
      <Route path="/post/:id" element={<PostPage />} />
    </Routes>,
    { viewer: signedIn ? TEST_VIEWER : null, path: `/post/${post.id}${at}` },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchRelated.mockResolvedValue([]);
  api.setVote.mockResolvedValue(undefined);
  api.setPostFollow.mockResolvedValue(undefined);
  boardsApi.fetchIsBoardTeam.mockResolvedValue(false);
});

describe('post page', () => {
  it('shows Pending review on a post whose board waits for review, worded for its author', async () => {
    renderPost(makePost({ title: 'Sync loses edits', author_id: TEST_VIEWER.id, author: ME, board: { ...BOARD, name: 'Muse', status: 'pending' } }));
    const note = (await screen.findByText('Pending review.')).closest('[role="status"]');
    expect(note?.textContent).toBe('Pending review. Muse is waiting for review. Until it’s approved, only you can see it and what you post on it.');
  });

  it('words the pending notice for staff reading someone else’s post', async () => {
    renderPost(makePost({ title: 'Sync loses edits', board: { ...BOARD, name: 'Muse', status: 'pending' } }));
    expect((await screen.findByText('Pending review.')).closest('[role="status"]')?.textContent).toMatch(/only the person who added it and the Publisense team can see it\.$/);
  });

  it('shows no pending notice once the board is approved', async () => {
    renderPost(makePost({ title: 'Sync loses edits', board: { ...BOARD, status: 'live' } }));
    expect(await screen.findByText('Sync loses edits')).toBeTruthy();
    expect(screen.queryByText(/Pending review/)).toBeNull();
  });

  it('sets the tab title to the post title (#159)', async () => {
    renderPost(makePost({ title: 'Ghost preview in split windows' }));
    await waitFor(() => expect(document.title).toBe('Ghost preview in split windows · Publisense'));
  });

  it('shows the post, its status timeline, the official reply unpinned and threads', async () => {
    const post = makePost({ title: 'Ghost preview in split windows', status: 'planned', reply_count: 3, body: 'Line one\nLine two' });
    const official = makeReply(post, { is_official: true, body: 'On the roadmap for next cycle.', created_at: iso(1) });
    const root = makeReply(post, { body: 'Same here on a monorepo.' });
    const child = makeReply(post, { parent_id: root.id, author: ME, author_id: ME.id, body: 'Matches what I see.' });
    renderPost(post, {
      replies: [root, child, official],
      events: [{ id: 'e1', from: 'open', to: 'planned', note: null, actor_id: 'x', at: iso(3) }],
    });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Ghost preview in split windows');
    expect(screen.getByText(/Line one/).textContent).toBe('Line one\nLine two');

    const timeline = await screen.findByRole('region', { name: 'Status' });
    expect(within(timeline).getByText('Posted')).toBeTruthy();
    expect(within(timeline).getByText('Planned')).toBeTruthy();
    // The status change is the team's, shown as the board with its Team badge.
    expect(timeline.textContent).toContain('Cursor Team');
    expect(timeline.textContent).not.toContain('Cursor team');

    const replies = screen.getByRole('region', { name: 'Replies' });
    const items = await within(replies).findAllByRole('article');
    // Not pinned (Albert, 2026-10-27): "Top" puts the most discussed thread first.
    expect(replies.textContent).not.toContain('Pinned');
    expect(items[0]!.textContent).toContain('Same here on a monorepo.');
    expect(items[1]!.textContent).toContain('Matches what I see.');
    expect(items[2]!.textContent).toContain('On the roadmap for next cycle.');
    // The official reply speaks as the board: no teammate handle anywhere on it.
    expect(items[2]!.textContent).toContain('Cursor Team');
    expect(items[2]!.textContent).not.toContain('@');
    expect(items[2]!.getAttribute('aria-label')).toBe('Reply by Cursor · Team');
    // Only the author gets Edit and Delete.
    expect(within(items[0]!).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(items[1]!).getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('answers a non-id path with Post not found and no request', async () => {
    renderWith(
      <Routes>
        <Route path="/post/:id" element={<PostPage />} />
      </Routes>,
      { path: '/post/nope' },
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Post not found');
    expect(api.fetchPost).not.toHaveBeenCalled();
  });

  it('says Post not found when the post is gone or not visible', async () => {
    renderPost(makePost(), { found: false });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Post not found');
  });

  it('upvotes optimistically on the post page too', async () => {
    const post = makePost({ vote_count: 1 });
    renderPost(post);
    fireEvent.click(await screen.findByRole('button', { name: /Upvote, 1 vote/ }));
    expect(await screen.findByRole('button', { name: /Upvote, 2 votes/ })).toBeTruthy();
    // Voting follows the post.
    expect(screen.getByRole('button', { name: 'Following' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('replies', () => {
  it('posts a reply, adds it to the thread and follows the post', async () => {
    const post = makePost({ reply_count: 0 });
    renderPost(post);
    api.createReply.mockImplementation(async (postId: string, body: string, parentId: string | null) =>
      makeReply(post, { post_id: postId, body: body.trim(), parent_id: parentId, author: ME, author_id: ME.id }),
    );
    expect(await screen.findByText(/No replies yet/)).toBeTruthy();
    const box = screen.getByRole('textbox', { name: 'Add a reply' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '  Workaround: pin the working directory.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith(post.id, '  Workaround: pin the working directory.  ', null, false));
    expect(await screen.findByText('Workaround: pin the working directory.')).toBeTruthy();
    expect(screen.getByText('Reply posted')).toBeTruthy();
    expect(api.setPostFollow).toHaveBeenCalledWith(post.id, TEST_VIEWER.id, true);
    expect(screen.getByRole('heading', { name: '1 reply' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '1 reply' })).toBeTruthy();
  });

  it('replies inside a thread with the parent id', async () => {
    const post = makePost({ reply_count: 1 });
    const root = makeReply(post, { body: 'Root reply' });
    renderPost(post, { replies: [root] });
    api.createReply.mockImplementation(async (_p: string, body: string, parentId: string | null) =>
      makeReply(post, { body, parent_id: parentId, author: ME, author_id: ME.id }),
    );
    const item = (await screen.findByText('Root reply')).closest('article')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Reply' }));
    const box = within(item).getByRole('textbox', { name: 'Reply to this thread' });
    fireEvent.change(box, { target: { value: 'Nested answer' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith(post.id, 'Nested answer', root.id, false));
    expect(await screen.findByText('Nested answer')).toBeTruthy();
  });

  it('a team member replies as themselves by default and picks the team voice explicitly', async () => {
    boardsApi.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost({ reply_count: 0 });
    renderPost(post);
    api.createReply.mockImplementation(async (postId: string, body: string, parentId: string | null, official: boolean) =>
      makeReply(post, { post_id: postId, body, parent_id: parentId, author: ME, author_id: ME.id, is_official: official }),
    );
    const box = await screen.findByRole('textbox', { name: 'Add a reply' });
    fireEvent.focus(box);
    const as = (await screen.findByRole('combobox', { name: 'Reply as' })) as HTMLSelectElement;
    expect(as.value).toBe('me');
    fireEvent.change(box, { target: { value: 'Personally, I love it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith(post.id, 'Personally, I love it.', null, false));
    expect(await screen.findByText('Reply posted')).toBeTruthy();

    const again = screen.getByRole('textbox', { name: 'Add a reply' });
    fireEvent.focus(again);
    const as2 = (await screen.findByRole('combobox', { name: 'Reply as' })) as HTMLSelectElement;
    expect(as2.value).toBe('me');
    fireEvent.change(as2, { target: { value: 'team' } });
    expect(as2.options[as2.selectedIndex]!.text).toBe('Cursor · Team');
    fireEvent.change(again, { target: { value: 'Fixed in 2.4.' } });
    fireEvent.keyDown(again, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(api.createReply).toHaveBeenLastCalledWith(post.id, 'Fixed in 2.4.', null, true));
  });

  it('team members get the same Reply as choice on a nested reply, defaulting to themselves', async () => {
    boardsApi.fetchIsBoardTeam.mockResolvedValue(true);
    const post = makePost({ reply_count: 2 });
    const root = makeReply(post, { body: 'Root reply' });
    const child = makeReply(post, { parent_id: root.id, body: 'Child reply' });
    renderPost(post, { replies: [root, child] });
    api.createReply.mockImplementation(async (_p: string, body: string, parentId: string | null, official: boolean) =>
      makeReply(post, { body, parent_id: parentId, author: ME, author_id: ME.id, is_official: official }),
    );
    const item = (await screen.findByText('Child reply')).closest('article')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Reply' }));
    const as = (await within(item).findByRole('combobox', { name: 'Reply as' })) as HTMLSelectElement;
    expect(as.value).toBe('me');
    fireEvent.change(as, { target: { value: 'team' } });
    const box = within(item).getByRole('textbox', { name: 'Reply to this thread' });
    fireEvent.change(box, { target: { value: 'Team answer, nested' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    // A true child of the reply answered, not of its thread (0050).
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith(post.id, 'Team answer, nested', child.id, true));
  });

  it('nests replies to replies, links @mentions and opens deep branches on their own', async () => {
    const post = makePost({ reply_count: 6 });
    const r0 = makeReply(post, { body: 'Level zero', created_at: iso(10) });
    const r1 = makeReply(post, { parent_id: r0.id, body: 'Level one @someone', created_at: iso(9) });
    const r2 = makeReply(post, { parent_id: r1.id, body: 'Level two', created_at: iso(8) });
    const r3 = makeReply(post, { parent_id: r2.id, body: 'Level three', created_at: iso(7) });
    const r4 = makeReply(post, { parent_id: r3.id, body: 'Level four', created_at: iso(6) });
    const r5 = makeReply(post, { parent_id: r4.id, body: 'Level five', created_at: iso(5) });
    renderPost(post, { replies: [r0, r1, r2, r3, r4, r5] });
    expect(await screen.findByText('Level three')).toBeTruthy();
    expect(screen.queryByText('Level four')).toBeNull();
    const more = screen.getByRole('link', { name: /Continue this thread \(2 replies\)/ });
    expect(more.getAttribute('href')).toContain(`thread=${r3.id}`);
    expect(screen.getByRole('link', { name: '@someone' }).getAttribute('href')).toBe('/u/someone');
  });

  it('someone outside the team never sees Reply as and replies personally', async () => {
    const post = makePost({ reply_count: 0 });
    renderPost(post);
    fireEvent.focus(await screen.findByRole('textbox', { name: 'Add a reply' }));
    await screen.findByRole('button', { name: 'Reply' });
    expect(screen.queryByRole('combobox', { name: 'Reply as' })).toBeNull();
  });

  it('a #reply-<id> link scrolls to that reply and highlights it, opening a deep branch first', async () => {
    const post = makePost({ reply_count: 6 });
    const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    const r0 = makeReply(post, { id: id(0), body: 'Level zero', created_at: iso(10) });
    const r1 = makeReply(post, { id: id(1), parent_id: id(0), body: 'Level one', created_at: iso(9) });
    const r2 = makeReply(post, { id: id(2), parent_id: id(1), body: 'Level two', created_at: iso(8) });
    const r3 = makeReply(post, { id: id(3), parent_id: id(2), body: 'Level three', created_at: iso(7) });
    const r4 = makeReply(post, { id: id(4), parent_id: id(3), body: 'Level four', created_at: iso(6) });
    const r5 = makeReply(post, { id: id(5), parent_id: id(4), body: 'Level five', created_at: iso(5) });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderPost(post, { replies: [r0, r1, r2, r3, r4, r5], at: `#reply-${id(5)}` });
    // Level five is deeper than the page indents, so its branch opens on its own.
    const target = (await screen.findByText('Level five')).closest('article')!;
    expect(screen.getByRole('link', { name: /All replies/ })).toBeTruthy();
    await waitFor(() => expect(target.getAttribute('aria-current')).toBe('true'));
    expect(target.id).toBe(`reply-${id(5)}`);
    expect(scroll).toHaveBeenCalled();
  });

  it('replying to a reply doesn’t prefill an @mention (the thread shows who it answers)', async () => {
    const post = makePost({ reply_count: 2 });
    const root = makeReply(post, { body: 'Root' });
    const child = makeReply(post, { parent_id: root.id, author: OTHER, author_id: OTHER.id, body: 'Someone else' });
    renderPost(post, { replies: [root, child] });
    const item = (await screen.findByText('Someone else')).closest('article')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Reply' }));
    const box = within(item).getByRole('textbox', { name: 'Reply to this thread' }) as HTMLTextAreaElement;
    expect(box.value).toBe('');
  });

  it('signed out, focusing the reply box opens sign-in', async () => {
    renderPost(makePost(), { signedIn: false });
    fireEvent.focus(await screen.findByRole('textbox', { name: 'Add a reply' }));
    expect(await screen.findByText(/Sign in to reply/)).toBeTruthy();
  });

  it('lets the author edit and delete their reply', async () => {
    const post = makePost({ reply_count: 2 });
    const mine = makeReply(post, { author: ME, author_id: ME.id, body: 'Frist!', created_at: iso(0.1) });
    const answer = makeReply(post, { parent_id: mine.id, body: 'Answer to it' });
    renderPost(post, { replies: [mine, answer] });
    api.updateReply.mockResolvedValue({ id: mine.id, body: 'First!', edited_at: iso(0) });
    api.deleteReply.mockResolvedValue(undefined);

    const item = (await screen.findByText('Frist!')).closest('article')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    const box = within(item).getByRole('textbox', { name: 'Edit reply' });
    fireEvent.change(box, { target: { value: 'First!' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateReply).toHaveBeenCalledWith(mine.id, 'First!'));
    expect(await screen.findByText('First!')).toBeTruthy();
    expect(within(item).getByText('edited')).toBeTruthy();

    fireEvent.click(within(item).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this reply?' });
    expect(dialog.textContent).toContain('The reply to it will be deleted too.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete reply' }));
    await waitFor(() => expect(api.deleteReply).toHaveBeenCalledWith(mine.id));
    await waitFor(() => expect(screen.queryByText('First!')).toBeNull());
    expect(screen.queryByText('Answer to it')).toBeNull();
    expect(screen.getByRole('heading', { name: '0 replies' })).toBeTruthy();
  });
});

describe('reply edit rules (0051, #181)', () => {
  it('disables Edit on a community reply after the 1-hour window, with the reason; Delete stays', async () => {
    const post = makePost({ reply_count: 1 });
    const mine = makeReply(post, { author: ME, author_id: ME.id, body: 'Old words', created_at: iso(2) });
    renderPost(post, { replies: [mine] });
    const item = (await screen.findByText('Old words')).closest('article')!;
    const edit = within(item).getByRole('button', { name: 'Edit' });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    expect(edit.getAttribute('title')).toBe('Editing closes 1 hour after posting');
    expect(document.getElementById(edit.getAttribute('aria-describedby')!)?.textContent).toBe('Editing closes 1 hour after posting');
    fireEvent.click(edit);
    expect(within(item).queryByRole('textbox', { name: 'Edit reply' })).toBeNull();
    expect(within(item).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('keeps Edit on an old official reply while the post is open', async () => {
    const post = makePost({ reply_count: 1 });
    const mine = makeReply(post, { author: ME, author_id: ME.id, body: 'Team answer', is_official: true, created_at: iso(72) });
    renderPost(post, { replies: [mine] });
    const item = (await screen.findByText('Team answer')).closest('article')!;
    const edit = within(item).getByRole('button', { name: 'Edit' });
    expect(edit.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(edit);
    expect(within(item).getByRole('textbox', { name: 'Edit reply' })).toBeTruthy();
  });

  it('locks every reply, official included, once the post is Shipped', async () => {
    const post = makePost({ reply_count: 1, status: 'shipped' });
    const mine = makeReply(post, { author: ME, author_id: ME.id, body: 'Shipped answer', is_official: true, created_at: iso(0.1) });
    renderPost(post, { replies: [mine] });
    const item = (await screen.findByText('Shipped answer')).closest('article')!;
    const edit = within(item).getByRole('button', { name: 'Edit' });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    expect(edit.getAttribute('title')).toBe('Can’t edit once the post is Shipped');
  });

  it('shows no Edit on someone else’s reply', async () => {
    const post = makePost({ reply_count: 1 });
    const theirs = makeReply(post, { body: 'Their words', created_at: iso(0.1) });
    renderPost(post, { replies: [theirs] });
    const item = (await screen.findByText('Their words')).closest('article')!;
    expect(within(item).queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('merged permalink (0043)', () => {
  it('a signed-out visitor sees "Merged into …" linking to the surviving post, not Post not found', async () => {
    const target = 'a0000000-0000-4000-8000-0000000000ee';
    api.fetchPostTitle.mockResolvedValue({ id: target, title: 'Caret lost after rebase' });
    renderPost(makePost({ title: 'Composer drops edits', status: 'merged', merged_into: target }), {
      signedIn: false,
      events: [{ id: 'e1', from: 'open', to: 'merged', note: null, actor_id: OTHER.id, at: iso(30) }],
    });
    const link = await screen.findByRole('link', { name: 'Caret lost after rebase' });
    expect(link.getAttribute('href')).toBe(`/post/${target}`);
    expect(screen.getByText(/Votes and followers moved there/)).toBeTruthy();
    expect(screen.queryByText('Post not found')).toBeNull();
    // Closed: no voting, no reply box, no undo for a visitor.
    expect(screen.queryByRole('button', { name: 'Undo merge' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Add a reply' })).toBeNull();
  });
});

describe('author edit and delete', () => {
  it('only the author sees Edit post and Delete post', async () => {
    renderPost(makePost());
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit post' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete post' })).toBeNull();
  });

  it('edits the post and shows the change', async () => {
    // Inside the 1-hour edit window (0045).
    const post = makePost({ author: ME, author_id: ME.id, title: 'Old title', type: 'bug', created_at: iso(0.25) });
    renderPost(post);
    api.updatePost.mockImplementation(async (id: string, d: { type: string; title: string; body: string }) => ({
      id,
      type: d.type,
      title: d.title.trim(),
      body: d.body.trim(),
      edited_at: iso(0),
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit post' });
    const title = within(dialog).getByRole('textbox', { name: /Title/ });
    fireEvent.change(title, { target: { value: 'no' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeTruthy();
    expect(api.updatePost).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: 'New, clearer title' } });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Type' }), { target: { value: 'feature' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updatePost).toHaveBeenCalledWith(post.id, { type: 'feature', title: 'New, clearer title', body: 'Body text', platform: null }),
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('New, clearer title');
    expect(screen.getByText('Feature request')).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
    expect(screen.getByText('Post updated')).toBeTruthy();
  });

  it('disables Edit post with the reason once the 1-hour window has passed (0045)', async () => {
    renderPost(makePost({ author: ME, author_id: ME.id, created_at: iso(2) }));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    const edit = screen.getByRole('menuitem', { name: /Edit post/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    expect(edit.textContent).toContain('Editing closes 1 hour after posting');
    fireEvent.click(edit);
    expect(screen.queryByRole('dialog', { name: 'Edit post' })).toBeNull();
    // Delete is unchanged.
    expect(screen.getByRole('menuitem', { name: 'Delete post' })).toBeTruthy();
  });

  it('disables Edit post once the team has shipped or closed it, even inside the window', async () => {
    renderPost(makePost({ author: ME, author_id: ME.id, created_at: iso(0.1), status: 'shipped' }));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    const edit = screen.getByRole('menuitem', { name: /Edit post/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    expect(edit.textContent).toContain('Can’t edit once it’s Shipped');
  });

  it('deletes the post after confirming and goes home', async () => {
    const post = makePost({ author: ME, author_id: ME.id });
    const { router } = renderPost(post);
    api.deletePost.mockResolvedValue(undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this post?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deletePost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete post' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this post?' })).getByRole('button', { name: 'Delete post' }));
    await waitFor(() => expect(api.deletePost).toHaveBeenCalledWith(post.id));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByText('Post deleted')).toBeTruthy();
  });

  it('keeps the dialog open with the reason when delete is refused', async () => {
    const post = makePost({ author: ME, author_id: ME.id });
    renderPost(post);
    api.deletePost.mockRejectedValue(new Error('We couldn’t delete this post. Try again.'));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this post?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete post' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
  });
});

describe('post helpers', () => {
  it('builds the reply tree at any depth, official replies unpinned', () => {
    const p = makePost();
    const a = makeReply(p, { created_at: iso(5) });
    const b = makeReply(p, { created_at: iso(4) });
    const a1 = makeReply(p, { parent_id: a.id, created_at: iso(1) });
    const a0 = makeReply(p, { parent_id: a.id, created_at: iso(2) });
    const o = makeReply(p, { is_official: true, created_at: iso(3) });
    const a00 = makeReply(p, { parent_id: a0.id, created_at: iso(0) });
    const top = buildThreads([a, b, a1, a0, o, a00], 'top');
    expect(top.map((t) => t.reply.id)).toEqual([a.id, b.id, o.id]);
    expect(top[0]!.children.map((c) => c.reply.id)).toEqual([a0.id, a1.id]);
    expect(top[0]!.children[0]!.children.map((c) => c.reply.id)).toEqual([a00.id]);
    expect(top[0]!.total).toBe(3);
    expect(buildThreads([a, b, a1, a0, o], 'new').map((t) => t.reply.id)).toEqual([o.id, b.id, a.id]);
  });

  it('tells seeded, deleted and community posts apart', () => {
    expect(postKind({ author: OTHER, author_id: OTHER.id, source_url: null })).toBe('community');
    expect(postKind({ author: null, author_id: null, source_url: 'https://github.com/x' })).toBe('seeded');
    expect(postKind({ author: null, author_id: null, source_url: null })).toBe('deleted');
    expect(sourceLabel('https://www.reddit.com/r/x')).toBe('Reddit');
    expect(sourceLabel('https://x.com/a/status/1')).toBe('X');
    expect(sourceLabel('https://forum.cursor.com/t/1')).toBe('forum.cursor.com');
  });

  it('formats ages like the mockup', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(shortAge('2026-10-24T11:59:30Z', now)).toBe('now');
    expect(shortAge('2026-10-24T08:00:00Z', now)).toBe('4h');
    expect(shortAge('2026-10-21T12:00:00Z', now)).toBe('3d');
    expect(shortAge('2026-10-03T12:00:00Z', now)).toBe('3w');
    expect(shortAge('2026-08-01T12:00:00Z', now)).toBe('Aug 1');
    expect(shortAge('2025-08-01T12:00:00Z', now)).toBe('Aug 1, 2025');
  });

  it('validates drafts like the table checks', () => {
    expect(validatePost({ type: 'bug', title: 'ok', body: '' }).title).toBeTruthy();
    expect(validatePost({ type: 'bug', title: 'x'.repeat(141), body: '' }).title).toBeTruthy();
    expect(validatePost({ type: 'feature', title: 'Fine title', body: 'x'.repeat(10_001) }).body).toBeTruthy();
    expect(validatePost({ type: 'feature', title: 'Fine title', body: '' })).toEqual({});
    expect(validateReply('   ')).toBeTruthy();
    expect(validateReply('x'.repeat(5001))).toBeTruthy();
    expect(validateReply('ok')).toBeNull();
  });
});

describe('staff and seeded posts (0031)', () => {
  const seeded = () =>
    makePost({ author: null, author_id: null, source_url: 'https://github.com/acme/notes/issues/7', title: 'Imported title', type: 'bug', created_at: '2025-03-14T12:00:00Z' });

  it('people who aren’t staff can’t edit or delete a seeded post', async () => {
    modApi.fetchIsPlatformAdmin.mockResolvedValue(false);
    renderPost(seeded());
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit post' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete post' })).toBeNull();
  });

  it('staff correct a seeded post, including its source link and original date', async () => {
    modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
    const post = seeded();
    renderPost(post);
    api.editSeededPost.mockImplementation(async (id: string, d: { type: 'bug' | 'feature'; title: string; body: string; sourceUrl: string }) => ({
      ...post,
      id,
      type: d.type,
      title: d.title.trim(),
      body: d.body.trim(),
      source_url: d.sourceUrl,
      created_at: '2025-03-10T12:00:00Z',
      edited_at: iso(0),
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit post' });
    expect((within(dialog).getByLabelText('Source link') as HTMLInputElement).value).toBe('https://github.com/acme/notes/issues/7');
    expect((within(dialog).getByLabelText('Originally posted') as HTMLInputElement).value).toBe('2025-03-14');
    fireEvent.change(within(dialog).getByLabelText('Source link'), { target: { value: 'not a link' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Paste the full https link to the original post.')).toBeTruthy();
    expect(api.editSeededPost).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Source link'), { target: { value: 'https://reddit.com/r/acme/comments/1' } });
    fireEvent.change(within(dialog).getByLabelText('Originally posted'), { target: { value: '2025-03-10' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Title/ }), { target: { value: 'Fixed imported title' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.editSeededPost).toHaveBeenCalledWith(
        post.id,
        expect.objectContaining({ title: 'Fixed imported title', sourceUrl: 'https://reddit.com/r/acme/comments/1', postedOn: '2025-03-10' }),
        TEST_VIEWER.id,
      ),
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Fixed imported title');
    expect(api.updatePost).not.toHaveBeenCalled();
  });

  it('staff delete a seeded post', async () => {
    modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
    api.deleteSeededPost.mockResolvedValue(undefined);
    const post = seeded();
    renderPost(post);
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete post' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(api.deleteSeededPost).toHaveBeenCalledWith(post.id));
    expect(api.deletePost).not.toHaveBeenCalled();
  });
});

describe('device on a post (0033)', () => {
  it('shows the device on the post', async () => {
    renderPost(makePost({ platform: 'android' }));
    expect(await screen.findByText('Android')).toBeTruthy();
  });

  it('labels friction posts (0034)', async () => {
    renderPost(makePost({ type: 'friction' }));
    expect((await screen.findAllByText('Friction')).length).toBeGreaterThan(0);
  });
});
