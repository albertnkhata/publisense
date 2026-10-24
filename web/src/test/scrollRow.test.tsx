import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ScrollRow, scrollEdges } from '../ui';

/** jsdom does no layout: give the scroller fixed metrics and a live scrollLeft. */
function mockMetrics(el: HTMLElement, m: { scrollWidth: number; clientWidth: number; scrollLeft?: number }) {
  let left = m.scrollLeft ?? 0;
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => m.scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => m.clientWidth });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => (left = v) });
  return {
    scrollTo(v: number) {
      left = v;
      fireEvent.scroll(el);
    },
  };
}

function renderRow() {
  render(
    <ScrollRow label="Categories">
      {['All', 'AI assistants', 'Code editors', 'Dev platforms', 'Design', 'Productivity', 'Browsers'].map((c) => (
        <button key={c} type="button">
          {c}
        </button>
      ))}
    </ScrollRow>,
  );
  return screen.getByRole('toolbar', { name: 'Categories' });
}

const left = () => screen.queryByRole('button', { name: 'Scroll categories left' });
const right = () => screen.queryByRole('button', { name: 'Scroll categories right' });

afterEach(() => vi.restoreAllMocks());

describe('scrollEdges', () => {
  it('reports no overflow when everything fits', () => {
    expect(scrollEdges({ scrollWidth: 600, clientWidth: 600, scrollLeft: 0 })).toEqual({ start: false, end: false });
  });
  it('reports only the end at the start of an overflowing row', () => {
    expect(scrollEdges({ scrollWidth: 900, clientWidth: 400, scrollLeft: 0 })).toEqual({ start: false, end: true });
  });
  it('reports both ends in the middle', () => {
    expect(scrollEdges({ scrollWidth: 900, clientWidth: 400, scrollLeft: 200 })).toEqual({ start: true, end: true });
  });
  it('reports only the start at the end, with sub-pixel slack', () => {
    expect(scrollEdges({ scrollWidth: 900, clientWidth: 400, scrollLeft: 499.5 })).toEqual({ start: true, end: false });
  });
});

describe('ScrollRow', () => {
  it('shows no chevrons when the chips fit', () => {
    const row = renderRow();
    mockMetrics(row, { scrollWidth: 600, clientWidth: 600 });
    fireEvent.scroll(row);
    expect(left()).toBeNull();
    expect(right()).toBeNull();
  });

  it('shows the right chevron at the start, both in the middle, the left at the end', () => {
    const row = renderRow();
    const m = mockMetrics(row, { scrollWidth: 900, clientWidth: 400 });
    fireEvent.scroll(row);
    expect(left()).toBeNull();
    expect(right()).not.toBeNull();

    m.scrollTo(250);
    expect(left()).not.toBeNull();
    expect(right()).not.toBeNull();

    m.scrollTo(500);
    expect(left()).not.toBeNull();
    expect(right()).toBeNull();
  });

  it('re-checks on window resize', () => {
    const row = renderRow();
    const metrics = { scrollWidth: 600, clientWidth: 600 };
    mockMetrics(row, metrics);
    fireEvent.scroll(row);
    expect(right()).toBeNull();
    metrics.clientWidth = 380;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(right()).not.toBeNull();
  });

  it('chevrons are labelled buttons outside the tab order and scroll by ~75% of the visible width', () => {
    const row = renderRow();
    mockMetrics(row, { scrollWidth: 900, clientWidth: 400, scrollLeft: 200 });
    fireEvent.scroll(row);
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];

    const r = right()!;
    expect(r.tagName).toBe('BUTTON');
    expect(r.tabIndex).toBe(-1);
    fireEvent.click(r);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 300, behavior: 'smooth' });
    fireEvent.click(left()!);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -300, behavior: 'smooth' });
  });

  it('scrolls instantly under prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const row = renderRow();
    mockMetrics(row, { scrollWidth: 900, clientWidth: 400 });
    fireEvent.scroll(row);
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    fireEvent.click(right()!);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 300, behavior: 'auto' });
  });

  it('brings a focused chip that is off the right edge into view', () => {
    const row = renderRow();
    mockMetrics(row, { scrollWidth: 900, clientWidth: 400 });
    fireEvent.scroll(row);
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, width: 400 } as DOMRect);
    const chip = screen.getByRole('button', { name: 'Browsers' });
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({ left: 420, right: 500, width: 80 } as DOMRect);
    act(() => chip.focus());
    expect(scrollBy).toHaveBeenCalledWith({ left: 140, behavior: 'smooth' });
  });
});
