/** What a preview image shows for a post or board, read with the public anon key. No rendering here, so it is unit tested. */
import { postMetaLine, type OgCardData } from './ogCard.js';

export async function cardData(kind: string, key: string): Promise<OgCardData | null> {
  const base = (process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anon = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!base || !anon) return null;
  const k = encodeURIComponent(key);
  const q =
    kind === 'post' && /^[0-9a-f-]{36}$/i.test(key)
      ? `post?select=title,body,status,vote_count,board(name,color,logo_path)&id=eq.${k}&hidden_at=is.null&limit=1`
      : kind === 'board' && /^[a-z0-9-]{1,80}$/i.test(key)
        ? `board?select=name,tagline,color,logo_path,post_count&slug=eq.${k}&status=eq.live&limit=1`
        : kind === 'user' && /^@?[a-z0-9_]{3,30}$/i.test(key)
          ? `profile?select=handle,name,bio,avatar_path,follower_count&handle=eq.${encodeURIComponent(key.replace(/^@/, '').toLowerCase())}&limit=1`
          : null;
  if (!q) return null;
  const r = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(2000) });
  if (!r.ok) return null;
  const row = ((await r.json()) as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  const logo = (path: unknown) =>
    typeof path === 'string' && path ? `${base}/storage/v1/object/public/board-logos/${path.split('/').map(encodeURIComponent).join('/')}` : null;

  if (kind === 'post') {
    const board = (row.board ?? null) as { name: string; color: string; logo_path: string | null } | null;
    return {
      title: String(row.title ?? ''),
      board: board?.name ?? 'Publisense',
      logoUrl: logo(board?.logo_path),
      color: board?.color ?? '#0047AB',
      meta: postMetaLine(String(row.status ?? 'open'), Number(row.vote_count ?? 0)),
      detail: typeof row.body === 'string' && row.body.trim() ? row.body.replace(/\s+/g, ' ').trim() : null,
    };
  }
  if (kind === 'user') {
    const handle = String(row.handle ?? '');
    const name = String(row.name ?? '').trim();
    const followers = Number(row.follower_count ?? 0);
    const avatar = typeof row.avatar_path === 'string' && row.avatar_path
      ? `${base}/storage/v1/object/public/avatars/${row.avatar_path.split('/').map(encodeURIComponent).join('/')}`
      : null;
    const bio = String(row.bio ?? '').replace(/\s+/g, ' ').trim();
    return {
      title: bio || `Feedback from ${name || '@' + handle} on Publisense`,
      board: name || `@${handle}`,
      logoUrl: avatar,
      color: '#0047AB',
      meta: `@${handle} · ${followers} ${followers === 1 ? 'follower' : 'followers'}`,
      round: true,
      quiet: Boolean(bio),
    };
  }
  const posts = Number(row.post_count ?? 0);
  return {
    title: String(row.tagline ?? '') || `Feedback for ${String(row.name)}`,
    board: String(row.name ?? ''),
    logoUrl: logo(row.logo_path),
    color: String(row.color ?? '#0047AB'),
    meta: `Feedback board · ${posts} ${posts === 1 ? 'post' : 'posts'}`,
  };
}
