import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { claimMeta, applyMeta } from '../../api/_lib/shareMeta';
import { buildSitemap, sitemapEntries } from '../../api/_lib/sitemap';
import { lookup } from '../../api/share';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClaimProvider } from '../claim/ClaimDialog';
import { CLAIM_INTRO } from '../claim/ClaimIntro';
import { claimHref } from '../lib/claimLink';
import { BoardPage } from '../pages/BoardPage';
import { CLAIM_COPY, ClaimPage } from '../pages/ClaimPage';
import { HubPage } from '../pages/HubPage';
import { ComposerProvider } from '../shell/composer';
import { LegalLinks } from '../shell/LegalLinks';
import { RightRail } from '../shell/RightRail';
import { CURSOR, FIGJAM, FIGMA, FIGMA_HUB, SUPABASE } from './boardFixtures';
import { renderWith, TEST_VIEWER } from './renderApp';

/*
 * #157: a signed-out visitor can learn how claiming works before signing up.
 * The /claim explainer, the claim intro modal its signed-out entry points open
 * (home pitch, board and hub headers, the right rail, the footer), and its
 * share tags.
 */

const boardsApi = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  fetchBoards: vi.fn(),
  fetchHub: vi.fn(),
  fetchHubs: vi.fn(),
  fetchPostCounts: vi.fn(),
  fetchTrending: vi.fn(),
  fetchIsBoardTeam: vi.fn(),
  fetchFollowedScopes: vi.fn(),
}));
const postsApi = vi.hoisted(() => ({
  fetchPostList: vi.fn(),
  fetchRoadmap: vi.fn(),
  fetchChangelog: vi.fn(),
}));
vi.mock('../api/boards', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/boards')>()), ...boardsApi }));
vi.mock('../api/posts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/posts')>()), ...postsApi }));

function renderAt(path: string, signedIn = false) {
  return renderWith(
    <ComposerProvider>
      <ClaimProvider>
        <Routes>
          <Route path="/claim" element={<ClaimPage />} />
          <Route path="/b/:board" element={<BoardPage />} />
          <Route path="/h/:hub" element={<HubPage />} />
          <Route path="/rail" element={<RightRail />} />
          <Route path="/footer" element={<LegalLinks />} />
        </Routes>
      </ClaimProvider>
    </ComposerProvider>,
    { viewer: signedIn ? TEST_VIEWER : null, path },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  boardsApi.fetchBoard.mockResolvedValue(CURSOR);
  boardsApi.fetchBoards.mockResolvedValue([CURSOR, FIGJAM, FIGMA, SUPABASE]);
  boardsApi.fetchHub.mockResolvedValue(FIGMA_HUB);
  boardsApi.fetchHubs.mockResolvedValue([FIGMA_HUB]);
  boardsApi.fetchPostCounts.mockResolvedValue({ posts: 0, roadmap: 0 });
  boardsApi.fetchTrending.mockResolvedValue([]);
  boardsApi.fetchIsBoardTeam.mockResolvedValue(false);
  boardsApi.fetchFollowedScopes.mockResolvedValue(new Set());
  postsApi.fetchPostList.mockResolvedValue({ items: [], next: null });
  postsApi.fetchRoadmap.mockResolvedValue({ planned: [], in_progress: [], shipped: [] });
  postsApi.fetchChangelog.mockResolvedValue([]);
});

describe('/claim explainer, signed out', () => {
  it('explains verification, team powers and what users get without an account', () => {
    renderAt('/claim');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(CLAIM_COPY.title);
    for (const h of [CLAIM_COPY.whoTitle, CLAIM_COPY.stepsTitle, CLAIM_COPY.teamTitle, CLAIM_COPY.usersTitle, CLAIM_COPY.takenTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: h })).toBeTruthy();
    }
    // Both proofs the flow accepts, with the real code length and expiry.
    expect(screen.getByText(/6-digit code/)).toBeTruthy();
    expect(screen.getByText(/expires in 10 minutes/)).toBeTruthy();
    expect(screen.getByText(/TXT record/)).toBeTruthy();
    expect(screen.getByText('Reply officially')).toBeTruthy();
    expect(screen.getByText('Set statuses')).toBeTruthy();
    expect(screen.getByText('Bring your teammates')).toBeTruthy();
    expect(screen.getByText('The board stays public')).toBeTruthy();
    // Nothing on the page asks for an account just to read it.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sets the tab title, description, share tags and canonical URL, and puts them back', () => {
    const { unmount } = renderAt('/claim');
    expect(document.title).toBe('How claiming works · Publisense');
    const meta = (sel: string) => document.head.querySelector(sel)?.getAttribute('content');
    expect(meta('meta[name="description"]')).toBe(CLAIM_COPY.metaDescription);
    expect(meta('meta[property="og:title"]')).toBe('How claiming works · Publisense');
    expect(meta('meta[property="og:url"]')).toBe('https://publisense.app/claim');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://publisense.app/claim');
    unmount();
    expect(document.title).toBe('Publisense');
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
  });

  it('the call to action opens sign-up with the claim reason; sign in is offered too', async () => {
    renderAt('/claim');
    const [cta] = screen.getAllByRole('button', { name: CLAIM_COPY.signUp });
    fireEvent.click(cta!);
    const dialog = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(dialog).getByText('Create an account to claim your product’s board. It takes a few seconds.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: CLAIM_COPY.signIn }).length).toBeGreaterThan(0);
  });

  it('?board= names the product and the domain to prove', async () => {
    renderAt('/claim?board=cursor');
    const note = (await screen.findByText(/you’ll prove you can use the/)).closest('p') as HTMLElement;
    expect(note.textContent).toContain('Cursor');
    expect(note.textContent).toContain('cursor.com');
    expect(within(note).getByRole('link', { name: 'Back to Cursor' }).getAttribute('href')).toBe('/b/cursor');
  });

  it('?board= on a claimed board points at join or report instead', async () => {
    boardsApi.fetchBoards.mockResolvedValue([{ ...CURSOR, claimed_at: '2026-10-01T00:00:00Z' }]);
    renderAt('/claim?board=cursor');
    expect(await screen.findByText(/is already claimed by a verified team/)).toBeTruthy();
  });
});

describe('/claim explainer, signed in', () => {
  it('starts the claim for the named board instead of sign-up', async () => {
    renderAt('/claim?board=cursor', true);
    expect((await screen.findAllByRole('button', { name: 'Claim Cursor' })).length).toBe(2);
    expect(screen.queryByRole('button', { name: CLAIM_COPY.signUp })).toBeNull();
    expect(screen.getByText(CLAIM_COPY.ctaSignedIn)).toBeTruthy();
  });

  it('without a product, offers the product picker', () => {
    renderAt('/claim', true);
    expect(screen.getAllByRole('button', { name: CLAIM_COPY.claim }).length).toBe(2);
  });
});

const introDialog = () => screen.findByRole('dialog', { name: CLAIM_INTRO.title });

describe('entry points', () => {
  it('board header, signed out: opens the claim intro modal for that board instead of navigating', async () => {
    const { router } = renderAt('/b/cursor');
    const link = await screen.findByRole('link', { name: 'Is this your product? Claim it' });
    // A real link to the full explainer underneath (new tab, no JS), announced as opening a dialog.
    expect(link.getAttribute('href')).toBe('/claim?board=cursor');
    expect(link.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(link);
    const dialog = await introDialog();
    expect(router.state.location.pathname).toBe('/b/cursor');
    expect((await within(dialog).findByTestId('claim-intro-note')).textContent).toBe('To claim Cursor, you’ll prove you can use the cursor.com domain.');
    expect(within(dialog).getByText(/6-digit code/)).toBeTruthy();
    expect(within(dialog).getByText(/TXT record/)).toBeTruthy();
    expect(within(dialog).getByText(/Verified team badge/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: CLAIM_INTRO.signUp })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: CLAIM_INTRO.signIn })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: CLAIM_INTRO.learnMore }).getAttribute('href')).toBe('/claim?board=cursor');
    expect(screen.queryByRole('dialog', { name: 'Create your account' })).toBeNull();
  });

  it('"Learn more" goes to the full /claim page for that board and closes the modal', async () => {
    const { router } = renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('link', { name: 'Is this your product? Claim it' }));
    fireEvent.click(within(await introDialog()).getByRole('link', { name: CLAIM_INTRO.learnMore }));
    expect(router.state.location.pathname).toBe('/claim');
    expect(router.state.location.search).toBe('?board=cursor');
    expect(await screen.findByRole('heading', { level: 1, name: CLAIM_COPY.title })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Escape closes the modal and puts focus back on the entry point', async () => {
    renderAt('/b/cursor');
    const link = await screen.findByRole('link', { name: 'Is this your product? Claim it' });
    link.focus();
    fireEvent.click(link);
    const dialog = await introDialog();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(link);
  });

  it('"Create an account to claim" swaps the modal for sign-up with the claim subtitle; focus returns to the entry point after', async () => {
    renderAt('/b/cursor');
    const link = await screen.findByRole('link', { name: 'Is this your product? Claim it' });
    link.focus();
    fireEvent.click(link);
    fireEvent.click(within(await introDialog()).getByRole('button', { name: CLAIM_INTRO.signUp }));
    const auth = await screen.findByRole('dialog', { name: 'Create your account' });
    expect(within(auth).getByText('Create an account to claim your product’s board. It takes a few seconds.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: CLAIM_INTRO.title })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(link);
  });

  it('"I have an account" opens sign-in with the same reason', async () => {
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('link', { name: 'Is this your product? Claim it' }));
    fireEvent.click(within(await introDialog()).getByRole('button', { name: CLAIM_INTRO.signIn }));
    const auth = await screen.findByRole('dialog');
    expect(auth.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(auth).getByText(/claim your product’s board/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: CLAIM_INTRO.title })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Create your account' })).toBeNull();
  });

  it('a modified click (new tab) is left to the browser: no modal', async () => {
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('link', { name: 'Is this your product? Claim it' }), { ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: CLAIM_INTRO.title })).toBeNull();
  });

  it('the modal says when the board is already claimed', async () => {
    boardsApi.fetchBoards.mockResolvedValue([{ ...CURSOR, claimed_at: 'Thu 2026-10-01 2:00 AM CAT (UTC+02:00)' }]);
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('link', { name: 'Is this your product? Claim it' }));
    const note = await within(await introDialog()).findByTestId('claim-intro-note');
    expect(note.textContent).toMatch(/^Cursor is already claimed by a verified team\. With an account you can ask to join it, or report it/);
  });

  it('the modal says when the board has no website to verify', async () => {
    boardsApi.fetchBoard.mockResolvedValue({ ...CURSOR, site: null });
    boardsApi.fetchBoards.mockResolvedValue([{ ...CURSOR, site: null }]);
    renderAt('/b/cursor');
    fireEvent.click(await screen.findByRole('link', { name: 'Is this your product? Claim it' }));
    const note = await within(await introDialog()).findByTestId('claim-intro-note');
    expect(note.textContent).toBe('Cursor has no website to verify yet, so it can’t be claimed for now.');
  });

  it('board header, signed in: still starts the claim directly', async () => {
    renderAt('/b/cursor', true);
    expect(await screen.findByRole('button', { name: 'Work at Cursor?' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Is this your product? Claim it' })).toBeNull();
  });

  it('hub header, signed out: opens the modal for that hub', async () => {
    const { router } = renderAt('/h/figma');
    const link = await screen.findByRole('link', { name: 'Is this your company? Claim it' });
    expect(link.getAttribute('href')).toBe('/claim?hub=figma');
    fireEvent.click(link);
    const dialog = await introDialog();
    expect(router.state.location.pathname).toBe('/h/figma');
    expect((await within(dialog).findByTestId('claim-intro-note')).textContent).toBe('To claim Figma, you’ll prove you can use the figma.com domain.');
    expect(within(dialog).getByRole('link', { name: CLAIM_INTRO.learnMore }).getAttribute('href')).toBe('/claim?hub=figma');
  });

  it('right rail, signed out: "Claim its board" opens the modal (no product off a board page)', async () => {
    const { router } = renderAt('/rail');
    const link = await screen.findByRole('link', { name: 'Claim its board' });
    expect(link.getAttribute('href')).toBe('/claim');
    fireEvent.click(link);
    const dialog = await introDialog();
    expect(router.state.location.pathname).toBe('/rail');
    expect(within(dialog).queryByTestId('claim-intro-note')).toBeNull();
    expect(within(dialog).getByRole('link', { name: CLAIM_INTRO.learnMore }).getAttribute('href')).toBe('/claim');
  });

  it('right rail, signed in: "Claim its board" still opens the flow', async () => {
    renderAt('/rail', true);
    expect(await screen.findByRole('button', { name: 'Claim its board' })).toBeTruthy();
  });

  it('footer, signed out: "Claim your board" opens the modal', async () => {
    const { router } = renderAt('/footer');
    const link = screen.getByRole('link', { name: 'Claim your board' });
    expect(link.getAttribute('href')).toBe('/claim');
    fireEvent.click(link);
    expect(await introDialog()).toBeTruthy();
    expect(router.state.location.pathname).toBe('/footer');
  });

  it('footer, signed in: still a plain link to the explainer', () => {
    renderAt('/footer', true);
    const link = screen.getByRole('link', { name: 'Claim your board' });
    expect(link.getAttribute('href')).toBe('/claim');
    expect(link.getAttribute('aria-haspopup')).toBeNull();
  });

  it('claimHref builds the links', () => {
    expect(claimHref()).toBe('/claim');
    expect(claimHref({ board: 'cursor' })).toBe('/claim?board=cursor');
    expect(claimHref({ hub: 'figma' })).toBe('/claim?hub=figma');
  });
});

describe('claim explainer copy', () => {
  const all = JSON.stringify(CLAIM_COPY);

  it('promises nothing the product does not do: no pricing, plans or integrations', () => {
    expect(all).not.toMatch(/\b(free|price|pricing|paid|plan|plans|trial|subscription|integration|slack|api|analytics)\b/i);
    expect(JSON.stringify(CLAIM_INTRO)).not.toMatch(/\b(free|price|pricing|paid|plan|plans|trial|subscription|integration|slack|api|analytics)\b/i);
  });

  it('the modal only shortens what the /claim page says', () => {
    const intro = CLAIM_INTRO.lines.map((l) => `${l.lead} ${l.text}`).join(' ');
    // Each fact in the modal, and where the full page states it.
    for (const fact of ['6-digit code', 'TXT record', 'gmail.com', 'domain of the product’s website']) {
      expect(intro).toContain(fact);
      expect(all).toContain(fact);
    }
    expect(intro).toContain('Verified team');
    expect(all).toContain('Verified team');
    expect(all).toContain('pinned to the top');
    expect(all).toContain('roadmap');
    expect(all).toContain('changelog');
    expect(all).toContain('an address on your domain');
    expect(intro).toContain('an address on your domain');
    expect(CLAIM_INTRO.signUp).toBe(CLAIM_COPY.signUp);
    expect(CLAIM_INTRO.signIn).toBe(CLAIM_COPY.signIn);
    expect(CLAIM_INTRO.lines.length).toBeLessThanOrEqual(4);
  });

  it('crawlers get the same title and description as the page', () => {
    const m = claimMeta();
    expect(m.description).toBe(CLAIM_COPY.metaDescription);
    expect(m.title).toBe(`${CLAIM_COPY.pageTitle} · Publisense`);
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const out = applyMeta(html, m);
    expect(out).toContain('<link rel="canonical" href="https://publisense.app/claim" />');
    expect(out).toContain('<title>How claiming works · Publisense</title>');
  });

  it('the share function answers /claim without a database', async () => {
    await expect(lookup('claim', 'claim')).resolves.toEqual(claimMeta());
  });

  it('vercel serves /claim to people and crawlers, and the sitemap lists it', () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as { rewrites: Array<{ source: string; destination: string; has?: unknown }> };
    const rules = vercel.rewrites.filter((r) => r.source === '/claim');
    expect(rules.find((r) => r.has)?.destination).toBe('/api/share?kind=claim&key=claim');
    expect(rules.find((r) => !r.has)?.destination).toBe('/index.html');
    // The crawler rule must come first, or people's rule would catch crawlers too.
    expect(rules[0]?.has).toBeTruthy();
    expect(buildSitemap(sitemapEntries({ boards: [], hubs: [], posts: [] }))).toContain('<loc>https://publisense.app/claim</loc>');
  });
});

describe('routes', () => {
  it('waits for nothing: the page renders before boards load', async () => {
    boardsApi.fetchBoards.mockReturnValue(new Promise(() => {}));
    renderAt('/claim?board=cursor');
    expect(screen.getByRole('heading', { level: 1, name: CLAIM_COPY.title })).toBeTruthy();
    await waitFor(() => expect(boardsApi.fetchBoards).toHaveBeenCalled());
  });
});
