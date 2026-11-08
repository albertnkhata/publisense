import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PwaWatcher, PWA_COPY } from '../shell/PwaWatcher';
import { ToastProvider, useToast } from '../ui';

describe('PwaWatcher', () => {
  it('shows an offline pill while offline', () => {
    render(
      <ToastProvider>
        <PwaWatcher register={false} />
      </ToastProvider>,
    );
    expect(screen.queryByText(PWA_COPY.offline)).toBeNull();
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(PWA_COPY.offline)).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(PWA_COPY.offline)).toBeNull();
  });
});

describe('sticky toast', () => {
  it('stays until its action is taken', () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    function Fire() {
      const { toast } = useToast();
      return <button onClick={() => toast({ message: PWA_COPY.update, onUndo: apply, undoLabel: PWA_COPY.refresh, sticky: true })}>go</button>;
    }
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    act(() => void vi.advanceTimersByTime(60_000));
    fireEvent.click(screen.getByRole('button', { name: PWA_COPY.refresh }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PWA_COPY.update)).toBeNull();
    vi.useRealTimers();
  });
});

describe('manifest and worker', () => {
  const pub = (f: string) => readFileSync(resolve(__dirname, '../../public', f), 'utf8');
  it('manifest is installable', () => {
    const m = JSON.parse(pub('manifest.webmanifest'));
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  });
  it('worker never handles API, badge, feed, sitemap or auth paths', () => {
    const src = pub('sw.js');
    const m = src.match(/const BYPASS = (\/.*\/);/);
    expect(m).toBeTruthy();
    const re = new Function(`return ${m![1]}`)() as RegExp;
    for (const p of ['/api/share', '/badge/cursor.svg', '/b/cursor/feed.xml', '/b/cursor/changelog.xml', '/sitemap.xml', '/auth/reset']) expect(re.test(p)).toBe(true);
    for (const p of ['/', '/b/cursor', '/apiary', '/badges']) expect(re.test(p)).toBe(false);
  });
});
