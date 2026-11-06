import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { OnboardingDialog, onboardingBoards, ONBOARDING_COPY, ONBOARDING_SHOWN } from '../shell/OnboardingDialog';
import { viewerFrom, type Viewer } from '../lib/viewer';
import type { Board } from '../api';
import { renderWith } from './renderApp';

const api = vi.hoisted(() => ({ markOnboarded: vi.fn(), fetchBoards: vi.fn(), setScopeFollow: vi.fn() }));
vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  markOnboarded: api.markOnboarded,
}));
vi.mock('../api/boards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/boards')>()),
  fetchBoards: api.fetchBoards,
  setScopeFollow: api.setScopeFollow,
}));

const board = (n: number, posts: number, extra: Partial<Board> = {}): Board =>
  ({
    id: `b${n}`,
    slug: `board-${n}`,
    name: `Board ${n}`,
    tagline: `Tagline ${n}`,
    site: null,
    color: null,
    logo_path: null,
    category: 'productivity',
    hub_id: null,
    claimed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    follower_count: 0,
    post_count: posts,
    status: 'live',
    created_by: null,
    ...extra,
  }) as Board;

const viewer = (onboard: boolean): Viewer => ({ id: 'u1', name: 'Nia', handle: 'nia', bio: '', email: 'nia@example.com', hasPassword: true, connected: [], onboard });

const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchBoards.mockResolvedValue([board(1, 5), board(2, 9), board(3, 1), board(4, 3), board(5, 0, { status: 'pending' })]);
  api.setScopeFollow.mockResolvedValue(undefined);
  api.markOnboarded.mockResolvedValue(undefined);
});

describe('OnboardingDialog', () => {
  it('shows nothing for an account that is not new or already onboarded', () => {
    renderWith(<OnboardingDialog />, { viewer: viewer(false) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists live boards, most active first', async () => {
    renderWith(<OnboardingDialog />, { viewer: viewer(true) });
    expect(await screen.findByRole('dialog', { name: ONBOARDING_COPY.title })).toBeTruthy();
    const names = (await screen.findAllByRole('button', { pressed: false })).map((b) => b.textContent);
    expect(names.map((t) => t?.match(/Board \d/)?.[0])).toEqual(['Board 2', 'Board 1', 'Board 4', 'Board 3']);
  });

  it('unlocks Continue at three picks, follows them, and lands on Following', async () => {
    const { router } = renderWith(<OnboardingDialog />, { viewer: viewer(true) });
    await screen.findByRole('dialog');
    const cont = () => screen.getByRole('button', { name: /^Continue/ }) as HTMLButtonElement;
    fireEvent.click(await screen.findByRole('button', { name: /^Board 1\b/ }));
    fireEvent.click(tile('Board 2'));
    expect(cont().disabled).toBe(true);
    expect(cont().textContent).toContain('2/3');
    fireEvent.click(tile('Board 3'));
    expect(tile('Board 3').getAttribute('aria-pressed')).toBe('true');
    expect(cont().disabled).toBe(false);
    fireEvent.click(cont());
    await waitFor(() => expect(api.markOnboarded).toHaveBeenCalledTimes(1));
    expect(api.setScopeFollow.mock.calls.map((c) => c[1]).sort()).toEqual(['b1', 'b2', 'b3']);
    await waitFor(() => expect(router.state.location.search).toBe('?scope=following'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Skip follows nothing and marks it done', async () => {
    renderWith(<OnboardingDialog />, { viewer: viewer(true) });
    fireEvent.click(await screen.findByRole('button', { name: /^Board 1\b/ }));
    fireEvent.click(screen.getByRole('button', { name: ONBOARDING_COPY.skip }));
    await waitFor(() => expect(api.markOnboarded).toHaveBeenCalledTimes(1));
    expect(api.setScopeFollow).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('search filters the list', async () => {
    renderWith(<OnboardingDialog />, { viewer: viewer(true) });
    await screen.findByRole('button', { name: /^Board 1\b/ });
    fireEvent.change(screen.getByRole('searchbox', { name: ONBOARDING_COPY.search }), { target: { value: 'tagline 4' } });
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: ONBOARDING_COPY.search }), { target: { value: 'zzz' } });
    expect(screen.getByText(ONBOARDING_COPY.none)).toBeTruthy();
  });
});

describe('onboardingBoards', () => {
  it('caps the unfiltered list', () => {
    const many = Array.from({ length: 20 }, (_, i) => board(i, i));
    expect(onboardingBoards(many, '')).toHaveLength(ONBOARDING_SHOWN);
    expect(onboardingBoards(many, '')[0]?.id).toBe('b19');
  });
});

describe('viewerFrom onboard', () => {
  const user = (over: Partial<User>): User =>
    ({ id: 'u1', email: 'a@b.co', user_metadata: {}, identities: [{ provider: 'email' }], created_at: new Date().toISOString(), ...over }) as User;
  it('is set for new accounts of any provider until onboarded', () => {
    expect(viewerFrom(user({}), null).onboard).toBe(true);
    expect(viewerFrom(user({ identities: [{ provider: 'google' }] as User['identities'] }), null).onboard).toBe(true);
    expect(viewerFrom(user({ user_metadata: { onboarded: true } }), null).onboard).toBe(false);
    expect(viewerFrom(user({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }), null).onboard).toBe(false);
  });
});
