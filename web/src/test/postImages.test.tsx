import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { fitWithin, isPostImagePath } from '../api/postImages';
import { PostImages } from '../posts/PostImages';
import { ComposerProvider, useComposer } from '../shell/composer';
import { CURSOR, FIGMA, FIGMA_HUB, SUPABASE } from './boardFixtures';
import { makePost } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

const boardsApi = vi.hoisted(() => ({ fetchBoards: vi.fn(), fetchHubs: vi.fn(), searchAll: vi.fn() }));
const postsApi = vi.hoisted(() => ({ fetchSimilar: vi.fn(), createPost: vi.fn(), seedPost: vi.fn(), setVote: vi.fn() }));
const imagesApi = vi.hoisted(() => ({ preparePostImage: vi.fn(), uploadPostImage: vi.fn(), removePostImages: vi.fn() }));
const modApi = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn() }));
vi.mock('../api/moderation', async (orig) => ({ ...(await orig<typeof import('../api/moderation')>()), ...modApi }));
vi.mock('../api/boards', async (orig) => ({ ...(await orig<typeof import('../api/boards')>()), ...boardsApi }));
const draftsApi = vi.hoisted(() => ({ fetchDrafts: vi.fn(), saveDraft: vi.fn(), deleteDraft: vi.fn() }));
vi.mock('../api/drafts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/drafts')>()), ...draftsApi }));
vi.mock('../api/posts', async (orig) => ({ ...(await orig<typeof import('../api/posts')>()), ...postsApi }));
vi.mock('../api/postImages', async (orig) => ({
  ...(await orig<typeof import('../api/postImages')>()),
  ...imagesApi,
  postImageUrl: (p: string) => `https://cdn.test/post-images/${p}`,
}));

const ME = TEST_VIEWER.id;
const P1 = `${ME}/11111111-1111-4111-8111-111111111111.webp`;
const P2 = `${ME}/22222222-2222-4222-8222-222222222222.webp`;

function Opener() {
  const { openComposer } = useComposer();
  return (
    <button type="button" onClick={() => openComposer()}>
      Open composer
    </button>
  );
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  draftsApi.fetchDrafts.mockResolvedValue([]);
  draftsApi.saveDraft.mockResolvedValue('d0000000-0000-4000-8000-000000000009');
  draftsApi.deleteDraft.mockResolvedValue(undefined);
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGMA, SUPABASE]);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  postsApi.fetchSimilar.mockResolvedValue([]);
  modApi.fetchIsPlatformAdmin.mockResolvedValue(false);
  imagesApi.preparePostImage.mockImplementation(async () => new Blob(['y'], { type: 'image/webp' }));
  imagesApi.uploadPostImage.mockResolvedValueOnce({ path: P1, error: null }).mockResolvedValueOnce({ path: P2, error: null });
  imagesApi.removePostImages.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('post image helpers', () => {
  it('scales the longest edge down to 2400 and never up', () => {
    expect(fitWithin(4800, 1200)).toEqual({ width: 2400, height: 600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('accepts only bucket paths', () => {
    expect(isPostImagePath(P1)).toBe(true);
    expect(isPostImagePath('https://evil.example/x.png')).toBe(false);
  });
});

describe('composer screenshots', () => {
  async function openWithDraft() {
    renderWith(
      <ComposerProvider>
        <Routes>
          <Route path="/" element={<Opener />} />
          <Route path="/post/:id" element={<h1>Post page</h1>} />
        </Routes>
      </ComposerProvider>,
      { viewer: TEST_VIEWER },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Post feedback' });
    const product = within(dialog).getByRole('combobox', { name: 'Product' });
    fireEvent.focus(product);
    fireEvent.change(product, { target: { value: 'postgres' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /Supabase/ }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Table editor freezes on paste' } });
    return dialog;
  }
  const fileInput = (dialog: HTMLElement) => dialog.querySelector('input[type="file"]') as HTMLInputElement;

  it('uploads picked and pasted images and posts their paths in order', async () => {
    postsApi.createPost.mockResolvedValue(makePost({ id: 'a0000000-0000-4000-8000-0000000000aa' }));
    const dialog = await openWithDraft();
    expect(within(dialog).getByRole('button', { name: 'Add screenshots' })).toBeTruthy();
    fireEvent.change(fileInput(dialog), { target: { files: [png('one.png')] } });
    fireEvent.paste(within(dialog).getByRole('textbox', { name: /Details/ }), { clipboardData: { files: [png('two.png')] } });
    const list = await within(dialog).findByRole('list', { name: 'Screenshots to post' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() => expect(imagesApi.uploadPostImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(dialog).queryByLabelText('Uploading')).toBeNull());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(postsApi.createPost).toHaveBeenCalledWith(expect.objectContaining({ images: [P1, P2] }), ME));
  });

  it('refuses other file types and deletes an upload you remove', async () => {
    const dialog = await openWithDraft();
    fireEvent.change(fileInput(dialog), { target: { files: [new File(['x'], 'clip.gif', { type: 'image/gif' })] } });
    expect(await within(dialog).findByText('Use PNG, JPEG or WebP images.')).toBeTruthy();
    expect(imagesApi.uploadPostImage).not.toHaveBeenCalled();

    fireEvent.change(fileInput(dialog), { target: { files: [png('one.png')] } });
    await waitFor(() => expect(imagesApi.uploadPostImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(dialog).queryByLabelText('Uploading')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove screenshot 1' }));
    expect(imagesApi.removePostImages).toHaveBeenCalledWith([P1]);
    expect(within(dialog).queryByRole('list', { name: 'Screenshots to post' })).toBeNull();
  });

  it('holds Post while an image uploads', async () => {
    imagesApi.uploadPostImage.mockReset();
    imagesApi.uploadPostImage.mockImplementation(() => new Promise(() => {}));
    const dialog = await openWithDraft();
    fireEvent.change(fileInput(dialog), { target: { files: [png('one.png')] } });
    expect(await within(dialog).findByText('Wait for the images to upload.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deletes the uploads when the draft is deleted', async () => {
    const dialog = await openWithDraft();
    fireEvent.change(fileInput(dialog), { target: { files: [png('one.png')] } });
    await waitFor(() => expect(within(dialog).queryByLabelText('Uploading')).toBeNull());
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Save post?' })).getByRole('button', { name: 'Delete' }));
    expect(imagesApi.removePostImages).toHaveBeenCalledWith([P1]);
  });

  it('keeps the uploads when the draft is saved', async () => {
    const dialog = await openWithDraft();
    fireEvent.change(fileInput(dialog), { target: { files: [png('one.png')] } });
    await waitFor(() => expect(within(dialog).queryByLabelText('Uploading')).toBeNull());
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Save post?' })).getByRole('button', { name: 'Save' }));
    expect(imagesApi.removePostImages).not.toHaveBeenCalledWith([P1]);
  });
});

describe('post screenshots', () => {
  it('shows nothing without images', () => {
    const { container } = renderWith(<PostImages paths={[]} title="T" />);
    expect(container.querySelector('ul')).toBeNull();
  });

  it('opens an image full size and steps between them', async () => {
    renderWith(<PostImages paths={[P1, P2]} title="Crash on save" />);
    const tiles = within(screen.getByRole('list', { name: 'Screenshots' })).getAllByRole('button');
    expect(tiles).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open screenshot 2 of 2 for Crash on save' }));
    const viewer = await screen.findByRole('dialog', { name: 'Screenshot 2 of 2' });
    expect((within(viewer).getByRole('img') as HTMLImageElement).src).toContain('22222222');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Next screenshot' }));
    expect(await screen.findByRole('dialog', { name: 'Screenshot 1 of 2' })).toBeTruthy();
  });
});
