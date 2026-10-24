import { useQuery } from '@tanstack/react-query';
import { getSupabase } from './supabase';

/*
 * Account-level operations: export my data, and delete my account through the
 * `delete-account` Edge Function (the only server-side holder of the service-role key;
 * docs/deferred.md D-002).
 */

// ------------------------------------------------------------------ deletion blockers

export interface OwnedScope {
  scope: 'board' | 'hub';
  id: string;
  name: string;
}

interface MembershipRow {
  user_id: string;
  scope: 'board' | 'hub';
  scope_id: string;
  role: 'owner' | 'admin' | 'member';
}

/**
 * Scopes where `userId` is the only owner. Pure, so the same rule the Edge
 * Function enforces can be tested here (supabase/functions/delete-account/rules.ts).
 */
export function soleOwnedScopes(userId: string, owners: MembershipRow[]): Array<Pick<MembershipRow, 'scope' | 'scope_id'>> {
  const mine = owners.filter((m) => m.user_id === userId && m.role === 'owner');
  return mine
    .filter((m) => !owners.some((o) => o.role === 'owner' && o.user_id !== userId && o.scope === m.scope && o.scope_id === m.scope_id))
    .map(({ scope, scope_id }) => ({ scope, scope_id }));
}

/**
 * The boards and hubs that block deletion (FOUNDATION §8: blocked while sole
 * owner). RLS lets a team member read their fellow members, so this needs no RPC.
 * The Edge Function checks again; this only explains the refusal up front.
 */
export async function fetchDeletionBlockers(userId: string): Promise<OwnedScope[]> {
  const sb = getSupabase();
  const mine = await sb.from('membership').select('user_id, scope, scope_id, role').eq('user_id', userId).eq('role', 'owner');
  if (mine.error) throw mine.error;
  const owned = (mine.data ?? []) as MembershipRow[];
  if (!owned.length) return [];
  const others = await sb
    .from('membership')
    .select('user_id, scope, scope_id, role')
    .eq('role', 'owner')
    .in('scope_id', owned.map((m) => m.scope_id));
  if (others.error) throw others.error;
  const sole = soleOwnedScopes(userId, [...owned, ...((others.data ?? []) as MembershipRow[])]);
  if (!sole.length) return [];
  const names = new Map<string, string>();
  for (const scope of ['board', 'hub'] as const) {
    const ids = sole.filter((s) => s.scope === scope).map((s) => s.scope_id);
    if (!ids.length) continue;
    const { data } = await sb.from(scope).select('id, name').in('id', ids);
    for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(r.id, r.name);
  }
  return sole.map((s) => ({ scope: s.scope, id: s.scope_id, name: names.get(s.scope_id) ?? `a ${s.scope}` }));
}

export function useDeletionBlockers(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['account', 'deletion-blockers', userId ?? 'none'],
    queryFn: () => fetchDeletionBlockers(userId as string),
    enabled: Boolean(userId) && enabled,
    staleTime: 0,
  });
}

export type DeleteResult = { ok: true } | { ok: false; reason: 'sole_owner' | 'last_platform_admin' | 'failed'; scopes?: OwnedScope[] };

/** Calls the Edge Function with the caller's JWT (supabase-js attaches it). */
export async function deleteAccount(): Promise<DeleteResult> {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('delete-account', { method: 'POST', body: {} });
  if (!error && (data as { ok?: boolean } | null)?.ok) {
    await sb.auth.signOut({ scope: 'local' });
    return { ok: true };
  }
  let body: { error?: string; scopes?: OwnedScope[] } | null = null;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      body = await ctx.json();
    } catch {
      body = null;
    }
  }
  if (body?.error === 'sole_owner') return { ok: false, reason: 'sole_owner', scopes: body.scopes ?? [] };
  if (body?.error === 'last_platform_admin') return { ok: false, reason: 'last_platform_admin' };
  return { ok: false, reason: 'failed' };
}

// ------------------------------------------------------------------ export

/** Every v2 table that holds rows about the caller, and the column naming them. */
export const EXPORT_TABLES = [
  ['profile', 'id'],
  ['post', 'author_id'],
  ['reply', 'author_id'],
  ['vote', 'user_id'],
  ['follow', 'user_id'],
  ['notification', 'recipient'],
  ['notification_pref', 'user_id'],
  ['membership', 'user_id'],
  ['join_request', 'user_id'],
  ['ownership_dispute', 'user_id'],
  ['report', 'reporter'],
] as const;

export interface DataExport {
  exported_at: string;
  account: { id: string; email: string | null; created_at: string | null };
  [table: string]: unknown;
}

/** Reads only what RLS already lets the caller read, then bundles it. */
export async function exportMyData(): Promise<DataExport> {
  const sb = getSupabase();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error('not signed in');
  const out: DataExport = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null },
  };
  const results = await Promise.all(EXPORT_TABLES.map(([table, col]) => sb.from(table).select('*').eq(col, user.id)));
  EXPORT_TABLES.forEach(([table], i) => {
    const r = results[i];
    if (r?.error) throw r.error;
    out[table] = r?.data ?? [];
  });
  return out;
}

/** Hand the export to the browser as a JSON file. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
