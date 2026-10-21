export type ProductCategory =
  | 'ai_agents'
  | 'dev_tools'
  | 'design_creative'
  | 'cloud_data'
  | 'productivity';

export type FeedbackType =
  | 'bug'
  | 'feature'
  | 'ux'
  | 'performance'
  | 'pricing';

export type Severity = 'annoyance' | 'friction' | 'blocker';

export type FeedbackStatus =
  | 'open'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'wont_do';

export type UserRole = 'user' | 'maintainer' | 'admin';

export type CommentKind = 'discussion' | 'workaround' | 'official';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string;
  websiteUrl: string;
  isVerified: boolean;
}

export interface Product {
  id: string;
  slug: string;
  orgId: string;
  name: string;
  tagline: string;
  description: string;
  category: ProductCategory;
  logoUrl: string;
  websiteUrl: string;
  isVerified: boolean;
  responsivenessRate: number;
  avgResponseTime: string;
  followersCount: number;
  /**
   * Claim state, from products.claim_status (migration 0009).
   *
   * 'unclaimed' — nobody has asked.
   * 'pending'   — someone submitted a matching work email; NOT verified and
   *               NOT a maintainer yet. Grants no rights.
   * 'verified'  — an admin approved it; the claimant became a maintainer.
   *
   * Optional because older local/offline state predates the column.
   */
  claimStatus?: 'unclaimed' | 'pending' | 'verified';
  claimEmail?: string;
  /** When the claimant asked, from products.claim_requested_at. */
  claimRequestedAt?: string;
}

export interface UserProfile {
  id: string;
  handle: string; // stored without leading @, e.g. 'albert'
  name: string;
  email: string;
  avatarUrl: string;
  bio: string;
  role: UserRole;
  managedOrgId?: string;
  roleTitle?: string;
  location?: string;
  joinedAt: string;
}

export interface FeedbackPost {
  id: string;
  productId: string;
  authorId: string;
  title: string;
  body: string;
  type: FeedbackType;
  severity: Severity;
  status: FeedbackStatus;
  officialNote?: string;
  officialUpdatedBy?: string;
  officialUpdatedAt?: string;
  tags: string[];
  mediaUrls?: string[];
  upvoteCount: number;
  repostCount: number;
  commentCount: number;
  createdAt: string;
}

export interface PostVote {
  postId: string;
  userId: string;
  createdAt: string;
}

export interface PostRepost {
  postId: string;
  userId: string;
  quoteText?: string;
  createdAt: string;
}

export interface FeedbackComment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  kind: CommentKind;
  likesCount: number;
  createdAt: string;
}

export interface FollowRelation {
  followerId: string;
  targetType: 'product' | 'user';
  targetId: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  postId?: string;
  productId?: string;
  /**
   * 'claim_approved' / 'claim_rejected' are written by the database when an
   * administrator decides a product claim. They arrive from notifications, not
   * from this browser, which is the point: the decision happens while the
   * claimant is away.
   */
  kind:
    | 'upvote'
    | 'comment'
    | 'status_change'
    | 'repost'
    | 'follow'
    | 'claim_approved'
    | 'claim_rejected';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const PRODUCT_CATEGORIES: {
  id: ProductCategory;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}[] = [
  {
    id: 'ai_agents',
    label: 'AI & Models',
    shortLabel: 'AI & Models',
    icon: '✦',
    description: 'LLMs, coding agents, and reasoning assistants',
  },
  {
    id: 'dev_tools',
    label: 'DevTools',
    shortLabel: 'DevTools',
    icon: '⌘',
    description: 'IDEs, frameworks, CLIs, and developer workflows',
  },
  {
    id: 'design_creative',
    label: 'Design & Creative',
    shortLabel: 'Design & Creative',
    icon: '◐',
    description: 'UI design systems, generative media, and prototyping',
  },
  {
    id: 'productivity',
    label: 'Productivity',
    shortLabel: 'Productivity',
    icon: '▣',
    description: 'Issue tracking, docs, and team collaboration',
  },
  {
    id: 'cloud_data',
    label: 'Consumer & Media',
    shortLabel: 'Consumer & Media',
    icon: '◎',
    description: 'Browsers, audio/media players, and everyday apps',
  },
];

export const FEEDBACK_TYPES: {
  id: FeedbackType;
  label: string;
}[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'feature', label: 'Feature' },
  { id: 'ux', label: 'UX / Friction' },
  { id: 'performance', label: 'Performance' },
  { id: 'pricing', label: 'Pricing' },
];

export const FEEDBACK_STATUSES: {
  id: FeedbackStatus;
  label: string;
  dotColor: string;
  badgeClass: string;
}[] = [
  {
    id: 'open',
    label: 'Open',
    dotColor: 'bg-zinc-400',
    badgeClass: 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/70',
  },
  {
    id: 'planned',
    label: 'Planned',
    dotColor: 'bg-violet-500',
    badgeClass: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800/60',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    dotColor: 'bg-sky-500',
    badgeClass: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60',
  },
  {
    id: 'shipped',
    label: 'Shipped',
    dotColor: 'bg-emerald-500',
    badgeClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
  },
  {
    id: 'wont_do',
    label: "Won't Do",
    dotColor: 'bg-rose-400',
    badgeClass: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60',
  },
];
