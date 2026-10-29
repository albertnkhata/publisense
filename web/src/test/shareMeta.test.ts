import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMeta, boardMeta, hubMeta, isCrawler, postMeta, shareTarget } from '../../api/_lib/shareMeta';
import { slowDown } from '../api/posts';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

describe('link previews', () => {
  it('ships site-wide share tags with the 1200x630 image', () => {
    expect(html).toContain('<meta property="og:image" content="https://publisense.app/og.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('only rewrites for crawlers', () => {
    expect(isCrawler('Twitterbot/1.0')).toBe(true);
    expect(isCrawler('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isCrawler('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) Chrome/129 Mobile Safari/537.36')).toBe(false);
  });

  it('knows which pages preview a record', () => {
    expect(shareTarget('/b/cursor')).toEqual({ kind: 'board', key: 'cursor' });
    expect(shareTarget('/h/figma/')).toEqual({ kind: 'hub', key: 'figma' });
    expect(shareTarget('/b/cursor/manage')).toBeNull();
    expect(shareTarget('/post/not-a-uuid')).toBeNull();
    expect(shareTarget('/post/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')?.kind).toBe('post');
  });

  it('rewrites title, description, url and escapes', () => {
    const out = applyMeta(html, boardMeta({ slug: 'cursor', name: 'Cursor "AI"', tagline: 'The AI code editor' }));
    expect(out).toContain('<title>Cursor &quot;AI&quot; feedback · Publisense</title>');
    expect(out).toContain('<meta property="og:url" content="https://publisense.app/b/cursor" />');
    expect(out).toContain('<link rel="canonical" href="https://publisense.app/b/cursor" />');
    expect(out).toMatch(/og:description" content="The AI code editor\. See what people/);
    expect(out).toMatch(/<meta property="og:image" content="https:\/\/publisense\.app\/api\/og\?kind=board&amp;key=cursor&amp;v=[a-z0-9]+" \/>/);
    expect(out).toMatch(/<meta name="twitter:image" content="https:\/\/publisense\.app\/api\/og\?kind=board/);
    expect(out).toContain('og:image:alt" content="Cursor &quot;AI&quot; on Publisense"');
  });

  it('gives each post its own preview image, versioned by title and status', () => {
    const a = postMeta({ id: 'p1', title: 'Dark mode', status: 'open', board: { name: 'Linear' } });
    const b = postMeta({ id: 'p1', title: 'Dark mode', status: 'planned', board: { name: 'Linear' } });
    expect(a.image?.path).toMatch(/^\/api\/og\?kind=post&key=p1&v=[a-z0-9]+$/);
    expect(a.image?.alt).toBe('Dark mode · Linear');
    expect(a.image?.path).not.toBe(b.image?.path);
    expect(applyMeta(html, a)).toContain('og:image" content="https://publisense.app/api/og?kind=post&amp;key=p1');
  });

  it('keeps the site image for hubs', () => {
    const out = applyMeta(html, hubMeta({ slug: 'figma', name: 'Figma' }));
    expect(out).toContain('og:image" content="https://publisense.app/og.png"');
  });

  it('clips long post bodies', () => {
    const m = postMeta({ id: 'x', title: 'Dark mode', body: 'a '.repeat(300), board: { name: 'Linear' } });
    expect(m.title).toBe('Dark mode · Linear · Publisense');
    expect(m.description.length).toBeLessThanOrEqual(200);
    expect(m.description.endsWith('…')).toBe(true);
  });
});

describe('rate limit words', () => {
  it('says short break or tomorrow', () => {
    expect(slowDown({ hint: 'short' }, 'posts')).toMatch(/short break/);
    expect(slowDown({ hint: 'day' }, 'upvotes')).toBe('You’ve hit today’s limit for upvotes. Try again tomorrow.');
  });
});

describe('merged post previews (0043)', () => {
  it('a merged post keeps its own page but points canonical and og:url at the surviving post', () => {
    const m = postMeta({
      id: 'dup',
      title: 'Composer drops edits',
      body: 'old body',
      board: { name: 'Cursor' },
      status: 'merged',
      merged_into: 'orig',
      merged: { id: 'orig', title: 'Caret lost after rebase' },
    });
    expect(m.path).toBe('/post/dup');
    expect(m.canonicalPath).toBe('/post/orig');
    expect(m.description).toBe('Merged into “Caret lost after rebase”. Votes and followers moved there.');
    const out = applyMeta(html, m);
    expect(out).toContain('<link rel="canonical" href="https://publisense.app/post/orig" />');
    expect(out).toContain('<meta property="og:url" content="https://publisense.app/post/orig" />');
  });

  it('a live post is its own canonical', () => {
    const m = postMeta({ id: 'p1', title: 'Dark mode', status: 'open', merged_into: null });
    expect(m.canonicalPath).toBeUndefined();
    expect(applyMeta(html, m)).toContain('<link rel="canonical" href="https://publisense.app/post/p1" />');
  });
});
