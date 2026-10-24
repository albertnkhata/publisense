// Supabase Edge Function: delete-account (Deno).
//
// The first and only server-side user of the service_role key (docs/deferred.md
// D-002). The key is read from the function's environment, which Supabase injects
// at runtime; it is never in the repo and never in a client bundle.
//
//   1. Verify the caller's JWT with the auth server (no JWT, no deletion).
//   2. Refuse while the caller is the sole owner of any board or hub
//      (FOUNDATION section 8; 0017's v2_guard_last_owner trigger is the backstop).
//   3. Refuse while the caller is the last platform admin.
//   4. Remove the caller's avatar objects through the Storage API, and follows
//      that point at the caller (they have no foreign key to cascade from).
//   5. Delete the auth user. profile, votes, follows, notifications, prefs,
//      memberships and email_token cascade; posts, replies and status events keep
//      their rows with the author set to null ("deleted user").
//
// Deploy (not done by CI):
//   supabase functions deploy delete-account --project-ref wyjfgrgxmhumyzwcrywj
// Keep JWT verification on (the default). The web app calls it through
// supabase.functions.invoke('delete-account'), which sends the user's JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS_HEADERS, json, soleOwnedScopes, type MembershipRow } from './rules.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('delete-account: SUPABASE_URL or the service role key is not set');
    return json(500, { error: 'not_configured' });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1. Who is asking? getUser(jwt) asks the auth server, so a forged, expired or
  //    anon token is refused here even if gateway verification were turned off.
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) return json(401, { error: 'unauthorized' });
  const uid = user.id;

  // 2. Sole owner of anything?
  const mine = await admin.from('membership').select('user_id, scope, scope_id, role').eq('user_id', uid).eq('role', 'owner');
  if (mine.error) return failed('membership read', mine.error);
  const owned = (mine.data ?? []) as MembershipRow[];
  if (owned.length) {
    const others = await admin
      .from('membership')
      .select('user_id, scope, scope_id, role')
      .eq('role', 'owner')
      .in('scope_id', owned.map((m) => m.scope_id));
    if (others.error) return failed('owners read', others.error);
    const sole = soleOwnedScopes(uid, [...owned, ...((others.data ?? []) as MembershipRow[])]);
    if (sole.length) {
      const scopes = [];
      for (const s of sole) {
        const { data } = await admin.from(s.scope).select('name').eq('id', s.scope_id).maybeSingle();
        scopes.push({ scope: s.scope, id: s.scope_id, name: (data as { name?: string } | null)?.name ?? s.scope });
      }
      return json(409, { error: 'sole_owner', scopes });
    }
  }

  // 3. The last platform admin cannot leave (FOUNDATION section 6).
  const staff = await admin.from('platform_admin').select('user_id');
  if (staff.error) return failed('platform_admin read', staff.error);
  const admins = (staff.data ?? []) as Array<{ user_id: string }>;
  if (admins.some((a) => a.user_id === uid) && admins.length === 1) return json(409, { error: 'last_platform_admin' });

  // 4. Storage objects first: Supabase refuses to delete a user who still owns objects.
  const bucket = admin.storage.from('avatars');
  for (;;) {
    const { data: files, error } = await bucket.list(uid, { limit: 100 });
    if (error) return failed('avatar list', error);
    if (!files?.length) break;
    const { error: rmError } = await bucket.remove(files.map((f) => `${uid}/${f.name}`));
    if (rmError) return failed('avatar remove', rmError);
    if (files.length < 100) break;
  }
  const follows = await admin.from('follow').delete().eq('target', 'user').eq('target_id', uid);
  if (follows.error) return failed('follow cleanup', follows.error);

  // 5. Delete the auth user; the v2 tables cascade from profile.
  const { error: delError } = await admin.auth.admin.deleteUser(uid);
  if (delError) return failed('deleteUser', delError);

  return json(200, { ok: true });
});

function failed(step: string, error: { message?: string }): Response {
  // Log the step and the message only: never the token or the key.
  console.error(`delete-account: ${step} failed: ${error.message ?? 'unknown error'}`);
  return json(500, { error: 'failed' });
}
