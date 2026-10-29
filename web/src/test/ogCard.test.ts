import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clipTitle, ogCard, postMetaLine, titleSize, type El } from '../../api/_lib/ogCard';
import { cardData } from '../../api/_lib/ogData';

const text = (e: El | string): string =>
  typeof e === 'string' ? e : ([] as Array<El | string>).concat(e.props.children ?? []).map(text).join(' ');
const find = (e: El | string, type: string): El | null => {
  if (typeof e === 'string') return null;
  if (e.type === type) return e;
  for (const c of ([] as Array<El | string>).concat(e.props.children ?? [])) {
    const f = find(c, type);
    if (f) return f;
  }
  return null;
};

describe('ogCard', () => {
  const data = { title: 'Dark mode', board: 'Linear', logoUrl: 'https://cdn/x.png', color: '#5E6AD2', meta: 'Planned · 12 upvotes' };

  it('leads with the product logo, name and the post title', () => {
    const card = ogCard(data);
    expect(card.props.style).toMatchObject({ width: 1200, height: 630 });
    expect(find(card, 'img')?.props.src).toBe('https://cdn/x.png');
    expect(text(card)).toContain('Linear');
    expect(text(card)).toContain('Planned · 12 upvotes');
    expect(text(card)).toContain('Dark mode');
  });

  it('shows the post body under the title', () => {
    const card = ogCard({ ...data, detail: 'Linear is too bright at night.\n\nPlease add a dark theme.' });
    expect(text(card)).toContain('Linear is too bright at night. Please add a dark theme.');
    expect(text(ogCard(data))).not.toContain('bright');
  });

  it('falls back to a coloured initial when the board has no logo', () => {
    const card = ogCard({ ...data, logoUrl: null });
    expect(find(card, 'img')).toBeNull();
    expect(text(card)).toContain('L');
  });

  it('sizes and clips titles to fit', () => {
    expect(titleSize('short')).toBeGreaterThan(titleSize('x'.repeat(120)));
    expect(clipTitle('word '.repeat(60)).length).toBeLessThanOrEqual(140);
    expect(postMetaLine('in_progress', 1)).toBe('In progress · 1 upvote');
  });
});

describe('cardData', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('builds a post card with the board logo from public storage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { title: 'Tip mid-delivery', status: 'open', vote_count: 3, board: { name: 'Instacart', color: '#43B02A', logo_path: 'a/b.png' } },
    ]))));
    expect(await cardData('post', '9b9e77de-b738-4c3e-aafc-f372be77115e')).toEqual({
      title: 'Tip mid-delivery',
      board: 'Instacart',
      logoUrl: 'https://example.supabase.co/storage/v1/object/public/board-logos/a/b.png',
      color: '#43B02A',
      meta: 'Open · 3 upvotes',
      detail: null,
    });
  });

  it('answers null for keys that cannot name a page, and for pages the public cannot see', async () => {
    const f = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', f);
    expect(await cardData('post', 'nope')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await cardData('board', 'cursor')).toBeNull();
  });
});
