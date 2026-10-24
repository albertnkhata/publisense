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
  setVote: vi.fn(),
}));
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

function chooseType(dialog: HTMLElement, label: 'Bug' | 'Feature request') {
  fireEvent.click(within(dialog).getByRole('button', { name: /Type/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(label) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGMA, SUPABASE]);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  postsApi.fetchSimilar.mockResolvedValue([]);
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
    chooseType(dialog, 'Feature request');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Branching for preview databases' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Details/ }), { target: { value: 'One per pull request.' } });
    expect(within(dialog).getByText('31/140')).toBeTruthy();
    expect(post.disabled).toBe(false);

    fireEvent.click(post);
    await waitFor(() =>
      expect(postsApi.createPost).toHaveBeenCalledWith(
        { boardId: SUPABASE.id, type: 'feature', title: 'Branching for preview databases', body: 'One per pull request.' },
        TEST_VIEWER.id,
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Post page' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/post/a0000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('Posted to Supabase')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull();
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

describe('search popover', () => {
  it('shows quick results and goes to the full results', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [FIGMA], hubs: [FIGMA_HUB], posts: [makePost({ title: 'Figma variables export' })] });
    const { router } = renderWith(
      <Routes>
        <Route path="*" element={<SearchWell />} />
      </Routes>,
    );
    const input = screen.getByRole('combobox', { name: 'Search products, posts and hubs' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'fig' } });
    const list = await screen.findByRole('listbox', { name: 'Search suggestions' });
    expect(await within(list).findByText('Figma variables export')).toBeTruthy();
    expect(within(list).getByText('Figma hub')).toBeTruthy();
    expect(within(list).getByText('See all results for “fig”')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(list).getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.submit(input.closest('form')!);
    expect(router.state.location.pathname).toBe('/b/figma');
  });

  it('submits the typed query to /search', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [], hubs: [], posts: [] });
    const { router } = renderWith(
      <Routes>
        <Route path="*" element={<SearchWell />} />
      </Routes>,
    );
    const input = screen.getByRole('combobox', { name: 'Search products, posts and hubs' });
    fireEvent.change(input, { target: { value: 'dark mode' } });
    fireEvent.submit(input.closest('form')!);
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?q=dark%20mode');
  });
});
