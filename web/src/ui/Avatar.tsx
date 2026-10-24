import { cx } from '../lib/cx';
import { Silhouette } from './Icon';

/**
 * Avatar (FOUNDATION §4): user (photo or default silhouette), board (colour
 * tile from data with initial or logo), hub (stacked board tiles).
 * Board colours come from data and are passed as the --board-color custom
 * property, the one inline style the style gate allows.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const box: Record<AvatarSize, string> = {
  xs: 'size-5 text-xs',
  sm: 'size-6 text-xs',
  md: 'size-7 text-sm',
  lg: 'size-8 text-md',
  xl: 'size-9 text-xl',
  '2xl': 'size-10 text-2xl',
};

const tileRadius: Record<AvatarSize, string> = {
  xs: 'rounded-sm',
  sm: 'rounded-sm',
  md: 'rounded-sm',
  lg: 'rounded-md',
  xl: 'rounded-lg',
  '2xl': 'rounded-lg',
};

export interface UserAvatarProps {
  name?: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function UserAvatar({ name, src, size = 'md', className }: UserAvatarProps) {
  return (
    <span
      className={cx(
        'inline-block shrink-0 overflow-hidden rounded-pill border border-line bg-elevated text-ink-muted',
        box[size],
        className,
      )}
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
    >
      {src ? <img src={src} alt="" className="block size-full object-cover" /> : <Silhouette />}
    </span>
  );
}

export interface BoardAvatarProps {
  name: string;
  /** board.color from data, e.g. "#1F9D6B". */
  color?: string | null;
  logoSrc?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Decorative when the board name is already shown next to it. */
  decorative?: boolean;
  ring?: boolean;
}

export function BoardAvatar({ name, color, logoSrc, size = 'md', className, decorative, ring }: BoardAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      style={{ '--board-color': color ?? undefined }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
      className={cx(
        'inline-grid shrink-0 place-items-center overflow-hidden bg-board leading-none font-bold text-on-brand',
        box[size],
        tileRadius[size],
        ring && 'ring-2 ring-card',
        className,
      )}
    >
      {logoSrc ? <img src={logoSrc} alt="" className="block size-full object-cover" /> : initial}
    </span>
  );
}

export interface HubAvatarProps {
  name: string;
  boards: Array<{ name: string; color?: string | null; logoSrc?: string | null }>;
  size?: AvatarSize;
  /** How many tiles to show before stopping (default 3). */
  max?: number;
  /** Keep the width of `max` tiles even when fewer show, so rows line up. */
  reserve?: boolean;
  className?: string;
}

export function HubAvatar({ name, boards, size = 'sm', max = 3, reserve = false, className }: HubAvatarProps) {
  const shown = boards.slice(0, max);
  const spacers = reserve ? Math.max(0, max - shown.length) : 0;
  return (
    <span role="img" aria-label={name} className={cx('inline-flex shrink-0 items-center', className)}>
      {shown.map((b, i) => (
        <BoardAvatar
          key={`${b.name}-${i}`}
          name={b.name}
          color={b.color}
          logoSrc={b.logoSrc}
          size={size}
          decorative
          ring
          className={i > 0 ? '-ml-2' : undefined}
        />
      ))}
      {Array.from({ length: spacers }, (_, i) => (
        <BoardAvatar key={`spacer-${i}`} name="" size={size} decorative className="invisible -ml-2" />
      ))}
    </span>
  );
}
