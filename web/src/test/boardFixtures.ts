import type { Board, BoardWithHub, Hub } from '../api/boards';
import type { PostSummary } from '../api/posts';
import { BOARD, iso, SUPA } from './postFixtures';

/** Boards and hubs shaped like the api layer returns them (no Supabase in tests). */
export function makeBoard(over: Partial<Board> = {}): Board {
  return {
    id: BOARD.id,
    slug: BOARD.slug,
    name: BOARD.name,
    tagline: 'The AI code editor',
    site: 'cursor.com',
    color: BOARD.color,
    logo_path: null,
    category: 'code',
    hub_id: null,
    claimed_at: null,
    created_at: iso(24 * 60),
    follower_count: 4100,
    post_count: 92,
    status: 'live',
    created_by: null,
    ...over,
  };
}

export const CURSOR: BoardWithHub = { ...makeBoard(), hub: null };
export const SUPABASE: Board = makeBoard({
  id: SUPA.id,
  slug: SUPA.slug,
  name: SUPA.name,
  tagline: 'Postgres development platform',
  site: 'supabase.com',
  color: SUPA.color,
  category: 'dev',
  follower_count: 2700,
  post_count: 48,
});

const HUB_ID = 'f0000000-0000-4000-8000-000000000001';
export const FIGMA = makeBoard({ id: 'b0000000-0000-4000-8000-0000000000f1', slug: 'figma', name: 'Figma', tagline: 'Collaborative interface design', category: 'design', hub_id: HUB_ID, post_count: 5, follower_count: 30 });
export const FIGJAM = makeBoard({ id: 'b0000000-0000-4000-8000-0000000000f2', slug: 'figjam', name: 'FigJam', tagline: 'Online whiteboard for teams', category: 'design', hub_id: HUB_ID, post_count: 2, follower_count: 12 });

export const FIGMA_HUB: Hub = {
  id: HUB_ID,
  slug: 'figma',
  name: 'Figma',
  description: 'Figma, FigJam and Figma Slides in one place',
  primary_domain: 'figma.com',
  domains: ['figma.com'],
  claimed_at: null,
  created_at: iso(24 * 60),
  follower_count: 210,
  boards: [FIGJAM, FIGMA],
};

let n = 0;
export function makeSummary(over: Partial<PostSummary> = {}): PostSummary {
  n += 1;
  return {
    id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    board_id: BOARD.id,
    title: `Summary ${n}`,
    type: 'feature',
    status: 'planned',
    vote_count: 10,
    reply_count: 0,
    created_at: iso(10),
    board: BOARD,
    ...over,
  };
}
