import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPostIds, parseInboundWebhook } from '../../api/_lib/inboundWebhook';
import handler from '../../api/webhook';

const POST_A = '11111111-2222-4333-8444-555555555555';
const POST_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function makeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = '';
  return {
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    send(b: string) {
      body = b;
    },
  };
}

describe('inboundWebhook parser & handler (0065)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts unique Publisense post UUIDs from exported markdown', () => {
    const md = `## [Bug] Crash\n\n---\n**Publisense:** [Crash](https://publisense.app/post/${POST_A}) and duplicate https://publisense.app/post/${POST_A} plus /post/${POST_B}`;
    expect(extractPostIds(md)).toEqual([POST_A, POST_B]);
  });

  it('maps GitHub issue closed (completed vs not_planned) and PR merged events', () => {
    const closedCompleted = parseInboundWebhook(
      {
        action: 'closed',
        repository: { full_name: 'getcursor/cursor' },
        issue: { number: 42, state_reason: 'completed', body: `See https://publisense.app/post/${POST_A}` },
      },
      'issues',
    );
    expect(closedCompleted).toEqual([{ postId: POST_A, to: 'shipped', note: 'Resolved in getcursor/cursor#42' }]);

    const notPlanned = parseInboundWebhook(
      {
        action: 'closed',
        repository: { full_name: 'getcursor/cursor' },
        issue: { number: 43, state_reason: 'not_planned', body: `See https://publisense.app/post/${POST_A}` },
      },
      'issues',
    );
    expect(notPlanned).toEqual([{ postId: POST_A, to: 'declined', note: 'Closed as not planned in getcursor/cursor#43' }]);

    const prMerged = parseInboundWebhook(
      {
        action: 'closed',
        repository: { full_name: 'getcursor/cursor' },
        pull_request: { number: 99, merged: true, body: `Fixes https://publisense.app/post/${POST_B}` },
      },
      'pull_request',
    );
    expect(prMerged).toEqual([{ postId: POST_B, to: 'shipped', note: 'Shipped in getcursor/cursor#99' }]);
  });

  it('maps Linear Issue started, completed, and canceled state changes', () => {
    const started = parseInboundWebhook({
      type: 'Issue',
      action: 'update',
      data: {
        identifier: 'ENG-108',
        description: `**Publisense:** [Dark mode](https://publisense.app/post/${POST_A})`,
        state: { type: 'started', name: 'In Progress' },
      },
    });
    expect(started).toEqual([{ postId: POST_A, to: 'in_progress', note: 'Started in ENG-108' }]);

    const completed = parseInboundWebhook({
      type: 'Issue',
      action: 'update',
      data: {
        identifier: 'ENG-108',
        description: `**Publisense:** [Dark mode](https://publisense.app/post/${POST_A})`,
        state: { type: 'completed', name: 'Done' },
      },
    });
    expect(completed).toEqual([{ postId: POST_A, to: 'shipped', note: 'Completed in ENG-108' }]);
  });

  it('calls apply_inbound_webhook RPC on POST /api/webhook?token=...', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, changed: true, status: 'shipped' }), { status: 200 }),
    );

    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { 'x-github-event': 'issues' },
        query: { token: TOKEN },
        body: {
          action: 'closed',
          repository: { full_name: 'getcursor/cursor' },
          issue: { number: 12, state_reason: 'completed', body: `https://publisense.app/post/${POST_A}` },
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, matched: 1, updated: 1 });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/apply_inbound_webhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          p_token: TOKEN,
          p_post: POST_A,
          p_to: 'shipped',
          p_note: 'Resolved in getcursor/cursor#12',
        }),
      }),
    );
  });
});
