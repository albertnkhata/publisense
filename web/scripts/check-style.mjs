#!/usr/bin/env node
/**
 * Style gate for web/src (docs/v2/FOUNDATION.md §3). Fails on:
 *
 *   1. arbitrary-value   Tailwind arbitrary values with a literal inside, e.g.
 *                        text-[13px], bg-[#0047AB], rounded-[7px], data-[state=open]:,
 *                        or arbitrary properties like [mask-type:alpha].
 *                        A CSS variable is not a literal: w-[var(--x)] and the
 *                        v4 shorthand w-(--x) are allowed.
 *   2. raw-hex           a hex colour anywhere in web/src except src/styles/theme.css.
 *   3. inline-style      style={…} in JSX, unless it is an object literal whose
 *                        every key is a CSS custom property, e.g.
 *                        style={{ '--board-color': board.color }}.
 *
 * Comments are ignored, so docs can quote the patterns they forbid.
 * JSON data files are not scanned: board colours are data, not styling.
 *
 * Usage: node scripts/check-style.mjs [dir]   (default: web/src)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = /\.(tsx?|jsx?|mjs|cjs|css|html)$/;
const THEME_FILE = 'src/styles/theme.css';

/** Replace comments with spaces (newlines kept) so line numbers stay true. */
export function stripComments(text, isCss = false) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (!isCss && c === '/' && n === '/' && text[i - 1] !== ':') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// -- rule 1 -----------------------------------------------------------------
const ARBITRARY_VALUE = /(?<![\w$.])((?:[\w-]+(?:\/[\w-]+)?:)*!?-?[a-z][\w-]*-\[([^\]\s'"`]*)\])/g;
const ARBITRARY_PROPERTY = /(?<![\w$\])])(\[[a-z][a-z-]*:[^\]\s'"`]+\])/g;

function isVariable(value) {
  return /^(var\(--[\w-]+\)|--[\w-]+)$/.test(value);
}

function checkArbitrary(file, text, out) {
  for (const m of text.matchAll(ARBITRARY_VALUE)) {
    if (isVariable(m[2])) continue;
    out.push({ file, line: lineOf(text, m.index), rule: 'arbitrary-value', match: m[1] });
  }
  for (const m of text.matchAll(ARBITRARY_PROPERTY)) {
    out.push({ file, line: lineOf(text, m.index), rule: 'arbitrary-value', match: m[1] });
  }
}

// -- rule 2 -----------------------------------------------------------------
const HEX = /(?<![\w&#/\\-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

function checkHex(file, text, out) {
  for (const m of text.matchAll(HEX)) {
    out.push({ file, line: lineOf(text, m.index), rule: 'raw-hex', match: m[0] });
  }
}

// -- rule 3 -----------------------------------------------------------------
/** Index just past the bracket that closes the one at `open`, or -1. */
function matchBracket(text, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [];
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** Split an object literal body on top-level commas. */
function topLevelProps(body) {
  const props = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('{(['.includes(c)) depth++;
    else if ('})]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      props.push(body.slice(start, i));
      start = i + 1;
    }
  }
  props.push(body.slice(start));
  return props.map((p) => p.trim()).filter(Boolean);
}

const CUSTOM_PROP_KEY = /^(['"])--[\w-]+\1\s*:/;

function checkInlineStyle(file, text, out) {
  for (const m of text.matchAll(/\bstyle\s*=\s*\{/g)) {
    const exprStart = m.index + m[0].length - 1;
    const exprEnd = matchBracket(text, exprStart);
    const expr = text.slice(exprStart + 1, exprEnd - 1).trim();
    const line = lineOf(text, m.index);
    const snippet = `style={${expr.length > 60 ? expr.slice(0, 57) + '...' : expr}}`;
    if (!expr.startsWith('{')) {
      out.push({ file, line, rule: 'inline-style', match: snippet });
      continue;
    }
    const objEnd = matchBracket(expr, 0);
    const rest = expr.slice(objEnd).trim();
    // Allow a trailing type assertion: style={{ '--x': y } as CSSProperties}
    if (objEnd === -1 || (rest && !/^as\s+[\w.<>[\]\s]+$/.test(rest))) {
      out.push({ file, line, rule: 'inline-style', match: snippet });
      continue;
    }
    const props = topLevelProps(expr.slice(1, objEnd - 1));
    if (props.some((p) => !CUSTOM_PROP_KEY.test(p))) {
      out.push({ file, line, rule: 'inline-style', match: snippet });
    }
  }
}

/** Check one file's text. `file` is its path relative to web/ (posix). */
export function checkSource(file, rawText) {
  const isCss = file.endsWith('.css');
  const text = stripComments(rawText, isCss);
  const out = [];
  checkArbitrary(file, text, out);
  if (file !== THEME_FILE) checkHex(file, text, out);
  if (/\.(tsx|jsx)$/.test(file)) checkInlineStyle(file, text, out);
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    // Tests are not shipped and quote the forbidden patterns on purpose.
    else if (SCANNED.test(name) && !/\.test\.[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

export function checkDir(dir = join(WEB, 'src')) {
  return walk(dir).flatMap((abs) => checkSource(relative(WEB, abs).split(sep).join('/'), readFileSync(abs, 'utf8')));
}

const HELP = {
  'arbitrary-value': 'use a theme token (theme.css) or add one to FOUNDATION §3',
  'raw-hex': 'colours live in src/styles/theme.css; use a token utility',
  'inline-style': 'only CSS custom properties may be set inline, e.g. style={{ \'--board-color\': c }}',
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(WEB, 'src');
  const violations = checkDir(target);
  if (violations.length) {
    console.error(`check-style: ${violations.length} violation(s)`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.rule}  ${v.match}  (${HELP[v.rule]})`);
    process.exit(1);
  }
  console.log('check-style: OK (no arbitrary values, no raw hex outside theme.css, no inline styles)');
}
