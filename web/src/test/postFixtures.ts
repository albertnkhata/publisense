import type { Post, Reply } from '../api/posts';
import { TEST_VIEWER } from './renderApp';
import fixtures from '../dev/fixtures.json';

const colorOf = (name: string) => fixtures.boards.find((b) => b.name === name)?.color ?? '';

/** Sample rows shaped like the api layer returns them (no Supabase in tests). */
const H = 3600_000;
export const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString();

export const BOARD = { id: 'b0000000-0000-4000-8000-000000000001', slug: 'cursor', name: 'Cursor', color: colorOf('Cursor'), logo_path: null };
export const SUPA = { id: 'b0000000-0000-4000-8000-000000000002', slug: 'supabase', name: 'Supabase', color: colorOf('Supabase'), logo_path: null };
export const OTHER = { id: '00000000-0000-4000-8000-0000000000bb', handle: 'jmwamba', name: 'J Mwamba', avatar_path: null };
export const ME = { id: TEST_VIEWER.id, handle: TEST_VIEWER.handle, name: TEST_VIEWER.name, avatar_path: null };

let n = 0;
export function makePost(over: Partial<Post> = {}): Post {
  n += 1;
  const id = over.id ?? `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    board_id: BOARD.id,
    author_id: OTHER.id,
    source_url: null,
    type: 'bug',
    status: 'open',
    title: `Post number ${n}`,
    body: 'Body text',
    merged_into: null,
    hidden_at: null,
    edited_at: null,
    created_at: iso(4),
    vote_count: 10,
    reply_count: 0,
    author: OTHER,
    board: BOARD,
    voted: false,
    following: false,
    official: null,
    ...over,
  };
}

export function makeReply(post: Post, over: Partial<Reply> = {}): Reply {
  n += 1;
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    post_id: post.id,
    parent_id: null,
    author_id: OTHER.id,
    body: `Reply ${n}`,
    is_official: false,
    hidden_at: null,
    edited_at: null,
    created_at: iso(2),
    author: OTHER,
    ...over,
  };
}
