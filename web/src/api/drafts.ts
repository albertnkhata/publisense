import { getSupabase } from './supabase';
import type { BoardRef, Platform, PostType } from './posts';

/*
 * Saved post drafts (0061): owner-only rows, up to 20 per person, listed newest
 * first under Drafts in the composer. Posting or deleting one removes it.
 */

export const DRAFTS_MAX = 20;

export interface SavedDraft {
  id: string;
  board: BoardRef | null;
  type: PostType | null;
  platform: Platform | null;
  title: string;
  body: string;
  images: string[];
  updated_at: string;
}

export interface DraftFields {
  boardId: string | null;
  type: PostType | null;
  platform: Platform | null;
  title: string;
  body: string;
  images: string[];
}

const DRAFT_SELECT = 'id, type, platform, title, body, images, updated_at, board:board_id (id, slug, name, color, logo_path, status)';

export async function fetchDrafts(): Promise<SavedDraft[]> {
  const { data, error } = await getSupabase()
    .from('post_draft')
    .select(DRAFT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(DRAFTS_MAX);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SavedDraft[];
}

/** Insert (no id) or update a draft; returns its id. */
export async function saveDraft(id: string | null, d: DraftFields): Promise<string> {
  const row = { board_id: d.boardId, type: d.type, platform: d.platform, title: d.title, body: d.body, images: d.images };
  const sb = getSupabase();
  if (id) {
    const { data, error } = await sb.from('post_draft').update(row).eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return (data as { id: string }).id;
    // Deleted elsewhere: save it as a new one.
  }
  const { data, error } = await sb.from('post_draft').insert(row).select('id').single();
  if (error) throw new Error(error.hint === 'draft_limit' ? `You can keep up to ${DRAFTS_MAX} drafts. Delete one to save this.` : error.message);
  return (data as { id: string }).id;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await getSupabase().from('post_draft').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
