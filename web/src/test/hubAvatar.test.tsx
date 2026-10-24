import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HubAvatar } from '../ui';

const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Board ${i + 1}` }));

describe('HubAvatar', () => {
  it('pads to the full width with hidden spacers when reserve is set', () => {
    render(<HubAvatar name="Google hub" boards={tiles(2)} reserve />);
    const stack = screen.getByRole('img', { name: 'Google hub' });
    expect(stack.children).toHaveLength(3);
    expect(stack.querySelectorAll('.invisible')).toHaveLength(1);
  });

  it('adds no spacers without reserve, or when the stack is already full', () => {
    const { rerender } = render(<HubAvatar name="Hub" boards={tiles(2)} />);
    expect(screen.getByRole('img', { name: 'Hub' }).children).toHaveLength(2);
    rerender(<HubAvatar name="Hub" boards={tiles(5)} reserve />);
    const stack = screen.getByRole('img', { name: 'Hub' });
    expect(stack.children).toHaveLength(3);
    expect(stack.querySelectorAll('.invisible')).toHaveLength(0);
  });
});
