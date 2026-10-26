import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { pageTitle, usePageTitle } from '../lib/usePageTitle';

function Titled({ title }: { title: string | null }) {
  usePageTitle(title);
  return null;
}

describe('usePageTitle (#159)', () => {
  it('formats "Name · Publisense" and falls back to the site name', () => {
    expect(pageTitle('Figma')).toBe('Figma · Publisense');
    expect(pageTitle(null)).toBe('Publisense');
    expect(pageTitle('')).toBe('Publisense');
  });

  it('sets the title, follows changes, and reverts on unmount', () => {
    document.title = 'Publisense';
    const { rerender, unmount } = render(<Titled title={null} />);
    expect(document.title).toBe('Publisense');
    rerender(<Titled title="Cursor" />);
    expect(document.title).toBe('Cursor · Publisense');
    rerender(<Titled title="Ghost preview in split windows" />);
    expect(document.title).toBe('Ghost preview in split windows · Publisense');
    unmount();
    expect(document.title).toBe('Publisense');
  });
});
