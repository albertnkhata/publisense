import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import type { BoardWithHub } from '../api/boards';
import type { QueuedBoard } from '../api/products';
import { parseLink as webParseLink } from '../lib/link';
import * as rules from '../../../supabase/functions/link-preview/rules';
import { ClaimProvider } from '../claim/ClaimDialog';
import { BoardPage } from '../pages/BoardPage';
import { ExplorePage } from '../pages/ExplorePage';
import { AdminProductsPage } from '../pages/AdminPages';
import { describeNotification } from '../pages/NotificationsPage';
import { AddProductHost, AddProductProvider, useAddProduct } from '../products/AddProductDialog';
import { ComposerProvider, useComposer } from '../shell/composer';
import { SearchWell } from '../shell/SearchWell';
import { CURSOR, makeBoard, SUPABASE } from './boardFixtures';
import { iso, ME, OTHER } from './postFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

// Network calls are mocked; the pure helpers stay real.
const productsApi = vi.hoisted(() => ({
  checkProductLink: vi.fn(),
  fetchLinkPreview: vi.fn(),
  createBoard: vi.fn(),
  storeBoardLogo: vi.fn(),
  fetchProductQueue: vi.fn(),
  decideBoard: vi.fn(),
}));
const boardsApi = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  fetchBoards: vi.fn(),
  fetchHubs: vi.fn(),
  fetchHub: vi.fn(),
  fetchPostCounts: vi.fn(),
  fetchTrending: vi.fn(),
  fetchIsBoardTeam: vi.fn(),
  fetchFollowedScopes: vi.fn(),
  searchAll: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchPostList: vi.fn(),
  fetchRoadmap: vi.fn(),
  fetchChangelog: vi.fn(),
  fetchWanted: vi.fn(),
  fetchSimilar: vi.fn(),
  createPost: vi.fn(),
}));
const modApi = vi.hoisted(() => ({ fetchIsPlatformAdmin: vi.fn() }));
const teamsApi = vi.hoisted(() => ({ fetchVerifiedDomains: vi.fn(), fetchPendingDns: vi.fn(), fetchMyRequests: vi.fn() }));
vi.mock('../api/products', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/products')>()), ...productsApi }));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));
vi.mock('../api/moderation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/moderation')>()), ...modApi }));
vi.mock('../api/teams', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/teams')>()), ...teamsApi }));

const { ProductError } = await vi.importActual<typeof import('../api/products')>('../api/products');

const ACME_ID = 'b0000000-0000-4000-8000-0000000000a1';
const ACME: BoardWithHub = {
  ...makeBoard({ id: ACME_ID, slug: 'acme-notes', name: 'Acme Notes', tagline: 'Notes for small teams', site: 'acme-notes.dev', category: 'prod', follower_count: 1, post_count: 0, status: 'pending', created_by: TEST_VIEWER.id }),
  hub: null,
  creator: ME,
  review_note: null,
};

function Opener() {
  const ctx = useAddProduct();
  return (
    <button type="button" onClick={() => ctx?.openAddProduct()}>
      Open add product
    </button>
  );
}

function ComposerOpener() {
  const { openComposer } = useComposer();
  return (
    <button type="button" onClick={() => openComposer()}>
      Open composer
    </button>
  );
}

function renderApp(path = '/', signedIn = true) {
  return renderWith(
    <AddProductProvider>
      <ComposerProvider>
        <ClaimProvider>
          <AddProductHost />
          <Routes>
            <Route path="/" element={<Opener />} />
            <Route path="/well" element={<SearchWell />} />
            <Route path="/compose" element={<ComposerOpener />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/b/:board" element={<BoardPage />} />
            <Route path="/u/:handle" element={<h1>Profile page</h1>} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
          </Routes>
        </ClaimProvider>
      </ComposerProvider>
    </AddProductProvider>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

async function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Open add product' }));
  return screen.findByRole('dialog', { name: 'Add a product' });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  productsApi.checkProductLink.mockResolvedValue({ kind: 'site', canonical: 'acme-notes.dev', match: null, hub: null });
  productsApi.fetchLinkPreview.mockResolvedValue({ kind: 'site', canonical: 'acme-notes.dev', name: 'Acme Notes', description: 'Notes for small teams', icon_url: null });
  // Once created, RLS lets its creator read the pending board in the catalogue.
  productsApi.createBoard.mockImplementation(async () => {
    boardsApi.fetchBoards.mockResolvedValue([CURSOR, SUPABASE, ACME]);
    return { id: ACME_ID, slug: 'acme-notes', name: 'Acme Notes', status: 'pending', hub: null, can_claim: false };
  });
  productsApi.storeBoardLogo.mockResolvedValue(null);
  productsApi.fetchProductQueue.mockResolvedValue([]);
  productsApi.decideBoard.mockResolvedValue(undefined);
  boardsApi.fetchBoard.mockImplementation(async (slug: string) => (slug === 'acme-notes' ? ACME : slug === 'cursor' ? CURSOR : null));
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, SUPABASE]);
  boardsApi.fetchHubs.mockResolvedValue([]);
  boardsApi.fetchPostCounts.mockResolvedValue({ posts: 0, roadmap: 0 });
  boardsApi.fetchTrending.mockResolvedValue([]);
  boardsApi.fetchIsBoardTeam.mockResolvedValue(false);
  boardsApi.fetchFollowedScopes.mockResolvedValue(new Set());
  postsApi.fetchPostList.mockResolvedValue({ items: [], next: null });
  postsApi.fetchRoadmap.mockResolvedValue({ planned: [], in_progress: [], shipped: [] });
  postsApi.fetchChangelog.mockResolvedValue([]);
  postsApi.fetchWanted.mockResolvedValue([]);
  postsApi.fetchSimilar.mockResolvedValue([]);
  modApi.fetchIsPlatformAdmin.mockResolvedValue(true);
  teamsApi.fetchVerifiedDomains.mockResolvedValue([]);
  teamsApi.fetchPendingDns.mockResolvedValue([]);
  teamsApi.fetchMyRequests.mockResolvedValue({ join: null, dispute: null });
});

// ------------------------------------------------------------------ link rules

/** The same cases supabase/tests/v2_rls_test.sql runs against public.v2_parse_link(). */
const LINK_CASES: Array<[string, ReturnType<typeof webParseLink>]> = [
  ['https://www.Cursor.com/pricing?x=1#top', { kind: 'site', canonical: 'cursor.com', full: 'cursor.com/pricing' }],
  ['cursor.com', { kind: 'site', canonical: 'cursor.com', full: 'cursor.com' }],
  ['http://acme.dev:8080/', { kind: 'site', canonical: 'acme.dev', full: 'acme.dev' }],
  ['https://github.com/Vercel/Next.js.git', { kind: 'github', canonical: 'github.com/vercel/next.js', full: 'github.com/vercel/next.js.git' }],
  ['https://github.com/vercel/next.js/tree/canary/docs', { kind: 'github', canonical: 'github.com/vercel/next.js', full: 'github.com/vercel/next.js/tree/canary/docs' }],
  ['https://github.com/features/copilot', { kind: 'site', canonical: 'github.com', full: 'github.com/features/copilot' }],
  ['https://github.com/vercel', { kind: 'site', canonical: 'github.com', full: 'github.com/vercel' }],
  ['figma.com/figjam/board/123', { kind: 'site', canonical: 'figma.com', full: 'figma.com/figjam/board/123' }],
  ['javascript:alert(1)', null],
  ['ftp://acme.dev', null],
  ['http://127.0.0.1/', null],
  ['http://10.0.0.8:3000', null],
  ['https://user:pw@acme.dev', null],
  ['http://localhost', null],
  ['http://[::1]/', null],
  ['acme dev.com', null],
  ['', null],
];

describe('link rules', () => {
  it('parse the same way in the web app and the Edge Function', () => {
    for (const [input, want] of LINK_CASES) {
      expect(webParseLink(input), input).toEqual(want);
      expect(rules.parseLink(input), input).toEqual(want);
    }
  });

  it('refuse private, loopback, link-local, CGNAT and embedded-IPv4 addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1']) {
      expect(rules.isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:db8::1']) {
      expect(rules.isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['1.1.1.1', '140.82.112.3', '172.32.0.1', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2a00:1450:4001:80b::200e']) {
      expect(rules.isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('only fetch http(s) on default ports at public-looking host names', () => {
    const ok = (u: string) => rules.urlAllowed(new URL(u));
    expect(ok('https://linear.app/')).toBe(true);
    expect(ok('http://linear.app:80/x')).toBe(true);
    expect(ok('https://linear.app:8443/')).toBe(false);
    expect(ok('https://127.0.0.1/')).toBe(false);
    expect(ok('http://[::1]/')).toBe(false);
    expect(ok('http://2130706433/')).toBe(false); // decimal 127.0.0.1, normalised by URL
    expect(ok('https://u:p@linear.app/')).toBe(false);
    expect(ok('file:///etc/passwd')).toBe(false);
    expect(ok('http://metadata.google.internal/')).toBe(false);
    expect(ok('http://printer.local/')).toBe(false);
    expect(ok('http://intranet/')).toBe(false);
  });

  it('read a name, a one-line description and logo candidates from a page head', () => {
    const html = `<html><head><title>Acme Notes – Notes for teams</title>
      <meta name="description" content="Fast,
      shared notes &amp; docs for small teams that want one place for everything they write, plan and decide together every single day.">
      <link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.acme.dev/touch.png">
      <meta property="og:image" content="/og.png"></head><body>…</body></html>`;
    const meta = rules.extractMeta(html, 'https://acme-notes.dev/');
    expect(meta.name).toBe('Acme Notes');
    expect(meta.description.length).toBeLessThanOrEqual(120);
    expect(meta.description.startsWith('Fast, shared notes & docs for small teams')).toBe(true);
    expect(meta.description.endsWith('…')).toBe(true);
    expect(meta.icons).toEqual([
      'https://cdn.acme.dev/touch.png',
      'https://acme-notes.dev/icon-32.png',
      'https://acme-notes.dev/favicon.ico',
      'https://acme-notes.dev/og.png',
      'https://acme-notes.dev/apple-touch-icon.png',
    ]);
    expect(rules.extractMeta('<meta property="og:site_name" content="Linear">', 'https://linear.app/').name).toBe('Linear');
  });

  it('accept images by magic bytes only', () => {
    expect(rules.sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(rules.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(rules.sniffImage(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('webp');
    expect(rules.sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(rules.sniffImage(new Uint8Array([0, 0, 1, 0]))).toBeNull(); // .ico
  });
});

// ------------------------------------------------------------------ the form

describe('add a product', () => {
  it('signed out, it asks them to create an account first', async () => {
    renderApp('/explore', false);
    fireEvent.click(await screen.findByRole('button', { name: 'Add it' }));
    const auth = await screen.findByRole('dialog');
    expect(within(auth).getByText(/Create an account to add a product/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Add a product' })).toBeNull();
  });

  it('autofills from the link, then creates the board and opens the first post on it', async () => {
    const { router } = renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'https://www.acme-notes.dev/' } });
    await waitFor(() => expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Acme Notes'));
    expect((within(dialog).getByLabelText(/^Description/) as HTMLInputElement).value).toBe('Notes for small teams');
    expect(productsApi.checkProductLink).toHaveBeenCalledWith('https://www.acme-notes.dev/');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Productivity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() =>
      expect(productsApi.createBoard).toHaveBeenCalledWith({ link: 'https://www.acme-notes.dev/', name: 'Acme Notes', tagline: 'Notes for small teams', category: 'prod' }),
    );
    const composer = await screen.findByRole('dialog', { name: 'What do you want to tell them?' });
    expect(await within(composer).findByText(/Acme Notes is waiting for review/)).toBeTruthy();
    expect(within(composer).getByText('Acme Notes')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/b/acme-notes');
    expect(productsApi.storeBoardLogo).toHaveBeenCalledWith(ACME_ID);
    // Not their domain: no claim offer.
    expect(within(composer).queryByText('Is this your product?')).toBeNull();
  });

  it('shows no helper line under Link, and still takes a GitHub repo link', async () => {
    productsApi.checkProductLink.mockResolvedValue({ kind: 'github', canonical: 'github.com/acme/notes', match: null, hub: null });
    renderApp();
    const dialog = await openForm();
    const link = within(dialog).getByLabelText('Link');
    expect(link.getAttribute('aria-describedby')).toBeNull();
    expect(within(dialog).queryByText(/its GitHub repo/)).toBeNull();
    fireEvent.change(link, { target: { value: 'https://github.com/acme/notes' } });
    await waitFor(() => expect(productsApi.checkProductLink).toHaveBeenCalledWith('https://github.com/acme/notes'));
    expect(within(dialog).queryByText('Paste a product website or a GitHub repo link.')).toBeNull();
  });

  it('keeps what the person typed over the autofill', async () => {
    renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Acme' } });
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'acme-notes.dev' } });
    await waitFor(() => expect((within(dialog).getByLabelText(/^Description/) as HTMLInputElement).value).toBe('Notes for small teams'));
    expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Acme');
  });

  it('says when a product is already here, links to it and blocks a duplicate', async () => {
    productsApi.checkProductLink.mockResolvedValue({ kind: 'site', canonical: 'cursor.com', match: { slug: 'cursor', name: 'Cursor', status: 'live', mine: false }, hub: null });
    const { router } = renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'https://cursor.com/pricing' } });
    expect(await within(dialog).findByText('It’s already here')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add product' }) as HTMLButtonElement).disabled).toBe(true);
    expect(productsApi.fetchLinkPreview).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Go to Cursor' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/b/cursor'));
    expect(productsApi.createBoard).not.toHaveBeenCalled();
  });

  it('tells them about their own pending board, and someone else’s without naming it', async () => {
    productsApi.checkProductLink.mockResolvedValueOnce({ kind: 'site', canonical: 'acme-notes.dev', match: { slug: 'acme-notes', name: 'Acme Notes', status: 'pending', mine: true }, hub: null });
    renderApp();
    let dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'acme-notes.dev' } });
    expect(await within(dialog).findByText(/You added it\. It goes live once it’s reviewed/)).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Go to Acme Notes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    productsApi.checkProductLink.mockResolvedValueOnce({ kind: 'site', canonical: 'beta.io', match: { status: 'pending', mine: false }, hub: null });
    dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'beta.io' } });
    expect(await within(dialog).findByText(/Someone added it a moment ago/)).toBeTruthy();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('shows the duplicate the server found at submit time', async () => {
    productsApi.createBoard.mockRejectedValue(new ProductError('exists', 'It’s already here.', { slug: 'cursor', name: 'Cursor', status: 'live', mine: false }));
    renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'acme-notes.dev' } });
    await waitFor(() => expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Acme Notes'));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await within(dialog).findByText('It’s already here')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Go to Cursor' })).toBeTruthy();
  });

  it('checks the fields before sending', async () => {
    productsApi.fetchLinkPreview.mockResolvedValue(null);
    renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'not a link' } });
    expect(await within(dialog).findByText('Paste a product website or a GitHub repo link.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'acme-notes.dev' } });
    await waitFor(() => expect(productsApi.checkProductLink).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await within(dialog).findByText(/Give it a name/)).toBeTruthy();
    expect(within(dialog).getByText('Choose a category.')).toBeTruthy();
    expect(productsApi.createBoard).not.toHaveBeenCalled();
  });

  it('offers the claim flow when their email is on the product’s domain', async () => {
    productsApi.createBoard.mockImplementation(async () => {
      boardsApi.fetchBoards.mockResolvedValue([CURSOR, SUPABASE, ACME]);
      return { id: ACME_ID, slug: 'acme-notes', name: 'Acme Notes', status: 'pending', hub: null, can_claim: true };
    });
    renderApp();
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: 'acme-notes.dev' } });
    await waitFor(() => expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Acme Notes'));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Productivity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const composer = await screen.findByRole('dialog', { name: 'What do you want to tell them?' });
    expect(await within(composer).findByText('Is this your product?')).toBeTruthy();
    fireEvent.click(within(composer).getByRole('button', { name: 'Claim it' }));
    expect(await screen.findByRole('dialog', { name: 'Claim Acme Notes' })).toBeTruthy();
  });
});


describe('entry points', () => {
  it('search with no product results offers “Can’t find it? Add it”, prefilled', async () => {
    boardsApi.searchAll.mockResolvedValue({ boards: [], hubs: [], posts: [] });
    renderApp('/well');
    const input = screen.getByRole('combobox', { name: /Search products/ });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Acme Notes' } });
    fireEvent.click(await screen.findByRole('option', { name: /Can’t find it\? Add it/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a product' });
    expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Acme Notes');
  });

  it('the composer’s product picker offers to add one, and lists only live boards plus your own pending ones', async () => {
    boardsApi.fetchBoards.mockResolvedValue([CURSOR, ACME, makeBoard({ id: 'b0000000-0000-4000-8000-0000000000a2', slug: 'acme-beta', name: 'Acme Beta', status: 'pending', created_by: OTHER.id })]);
    renderApp('/compose');
    fireEvent.click(screen.getByRole('button', { name: 'Open composer' }));
    const composer = await screen.findByRole('dialog', { name: 'Post feedback' });
    const product = within(composer).getByRole('combobox', { name: 'Product' });
    fireEvent.focus(product);
    fireEvent.change(product, { target: { value: 'acme' } });
    expect(await within(composer).findByRole('option', { name: /Acme Notes/ })).toBeTruthy();
    expect(within(composer).queryByRole('option', { name: /Acme Beta/ })).toBeNull();
    fireEvent.click(within(composer).getByRole('button', { name: 'Not listed? Add a product' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a product' });
    expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('acme');
    expect(screen.queryByRole('dialog', { name: 'Post feedback' })).toBeNull();
  });
});

// ------------------------------------------------------------------ pending boards

describe('pending boards', () => {
  it('show their creator a quiet Pending review pill, with "Added by" hidden for now', async () => {
    renderApp('/b/acme-notes');
    expect(await screen.findByRole('heading', { level: 1, name: /Acme Notes/ })).toBeTruthy();
    expect(screen.getByText('Pending review')).toBeTruthy();
    expect(screen.queryByText(/Added by/)).toBeNull();
  });

  it('drop "Added by" once the board is claimed, and live boards have no pill', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...ACME, status: 'live', claimed_at: iso(1), creator: OTHER });
    renderApp('/b/acme-notes');
    expect(await screen.findByRole('heading', { level: 1, name: /Acme Notes/ })).toBeTruthy();
    expect(screen.queryByText('Pending review')).toBeNull();
    expect(screen.queryByText(/Added by/)).toBeNull();
  });

  it('a rejected board tells its creator why and takes no posts', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...ACME, status: 'rejected', review_note: 'Already listed as Acme' });
    renderApp('/b/acme-notes');
    expect(await screen.findByText('Not approved')).toBeTruthy();
    expect(screen.getByText(/This product wasn’t approved: Already listed as Acme/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Post feedback' })).toBeNull();
  });

  it('stay out of Explore even for the people RLS lets read them', async () => {
    boardsApi.fetchBoards.mockResolvedValue([CURSOR, ACME, makeBoard({ id: 'b0000000-0000-4000-8000-0000000000a2', slug: 'beta', name: 'Beta', status: 'pending', created_by: OTHER.id })]);
    renderApp('/explore');
    expect(await screen.findByRole('list', { name: 'All products' })).toBeTruthy();
    const all = screen.getByRole('list', { name: 'All products' });
    expect(within(all).getByText('Cursor')).toBeTruthy();
    expect(within(all).queryByText('Acme Notes')).toBeNull();
    expect(within(all).queryByText('Beta')).toBeNull();
    expect(screen.getByText(/Can’t find a product you use\?/)).toBeTruthy();
  });
});

// ------------------------------------------------------------------ admin queue

const QUEUED: QueuedBoard = { ...ACME, created_by: OTHER.id, creator: OTHER, review_note: null, reviewed_at: null };

describe('admin: new products', () => {
  it('lists pending products and approves with edits', async () => {
    productsApi.fetchProductQueue.mockResolvedValue([QUEUED]);
    renderApp('/admin/products');
    const list = await screen.findByRole('list', { name: 'Products waiting for review' });
    expect(within(list).getByText('Acme Notes')).toBeTruthy();
    expect(within(list).getByRole('link', { name: '@jmwamba' })).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Approve…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve Acme Notes?' });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Acme Notes HQ' } });
    fireEvent.change(within(dialog).getByLabelText('Category'), { target: { value: 'code' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(productsApi.decideBoard).toHaveBeenCalledWith({ id: ACME_ID, approve: true, name: 'Acme Notes HQ', tagline: 'Notes for small teams', category: 'code' }),
    );
  });

  it('rejects with an optional reason', async () => {
    productsApi.fetchProductQueue.mockResolvedValue([QUEUED]);
    renderApp('/admin/products');
    fireEvent.click(await screen.findByRole('button', { name: 'Reject…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject Acme Notes?' });
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Not a product' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(productsApi.decideBoard).toHaveBeenCalledWith({ id: ACME_ID, approve: false, reason: 'Not a product' }));
  });

  it('is a plain not-found page for everyone else', async () => {
    modApi.fetchIsPlatformAdmin.mockResolvedValue(false);
    renderApp('/admin/products');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(productsApi.fetchProductQueue).not.toHaveBeenCalled();
  });
});

describe('product notifications', () => {
  const base = { id: 'n1', target_type: 'board' as const, target_id: ACME_ID, post_id: null, read_at: null, created_at: iso(1), actor: null, post: null, quote: null, scope: null };
  it('say when a product went live, or why it did not', () => {
    const live = describeNotification({ ...base, kind: 'product', data: { status: 'approved', slug: 'acme-notes', name: 'Acme Notes' } }, TEST_VIEWER.id);
    expect(live.href).toBe('/b/acme-notes');
    const no = describeNotification({ ...base, kind: 'product', data: { status: 'rejected', slug: 'acme-notes', name: 'Acme Notes', reason: 'Duplicate' } }, TEST_VIEWER.id);
    const { container } = renderWith(<p>{no.text}</p>);
    expect(container.textContent).toBe('Acme Notes wasn’t approved: Duplicate');
  });
});
