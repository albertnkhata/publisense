import type { BoardCategory } from '../api';
import type { IconName } from '../ui';

/** Exhaustive icon map for every product category shown in NavRail and category cards. */
export const CATEGORY_ICON: Record<BoardCategory, IconName> = {
  ai: 'sparkles',
  code: 'code',
  dev: 'layers',
  design: 'pen-tool',
  prod: 'zap',
  browser: 'globe',
  comms: 'messages',
  social: 'at-sign',
  media: 'play',
  finance: 'credit-card',
  shopping: 'shopping-bag',
  gaming: 'gamepad',
  education: 'book-open',
  health: 'heart',
  travel: 'map-pin',
  other: 'tag',
};
