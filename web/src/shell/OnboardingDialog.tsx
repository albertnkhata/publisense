import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { boardKeys, compactCount, isLive, logoSrc, markOnboarded, matchesAll, setScopeFollow, useBoards, type Board } from '../api';
import { cx } from '../lib/cx';
import { useViewer } from '../lib/viewer';
import { BoardAvatar, Button, Dialog, Icon, Input, SkeletonBlock, useToast } from '../ui';

/** Boards shown before anything is typed: the most active ones. */
export const ONBOARDING_SHOWN = 12;
/** Picks needed before Continue unlocks; Skip is always there. */
export const ONBOARDING_MIN = 3;

export const ONBOARDING_COPY = {
  title: 'Follow a few products',
  description: 'Their posts fill your Following feed.',
  search: 'Search products',
  none: 'No products match that.',
  skip: 'Skip',
  cont: 'Continue',
  failed: 'We couldn’t follow some of those. Try again from their boards.',
};

/** Most active first: posts, then followers, then name. */
export function onboardingBoards(boards: Board[], q: string): Board[] {
  const live = boards.filter(isLive);
  const term = q.trim();
  const list = term ? live.filter((b) => matchesAll(`${b.name} ${b.tagline ?? ''}`, term)) : live;
  const sorted = [...list].sort((a, b) => b.post_count - a.post_count || b.follower_count - a.follower_count || a.name.localeCompare(b.name));
  return term ? sorted : sorted.slice(0, ONBOARDING_SHOWN);
}

/**
 * First-run onboarding, once per new account: pick a few products to follow,
 * then land on the Following feed. Finishing, Skip, Escape or closing all mark
 * it done (user metadata), so it never comes back on any device.
 */
export function OnboardingDialog() {
  const { viewer, refresh } = useViewer();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const open = Boolean(viewer?.onboard);
  const boards = useBoards();
  const [done, setDone] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => onboardingBoards(boards.data ?? [], q), [boards.data, q]);

  if (!open || done || !viewer) return null;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish(follow: boolean) {
    if (busy) return;
    if (!follow) {
      setDone(true);
      await markOnboarded();
      refresh();
      return;
    }
    setBusy(true);
    const results = await Promise.allSettled([...picked].map((id) => setScopeFollow('board', id, viewer!.id, true)));
    await markOnboarded();
    setBusy(false);
    setDone(true);
    if (results.some((r) => r.status === 'rejected')) toast(ONBOARDING_COPY.failed);
    void qc.invalidateQueries({ queryKey: boardKeys.follows(viewer!.id) });
    void qc.invalidateQueries({ queryKey: boardKeys.boards });
    void qc.invalidateQueries({ queryKey: ['posts', 'feed', 'following'] });
    refresh();
    navigate('/?scope=following');
  }

  const ready = picked.size >= ONBOARDING_MIN;
  return (
    <Dialog
      open
      size="lg"
      onClose={() => void finish(false)}
      dismissable={false}
      title={ONBOARDING_COPY.title}
      description={ONBOARDING_COPY.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => void finish(false)} disabled={busy}>
            {ONBOARDING_COPY.skip}
          </Button>
          <Button onClick={() => void finish(true)} disabled={!ready} loading={busy}>
            {ready ? ONBOARDING_COPY.cont : `${ONBOARDING_COPY.cont} (${picked.size}/${ONBOARDING_MIN})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          aria-label={ONBOARDING_COPY.search}
          placeholder={ONBOARDING_COPY.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {boards.isLoading ? (
          <div aria-hidden="true" className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-line p-3">
                <SkeletonBlock className="size-7 rounded-sm" />
                <SkeletonBlock className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-ink-muted">{ONBOARDING_COPY.none}</p>
        ) : (
          <ul aria-label="Products" className="m-0 grid list-none grid-cols-2 gap-2 p-0 max-sm:grid-cols-1">
            {shown.map((b) => {
              const on = picked.has(b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(b.id)}
                    className={cx(
                      'flex w-full min-w-0 items-center gap-3 rounded-md border bg-card p-3 text-left transition-colors duration-120',
                      on ? 'border-brand' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <BoardAvatar name={b.name} color={b.color} logoSrc={logoSrc(b)} size="md" decorative />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold text-ink">{b.name}</span>
                      <span className="truncate text-sm text-ink-muted">
                        {b.post_count > 0 ? `${compactCount(b.post_count)} ${b.post_count === 1 ? 'post' : 'posts'}` : b.tagline}
                      </span>
                    </span>
                    <span className={cx('shrink-0', on ? 'text-brand' : 'text-ink-muted')} aria-hidden="true">
                      <Icon name={on ? 'check' : 'plus'} size={16} strokeWidth={2.2} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
