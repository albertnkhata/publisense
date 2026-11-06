/*
 * Publisense service worker: an offline-capable app shell, nothing more.
 * - Hashed /assets/* are immutable: cache-first.
 * - Page navigations: network-first, falling back to the last cached shell
 *   (index.html), so the app opens offline and renders its own offline state.
 * - Everything else (Supabase, /api, /badge, /sitemap.xml, other origins)
 *   is never touched: data, sign-in and votes are always live.
 * A new deploy installs a new worker that waits; the app shows "New version
 * available" and posts SKIP_WAITING when the user taps Refresh.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const ASSET_MAX = 80;
const BYPASS = /^\/(api|badge|sitemap\.xml|auth)(\/|$|\?)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add(new Request('/', { cache: 'reload' }))).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || BYPASS.test(url.pathname)) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await c.put(req, res.clone());
          const keys = await c.keys();
          for (const k of keys.slice(0, Math.max(0, keys.length - ASSET_MAX))) await c.delete(k);
        }
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && url.pathname === '/') (await caches.open(SHELL)).put('/', res.clone());
          return res;
        } catch {
          const shell = await caches.match('/', { cacheName: SHELL });
          return shell ?? Response.error();
        }
      })(),
    );
  }
});
