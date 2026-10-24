import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

/**
 * Menu: the ⋯ menu, the avatar menu and dropdowns (FOUNDATION §4).
 * WAI-ARIA menu button pattern: Enter/Space/ArrowDown open on the first item,
 * ArrowUp opens on the last; arrows move (wrapping), Home/End jump, printable
 * keys typeahead, Escape closes and returns focus to the trigger, Tab closes.
 */
interface MenuCtx {
  close: (restoreFocus?: boolean) => void;
}
const MenuContext = createContext<MenuCtx | null>(null);

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  id: string;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string;
  onClick: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
  /** Render the trigger and spread the props onto a button. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  children: ReactNode;
  /** Accessible name when the trigger's text is not a good one. */
  label?: string;
  side?: 'bottom' | 'top';
  align?: 'start' | 'end';
  className?: string;
  /** Panel width: auto (min 224) or match the trigger's container. */
  fullWidth?: boolean;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]),[role="menuitemradio"]:not([aria-disabled="true"]),[role="menuitemcheckbox"]:not([aria-disabled="true"])';

export function Menu({ trigger, children, label, side = 'bottom', align = 'start', className, fullWidth }: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const triggerId = useId();
  const panelId = useId();

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openWith = (focus: 'first' | 'last') => {
    pendingFocus.current = focus;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const list = items();
    const target = pendingFocus.current === 'last' ? list[list.length - 1] : list[0];
    (target ?? panelRef.current)?.focus();
    pendingFocus.current = null;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWith('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openWith('last');
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index < 0 ? list.length - 1 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.text = now - t.at > 500 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const start = index + 1;
          const ordered = [...list.slice(start), ...list.slice(0, start)];
          const match = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(t.text));
          match?.focus();
        }
    }
  };

  return (
    <MenuContext.Provider value={{ close }}>
      <div ref={wrapRef} className={cx('relative', fullWidth && 'w-full')}>
        {trigger({
          ref: triggerRef,
          id: triggerId,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': panelId,
          onClick: () => (open ? close(false) : openWith('first')),
          onKeyDown: onTriggerKeyDown,
        })}
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label={label}
          aria-labelledby={label ? undefined : triggerId}
          tabIndex={-1}
          hidden={!open}
          onKeyDown={onPanelKeyDown}
          className={cx(
            'absolute z-40 flex flex-col rounded-lg border border-line bg-card p-1 shadow-overlay outline-none',
            fullWidth ? 'inset-x-0' : 'min-w-menu',
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
            align === 'start' ? 'left-0' : 'right-0',
            className,
          )}
        >
          {open ? children : null}
        </div>
      </div>
    </MenuContext.Provider>
  );
}

const itemClass =
  'flex w-full items-center gap-3 rounded-sm border-0 bg-transparent px-3 py-2 text-left text-sm font-medium no-underline ' +
  'outline-none hover:bg-subtle focus-visible:bg-subtle focus:bg-subtle aria-disabled:cursor-default aria-disabled:opacity-45';

export interface MenuItemProps {
  children: ReactNode;
  icon?: IconName | ReactNode;
  description?: ReactNode;
  /** Keyboard hint shown on the right, e.g. "⌃D". */
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Render as an in-app link. */
  to?: string;
}

function ItemContent({ icon, description, kbd, children }: Pick<MenuItemProps, 'icon' | 'description' | 'kbd' | 'children'>) {
  return (
    <>
      {icon ? (
        <span className="grid size-4 shrink-0 place-items-center text-ink-secondary group-data-danger:text-danger">
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={16} strokeWidth={1.8} /> : icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{children}</span>
        {description ? <span className="text-xs font-normal text-ink-muted">{description}</span> : null}
      </span>
      {kbd ? <kbd className="ml-auto font-mono text-xs text-ink-muted">{kbd}</kbd> : null}
    </>
  );
}

export function MenuItem({ children, icon, description, kbd, danger, disabled, onSelect, to }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  const select = () => {
    if (disabled) return;
    onSelect?.();
    ctx?.close(!to);
  };
  const classes = cx('group', itemClass, danger ? 'text-danger' : 'text-ink');
  const content = <ItemContent icon={icon} description={description} kbd={kbd}>{children}</ItemContent>;
  if (to && !disabled) {
    return (
      <Link to={to} role="menuitem" tabIndex={-1} data-danger={danger || undefined} className={classes} onClick={select}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-danger={danger || undefined}
      className={classes}
      onClick={select}
    >
      {content}
    </button>
  );
}

export function MenuItemRadio({
  children,
  checked,
  description,
  onSelect,
}: {
  children: ReactNode;
  checked: boolean;
  description?: ReactNode;
  onSelect: () => void;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      className={cx(itemClass, 'justify-between text-ink aria-checked:font-semibold')}
      onClick={() => {
        onSelect();
        ctx?.close(true);
      }}
    >
      <span className="flex min-w-0 flex-col">
        <span>{children}</span>
        {description ? <span className="text-xs font-normal text-ink-muted">{description}</span> : null}
      </span>
      <span className={cx('text-brand', !checked && 'invisible')}>
        <Icon name="check" size={16} strokeWidth={2.25} />
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-1 my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-muted uppercase">{children}</div>;
}
