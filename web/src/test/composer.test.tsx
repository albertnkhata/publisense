import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { ComposerProvider, useComposer } from '../shell/composer';
import { SearchWell } from '../shell/SearchWell';
import { CURSOR, FIGMA, FIGMA_HUB, SUPABASE } from './boardFixtures';
import { makePost } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const boardsApi = vi.hoisted(() => ({
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
  searchAll: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchSimilar: vi.fn(),
  createPost: vi.fn(),
  seedPost: vi.fn(),
  setVote: vi.fn(),
}));
const modApi = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn() }));
const draftsApi = vi.hoisted(() => ({ fetchDrafts: vi.fn(), saveDraft: vi.fn(), deleteDraft: vi.fn() }));
vi.mock('../api/drafts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/drafts')>()), ...draftsApi }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...modApi }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));

function Opener() {
  const { openComposer } = useComposer();
  return (
    <button type="button" onClick={() => openComposer()}>
      Open composer
    </button>
  );
}

function renderComposer(signedIn = true) {
  return renderWith(
    <ComposerProvider>
      <Routes>
        <Route path="/" element={<Opener />} />
        <Route path="/post/:id" element={<h1>Post page</h1>} />
      </Routes>
    </ComposerProvider>,
    { viewer: signedIn ? TEST_VIEWER : null },
  );
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Open composer' }));
  return screen.findByRole('dialog', { name: 'Post feedback' });
}

async function chooseSupabase(dialog: HTMLElement) {
  const product = within(dialog).getByRole('combobox', { name: 'Product' });
  fireEvent.focus(product);
  fireEvent.change(product, { target: { value: 'postgres' } });
  fireEvent.click(await within(dialog).findByRole('option', { name: /Supabase/ }));
}

function chooseType(dialog: HTMLElement, label: 'Bug' | 'Friction' | 'Feature request') {
  fireEvent.click(within(dialog).getByRole('button', { name: /Type/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(label) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGMA, SUPABASE]);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  postsApi.fetchSimilar.mockResolvedValue([]);
  modApi.fetchIsPlatformAdmin.mockResolvedValue(false);
  draftsApi.fetchDrafts.mockResolvedValue([]);
  draftsApi.saveDraft.mockResolvedValue('d0000000-0000-4000-8000-000000000001');
  draftsApi.deleteDraft.mockResolvedValue(undefined);
});

describe('composer', () => {
  it('asks a signed-out visitor to sign in instead of opening', async () => {
    renderComposer(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }));
    expect(await screen.findByText(/Sign in to post feedback/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull();
  });

  it('posts to the chosen board and opens the new post', async () => {
    postsApi.createPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000ff', title: 'Branching for preview databases' }));
    const { router } = renderComposer();
    const dialog = await open();
    const post = within(dialog).getByRole('button', { name: 'Post' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);

    await chooseSupabase(dialog);
    expect(within(dialog).getByText('Supabase')).toBeTruthy();
    expect(within(dialog).getByText('Product')).toBeTruthy();
    expect(within(dialog).getByText('Type')).toBeTruthy();
    chooseType(dialog, 'Friction');
    chooseType(dialog, 'Feature request');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Branching for preview databases' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Details/ }), { target: { value: 'One per pull request.' } });
    // Platform is optional (0033): choosing it again clears it. Desktop is split into macOS and Windows (0057).
    expect(within(dialog).getByRole('button', { name: 'macOS' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Windows' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Desktop' })).toBeNull();
    const ios = within(dialog).getByRole('button', { name: 'iOS' });
    fireEvent.click(ios);
    expect(ios.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Web' }));
    expect(ios.getAttribute('aria-pressed')).toBe('false');
    expect(within(dialog).getByText('31/140')).toBeTruthy();
    expect(post.disabled).toBe(false);

    fireEvent.click(post);
    await waitFor(() =>
      expect(postsApi.createPost).toHaveBeenCalledWith(
        { boardId: SUPABASE.id, type: 'feature', title: 'Branching for preview databases', body: 'One per pull request.', platform: 'web', images: [] },
        TEST_VIEWER.id,
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/post/a0000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('Posted to Supabase')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull();
  });

  it('renders platform pills in a single responsive row that stacks on phones', async () => {
    renderComposer();
    const dialog = await open();
    const group = within(dialog).getByRole('group', { name: /Platform/i });
    expect(group.className).toContain('max-sm:flex-nowrap');
    expect(group.className).toContain('max-sm:overflow-x-auto');
    const ios = within(group).getByRole('button', { name: 'iOS' });
    expect(ios.className).toContain('max-sm:px-2');
    const section = group.parentElement?.parentElement;
    expect(section?.className).toContain('max-sm:flex-col');
  });

  it('does not display automatic follow note in composer', async () => {
    renderComposer();
    const dialog = await open();
    expect(within(dialog).queryByText(/follow this post automatically/i)).toBeNull();
  });

  it('asks whether to save or delete a draft, from Escape, the X or Cancel', async () => {
    renderComposer();
    const dialog = await open();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Half a thought' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    const prompt = await screen.findByRole('alertdialog', { name: 'Save post?' });
    // Escape again cancels the prompt and keeps the composer open.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(prompt).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Post feedback' })).toBeTruthy();
    expect((within(dialog).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Half a thought');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Save post?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull());
    // Deleted: the next composer starts empty.
    const again = await open();
    expect((within(again).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('');
  });

  it('saves a draft to Drafts, and opens it again from the list', async () => {
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    chooseType(dialog, 'Feature request');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Branching for preview databases' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Details/ }), { target: { value: 'One per pull request.' } });
    // What the server lists once it is saved.
    draftsApi.fetchDrafts.mockResolvedValue([
      {
        id: 'd0000000-0000-4000-8000-000000000001',
        board: { id: SUPABASE.id, slug: 'supabase', name: 'Supabase', color: SUPABASE.color, logo_path: null },
        type: 'feature',
        platform: null,
        title: 'Branching for preview databases',
        body: 'One per pull request.',
        images: [],
        updated_at: new Date().toISOString(),
      },
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Save post?' })).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull());
    expect(draftsApi.saveDraft).toHaveBeenCalledWith(null, {
      boardId: SUPABASE.id,
      type: 'feature',
      platform: null,
      title: 'Branching for preview databases',
      body: 'One per pull request.',
      images: [],
    });
    expect(await screen.findByText('Saved to Drafts')).toBeTruthy();
    // Saved to the server, so the device copy is gone and the next composer starts blank.
    expect(window.localStorage.getItem(`publisense:post-draft:${TEST_VIEWER.id}`)).toBeNull();

    const again = await open();
    expect((within(again).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('');
    fireEvent.click(await within(again).findByRole('button', { name: 'Drafts' }));
    const list = await screen.findByRole('dialog', { name: 'Drafts' });
    fireEvent.click(within(list).getByRole('button', { name: 'Open draft: Branching for preview databases' }));
    const opened = await screen.findByRole('dialog', { name: 'Post feedback' });
    expect((within(opened).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Branching for preview databases');
    expect((within(opened).getByRole('textbox', { name: /Details/ }) as HTMLTextAreaElement).value).toBe('One per pull request.');
    expect(await within(opened).findByText('Supabase')).toBeTruthy();
    expect(within(opened).getByRole('button', { name: /Type/ }).textContent).toMatch(/Feature request/);

    // Posting it removes the saved draft.
    postsApi.createPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000fd', title: 'Branching for preview databases' }));
    fireEvent.click(within(opened).getByRole('button', { name: 'Post' }));
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    await waitFor(() => expect(draftsApi.deleteDraft).toHaveBeenCalledWith('d0000000-0000-4000-8000-000000000001'));
  });

  it('asks before deleting a draft from the list', async () => {
    draftsApi.fetchDrafts.mockResolvedValue([
      { id: 'd0000000-0000-4000-8000-000000000002', board: null, type: 'bug', platform: null, title: '', body: 'x', images: [], updated_at: new Date().toISOString() },
    ]);
    renderComposer();
    const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Drafts' }));
    const list = await screen.findByRole('dialog', { name: 'Drafts' });
    fireEvent.click(within(list).getByRole('button', { name: 'Delete draft: Untitled draft' }));
    const prompt = await screen.findByRole('alertdialog', { name: 'Delete draft?' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    expect(draftsApi.deleteDraft).not.toHaveBeenCalled();
    draftsApi.fetchDrafts.mockResolvedValue([]);
    fireEvent.click(within(list).getByRole('button', { name: 'Delete draft: Untitled draft' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Delete draft?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(draftsApi.deleteDraft).toHaveBeenCalledWith('d0000000-0000-4000-8000-000000000002'));
    expect(await within(list).findByText('No drafts yet.')).toBeTruthy();
    // Back returns to the composer.
    fireEvent.click(within(list).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Post feedback' })).toBeTruthy();
  });

  it('brings back what was typed when the composer was never closed properly', async () => {
    window.localStorage.setItem(
      `publisense:post-draft:${TEST_VIEWER.id}`,
      JSON.stringify({ board: null, type: 'bug', platform: null, title: 'Lost in a reload', body: '', images: [] }),
    );
    renderComposer();
    const dialog = await open();
    expect((within(dialog).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Lost in a reload');
  });

  it('keeps what was typed even when the composer is never closed properly', async () => {
    renderComposer();
    const dialog = await open();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Autosaved thought' } });
    await waitFor(() => expect(window.localStorage.getItem(`publisense:post-draft:${TEST_VIEWER.id}`)).toContain('Autosaved thought'));
  });

  it('clears the draft once it is posted', async () => {
    postsApi.createPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000fe', title: 'Posted thought' }));
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Posted thought' } });
    await waitFor(() => expect(window.localStorage.getItem(`publisense:post-draft:${TEST_VIEWER.id}`)).toContain('Posted thought'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    expect(window.localStorage.getItem(`publisense:post-draft:${TEST_VIEWER.id}`)).toBeNull();
  });

  it('suggests similar posts to upvote instead', async () => {
    postsApi.fetchSimilar.mockResolvedValue([makePost({ title: 'Preview branches per PR', status: 'planned', reply_count: 4, board: { id: SUPABASE.id, slug: 'supabase', name: 'Supabase', color: SUPABASE.color, logo_path: null } })]);
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Preview branch for every PR' } });
    const similar = await within(dialog).findByRole('region', { name: 'Similar posts' });
    expect(within(similar).getByText('Already posted?')).toBeTruthy();
    expect(within(similar).getByRole('link', { name: /Preview branches per PR/ })).toBeTruthy();
    expect(within(similar).getByText('Planned · Supabase · 4 replies')).toBeTruthy();
    expect(within(similar).getByRole('button', { name: /Upvote/ })).toBeTruthy();
    expect(postsApi.fetchSimilar).toHaveBeenCalledWith('Preview branch for every PR', [SUPABASE.id], TEST_VIEWER.id);
  });

  it('keeps the dialog open and explains a refused post', async () => {
    postsApi.createPost.mockRejectedValue(new Error('You can’t post on this board.'));
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    chooseType(dialog, 'Bug');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Studio logs freeze' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    expect(await within(dialog).findByText('You can’t post on this board.')).toBeTruthy();
  });

  it('keeps a pasted title over the limit, says so at the field and explains why Post is off (#171)', async () => {
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    chooseType(dialog, 'Bug');
    const title = within(dialog).getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(title.maxLength).toBe(-1); // no silent browser cut
    const long = 'x'.repeat(175);
    fireEvent.change(title, { target: { value: long } });
    expect(title.value).toBe(long);
    expect(within(dialog).getByText('175/140')).toBeTruthy();
    expect(within(dialog).getAllByText('Titles can be up to 140 characters.').length).toBeGreaterThan(0);
    expect(title.getAttribute('aria-invalid')).toBe('true');
    const post = within(dialog).getByRole('button', { name: 'Post' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    expect(post.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(post.getAttribute('aria-describedby')!)?.textContent).toBe('Titles can be up to 140 characters.');

    fireEvent.change(title, { target: { value: 'x'.repeat(140) } });
    expect(within(dialog).queryByText('Titles can be up to 140 characters.')).toBeNull();
    expect(post.disabled).toBe(false);
    expect(post.getAttribute('aria-describedby')).toBeNull();
  });

  it('says why Post is disabled, one reason at a time', async () => {
    renderComposer();
    const dialog = await open();
    const post = within(dialog).getByRole('button', { name: 'Post' }) as HTMLButtonElement;
    const reason = () => document.getElementById(post.getAttribute('aria-describedby') ?? '')?.textContent;
    expect(post.disabled).toBe(true);
    expect(reason()).toBe('Choose a product to post.');
    await chooseSupabase(dialog);
    // Type comes preselected (Bug), so the next reason is the title.
    expect(reason()).toBe('Add a title to post.');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'ab' } });
    expect(reason()).toBe('Give it a title of at least 3 characters.');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'abc' } });
    expect(post.disabled).toBe(false);
    expect(post.getAttribute('aria-describedby')).toBeNull();
    expect(within(dialog).queryByRole('status')).toBeNull();
  });

  it('says when no product matches and lets you change the product', async () => {
    renderComposer();
    const dialog = await open();
    const product = within(dialog).getByRole('combobox', { name: 'Product' });
    fireEvent.focus(product);
    fireEvent.change(product, { target: { value: 'zzz' } });
    expect(await within(dialog).findByText('No products match “zzz”.')).toBeTruthy();
    fireEvent.change(product, { target: { value: 'cur' } });
    fireEvent.keyDown(product, { key: 'Enter' });
    expect(await within(dialog).findByText('Cursor')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }));
    expect(within(dialog).getByRole('combobox', { name: 'Product' })).toBeTruthy();
  });
});

describe('search modal without the composer', () => {
  // SearchWell is rendered here with no ComposerProvider: search must not depend on the composer.
  it('renders, shows quick results and opens the highlighted one', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [FIGMA], hubs: [FIGMA_HUB], posts: [makePost({ title: 'Figma variables export' })] });
    const { router } = renderWith(
      <Routes>
        <Route path="*" element={<SearchWell />} />
      </Routes>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search products, posts, hubs' }));
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    const input = within(modal).getByRole('combobox', { name: 'Search products, posts and hubs' });
    fireEvent.change(input, { target: { value: 'fig' } });
    const list = within(modal).getByRole('listbox', { name: 'Search suggestions' });
    expect(await within(list).findByText('Figma variables export')).toBeTruthy();
    expect(within(list).getByText('Figma hub')).toBeTruthy();
    expect(within(list).getByText('See all results for “fig”')).toBeTruthy();
    expect(within(modal).queryByRole('button', { name: 'Post feedback' })).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(list).getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.submit(input.closest('form')!);
    expect(router.state.location.pathname).toBe('/b/figma');
  });

  it('does not open the search modal when pressing / on /search', async () => {
    renderWith(
      <Routes>
        <Route
          path="/search"
          element={
            <div>
              <SearchWell />
              <form role="search">
                <input type="search" placeholder="Search page input" />
              </form>
            </div>
          }
        />
      </Routes>,
      { path: '/search' },
    );
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });

  it('submits the typed query to /search', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [], hubs: [], posts: [] });
    const { router } = renderWith(
      <Routes>
        <Route path="*" element={<SearchWell />} />
      </Routes>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search products, posts, hubs' }));
    const modal = await screen.findByRole('dialog', { name: 'Search' });
    const input = within(modal).getByRole('combobox', { name: 'Search products, posts and hubs' });
    fireEvent.change(input, { target: { value: 'dark mode' } });
    fireEvent.submit(input.closest('form')!);
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?q=dark%20mode');
  });
});

describe('composer', () => {
  describe('from a source (staff)', () => {
    it('is not offered to people who aren’t staff', async () => {
      renderComposer();
      const dialog = await open();
      await waitFor(() => expect(modApi.fetchIsPlatformAdmin).toHaveBeenCalled());
      expect(within(dialog).queryByRole('group', { name: 'Post as' })).toBeNull();
      expect(within(dialog).queryByLabelText('Source link')).toBeNull();
    });

    it('seeds a post with its source link and original date, with no author', async () => {
      modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
      postsApi.seedPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000ee', title: 'Branching for preview databases' }));
      const { router } = renderComposer();
      const dialog = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: 'From a source' }));
      expect(await screen.findByRole('dialog', { name: 'Add feedback from a source' })).toBeTruthy();
      await chooseSupabase(dialog);
      chooseType(dialog, 'Feature request');
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Branching for preview databases' } });
      const add = within(dialog).getByRole('button', { name: 'Add post' }) as HTMLButtonElement;
      expect(add.disabled).toBe(true);
      fireEvent.change(within(dialog).getByLabelText('Source link'), { target: { value: 'https://github.com/supabase/supabase/issues/42' } });
      fireEvent.change(within(dialog).getByLabelText(/Originally posted/), { target: { value: '2025-03-14' } });
      expect(within(dialog).getAllByText(/from GitHub, with no author/).length).toBeGreaterThan(0);
      fireEvent.click(add);
      await waitFor(() => expect(router.state.location.pathname).toBe('/post/a0000000-0000-4000-8000-0000000000ee'));
      expect(postsApi.seedPost).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: SUPABASE.id, type: 'feature', title: 'Branching for preview databases', sourceUrl: 'https://github.com/supabase/supabase/issues/42', postedOn: '2025-03-14' }),
        TEST_VIEWER.id,
      );
      expect(postsApi.createPost).not.toHaveBeenCalled();
    });

    it('offers products still waiting for review when seeding, but not when posting as yourself', async () => {
      modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
      boardsApi.fetchBoards.mockResolvedValue([CURSOR, { ...SUPABASE, id: 'b0000000-0000-4000-8000-0000000000c1', slug: 'instacart', name: 'Instacart', tagline: 'Groceries', status: 'pending', created_by: 'someone-else' }]);
      renderComposer();
      const dialog = await open();
      const product = within(dialog).getByRole('combobox', { name: 'Product' });
      fireEvent.focus(product);
      fireEvent.change(product, { target: { value: 'insta' } });
      await waitFor(() => expect(within(dialog).queryByRole('option', { name: /Instacart/ })).toBeNull());
      fireEvent.click(within(dialog).getByRole('button', { name: 'From a source' }));
      fireEvent.focus(product);
      fireEvent.change(product, { target: { value: 'instac' } });
      expect(await within(dialog).findByRole('option', { name: /Instacart/ })).toBeTruthy();
    });

    it('asks for a full https link before seeding', async () => {
      modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
      renderComposer();
      const dialog = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: 'From a source' }));
      await chooseSupabase(dialog);
      chooseType(dialog, 'Bug');
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Login loops' } });
      fireEvent.change(within(dialog).getByLabelText('Source link'), { target: { value: 'reddit.com/r/supabase' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add post' }));
      expect(await within(dialog).findByText('Paste the full https link to the original post.')).toBeTruthy();
      expect(postsApi.seedPost).not.toHaveBeenCalled();
    });

    it('still posts as yourself by default', async () => {
      modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
      postsApi.createPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000fd' }));
      renderComposer();
      const dialog = await open();
      expect((await within(dialog).findByRole('button', { name: 'You' })).getAttribute('aria-pressed')).toBe('true');
      expect(within(dialog).queryByLabelText('Source link')).toBeNull();
    });
  });
});
