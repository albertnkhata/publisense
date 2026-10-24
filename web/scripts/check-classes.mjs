#!/usr/bin/env node
/**
 * Dead-utility gate (run after `npm run build`).
 *
 * The theme is locked (`--*: initial`), so a class that names a token we do
 * not define (`p-11`, `tracking-wide`, `backdrop-blur-xl`) compiles to
 * NOTHING, silently. This script lists every utility-looking token in
 * web/src string literals and fails if the built CSS has no rule for it.
 *
 * Usage: node scripts/check-classes.mjs [distDir]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const DIST = join(WEB, process.argv[2] ?? 'dist');

// Tokens that are markers, not utilities (no CSS of their own).
const MARKERS = new Set(['group', 'peer']);
const MARKER_RE = /^(group|peer)\/[\w-]+$/;

// A token is treated as a utility when its last segment starts with one of these.
const UTILITY = new RegExp(
  '^-?(' +
    [
      'bg', 'text', 'border', 'rounded', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
      'w', 'h', 'size', 'min-w', 'min-h', 'max-w', 'max-h', 'gap', 'gap-x', 'gap-y', 'flex', 'grid', 'inline', 'block',
      'hidden', 'items', 'justify', 'place', 'font', 'leading', 'tracking', 'shadow', 'ring', 'opacity', 'z', 'top', 'left',
      'right', 'bottom', 'inset', 'inset-x', 'inset-y', 'translate', '-translate', 'animate', 'transition', 'duration',
      'ease', 'overflow', 'truncate', 'whitespace', 'select', 'cursor', 'outline', 'underline', 'decoration', 'sr-only',
      'not-sr-only', 'absolute', 'relative', 'fixed', 'sticky', 'self', 'shrink', 'grow', 'order', 'col', 'row',
      'auto-cols', 'grid-cols', 'grid-flow', 'backdrop', 'fill', 'stroke', 'accent', 'appearance', 'resize', 'object',
      'uppercase', 'tabular-nums', 'no-underline', 'invisible', 'visible', 'pointer-events', 'list', 'aspect', 'divide',
      'space', 'blur', 'contents', 'table', 'italic', 'scale', 'rotate', 'origin',
    ].join('|') +
    ')(-|$)',
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

const STANDALONE = new Set([
  'flex', 'grid', 'hidden', 'block', 'inline', 'truncate', 'absolute', 'relative', 'fixed', 'sticky', 'uppercase',
  'italic', 'invisible', 'visible', 'contents', 'table', 'underline', 'shrink', 'grow', 'transition', 'outline', 'border', 'rounded', 'shadow', 'ring',
]);

const escape = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

function tokensOf(text) {
  const found = new Set();
  // string literals: '…', "…", `…` (template expressions are skipped)
  const re = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const body = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const tok of body.split(/\s+/)) {
      if (!tok || MARKERS.has(tok) || MARKER_RE.test(tok)) continue;
      const base = tok.split(':').pop() ?? '';
      if (!/^[!-]?[a-z][a-z0-9-]*([/.][a-z0-9]+)?(-\(--[\w-]+\))?$/.test(base)) continue;
      const bare = base.replace(/^!/, '');
      if (bare.endsWith('-')) continue;
      if (!UTILITY.test(bare)) continue;
      // A bare word is only a utility if it is one of the standalone ones.
      if (!bare.includes('-') && !STANDALONE.has(bare)) continue;
      found.add(tok);
    }
  }
  return found;
}

const css = cssFiles(DIST).map((f) => readFileSync(f, 'utf8')).join('\n');
if (!css) {
  console.error(`check-classes: no CSS found in ${relative(WEB, DIST)}; run the build first.`);
  process.exit(2);
}

const missing = [];
for (const file of walk(SRC)) {
  for (const tok of tokensOf(readFileSync(file, 'utf8'))) {
    const selector = new RegExp(`\\.${escape(tok).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}(?![\\w-])`);
    if (!selector.test(css)) missing.push(`${relative(WEB, file)}: ${tok}`);
  }
}

if (missing.length) {
  console.error(`check-classes: ${missing.length} utility class(es) produce no CSS (undefined token?):`);
  for (const line of [...new Set(missing)].sort()) console.error(`  ${line}`);
  process.exit(1);
}
console.log('check-classes: OK, every utility used in web/src has a rule in the built CSS');
