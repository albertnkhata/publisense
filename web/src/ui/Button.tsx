import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  /** Stretch to the container width. */
  block?: boolean;
  children?: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md border font-semibold whitespace-nowrap select-none ' +
  'transition-colors duration-120 ease-out disabled:cursor-default disabled:opacity-45 aria-busy:cursor-progress';

const variants: Record<ButtonVariant, string> = {
  // Cobalt is the only action colour.
  primary: 'border-transparent bg-brand text-on-brand enabled:hover:bg-brand-hover',
  secondary: 'border-line-strong bg-card text-ink enabled:hover:bg-subtle',
  ghost: 'border-transparent bg-transparent text-ink-secondary enabled:hover:bg-subtle enabled:hover:text-ink',
  danger: 'border-line-strong bg-card text-danger enabled:hover:bg-subtle',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-sm', // 32px
  md: 'h-8 px-4 text-base', // 40px (spacing tokens are the s-1…s-10 scale)
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
});
