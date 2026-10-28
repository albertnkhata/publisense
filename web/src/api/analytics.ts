import { useQuery } from '@tanstack/react-query';
import type { BoardCategory } from './boards';
import { fetchCommandCentre } from './moderation';
export { fetchCommandCentre };
import type { PostStatus } from './posts';
import { getSupabase, hasSupabaseConfig } from './supabase';

/*
 * First-party anonymous analytics & the /admin Command Centre (0053,
 * docs/v2/COMMAND_CENTRE.md).
 *
 * Events carry a temporary per-visit UUID kept in sessionStorage (cleared when
 * the tab closes), never a user_id, email or IP address. recordEvent is
 * fire-and-forget and becomes a no-op when Supabase is not configured (unit
 * tests without VITE_SUPABASE_URL).
 */

export const ANALYTICS_KINDS = [
  'page_view',
  'share_unfurl',
  'search_open',
  'search_click',
  'search_empty',
  'claim_open',
  'claim_board_picked',
  'claim_auth_prompt',
  'claim_verify_started',
  'claim_verify_failed',
  'composer_open',
  'similar_post_click',
  'share_click',
  'auth_open',
  'auth_link_expired',
] as const;

export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];

export type CommandCentreWindow = 7 | 30 | 90;

const VISIT_STORAGE_KEY = 'publisense.visit';
let memoryVisitId: string | null = null;

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-tab random visit token. Stored in sessionStorage so closing the tab drops it. */
export function getVisitId(): string {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(VISIT_STORAGE_KEY);
      if (existing && UUID_RE.test(existing)) return existing;
      const next = randomUuid();
      window.sessionStorage.setItem(VISIT_STORAGE_KEY, next);
      return next;
    }
  } catch {
    /* private mode or blocked storage: fall back to memory */
  }
  if (!memoryVisitId) memoryVisitId = randomUuid();
  return memoryVisitId;
}

/** Extract lowercase external hostname from a referrer URL, or null for same-origin/direct. */
export function externalReferrerHost(referrer?: string | null, currentHost?: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const self = (currentHost ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase().replace(/^www\./, '');
    if (!host || host === self || host === 'publisense.app' || host === 'v2.publisense.app' || host === 'localhost' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
      return null;
    }
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export interface RecordEventOptions {
  path?: string | null;
  boardId?: string | null;
  hubId?: string | null;
  referrerHost?: string | null;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget first-party event logger. Never throws. */
export function recordEvent(kind: AnalyticsKind, opts: RecordEventOptions = {}): void {
  if (!hasSupabaseConfig) return;
  try {
    const path = opts.path ?? (typeof window !== 'undefined' ? window.location.pathname : null);
    const referrerHost =
      opts.referrerHost !== undefined
        ? opts.referrerHost
        : typeof document !== 'undefined'
          ? externalReferrerHost(document.referrer)
          : null;
    void Promise.resolve(
      getSupabase().rpc('record_event', {
        p_visit_id: getVisitId(),
        p_kind: kind,
        p_path: path ? path.slice(0, 200) : null,
        p_board_id: opts.boardId ?? null,
        p_hub_id: opts.hubId ?? null,
        p_referrer_host: referrerHost,
        p_meta: opts.meta ?? {},
      }),
    ).catch(() => {});
  } catch {
    /* never surface analytics errors to the user */
  }
}

// ------------------------------------------------------------------ Command Centre read model

export interface CommandCentreQueues {
  pending_products: number;
  pending_companies: number;
  open_reports: number;
  open_disputes: number;
  pending_joins: number;
}

export interface CommandCentreTraction {
  users_total: number;
  users_window: number;
  member_posts_total: number;
  member_posts_window: number;
  imported_posts_total: number;
  replies_total: number;
  replies_window: number;
  official_replies_total: number;
  official_replies_window: number;
  votes_total: number;
  votes_window: number;
  follows_total: number;
}

export interface CommandCentreLoop {
  live_boards: number;
  claimed_boards: number;
  live_hubs: number;
  claimed_hubs: number;
  responded_posts: number;
  shipped_posts: number;
  median_first_response_hours: number | null;
  by_status: Record<PostStatus, number>;
}

export interface CommandCentreTraffic {
  page_views: number;
  visits: number;
  share_unfurls: number;
  share_clicks: number;
}

export interface CommandCentreFunnels {
  claim: {
    open: number;
    board_picked: number;
    auth_prompt: number;
    verify_started: number;
    verify_failed: number;
    completed: number;
  };
  composer: {
    open: number;
    similar_click: number;
    posts_created: number;
  };
  search: {
    open: number;
    click: number;
    empty: number;
  };
}

export interface CommandCentreDayPoint {
  day: string;
  visits: number;
  page_views: number;
  signups: number;
  posts: number;
  votes: number;
  responses: number;
}

export interface HotUnclaimedBoard {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo_path: string | null;
  category: BoardCategory | null;
  views: number;
  claim_opens: number;
  post_count: number;
  vote_count: number;
}

export interface EmptySearchRow {
  query: string;
  count: number;
  last_at: string;
}

export interface ReferrerRow {
  host: string;
  views: number;
  visits: number;
}

export interface AuthTriggerRow {
  trigger: string;
  count: number;
}

export interface CommandCentreData {
  days: CommandCentreWindow;
  generated_at: string;
  queues: CommandCentreQueues;
  traction: CommandCentreTraction;
  loop: CommandCentreLoop;
  traffic: CommandCentreTraffic;
  funnels: CommandCentreFunnels;
  series: CommandCentreDayPoint[];
  hot_unclaimed_boards: HotUnclaimedBoard[];
  empty_searches: EmptySearchRow[];
  referrers: ReferrerRow[];
  auth_triggers: {
    expired_links: number;
    triggers: AuthTriggerRow[];
  };
}

export const analyticsKeys = {
  commandCentre: (days: CommandCentreWindow) => ['admin-command-centre', days] as const,
};

export function useCommandCentre(days: CommandCentreWindow = 30, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.commandCentre(days),
    queryFn: () => fetchCommandCentre(days),
    enabled,
    staleTime: 30_000,
  });
}
