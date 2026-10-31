import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  PRODUCT_NAME_MAX,
  PRODUCT_CATEGORIES,
  ProductError,
  PRODUCT_TAGLINE_MAX,
  useCreateBoard,
  useLinkCheck,
  useLinkPreview,
  validateProduct,
  type BoardCategory,
  type CompanyChoice,
  type LinkMatch,
  type NewProduct,
} from '../api';
import { useClaim } from '../claim/ClaimDialog';
import { cx } from '../lib/cx';
import { parseLink } from '../lib/link';
import { useViewer } from '../lib/viewer';
import { useAuthDialog } from '../shell/auth';
import { useComposer } from '../shell/composer';
import { BoardAvatar, Button, Dialog, Field, Icon, Input, useToast } from '../ui';
import { CompanyPicker } from './CompanyPicker';
import { useDebounced } from '../lib/useDebounced';

/**
 * Add a product (0024). Paste a link (a product website or a GitHub repo); the name,
 * one-line description and logo fill in from it; pick a category. Company (0026, optional)
 * is prefilled when the link is on a company's domain, else a typeahead over companies
 * with "New company: …"; empty is fine (indie products, GitHub repos). If the product is
 * already here the form says so and links to it instead. New boards wait for review,
 * and the person who added one goes straight to posting on it.
 *
 * Opened from search with no results, the composer's product picker and the bottom
 * of Explore. Signed out, it asks them to sign up first.
 *
 * The provider sits above the composer (which offers "Add a product"); the dialog
 * itself renders through <AddProductHost/>, inside the composer and claim providers,
 * because after submit it opens the composer and may offer the claim flow.
 */
export interface AddProductOptions {
  /** Prefill: a link or a name (search's "Can't find it? Add it"). */
  prefill?: string;
}

interface AddProductCtx {
  openAddProduct: (opts?: AddProductOptions) => void;
}

interface HostState {
  open: boolean;
  opts: AddProductOptions;
  key: number;
  close: () => void;
}

const AddProductContext = createContext<(AddProductCtx & { host: HostState }) | null>(null);

export function AddProductProvider({ children }: { children: ReactNode }) {
  const { viewer } = useViewer();
  const { openAuth } = useAuthDialog();
  const [state, setState] = useState<{ open: boolean; opts: AddProductOptions; key: number }>({ open: false, opts: {}, key: 0 });
  const openAddProduct = useCallback(
    (opts?: AddProductOptions) => {
      if (!viewer) {
        openAuth('signup', 'add a product');
        return;
      }
      const clean: AddProductOptions = opts && typeof opts === 'object' && !('nativeEvent' in opts) ? { prefill: opts.prefill } : {};
      setState((s) => ({ open: true, opts: clean, key: s.key + 1 }));
    },
    [viewer, openAuth],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ openAddProduct, host: { ...state, close } }), [openAddProduct, state, close]);
  return <AddProductContext.Provider value={value}>{children}</AddProductContext.Provider>;
}

/** `openAddProduct`, or null outside the app shell (entry points then hide themselves). */
export function useAddProduct(): AddProductCtx | null {
  const ctx = useContext(AddProductContext);
  return ctx ? { openAddProduct: ctx.openAddProduct } : null;
}

export function AddProductHost() {
  const ctx = useContext(AddProductContext);
  if (!ctx || !ctx.host.open) return null;
  return <AddProductDialog key={ctx.host.key} opts={ctx.host.opts} onClose={ctx.host.close} />;
}

// ------------------------------------------------------------------ the dialog


/** The URL once the browser has loaded it as an image, else null (no broken tiles). */
function useLoadedImage(src: string | null | undefined): string | null {
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    const img = new Image();
    img.onload = () => live && setOk(src);
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return src && ok === src ? src : null;
}

function initialFrom(prefill: string | undefined): { link: string; name: string } {
  const p = (prefill ?? '').trim();
  if (!p) return { link: '', name: '' };
  return /\./.test(p) && !/\s/.test(p) && parseLink(p) ? { link: p, name: '' } : { link: '', name: p.slice(0, PRODUCT_NAME_MAX) };
}

function AddProductDialog({ opts, onClose }: { opts: AddProductOptions; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openComposer } = useComposer();
  const { openClaim } = useClaim();
  const create = useCreateBoard();
  const formId = useId();
  const linkRef = useRef<HTMLInputElement>(null);
  const start = useMemo(() => initialFrom(opts.prefill), [opts.prefill]);

  const [link, setLink] = useState(start.link);
  const [name, setName] = useState(start.name);
  const [tagline, setTagline] = useState('');
  const [category, setCategory] = useState<BoardCategory | null>(null);
  // A name carried over from the search box is only a guess: the site's own name
  // replaces it until the person types in the field.
  const [touched, setTouched] = useState({ name: false, tagline: false });
  const [errors, setErrors] = useState<Partial<Record<keyof NewProduct, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [lateMatch, setLateMatch] = useState<LinkMatch | null>(null);
  const [company, setCompany] = useState<CompanyChoice | null>(null);
  const [companyText, setCompanyText] = useState('');
  /** The person picked, changed or cleared the company themselves; stop prefilling. */
  const [companyTouched, setCompanyTouched] = useState(false);

  const debounced = useDebounced(link.trim(), 300);
  const parsed = parseLink(debounced);
  const check = useLinkCheck(debounced);
  const match = lateMatch ?? check.data?.match ?? null;
  const preview = useLinkPreview(debounced, Boolean(parsed) && check.isSuccess && !match);
  const icon = useLoadedImage(!match ? preview.data?.icon_url : null);
  const linkInvalid = debounced.length > 0 && !parsed;
  const domainHub = !match && check.data?.kind === 'site' ? (check.data.hub ?? null) : null;

  // Prefill Company from the link's domain until the person touches the field, and drop
  // the prefill again when the link moves off that domain.
  useEffect(() => {
    if (companyTouched || !check.data) return;
    if (domainHub) {
      if (company?.kind !== 'hub' || company.id !== domainHub.id) setCompany({ kind: 'hub', id: domainHub.id, slug: domainHub.slug, name: domainHub.name, status: 'live' });
    } else if (company) {
      setCompany(null);
    }
  }, [domainHub, company, companyTouched, check.data]);
  const suggested = (() => {
    const c = preview.data?.company?.trim();
    if (!c || domainHub || c.toLowerCase() === name.trim().toLowerCase()) return null;
    return c;
  })();

  // Autofill whatever the person has not typed themselves.
  const filled = useRef<string | null>(null);
  useEffect(() => {
    const p = preview.data;
    if (!p || filled.current === p.canonical) return;
    filled.current = p.canonical;
    if (!touched.name && p.name) setName(p.name.slice(0, PRODUCT_NAME_MAX));
    if (!touched.tagline && p.description) setTagline(p.description.slice(0, PRODUCT_TAGLINE_MAX));
  }, [preview.data, touched.name, touched.tagline]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (create.isPending) return;
    const chosen: CompanyChoice | null = company ?? (companyText.trim() ? { kind: 'new', name: companyText.replace(/\s+/g, ' ').trim() } : null);
    const v = { link, name, tagline, category: category ?? undefined, company: chosen };
    const found = validateProduct(v);
    setErrors(found);
    if (Object.keys(found).length || !category || match) return;
    setFailure(null);
    // Send the canonical repo link GitHub answered with (a renamed repo resolves to its new name).
    const sendLink = preview.data?.kind === 'github' ? `https://${preview.data.canonical}` : link;
    create.mutate(
      { link: sendLink, name, tagline, category, ...(chosen ? { company: chosen } : {}) },
      {
        onSuccess: ({ created }) => {
          onClose();
          toast(`${created.name} added · it goes live once it’s reviewed`);
          void navigate(`/b/${created.slug}`);
          openComposer({
            board: created.slug,
            firstPost: true,
            ...(created.can_claim ? { onClaim: () => openClaim({ board: created.slug }) } : {}),
          });
        },
        onError: (err) => {
          if (err instanceof ProductError && err.code === 'exists') setLateMatch(err.match ?? { status: 'live', mine: false });
          else setFailure(err instanceof Error ? err.message : 'We couldn’t add this product. Try again.');
        },
      },
    );
  };

  const blocked = Boolean(match);
  const checking = Boolean(parsed) && check.isFetching && !check.data;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a product"
      description="Give people a board to tell its team what to fix and build."
      initialFocus={linkRef}
      dismissable={!create.isPending}
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted max-sm:hidden">New products are reviewed before they’re public</span>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={blocked || checking} loading={create.isPending}>
            Add product
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label="Link"
          error={errors.link ?? (linkInvalid ? 'Paste a product website or a GitHub repo link.' : undefined)}
        >
          <Input
            ref={linkRef}
            type="url"
            inputMode="url"
            value={link}
            placeholder="https://acme.dev or github.com/owner/repo"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setLink(e.target.value);
              setLateMatch(null);
              setErrors((x) => ({ ...x, link: undefined }));
            }}
          />
        </Field>

        {match ? <AlreadyHere match={match} onOpen={onClose} /> : null}

        {!match ? (
          <>
            <div className="flex items-center gap-3">
              <BoardAvatar name={name.trim() || '?'} color={null} logoSrc={icon} size="xl" decorative />
              <p className="m-0 text-sm text-ink-muted" aria-live="polite">
                {parsed && preview.isFetching
                  ? 'Looking up the product…'
                  : icon
                    ? 'Logo from the product’s site. Its team can change it after claiming the board.'
                    : 'Its first letter stands in until the team adds a logo.'}
              </p>
            </div>

            <Field label="Name" error={errors.name} aside={`${name.length}/${PRODUCT_NAME_MAX}`}>
              <Input
                value={name}
                maxLength={PRODUCT_NAME_MAX}
                placeholder="Acme"
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setTouched((t) => ({ ...t, name: true }));
                  setErrors((x) => ({ ...x, name: undefined }));
                }}
              />
            </Field>

            <CompanyPicker
              value={company}
              onChange={(c) => {
                setCompany(c);
                setCompanyTouched(true);
                setErrors((x) => ({ ...x, company: undefined }));
              }}
              text={companyText}
              onText={(t) => {
                setCompanyText(t);
                setErrors((x) => ({ ...x, company: undefined }));
              }}
              removable={!domainHub}
              suggestion={suggested}
              error={errors.company}
              hint={
                !domainHub
                  ? undefined
                  : company?.kind === 'hub' && company.id === domainHub.id
                    ? `${check.data?.canonical ?? 'This domain'} belongs to ${domainHub.name}.`
                    : !company && !companyText.trim()
                      ? `Left empty, it joins ${domainHub.name}, which owns ${check.data?.canonical ?? 'this domain'}.`
                      : undefined
              }
            />

            <Field label="Description" optional error={errors.tagline} aside={`${tagline.length}/${PRODUCT_TAGLINE_MAX}`}>
              <Input
                value={tagline}
                maxLength={PRODUCT_TAGLINE_MAX}
                placeholder="What it is, in one line"
                autoComplete="off"
                onChange={(e) => {
                  setTagline(e.target.value.replace(/[\r\n]+/g, ' '));
                  setTouched((t) => ({ ...t, tagline: true }));
                }}
              />
            </Field>

            <CategoryField
              value={category}
              error={errors.category}
              onChange={(c) => {
                setCategory(c);
                setErrors((x) => ({ ...x, category: undefined }));
              }}
            />
          </>
        ) : null}

        <p className="m-0 hidden text-center text-sm text-ink-muted max-sm:block">New products are reviewed before they’re public</p>
        {failure ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {failure}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** "It's already here": the board, or a note that it waits for review. */
function AlreadyHere({ match, onOpen }: { match: LinkMatch; onOpen: () => void }) {
  const pending = match.status === 'pending';
  return (
    <section aria-live="polite" aria-label="Already on Publisense" className="flex items-center gap-3 rounded-md border border-line bg-elevated px-3 py-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-card text-brand">
        <Icon name="check" size={15} strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-base font-semibold text-ink">It’s already here</b>
        <span className="text-sm text-ink-muted">
          {pending && match.mine
            ? 'You added it. It goes live once it’s reviewed.'
            : pending
              ? 'Someone added it a moment ago. It goes live once it’s reviewed.'
              : 'Post on its board instead. Your feedback counts the same.'}
        </span>
      </span>
      {match.slug ? (
        <Link
          to={`/b/${match.slug}`}
          onClick={onOpen}
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-line-strong bg-card px-3 text-sm font-semibold text-ink no-underline transition-colors duration-120 hover:bg-subtle"
        >
          Go to {match.name ?? 'board'}
        </Link>
      ) : null}
    </section>
  );
}

function CategoryField({ value, error, onChange }: { value: BoardCategory | null; error?: string | undefined; onChange: (c: BoardCategory) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-semibold text-ink">
        Category
      </span>
      <div role="radiogroup" aria-labelledby={labelId} aria-invalid={error ? true : undefined} className="flex flex-wrap gap-2">
        {PRODUCT_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            onClick={() => onChange(c.value)}
            className={cx(
              'h-7 rounded-pill border px-3 text-sm font-medium transition-colors duration-120',
              value === c.value ? 'border-ink bg-ink text-card' : 'border-line bg-card text-ink-secondary hover:border-line-strong hover:text-ink',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "Can't find it? Add it" link-button used by search, the composer and Explore. */
export function AddProductLink({ prefill, children = 'Add it', className }: { prefill?: string; children?: ReactNode; className?: string }) {
  const ctx = useAddProduct();
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.openAddProduct(prefill ? { prefill } : undefined)}
      className={cx('border-0 bg-transparent p-0 font-semibold text-brand underline-offset-3 hover:underline', className)}
    >
      {children}
    </button>
  );
}
