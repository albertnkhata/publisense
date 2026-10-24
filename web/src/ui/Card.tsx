import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * Bordered surface, no shadow (FOUNDATION §3). The optional gutter is the
 * 40px avatar column used by post cards, replies and official responses.
 */
export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'section';
  gutter?: ReactNode;
  padding?: 'sm' | 'md' | 'none';
  interactive?: boolean;
}

export function Card({ as: Tag = 'div', gutter, padding = 'md', interactive, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        'rounded-md border border-line bg-card',
        padding === 'md' && 'px-5 py-4 max-md:p-4',
        padding === 'sm' && 'p-3',
        interactive && 'cursor-pointer transition-colors duration-120 hover:border-line-strong',
        className,
      )}
      {...rest}
    >
      {gutter ? (
        <div className="flex">
          <div className="w-gutter shrink-0">{gutter}</div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </Tag>
  );
}
