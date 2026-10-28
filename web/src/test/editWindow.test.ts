import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editLockReason, editWindowLabel, POST_EDIT_WINDOW_MINUTES, replyEditLockReason } from '../api/posts';

/* The author edit window (0045): one setting in the database, mirrored here. */

const MIN = 60_000;
const now = new Date('2026-10-27T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN).toISOString();

describe('edit window', () => {
  it('is 1 hour today', () => {
    expect(POST_EDIT_WINDOW_MINUTES).toBe(60);
    expect(editWindowLabel()).toBe('1 hour');
    expect(editWindowLabel(30)).toBe('30 minutes');
    expect(editWindowLabel(120)).toBe('2 hours');
  });

  it('lets the author edit inside the window only', () => {
    expect(editLockReason({ status: 'open', created_at: ago(5) }, now)).toBeNull();
    expect(editLockReason({ status: 'planned', created_at: ago(59) }, now)).toBeNull();
    expect(editLockReason({ status: 'open', created_at: ago(61) }, now)).toBe('Editing closes 1 hour after posting');
  });

  it('never once Shipped, Closed or Merged', () => {
    expect(editLockReason({ status: 'shipped', created_at: ago(1) }, now)).toBe('Can’t edit once it’s Shipped');
    expect(editLockReason({ status: 'closed', created_at: ago(1) }, now)).toBe('Can’t edit once it’s Closed');
    expect(editLockReason({ status: 'merged', created_at: ago(1) }, now)).toBe('Merged posts can’t be edited');
  });

  it('reply rules (0051): community replies for the window, official replies while open, none once locked', () => {
    const community = (minutes: number) => ({ is_official: false, created_at: ago(minutes) });
    const official = (minutes: number) => ({ is_official: true, created_at: ago(minutes) });
    expect(replyEditLockReason(community(5), { status: 'open' }, now)).toBeNull();
    expect(replyEditLockReason(community(61), { status: 'planned' }, now)).toBe('Editing closes 1 hour after posting');
    expect(replyEditLockReason(official(3 * 24 * 60), { status: 'in_progress' }, now)).toBeNull();
    expect(replyEditLockReason(official(1), { status: 'shipped' }, now)).toBe('Can’t edit once the post is Shipped');
    expect(replyEditLockReason(community(1), { status: 'closed' }, now)).toBe('Can’t edit once the post is Closed');
    expect(replyEditLockReason(official(1), { status: 'merged' }, now)).toBe('Can’t edit: the post was merged');
  });

  it('matches the latest public.v2_post_edit_window() in supabase/migrations', () => {
    const dir = resolve(__dirname, '../../../supabase/migrations');
    let latest: string | null = null;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(dir, f), 'utf8');
      const m = /function public\.v2_post_edit_window\(\)[\s\S]*?interval '([^']+)'/.exec(sql);
      if (m?.[1]) latest = m[1];
    }
    expect(latest).not.toBeNull();
    const [n, unit] = (latest ?? '').trim().split(/\s+/);
    const minutes = Number(n) * (/^hour/.test(unit ?? '') ? 60 : /^min/.test(unit ?? '') ? 1 : NaN);
    expect(minutes).toBe(POST_EDIT_WINDOW_MINUTES);
  });
});
