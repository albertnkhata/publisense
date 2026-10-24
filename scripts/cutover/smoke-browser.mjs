// Cutover browser smoke (read-only): loads Home, Explore, two boards, the hub and search on
// the live origin, desktop and mobile; screenshots; console errors; any non-GET request to
// Supabase is aborted and reported (the public pages must not need one). No sign-in, no forms.
// Needs Playwright (not a repo dependency): run from a folder where `npm i playwright` and
// `npx playwright install chromium` were done:
//   node scripts/cutover/smoke-browser.mjs [desktop|mobile]   (env BASE, OUT)
// Chromium ignores credentials in *_PROXY env vars, so they are passed through explicitly.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.env.OUT || 'cutover-shots'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'https://v2.publisense.app';
const pages = [['home', '/'], ['explore', '/explore'], ['board-figma', '/b/figma'], ['board-cursor', '/b/cursor'], ['hub-figma', '/h/figma'], ['search-figma', '/search?q=figma']];
const ALL = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { ...devices['iPhone 13'] } };
const profiles = process.argv[2] ? { [process.argv[2]]: ALL[process.argv[2]] } : ALL;
function proxyOpt() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return {};
  const u = new URL(raw);
  return { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined, bypass: process.env.NO_PROXY || process.env.no_proxy } };
}
const browser = await chromium.launch(proxyOpt());
const results = [];
for (const [pname, opts] of Object.entries(profiles)) {
  const ctx = await browser.newContext(opts);
  for (const [name, path] of pages) {
    const page = await ctx.newPage();
    const errors = [], failed = [], blocked = [], apiCalls = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText; if (f !== 'net::ERR_ABORTED' || !blocked.includes(r.url())) failed.push(`${r.method()} ${r.url().slice(0, 140)} ${f}`); });
    await page.route('**/*.supabase.co/**', (route) => {
      const r = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) { blocked.push(r.url()); return route.abort(); }
      apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.continue();
    });
    const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => ({ status: () => 'ERR ' + e.message.split('\n')[0] }));
    await page.waitForTimeout(1200);
    const h1 = await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => null);
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const notFound = /not found|404|doesn.t exist/i.test(text.slice(0, 600));
    await page.screenshot({ path: `${OUT}/${pname}-${name}.png`, fullPage: false, timeout: 15000 });
    results.push({ profile: pname, name, path, status: resp.status(), h1, notFound, chars: text.length, errors, failed, blocked, apiCalls: [...new Set(apiCalls)] });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/results-${Object.keys(profiles).join('-')}.json`, JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.profile.padEnd(7)} ${r.name.padEnd(13)} ${r.status} h1=${JSON.stringify(r.h1)} notFound=${r.notFound} errors=${r.errors.length} failed=${r.failed.length} blockedWrites=${r.blocked.length} api=${r.apiCalls.length}`);
