import { TeamPill } from '../ui';

/**
 * The one public identity of a board's team (#160 follow-up): the board's name
 * plus the Team badge, exactly as the post page shows an official reply. Every
 * surface that shows an official reply or a team status change (post page,
 * card quote, status timeline, notifications) renders it through here, so the
 * teammate's personal handle never appears on official content.
 */
export function TeamByline({ name, className }: { name: string; className?: string }) {
  return (
    <span className={className ?? 'inline-flex items-center gap-2'}>
      <b className="font-semibold text-ink">{name}</b>{' '}
      <TeamPill />
    </span>
  );
}

/** Plain-text form for labels and screen readers: "Publisense · Team". */
export const teamLabel = (name: string | null | undefined) => `${name ?? 'Board'} · Team`;
