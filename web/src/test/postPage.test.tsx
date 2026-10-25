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
import { iso, makePost, makeReply, ME, OTHER } from './postFixtures';

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

function renderPost(post: Post, { replies = [] as Reply[], events = [] as StatusEvent[], signedIn = true, found = true } = {}) {
  api.fetchPost.mockResolvedValue(found ? post : null);
  api.fetchReplies.mockResolvedValue(replies);
  api.fetchStatusEvents.mockResolvedValue(events);
  return renderWith(
    <Routes>
      <Route path="/" element={<h1>Home page</h1>} />
      <Route path="/post/:id" element={<PostPage />} />
    </Routes>,
    { viewer: signedIn ? TEST_VIEWER : null, path: `/post/${post.id}` },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchRelated.mockResolvedValue([]);
  api.setVote.mockResolvedValue(undefined);
  api.setPostFollow.mockResolvedValue(undefined);
});

describe('post page', () => {
  it('shows the post, its status timeline, pinned official reply and threads', async () => {
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
    expect(within(timeline).getByText(/Cursor team/)).toBeTruthy();

    const replies = screen.getByRole('region', { name: 'Replies' });
    const items = await within(replies).findAllByRole('article');
    expect(items[0]!.textContent).toContain('Pinned');
    expect(items[0]!.textContent).toContain('On the roadmap for next cycle.');
    expect(items[1]!.textContent).toContain('Same here on a monorepo.');
    expect(items[2]!.textContent).toContain('Matches what I see.');
    // Only the author gets Edit and Delete.
    expect(within(items[1]!).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(items[2]!).getByRole('button', { name: 'Edit' })).toBeTruthy();
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

  it('signed out, focusing the reply box opens sign-in', async () => {
    renderPost(makePost(), { signedIn: false });
    fireEvent.focus(await screen.findByRole('textbox', { name: 'Add a reply' }));
    expect(await screen.findByText(/Sign in to reply/)).toBeTruthy();
  });

  it('lets the author edit and delete their reply', async () => {
    const post = makePost({ reply_count: 2 });
    const mine = makeReply(post, { author: ME, author_id: ME.id, body: 'Frist!' });
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

describe('author edit and delete', () => {
  it('only the author sees Edit post and Delete post', async () => {
    renderPost(makePost());
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit post' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete post' })).toBeNull();
  });

  it('edits the post and shows the change', async () => {
    const post = makePost({ author: ME, author_id: ME.id, title: 'Old title', type: 'bug' });
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
  it('groups replies one level deep, official first', () => {
    const p = makePost();
    const a = makeReply(p, { created_at: iso(5) });
    const b = makeReply(p, { created_at: iso(4) });
    const a1 = makeReply(p, { parent_id: a.id, created_at: iso(1) });
    const a0 = makeReply(p, { parent_id: a.id, created_at: iso(2) });
    const o = makeReply(p, { is_official: true, created_at: iso(3) });
    const top = buildThreads([a, b, a1, a0, o], 'top');
    expect(top.pinned.map((t) => t.reply.id)).toEqual([o.id]);
    expect(top.threads.map((t) => t.reply.id)).toEqual([a.id, b.id]);
    expect(top.threads[0]!.children.map((c) => c.id)).toEqual([a0.id, a1.id]);
    expect(buildThreads([a, b, a1, a0, o], 'new').threads.map((t) => t.reply.id)).toEqual([b.id, a.id]);
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
