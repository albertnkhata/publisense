import { useEffect } from 'react';

/** True when the event comes from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

interface ShortcutOptions {
  ctrl?: boolean;
  enabled?: boolean;
}

/** Single-key shortcut (e.g. "[" or ctrl+"d"), ignored while typing. */
export function useShortcut(key: string, handler: () => void, { ctrl = false, enabled = true }: ShortcutOptions = {}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (ctrl !== e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, handler, ctrl, enabled]);
}
