#!/usr/bin/env node
/**
 * Live smoke test: signs a throwaway user in, exercises the real RLS policies on
 * the production project, then removes every row it created and asserts the
 * tables are back to their starting counts.
 *
 * This exists because the auth/RLS work was verified by hand, repeatedly, in PR
 * #14, #16, #24, #25, #29 and #32 — real requests, but nothing a machine could
 * repeat. It is not a substitute for a test database; it is a canary that runs
 * against production on purpose, with a hard requirement that it leaves no trace.
 *
 * Usage:  npm run smoke:live            (cleans up)
 *         npm run smoke:live -- --keep  (leaves the user behind for inspection)
 *
 * Credentials: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
 * read from the environment first, then from .env / .env.local and the local
 * secrets file. Nothing is printed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const KEEP = process.argv.includes('--keep');
const SECRETS = '/root/.hermes/profiles/saul/cache/secrets/publisense_service_role';

function envFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const local = { ...envFile('.env'), ...envFile('.env.local') };
const url = process.env.SUPABASE_URL || local.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || local.VITE_SUPABASE_ANON_KEY;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (existsSync(SECRETS) ? readFileSync(SECRETS, 'utf8').trim() : undefined);

if (!url || !anonKey || !serviceKey) {
  console.error('missing credentials: need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  const mark = ok ? '\u2713' : '\u2717';
  console.log(`  ${mark} ${name}${detail ? ` \u2014 ${detail}` : ''}`);
}

async function counts() {
  const out = {};
  for (const table of ['posts', 'post_votes', 'comments', 'profiles']) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    out[table] = count;
  }
  return out;
}

const stamp = Date.now();
const email = `smoke+${stamp}@publisense.invalid`;
const password = `Sm0ke-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
let userId = null;
let postId = null;
let baseline = null;

async function cleanup() {
  if (KEEP) {
    console.log(`\n  --keep set: leaving ${email} (user ${userId}) in place`);
    return;
  }
  if (postId) await admin.from('posts').delete().eq('id', postId);
  if (userId) {
    await admin.from('post_votes').delete().eq('user_id', userId);
    await admin.from('comments').delete().eq('author_id', userId);
    await admin.from('posts').delete().eq('author_id', userId);
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

// ---------------------------------------------------------------------------

console.log(`\nLive smoke test against ${url}`);
console.log(`Throwaway identity: ${email}\n`);

try {
  baseline = await counts();
  console.log(`Baseline: ${JSON.stringify(baseline)}\n`);
  console.log('Identity');

  // 1. A user can be created and their profile is provisioned by trigger.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Smoke Test' },
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  userId = created.data.user.id;
  check('admin can create a confirmed user', Boolean(userId), userId.slice(0, 8) + '…');

  const profile = await admin.from('profiles').select('id, handle, role').eq('id', userId).maybeSingle();
  check('signup trigger provisions a profile row', Boolean(profile.data), profile.data?.handle);
  check('provisioned profile is a plain user, not staff', profile.data?.role === 'user', `role=${profile.data?.role}`);

  // 2. Password sign-in works with the anon key, as the browser would.
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`signInWithPassword: ${session.error.message}`);
  const selfId = session.data.user.id;
  check('password sign-in returns a session', Boolean(session.data.session?.access_token), 'token present');
  check('session identity matches the created user', selfId === userId);

  // 3. A seeded post belonging to somebody else, for the vote and delete tests.
  const other = await admin.from('posts').select('id, author_id').neq('author_id', userId).limit(1).maybeSingle();
  if (other.error) throw new Error(`seed lookup: ${other.error.message}`);

  console.log('\nWriting');

  // product_id is NOT NULL, so borrow one from an existing post.
  const anyPost = await admin.from('posts').select('product_id').limit(1).maybeSingle();
  const productId = anyPost.data?.product_id;
  if (!productId) throw new Error('no seeded product to attach a smoke post to');

  // 4. Authenticated insert is allowed when the author is the caller.
  const created4 = await anon
    .from('posts')
    .insert({
      product_id: productId,
      author_id: selfId,
      title: `smoke test ${stamp}`,
      body: 'created by scripts/smoke-live.mjs; safe to delete',
      type: 'bug', // posts_type_check allows bug|feature|ux|performance|pricing
    })
    .select('id')
    .maybeSingle();
  if (created4.error) throw new Error(`own post insert: ${created4.error.message}`);
  postId = created4.data.id;
  check('authenticated user can create a post as themselves', Boolean(postId), postId);

  // 5. Impersonation must be refused by the policy's WITH CHECK.
  const spoof = await anon
    .from('posts')
    .insert({
      product_id: productId,
      author_id: other.data?.author_id || 'usr-albert',
      title: 'spoofed author',
      body: 'should never land',
      type: 'bug',
    })
    .select('id')
    .maybeSingle();
  check('cannot create a post under another user’s id', Boolean(spoof.error), spoof.error?.code || 'no error!');

  // 6. Voting: allowed for self, and a second vote cannot stack.
  if (other.data) {
    const vote1 = await anon.from('post_votes').insert({ post_id: other.data.id, user_id: selfId });
    check('can vote on a post', !vote1.error, vote1.error?.message || 'ok');
    const vote2 = await anon.from('post_votes').insert({ post_id: other.data.id, user_id: selfId });
    check('cannot vote twice on the same post', Boolean(vote2.error), vote2.error?.code || 'no error!');
    const spoofVote = await anon.from('post_votes').insert({ post_id: other.data.id, user_id: other.data.author_id });
    check('cannot vote on behalf of another user', Boolean(spoofVote.error), spoofVote.error?.code || 'no error!');
  }

  // 7. Editing yourself is allowed; self-promotion is not.
  const bio = await anon.from('profiles').update({ bio: 'smoke test' }).eq('id', selfId).select('bio').maybeSingle();
  check('can edit own profile', bio.data?.bio === 'smoke test', bio.error?.message || 'ok');

  const escalate = await anon.from('profiles').update({ role: 'admin' }).eq('id', selfId).select('role').maybeSingle();
  const afterRole = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  check('cannot promote self to admin', afterRole.data?.role === 'user', `role=${afterRole.data?.role}${escalate.error ? '' : ' (update silently allowed!)'}`);

  // 8. Deleting somebody else's post must not happen — proven by survival, not by
  //    an error code, because RLS delete affects zero rows rather than raising.
  if (other.data) {
    await anon.from('posts').delete().eq('id', other.data.id);
    const survivor = await admin.from('posts').select('id').eq('id', other.data.id).maybeSingle();
    check('cannot delete another user’s post', Boolean(survivor.data), survivor.data ? 'still present' : 'DELETED!');
  }
} catch (err) {
  check('run completed without an exception', false, err.message);
} finally {
  await cleanup();

  if (!KEEP && baseline) {
    const after = await counts();
    const drifted = Object.keys(baseline).filter((t) => baseline[t] !== after[t]);
    check(
      'left no rows behind (counts match baseline)',
      drifted.length === 0,
      drifted.length ? drifted.map((t) => `${t} ${baseline[t]}→${after[t]}`).join(', ') : JSON.stringify(after)
    );
  }

  const total = results.length;
  console.log(`\n${total - failed}/${total} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}
