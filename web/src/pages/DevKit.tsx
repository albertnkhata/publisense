import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import fixtures from '../dev/fixtures.json';
import { usePageTitle } from '../lib/usePageTitle';
import { useViewer } from '../lib/viewer';
import {
  BoardAvatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  HubAvatar,
  Icon,
  ICON_NAMES,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuItemRadio,
  MenuLabel,
  MenuSeparator,
  PasswordInput,
  Select,
  Skeleton,
  STATUS_META,
  StatusPill,
  TabPanel,
  Tabs,
  TeamPill,
  Textarea,
  Tooltip,
  TypePill,
  UserAvatar,
  useToast,
  VerifiedPill,
  type ButtonVariant,
  type PostStatus,
} from '../ui';

/**
 * /dev/kit: every primitive in every variant, rendered side by side in the
 * light and dark themes. The review surface for FOUNDATION §3–4.
 */
export default function DevKit() {
  usePageTitle('Kit');
  const { viewer, setPreviewSignedIn } = useViewer();
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-4">
        <div className="flex-1">
          <h1 className="m-0 text-xl font-bold">Publisense kit</h1>
          <p className="m-0 text-sm text-ink-muted">Tokens and primitives from FOUNDATION §3–4, in both themes.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={Boolean(viewer)}
            onChange={(e) => setPreviewSignedIn(e.target.checked)}
            className="size-4 accent-brand"
          />
          Preview the shell signed in
        </label>
        <Link to="/" className="text-sm font-semibold text-brand no-underline hover:underline">
          Open the app shell
        </Link>
      </header>
      <div className="grid grid-cols-2 max-lg:grid-cols-1">
        <section data-theme="light" aria-label="Light theme" className="min-w-0 bg-page p-6 text-ink max-sm:p-4">
          <KitContent theme="Light" />
        </section>
        <section data-theme="dark" aria-label="Dark theme" className="min-w-0 bg-page p-6 text-ink max-sm:p-4">
          <KitContent theme="Dark" />
        </section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mt-0 mb-3 text-xs font-semibold text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-3">{children}</div>;
}

const SWATCHES = [
  ['bg-page', '--bg-page'],
  ['bg-card', '--bg-card'],
  ['bg-subtle', '--bg-subtle'],
  ['bg-elevated', '--bg-elevated'],
  ['bg-line', '--border-subtle'],
  ['bg-line-strong', '--border-strong'],
  ['bg-ink', '--ink-primary'],
  ['bg-ink-secondary', '--ink-secondary'],
  ['bg-ink-muted', '--ink-muted'],
  ['bg-brand', '--brand'],
  ['bg-brand-hover', '--brand-hover'],
  ['bg-brand-soft', '--brand-soft'],
  ['bg-success', '--success'],
  ['bg-warning', '--warning'],
  ['bg-danger', '--danger'],
] as const;

const TEXT_SIZES = [
  ['text-xs', 'xs · 11'],
  ['text-sm', 'sm · 12.5'],
  ['text-base', 'base · 14'],
  ['text-md', 'md · 15'],
  ['text-lg', 'lg · 17'],
  ['text-xl', 'xl · 20'],
  ['text-2xl', '2xl · 24'],
] as const;

const RADII = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-pill'] as const;
const SPACES = ['w-1', 'w-2', 'w-3', 'w-4', 'w-5', 'w-6', 'w-7', 'w-8', 'w-9', 'w-10'] as const;
const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

function KitContent({ theme }: { theme: string }) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<'md' | 'lg' | null>(null);
  const [tab, setTab] = useState<'all' | 'following' | 'roadmap'>('all');
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [password, setPassword] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const tabsId = `kit-tabs-${theme.toLowerCase()}`;

  return (
    <div>
      <h2 className="mt-0 mb-6 text-lg font-bold">{theme}</h2>

      <Section title="Colour">
        <div className="grid grid-cols-5 gap-3 max-sm:grid-cols-3">
          {SWATCHES.map(([cls, name]) => (
            <div key={name} className="flex flex-col gap-1">
              <span className={`h-8 rounded-md border border-line ${cls}`} />
              <span className="font-mono text-xs text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-1">
          {TEXT_SIZES.map(([cls, label]) => (
            <p key={cls} className={`m-0 ${cls}`}>
              Feedback the team can act on <span className="font-mono text-xs text-ink-muted">{label}</span>
            </p>
          ))}
        </div>
        <Row>
          <span className="font-normal">Regular 400</span>
          <span className="font-medium">Medium 500</span>
          <span className="font-semibold">Semibold 600</span>
          <span className="font-bold">Bold 700</span>
          <span className="font-mono text-sm">Mono 1,284</span>
        </Row>
        <Row>
          <span className="text-ink">Primary ink</span>
          <span className="text-ink-secondary">Secondary ink</span>
          <span className="text-ink-muted">Muted ink</span>
          <span className="text-brand">Brand</span>
        </Row>
      </Section>

      <Section title="Radius and space">
        <Row>
          {RADII.map((r) => (
            <span key={r} className={`grid size-9 place-items-center border border-line-strong bg-subtle font-mono text-xs text-ink-muted ${r}`}>
              {r.replace('rounded-', '')}
            </span>
          ))}
        </Row>
        <div className="flex flex-col gap-1">
          {SPACES.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <span className="w-7 font-mono text-xs text-ink-muted">s-{i + 1}</span>
              <span className={`h-2 rounded-sm bg-brand ${s}`} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Icon">
        <div className="flex flex-wrap gap-2">
          {ICON_NAMES.map((name) => (
            <Tooltip key={name} content={name}>
              <span tabIndex={0} aria-label={name} className="grid size-8 place-items-center rounded-md border border-line text-ink-secondary">
                <Icon name={name} size={18} />
              </span>
            </Tooltip>
          ))}
        </div>
      </Section>

      <Section title="Button">
        {VARIANTS.map((v) => (
          <Row key={v}>
            <Button variant={v} size="md">
              {v[0]!.toUpperCase() + v.slice(1)}
            </Button>
            <Button variant={v} size="sm">
              Small
            </Button>
            <Button variant={v} icon="plus">
              With icon
            </Button>
            <Button variant={v} loading>
              Saving
            </Button>
            <Button variant={v} disabled>
              Disabled
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="IconButton">
        <Row>
          <IconButton icon="more" label="More options" />
          <IconButton icon="close" label="Close" />
          <IconButton icon="search" label="Search" variant="secondary" />
          <IconButton icon="share" label="Share" size="sm" />
          <IconButton icon="bookmark" label="Saved" aria-pressed={true} />
          <IconButton icon="flag" label="Report" disabled />
        </Row>
      </Section>

      <Section title="Field">
        <div className="flex flex-col gap-4">
          <Field label="Title" hint="Sum it up in one line" aside="0/120">
            <Input ref={nameRef} placeholder="Sum it up in one line" maxLength={120} />
          </Field>
          <Field label="Work email" error="Use an address at the product’s domain">
            <Input type="email" defaultValue="me@gmail.com" />
          </Field>
          <Field label="Details" optional>
            <Textarea placeholder="What happened, what you expected, and any workaround." />
          </Field>
          <Field label="Type">
            <Select defaultValue="">
              <option value="" disabled>
                Choose a type
              </option>
              <option value="bug">Bug</option>
              <option value="feature">Feature request</option>
            </Select>
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput showStrength value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          </Field>
          <Field label="Disabled">
            <Input disabled defaultValue="Read only" />
          </Field>
        </div>
      </Section>

      <Section title="Menu">
        <Row>
          <Menu label="Post options" align="start" trigger={(p) => <IconButton {...p} icon="more" label="More options" />}>
            <MenuItem icon="bell" description="Get status changes and team replies" onSelect={() => toast('Following post')}>
              Follow post
            </MenuItem>
            <MenuItem icon="bookmark">Save</MenuItem>
            <MenuItem icon="link" kbd="⌘L" onSelect={() => toast('Link copied')}>
              Copy link
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="eye-off" disabled>
              Hide
            </MenuItem>
            <MenuItem icon="flag" danger>
              Report
            </MenuItem>
          </Menu>
          <Menu
            align="start"
            label="Sort feed"
            trigger={(p) => (
              <button
                type="button"
                {...p}
                className="inline-flex items-center gap-1 rounded-sm border-0 bg-transparent py-1 pr-1 pl-2 text-sm font-semibold text-ink-secondary hover:bg-subtle hover:text-ink aria-expanded:bg-subtle"
              >
                {sort === 'top' ? 'Top' : 'New'}
                <Icon name="chevron-down" size={14} />
              </button>
            )}
          >
            <MenuLabel>Sort by</MenuLabel>
            <MenuItemRadio checked={sort === 'top'} description="Most upvoted" onSelect={() => setSort('top')}>
              Top
            </MenuItemRadio>
            <MenuItemRadio checked={sort === 'new'} description="Most recent first" onSelect={() => setSort('new')}>
              New
            </MenuItemRadio>
          </Menu>
        </Row>
      </Section>

      <Section title="Tabs">
        <Tabs
          idBase={tabsId}
          label="Feed"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All' },
            { value: 'following', label: 'Following' },
            { value: 'roadmap', label: 'Roadmap', count: 12 },
          ]}
        />
        <TabPanel idBase={tabsId} value={tab} className="pt-3 text-sm text-ink-secondary">
          Showing: {tab}
        </TabPanel>
      </Section>

      <Section title="Dialog">
        <Row>
          <Button variant="secondary" onClick={() => setDialog('md')}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setDialog('lg')}>
            Open large dialog
          </Button>
          <span className="text-sm text-ink-muted">Bottom sheet below 520px</span>
        </Row>
        <Dialog
          open={dialog !== null}
          size={dialog ?? 'md'}
          onClose={() => setDialog(null)}
          title={dialog === 'lg' ? 'Post feedback' : 'Claim a board'}
          description="Focus stays inside, Escape closes, and focus returns to the button."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={() => setDialog(null)}>Continue</Button>
            </>
          }
        >
          <Field label="Work email">
            <Input type="email" placeholder="you@company.com" />
          </Field>
        </Dialog>
      </Section>

      <Section title="Toast">
        <Row>
          <Button variant="secondary" onClick={() => toast('Link copied')}>
            Show toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ message: 'Post merged', onUndo: () => toast('Merge undone') })}
          >
            Toast with Undo
          </Button>
        </Row>
      </Section>

      <Section title="Avatar">
        <Row>
          {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map((s) => (
            <UserAvatar key={s} size={s} />
          ))}
        </Row>
        <Row>
          {fixtures.boards.map((b, i) => (
            <BoardAvatar key={b.name} name={b.name} color={b.color} size={(['sm', 'md', 'lg', 'xl', '2xl'] as const)[i] ?? 'md'} />
          ))}
          <BoardAvatar name="No colour" size="md" />
        </Row>
        <Row>
          <HubAvatar name="Acme hub" boards={fixtures.boards} size="xs" />
          <HubAvatar name="Acme hub" boards={fixtures.boards} size="sm" />
          <HubAvatar name="Acme hub" boards={fixtures.boards} size="md" max={4} />
        </Row>
      </Section>

      <Section title="Pill">
        <Row>
          {(Object.keys(STATUS_META) as PostStatus[]).map((s) => (
            <StatusPill key={s} status={s} />
          ))}
          <StatusPill status="shipped" detail="v0.42.1" />
        </Row>
        <Row>
          <TypePill type="bug" />
          <TypePill type="feature" />
          <VerifiedPill />
          <TeamPill />
        </Row>
      </Section>

      <Section title="Card">
        <div className="flex flex-col gap-3">
          <Card>
            <p className="m-0 text-base">A bordered surface with no shadow.</p>
          </Card>
          <Card gutter={<UserAvatar size="md" />} as="article">
            <p className="m-0 text-sm text-ink-muted">@jmwamba · 4h ago</p>
            <h3 className="mt-1 mb-1 text-md font-semibold">Card with the 40px avatar gutter</h3>
            <p className="m-0 text-base text-ink-secondary">Replies, official responses and post cards share this column.</p>
          </Card>
          <Card interactive padding="sm">
            <p className="m-0 text-sm">Interactive, small padding</p>
          </Card>
        </div>
      </Section>

      <Section title="EmptyState">
        <Card padding="none">
          <EmptyState icon="bell" title="No notifications yet" action={<Button variant="secondary">Explore boards</Button>}>
            Follow boards and posts to hear when they change.
          </EmptyState>
        </Card>
      </Section>

      <Section title="Skeleton">
        <div className="flex flex-col gap-3">
          <Skeleton variant="header" />
          <Skeleton variant="row" />
          <Skeleton variant="card" />
        </div>
      </Section>

      <Section title="Tooltip">
        <Row>
          <Tooltip content="Upvote" side="top">
            <Button variant="secondary" icon="arrow-up">
              92
            </Button>
          </Tooltip>
          <Tooltip content="Post feedback" kbd="C" side="right">
            <IconButton icon="plus" label="Post feedback" variant="secondary" />
          </Tooltip>
          <Tooltip content="Below" side="bottom">
            <Button variant="ghost">Bottom</Button>
          </Tooltip>
        </Row>
      </Section>
    </div>
  );
}
