import { describe, expect, it, vi } from 'vitest';
import * as co from '../../../supabase/functions/link-preview/company';

describe('company inference: names', () => {
  it('drops legal suffixes and keeps the brand as written', () => {
    expect(co.normalizeCompany('Acme, Inc.')).toBe('Acme');
    expect(co.normalizeCompany('Figma Ltd')).toBe('Figma');
    expect(co.normalizeCompany('SAP SE')).toBe('SAP SE');
    expect(co.normalizeCompany('Stripe, LLC.')).toBe('Stripe');
    expect(co.normalizeCompany('Spotify AB')).toBe('Spotify');
    expect(co.normalizeCompany('  ')).toBeNull();
    expect(co.normalizeCompany('2026')).toBeNull();
    expect(co.normalizeCompany('All rights reserved')).toBeNull();
  });

  it('treats spacing and case as the same company', () => {
    expect(co.sameCompany('Open AI', 'OpenAI')).toBe(true);
    expect(co.sameCompany('linear', 'Linear')).toBe(true);
    expect(co.sameCompany('Acme', 'Acme Notes')).toBe(false);
  });
});

describe('company inference: page signals', () => {
  it('reads an Organization, a publisher, and a @graph from JSON-LD, never a Person', () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Inc."}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"SoftwareApplication","name":"Acme Notes","publisher":{"@type":"Organization","name":"Acme"}},{"@type":"WebSite","author":{"@type":"Person","name":"Jane Doe"}}]}</script>`;
    expect(co.jsonLdCompanies(html)).toEqual(['Acme']);
    expect(co.jsonLdCompanies('<script type="application/ld+json">{not json</script>')).toEqual([]);
  });

  it('reads the footer’s © line, keeping the last one', () => {
    expect(co.copyrightHolder('<p>“Great” © 2020 Some Reviewer</p><footer>© 2024–2026 Acme Labs, Inc. All rights reserved.</footer>')).toBe('Acme Labs');
    expect(co.copyrightHolder('<footer>Copyright 2026 Figma | Privacy</footer>')).toBe('Figma');
    expect(co.copyrightHolder('<footer>&copy; 2025 Notion Labs, Inc.</footer>')).toBe('Notion Labs');
    expect(co.copyrightHolder('<footer>© 2026</footer>')).toBeNull();
    expect(co.copyrightHolder('<p>No footer here</p>')).toBeNull();
  });

  it('puts JSON-LD before the © line', () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script><footer>© 2026 Acme Holdings Ltd</footer>';
    expect(co.pageSignals(html)).toEqual([
      { name: 'Acme', basis: 'jsonld' },
      { name: 'Acme Holdings', basis: 'copyright' },
    ]);
  });
});

describe('company inference: deciding', () => {
  it('is sure when the signals agree, and calls a product its own company when names match', () => {
    expect(co.decideCompany({ productName: 'Acme Notes', signals: [{ name: 'Acme', basis: 'jsonld' }, { name: 'acme', basis: 'copyright' }] })).toEqual({
      company: 'Acme',
      basis: 'jsonld',
      confidence: 'high',
      ambiguous: false,
    });
    expect(co.decideCompany({ productName: 'Linear', signals: [{ name: 'Linear', basis: 'copyright' }] })).toMatchObject({ company: null, confidence: 'high', ambiguous: false });
  });

  it('leaves it open when the signals disagree or there are none', () => {
    expect(co.decideCompany({ productName: 'X', signals: [{ name: 'Acme', basis: 'jsonld' }, { name: 'Other Co', basis: 'copyright' }] })).toMatchObject({
      company: 'Acme',
      confidence: 'low',
      ambiguous: true,
    });
    expect(co.decideCompany({ productName: 'X', signals: [] })).toMatchObject({ company: null, ambiguous: true });
  });
});

describe('company inference: LLM tie-break', () => {
  const cfg = co.llmConfig((k) => ({ COMPANY_LLM_API_KEY: 'k', COMPANY_LLM_MODEL: 'm' })[k])!;
  const ctx = { link: 'cal.example.com', productName: 'Example Calendar', signals: [] };
  const reply = (content: string, ok = true) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: ok ? 200 : 500 }));

  it('is off without an API key, and defaults to an OpenAI-compatible endpoint', () => {
    expect(co.llmConfig(() => undefined)).toBeNull();
    expect(cfg).toEqual({ apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'm', timeoutMs: 2500 });
  });

  it('reads a confident answer, and drops an unsure or malformed one', () => {
    expect(co.parseLlmAnswer('{"company":"Example Inc.","same_as_product":false,"confidence":0.9}', 'Example Calendar')).toEqual({ company: 'Example', basis: 'llm', confidence: 'low' });
    expect(co.parseLlmAnswer('```json\n{"company":null,"same_as_product":true,"confidence":0.8}\n```', 'Linear')).toEqual({ company: null, basis: 'llm', confidence: 'low' });
    expect(co.parseLlmAnswer('{"company":"Example","confidence":0.3}', 'X')).toBeNull();
    expect(co.parseLlmAnswer('not json', 'X')).toBeNull();
  });

  it('asks only when the page leaves it open, and falls back when the call fails', async () => {
    const f = reply('{"company":"Example","same_as_product":false,"confidence":0.9}');
    expect(await co.resolveCompany(ctx, { llm: cfg, fetchImpl: f })).toEqual({ company: 'Example', basis: 'llm', confidence: 'low' });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', temperature: 0, response_format: { type: 'json_object' } });

    const sure = vi.fn();
    expect(await co.resolveCompany({ ...ctx, signals: [{ name: 'Example', basis: 'jsonld' }] }, { llm: cfg, fetchImpl: sure })).toMatchObject({ company: 'Example', basis: 'jsonld' });
    expect(sure).not.toHaveBeenCalled();

    expect(await co.resolveCompany(ctx, { llm: cfg, fetchImpl: reply('', false) })).toEqual({ company: null, basis: null, confidence: null });
    expect(await co.resolveCompany(ctx, { llm: cfg, fetchImpl: vi.fn().mockRejectedValue(new Error('down')) })).toEqual({ company: null, basis: null, confidence: null });
    expect(await co.resolveCompany(ctx, { llm: null, fetchImpl: sure })).toEqual({ company: null, basis: null, confidence: null });
  });
});
