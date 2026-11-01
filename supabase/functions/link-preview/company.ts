// Who makes a product, worked out from its link (Add a product no longer asks).
//
// Pure functions plus one injected-fetch LLM call, so the web tests import this file
// directly (like rules.ts); nothing here touches Deno globals.
//
// Order, strongest first:
//   1. The link's domain already belongs to a company. Decided in the database
//      (create_board's v2_link_hub); this file is never asked.
//   2. Signals the page itself gives: schema.org Organization / publisher in JSON-LD, and
//      the footer's "© 2026 Acme Inc." line. A GitHub repo owned by an organisation
//      names that organisation.
//   3. When the signals disagree, or a site gives none, an LLM may break the tie, if it
//      is configured (COMPANY_LLM_API_KEY). Its answer is a guess, and says so.
//
// Every answer is only a suggestion: create_board files a new company as pending, and
// the admin approving the product confirms, renames or drops it.

// Self-contained (no imports), so the same file type-checks under Deno and the web app.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', ndash: '–', mdash: '—', middot: '·', bull: '•' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : k.startsWith('#') ? parseInt(k.slice(1), 10) : NaN;
    if (k.startsWith('#')) return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    return ENTITIES[k] ?? m;
  });
}

function oneLine(s: string, max: number): string {
  const t = decodeEntities(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : '';
}

export type CompanyBasis = 'jsonld' | 'copyright' | 'github_org' | 'llm';

export interface CompanySignal {
  name: string;
  basis: Exclude<CompanyBasis, 'llm'>;
}

export interface CompanyGuess {
  /** The company, or null when it is the product itself or nobody can tell. */
  company: string | null;
  basis: CompanyBasis | null;
  /** high: the page says so plainly; low: a tie-break or a guess. */
  confidence: 'high' | 'low' | null;
}

export const NO_GUESS: CompanyGuess = { company: null, basis: null, confidence: null };

// ------------------------------------------------------------------ names

const LEGAL_SUFFIX =
  /[\s,]+(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|sas|sarl|bv|b\.v|nv|oy|ab|as|aps|pty|plc|lp|llp|srl|s\.r\.l|spa|kk|k\.k|pte)\.?$/i;

/** "Acme, Inc." -> "Acme". Keeps the name as written otherwise; null when nothing is left. */
export function normalizeCompany(raw: string | null | undefined): string | null {
  let s = oneLine(raw ?? '', 120);
  s = s.replace(/^(the\s+)?copyright\s+(of\s+)?/i, '').replace(/^by\s+/i, '');
  for (let i = 0; i < 2; i++) s = s.replace(LEGAL_SUFFIX, '').trim();
  s = s.replace(/[\s,.;:|·-]+$/, '').trim();
  if (s.length < 2 || s.length > 60) return null;
  if (!/\p{L}/u.test(s)) return null;
  if (/^(all rights reserved|rights reserved|privacy|terms)$/i.test(s)) return null;
  return s;
}

const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Same company, ignoring case, spaces and punctuation ("Open AI" = "OpenAI"). */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && key(a) === key(b));
}

// ------------------------------------------------------------------ page signals

const ORG_TYPES = new Set(['organization', 'corporation', 'localbusiness', 'ngo', 'educationalorganization', 'onlinebusiness', 'onlinestore']);
const MAKER_KEYS = ['publisher', 'creator', 'author', 'manufacturer', 'brand', 'provider', 'producer', 'parentOrganization'];

function types(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase());
}

function orgName(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const node = v as Record<string, unknown>;
  if (Array.isArray(v)) return null;
  const t = types(node);
  if (t.length && !t.some((x) => ORG_TYPES.has(x))) return null; // a Person is not a company
  return typeof node.name === 'string' ? node.name : null;
}

/** schema.org names: a top-level Organization, else whoever a product or site names as its maker. */
export function jsonLdCompanies(html: string): string[] {
  const out: string[] = [];
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(decodeEntities(m[1]!.trim()));
    } catch {
      continue;
    }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length && nodes.length < 50) {
      const n = stack.shift();
      if (!n || typeof n !== 'object') continue;
      const node = n as Record<string, unknown>;
      nodes.push(node);
      if (Array.isArray(node['@graph'])) stack.push(...(node['@graph'] as unknown[]));
    }
  }
  for (const node of nodes) {
    if (types(node).some((t) => ORG_TYPES.has(t)) && typeof node.name === 'string') out.push(node.name);
  }
  for (const node of nodes) {
    for (const k of MAKER_KEYS) {
      const v = node[k];
      for (const item of Array.isArray(v) ? v : [v]) {
        const n = orgName(item);
        if (n) out.push(n);
      }
    }
  }
  return [...new Set(out.map((n) => normalizeCompany(n)).filter((n): n is string => Boolean(n)))];
}

/** The holder named on a "© 2024–2026 Acme Inc. All rights reserved." line, if any. */
export function copyrightHolder(html: string): string | null {
  const text = decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
  // The last match is the footer's; earlier ones are often quotes or third-party credits.
  const re = /(?:©|\(c\)|copyright)\s*(?:©\s*)?(?:(?:19|20)\d{2}\s*(?:[-–—]\s*(?:(?:19|20)\d{2}|present)\s*)?,?\s*)?([^.|·•©\n]{2,80}?)(?=\s*(?:\.\s|\.$|,?\s*all rights|\||·|•|$|\s{2}|\s(?:privacy|terms|made with|built with)\b))/gi;
  let last: string | null = null;
  for (const m of text.matchAll(re)) {
    const n = normalizeCompany(m[1]!.replace(/^\s*(?:19|20)\d{2}\s*/, ''));
    // A holder is a few words; anything longer ran into the rest of the footer.
    if (n && !/^(?:19|20)\d{2}$/.test(n) && n.split(' ').length <= 5) last = n;
  }
  return last;
}

/** Every company the page names, strongest first. */
export function pageSignals(html: string): CompanySignal[] {
  const out: CompanySignal[] = jsonLdCompanies(html).map((name) => ({ name, basis: 'jsonld' as const }));
  const c = copyrightHolder(html);
  if (c) out.push({ name: c, basis: 'copyright' });
  return out;
}

// ------------------------------------------------------------------ deciding

export interface DecideInput {
  productName: string;
  signals: CompanySignal[];
}

/**
 * What the signals settle without help. `ambiguous` means an LLM may do better: the
 * signals disagree, or there are none.
 */
export function decideCompany({ productName, signals }: DecideInput): CompanyGuess & { ambiguous: boolean } {
  const distinct: CompanySignal[] = [];
  for (const s of signals) if (!distinct.some((d) => sameCompany(d.name, s.name))) distinct.push(s);
  if (distinct.length === 0) return { ...NO_GUESS, ambiguous: true };
  const top = distinct[0]!;
  // The product is its own company (Linear on linear.app): no separate company.
  const company = sameCompany(top.name, productName) ? null : top.name;
  if (distinct.length === 1) return { company, basis: top.basis, confidence: 'high', ambiguous: false };
  return { company, basis: top.basis, confidence: 'low', ambiguous: true };
}

// ------------------------------------------------------------------ LLM tie-break

export interface LlmConfig {
  apiKey: string;
  /** An OpenAI-compatible Chat Completions base URL. */
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function llmConfig(env: (k: string) => string | undefined): LlmConfig | null {
  const apiKey = env('COMPANY_LLM_API_KEY') ?? '';
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env('COMPANY_LLM_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env('COMPANY_LLM_MODEL') || 'gpt-4o-mini',
    timeoutMs: Number(env('COMPANY_LLM_TIMEOUT_MS')) || 2500,
  };
}

export interface LlmContext {
  /** The link as canonicalised (acme.dev, github.com/owner/repo). */
  link: string;
  productName: string;
  title?: string;
  description?: string;
  siteName?: string | null;
  signals: CompanySignal[];
}

export const LLM_SYSTEM = [
  'You identify the company or organisation that makes a software product, from facts about its web page.',
  'Answer with JSON only: {"company": string | null, "same_as_product": boolean, "confidence": number}.',
  'company: the maker’s short brand name without legal suffixes (Acme, not Acme Inc.).',
  'same_as_product: true when the product and the company are the same thing (Linear makes Linear).',
  'Use null when the maker is an individual person, or when you cannot tell. Never invent a company.',
  'confidence: 0 to 1.',
].join(' ');

export function llmPrompt(c: LlmContext): string {
  return JSON.stringify({
    link: c.link,
    product_name: c.productName,
    page_title: c.title ?? null,
    page_description: c.description ?? null,
    site_name: c.siteName ?? null,
    names_on_the_page: c.signals.map((s) => ({ name: s.name, from: s.basis })),
  });
}

/** Read the model's JSON answer. Anything off-shape, or not sure enough, is no answer. */
export function parseLlmAnswer(text: string, productName: string, minConfidence = 0.6): CompanyGuess | null {
  let a: unknown;
  try {
    a = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!a || typeof a !== 'object') return null;
  const o = a as { company?: unknown; same_as_product?: unknown; confidence?: unknown };
  const confidence = typeof o.confidence === 'number' ? o.confidence : 0;
  if (confidence < minConfidence) return null;
  if (o.same_as_product === true) return { company: null, basis: 'llm', confidence: 'low' };
  const name = typeof o.company === 'string' ? normalizeCompany(o.company) : null;
  if (!name) return null;
  return { company: sameCompany(name, productName) ? null : name, basis: 'llm', confidence: 'low' };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One Chat Completions call. Never throws: a failure is simply no answer. */
export async function askLlm(cfg: LlmConfig, ctx: LlmContext, fetchImpl: FetchLike): Promise<CompanyGuess | null> {
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: LLM_SYSTEM },
          { role: 'user', content: llmPrompt(ctx) },
        ],
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === 'string' ? parseLlmAnswer(text, ctx.productName) : null;
  } catch {
    return null;
  }
}

/** Signals first; the LLM only when they leave it open and it is configured. */
export async function resolveCompany(
  ctx: LlmContext,
  opts: { llm: LlmConfig | null; fetchImpl: FetchLike },
): Promise<CompanyGuess> {
  const d = decideCompany({ productName: ctx.productName, signals: ctx.signals });
  const settled: CompanyGuess = { company: d.company, basis: d.basis, confidence: d.confidence };
  if (!d.ambiguous || !opts.llm) return settled;
  const llm = await askLlm(opts.llm, ctx, opts.fetchImpl);
  return llm ?? settled;
}
