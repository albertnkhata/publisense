import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: IconName;
  /** Required: the accessible name. Icons never stand alone without one. */
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-md border text-ink-muted transition-colors duration-120 ease-out',
        'enabled:hover:bg-subtle enabled:hover:text-ink aria-expanded:bg-subtle aria-expanded:text-ink aria-pressed:text-brand',
        'disabled:cursor-default disabled:opacity-45',
        variant === 'ghost' ? 'border-transparent bg-transparent' : 'border-line bg-card',
        size === 'sm' ? 'size-6' : 'size-7',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 18} strokeWidth={1.8} />
    </button>
  );
});
