import { useEffect, useState } from 'react';

/** Matches the theme breakpoints (theme.css): sm 520, md 720, lg 1152, xl 1336. */
export const MQ = {
  sm: '(max-width: 519.98px)',
  md: '(max-width: 719.98px)',
  lg: '(max-width: 1151.98px)',
  xl: '(max-width: 1335.98px)',
} as const;

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
