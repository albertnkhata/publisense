import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostListSkeleton } from '../posts/PostList';
import { Skeleton } from '../ui';

// #158: the home feed's first paint shows placeholders, never "Loading" text.
describe('skeleton loaders', () => {
  it('render no text, only an unpainted loading status', () => {
    const { container } = render(<PostListSkeleton />);
    expect(container.textContent).toBe('');
    const status = screen.getByRole('status', { name: 'Loading posts' });
    expect(status.getAttribute('aria-busy')).toBe('true');
    // Announced once for the list, not once per card.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('a lone skeleton announces itself without painting text', () => {
    for (const variant of ['card', 'row', 'header'] as const) {
      const { container, unmount } = render(<Skeleton variant={variant} />);
      expect(container.textContent).toBe('');
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
      unmount();
    }
  });

  it('is decorative when a parent announces the load', () => {
    render(<Skeleton label={null} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
