import { useEffect } from 'react';

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Publisense` : 'Publisense';
  }, [title]);
}
