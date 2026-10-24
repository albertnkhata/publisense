import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';

function renderMenu(onCopy = vi.fn()) {
  render(
    <MemoryRouter>
      <Menu label="Post options" trigger={(p) => <button {...p}>More</button>}>
        <MenuItem onSelect={() => {}}>Follow post</MenuItem>
        <MenuItem onSelect={() => {}}>Save</MenuItem>
        <MenuItem onSelect={onCopy}>Copy link</MenuItem>
        <MenuSeparator />
        <MenuItem disabled>Hide</MenuItem>
        <MenuItem danger>Report</MenuItem>
      </Menu>
    </MemoryRouter>,
  );
  return screen.getByText('More');
}

const key = (k: string) => act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key: k }));

describe('Menu', () => {
  it('opens on ArrowDown, moves with arrows, skips disabled items, wraps', () => {
    const trigger = renderMenu();
    act(() => trigger.focus());
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Follow post');
    key('End');
    expect(document.activeElement?.textContent).toBe('Report'); // "Hide" is disabled
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Follow post');
    key('ArrowUp');
    expect(document.activeElement?.textContent).toBe('Report');
  });

  it('supports typeahead', () => {
    const trigger = renderMenu();
    act(() => trigger.focus());
    key('ArrowDown');
    key('c');
    expect(document.activeElement?.textContent).toBe('Copy link');
  });

  it('Escape closes and returns focus to the trigger; selecting runs the item', () => {
    const onCopy = vi.fn();
    const trigger = renderMenu(onCopy);
    act(() => trigger.focus());
    key('ArrowDown');
    key('Escape');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    key('ArrowDown');
    act(() => fireEvent.click(screen.getByText('Copy link')));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
