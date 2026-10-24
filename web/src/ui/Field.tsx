import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { AriaAttributes } from 'react';
import { cx } from '../lib/cx';
import { passwordStrength, STRENGTH_LABEL } from '../lib/passwordStrength';
import { Icon } from './Icon';

/* Field wires label, hint and inline error to whichever control it wraps. */
interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
}
const FieldContext = createContext<FieldCtx | null>(null);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Right-aligned extra in the label row (e.g. a 0/120 counter). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, optional, aside, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cx('flex flex-col gap-2', className)}>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-sm font-semibold text-ink">
            {label}
            {optional ? <span className="ml-1 font-normal text-ink-muted">Optional</span> : null}
          </label>
          {aside ? <span className="text-sm text-ink-muted tabular-nums">{aside}</span> : null}
        </div>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="m-0 text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldProps(props: { id?: string | undefined; 'aria-describedby'?: string | undefined; 'aria-invalid'?: AriaAttributes['aria-invalid'] }) {
  const ctx = useContext(FieldContext);
  return {
    id: props.id ?? ctx?.id,
    'aria-describedby': props['aria-describedby'] ?? ctx?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (ctx?.invalid || undefined),
  };
}

const control =
  'w-full rounded-md border border-line-strong bg-card text-base text-ink outline-none ' +
  'transition-colors duration-120 ease-out placeholder:text-ink-muted ' +
  'focus:border-ink-muted focus-visible:outline-none aria-invalid:border-danger ' +
  'disabled:cursor-not-allowed disabled:opacity-45 max-md:text-md';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} {...props} {...useFieldProps(props)} className={cx(control, 'h-8 px-3', className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea ref={ref} rows={rows} {...props} {...useFieldProps(props)} className={cx(control, 'resize-y px-3 py-2', className)} />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        {...props}
        {...useFieldProps(props)}
        className={cx(control, 'h-8 cursor-pointer appearance-none pr-8 pl-3', className)}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-ink-muted">
        <Icon name="chevron-down" size={16} />
      </span>
    </div>
  );
});

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Show the 3-step strength meter (sign-up and new-password forms). */
  showStrength?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, showStrength = false, value, defaultValue, onChange, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [inner, setInner] = useState(String(defaultValue ?? ''));
  const current = value !== undefined ? String(value) : inner;
  const strength = passwordStrength(current);
  const field = useFieldProps(props);
  const meterId = `${field.id ?? 'pw'}-strength`;
  const segment = (n: number) =>
    cx(
      'h-1 flex-1 rounded-pill transition-colors duration-120',
      strength >= n ? (strength === 1 ? 'bg-danger' : strength === 2 ? 'bg-warning' : 'bg-success') : 'bg-line',
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={(e) => {
            if (value === undefined) setInner(e.target.value);
            onChange?.(e);
          }}
          {...props}
          {...field}
          aria-describedby={cx(field['aria-describedby'], showStrength && current ? meterId : undefined) || undefined}
          className={cx(control, 'h-8 pr-10 pl-3', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-1 my-auto h-7 rounded-sm px-2 text-sm font-semibold text-ink-secondary hover:text-ink"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {showStrength ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            <i className={segment(1)} />
            <i className={segment(2)} />
            <i className={segment(3)} />
          </div>
          <span id={meterId} className="min-w-10 text-right text-xs text-ink-muted" aria-live="polite">
            {current ? STRENGTH_LABEL[strength] : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
});
