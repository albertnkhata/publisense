/**
 * Pure rules for account deletion, shared by the Edge Function and the web
 * tests (web/src/test/avatar.test.ts imports this file). No Deno or Supabase
 * imports, so it runs anywhere.
 */
export interface MembershipRow {
  user_id: string;
  scope: 'board' | 'hub';
  scope_id: string;
  role: 'owner' | 'admin' | 'member';
}

/**
 * Scopes where `userId` is the only owner (FOUNDATION section 8: delete account is
 * blocked while sole owner; 0017's v2_guard_last_owner trigger is the backstop).
 */
export function soleOwnedScopes(userId: string, rows: MembershipRow[]): Array<{ scope: 'board' | 'hub'; scope_id: string }> {
  return rows
    .filter((m) => m.user_id === userId && m.role === 'owner')
    .filter((m) => !rows.some((o) => o.role === 'owner' && o.user_id !== userId && o.scope === m.scope && o.scope_id === m.scope_id))
    .map(({ scope, scope_id }) => ({ scope, scope_id }));
}

/** CORS for supabase.functions.invoke from the browser. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
