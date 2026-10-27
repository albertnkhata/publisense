import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Update URL search params from the latest URL, not from a render's `params`
 * snapshot. Two quick updates (a keystroke and a click, two keystrokes) each
 * start from what the previous one wrote, so neither is lost. A value equal to
 * its fallback is removed from the URL.
 */
export function useSetUrlParams() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (changes: Array<[key: string, value: string, fallback: string]>, { replace = true }: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value, fallback] of changes) {
            if (value === fallback) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );
}

/**
 * A text field bound to one URL search param. The field reads and writes local
 * state, so every keystroke lands, and the URL follows after `delay` ms
 * (replacing the history entry). When the URL changes from outside (Back,
 * Forward, a link) the field takes the new value.
 *
 * Returns `[value, setValue]`; `value` is what the field shows.
 */
export function useUrlTextParam(key: string, delay = 250): [string, (value: string) => void] {
  const [params] = useSearchParams();
  const setUrl = useSetUrlParams();
  const urlValue = params.get(key) ?? '';
  const [value, setValue] = useState(urlValue);
  // The value we last wrote to the URL, so our own write doesn't reset the
  // field to an older value while the person keeps typing.
  const pushed = useRef<string | null>(null);

  useEffect(() => {
    if (pushed.current !== null && pushed.current === urlValue) {
      pushed.current = null;
      return;
    }
    pushed.current = null;
    setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (value === urlValue) return;
    const t = setTimeout(() => {
      pushed.current = value;
      setUrl([[key, value, '']]);
    }, delay);
    return () => clearTimeout(t);
  }, [value, urlValue, key, delay, setUrl]);

  return [value, setValue];
}
