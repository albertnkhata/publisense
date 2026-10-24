import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { COMPANY_NAME_MAX, useCompanySearch, type CompanyChoice, type CompanyOption } from '../api';
import { Button, Icon, IconButton } from '../ui';

/**
 * Company (0026): which company makes a product. A company is a hub. The value is an
 * existing hub, a new company by name, or nothing (indie products, GitHub repos).
 *
 *   chosen      a chip with the company's name, and Change (plus a remove button when
 *               `removable`). A new company carries a "New" tag.
 *   not chosen  a typeahead over live companies, with "New company: <typed>" at the
 *               end unless the typed name matches one exactly. Text typed but not picked
 *               is kept by the parent (`text`), which sends it as a company name.
 *
 * Used by the Add a product form and the admin approve dialog.
 */
export interface CompanyPickerProps {
  value: CompanyChoice | null;
  onChange: (v: CompanyChoice | null) => void;
  /** What is typed while nothing is chosen. */
  text: string;
  onText: (t: string) => void;
  label?: string;
  hint?: ReactNode;
  error?: string | undefined;
  /** Offer "New company: …" (default true). */
  allowNew?: boolean;
  /** Show a remove button on the chip (default true). Change is always there. */
  removable?: boolean;
  /** A name the product's page gave (og:site_name), offered as one click. */
  suggestion?: string | null;
}

export function CompanyPicker({
  value,
  onChange,
  text,
  onText,
  label = 'Company',
  hint,
  error,
  allowNew = true,
  removable = true,
  suggestion,
}: CompanyPickerProps) {
  const id = useId();
  const listId = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const focusNext = useRef(false);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const term = text.trim();
  const search = useCompanySearch(term, !value);

  useEffect(() => {
    if (!value && focusNext.current) {
      focusNext.current = false;
      inputRef.current?.focus();
      setOpen(true);
    }
  }, [value]);

  const items = useMemo(() => {
    const found: Array<{ key: string; option: CompanyOption | null; label: string }> = (search.data ?? []).map((o) => ({ key: o.id, option: o, label: o.name }));
    const exact = found.some((f) => f.label.toLowerCase() === term.toLowerCase());
    if (allowNew && term && !exact) found.push({ key: 'new', option: null, label: term.slice(0, COMPANY_NAME_MAX) });
    return found;
  }, [search.data, term, allowNew]);
  const active = Math.min(hl, Math.max(items.length - 1, 0));
  const shown = open && term.length > 0 && !value;

  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    onChange(it.option ? { kind: 'hub', id: it.option.id, slug: it.option.slug, name: it.option.name, status: 'live' } : { kind: 'new', name: it.label });
    onText('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) {
        if (term) setOpen(true);
        return;
      }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHl((active + d + items.length) % Math.max(items.length, 1));
    } else if (e.key === 'Enter') {
      if (shown && items[active]) {
        e.preventDefault();
        pick(active);
      }
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const change = () => {
    focusNext.current = true;
    onText(value ? '' : text);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`${id}-input`} id={`${id}-label`} className="text-sm font-semibold text-ink">
          {label}
          <span className="ml-1 font-normal text-ink-muted">Optional</span>
        </label>
      </div>
      {value ? (
        <div role="group" aria-labelledby={`${id}-label`} className="flex items-center gap-2">
          <span
            data-company-chip
            className="inline-flex h-7 min-w-0 items-center gap-2 rounded-pill border border-line-strong bg-subtle pr-3 pl-2 text-base font-semibold text-ink"
          >
            <Icon name="hub" size={14} className="shrink-0 text-ink-muted" />
            <span className="truncate">{value.name}</span>
            {value.kind === 'new' || value.status === 'pending' ? (
              <span className="rounded-pill bg-card px-2 text-xs font-medium text-ink-muted">New</span>
            ) : null}
          </span>
          <Button size="sm" variant="ghost" onClick={change} aria-label={`Change company (${value.name})`}>
            Change
          </Button>
          {removable ? <IconButton icon="close" size="sm" label={`Remove ${value.name}`} onClick={() => onChange(null)} /> : null}
        </div>
      ) : (
        <div className="relative">
          <span className="flex h-8 items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-ink-muted focus-within:border-ink-muted aria-invalid:border-danger" aria-invalid={error ? true : undefined}>
            <Icon name="search" size={15} />
            <input
              ref={inputRef}
              id={`${id}-input`}
              type="text"
              role="combobox"
              aria-expanded={shown}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
              aria-invalid={error ? true : undefined}
              aria-activedescendant={shown && items[active] ? `${listId}-${items[active].key}` : undefined}
              placeholder="Who makes it? Leave empty if it’s independent"
              autoComplete="off"
              maxLength={COMPANY_NAME_MAX}
              value={text}
              onChange={(e) => {
                onText(e.target.value);
                setHl(0);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKeyDown}
              className="w-full min-w-0 appearance-none border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none max-md:text-md"
            />
          </span>
          {shown ? (
            <div
              id={listId}
              role="listbox"
              aria-label="Companies"
              onMouseDown={(e) => e.preventDefault()}
              className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-card py-1 shadow-overlay"
            >
              {items.map((it, i) => (
                <button
                  key={it.key}
                  id={`${listId}-${it.key}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onClick={() => pick(i)}
                  onMouseEnter={() => setHl(i)}
                  className="flex w-full items-center gap-3 border-0 bg-transparent px-3 py-2 text-left aria-selected:bg-subtle"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-subtle text-ink-muted">
                    <Icon name={it.option ? 'hub' : 'plus'} size={15} />
                  </span>
                  {it.option ? (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold text-ink">{it.label}</span>
                      {it.option.primary_domain ? <span className="truncate text-sm text-ink-muted">{it.option.primary_domain}</span> : null}
                    </span>
                  ) : (
                    <span className="truncate text-base text-ink">
                      New company: <b className="font-semibold">{it.label}</b>
                    </span>
                  )}
                </button>
              ))}
              {items.length === 0 ? <p className="m-0 px-3 py-3 text-sm text-ink-muted">{search.isFetching ? 'Searching…' : `No company matches “${term}”.`}</p> : null}
            </div>
          ) : null}
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!value && !term && suggestion ? (
        <p className="m-0 text-sm text-ink-muted">
          Its site says{' '}
          <button
            type="button"
            onClick={() => {
              onText(suggestion.slice(0, COMPANY_NAME_MAX));
              setHl(0);
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="border-0 bg-transparent p-0 font-semibold text-brand underline-offset-3 hover:underline"
          >
            {suggestion}
          </button>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="m-0 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
