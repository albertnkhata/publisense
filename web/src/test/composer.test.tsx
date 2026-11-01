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
  fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(label) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGMA, SUPABASE]);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  postsApi.fetchSimilar.mockResolvedValue([]);
  modApi.fetchIsPlatformAdmin.mockResolvedValue(false);
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
    // Device is optional (0033): choosing it again clears it.
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
        { boardId: SUPABASE.id, type: 'feature', title: 'Branching for preview databases', body: 'One per pull request.', platform: 'web' },
        TEST_VIEWER.id,
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/post/a0000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('Posted to Supabase')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull();
  });

  it('asks before throwing away a draft, from Escape, the X or Cancel', async () => {
    renderComposer();
    const dialog = await open();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Half a thought' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(dialog).getByText(/Discard this post\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Post feedback' })).toBeTruthy();
    expect((within(dialog).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Half a thought');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull());
  });

  it('moves through types with the arrow keys and says what the chosen one means', async () => {
    renderComposer();
    const dialog = await open();
    await chooseSupabase(dialog);
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(within(dialog).getByText('Pick the one that fits best.')).toBeTruthy();
    fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' });
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true');
    expect(radios[1]!.tabIndex).toBe(0);
    expect(within(dialog).queryByText('Pick the one that fits best.')).toBeNull();
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
    expect(reason()).toBe('Choose a type to post.');
    chooseType(dialog, 'Bug');
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
