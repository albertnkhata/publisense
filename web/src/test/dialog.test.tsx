import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../ui/Dialog';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Claim a board"
        footer={<button>Continue</button>}
      >
        <input aria-label="Work email" />
      </Dialog>
    </>
  );
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift });

describe('Dialog', () => {
  it('is labelled by its title and moves focus inside on open', () => {
    render(<Harness />);
    act(() => screen.getByText('Open').focus());
    act(() => fireEvent.click(screen.getByText('Open')));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('Claim a board');
    // First focusable that is not the close button.
    expect(document.activeElement).toBe(screen.getByLabelText('Work email'));
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />);
    act(() => fireEvent.click(screen.getByText('Open')));
    const close = screen.getByLabelText('Close');
    const cont = screen.getByText('Continue');
    act(() => cont.focus());
    tab();
    expect(document.activeElement).toBe(close); // wrapped from last to first
    tab(true);
    expect(document.activeElement).toBe(cont); // wrapped from first to last
  });

  it('closes on Escape and restores focus to the opener', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByText('Open');
    act(() => opener.focus());
    act(() => fireEvent.click(opener));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
