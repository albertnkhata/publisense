import { useContext, useEffect, useState } from 'react';
import { onlineManager, QueryClientContext } from '@tanstack/react-query';
import { registerServiceWorker } from '../lib/pwa';
import { useToast } from '../ui';

export const PWA_COPY = {
  update: 'New version available',
  refresh: 'Refresh',
  offline: 'You’re offline. Showing what’s loaded.',
};

/**
 * Registers the service worker (production), offers updates, and shows an offline pill.
 *
 * Like TanStack Query's `OnlineManager`, starts online rather than trusting
 * `navigator.onLine` at boot (which reports false negatives in headless/VM/VPN
 * Chromium even when requests succeed), and clears the offline pill whenever a
 * query or mutation succeeds.
 */
export function PwaWatcher({ register = import.meta.env.PROD }: { register?: boolean }) {
  const { toast } = useToast();
  const qc = useContext(QueryClientContext);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!register) return;
    registerServiceWorker((apply) => toast({ message: PWA_COPY.update, onUndo: apply, undoLabel: PWA_COPY.refresh, sticky: true }));
  }, [register, toast]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!qc) return;
    const markOnline = () => {
      onlineManager.setOnline(true);
      setOnline(true);
    };
    const unsubQueries = qc.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') markOnline();
    });
    const unsubMutations = qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') markOnline();
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc]);

  if (online) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-3 z-60 flex justify-center px-4">
      <span className="rounded-pill bg-ink px-3 py-1 text-sm font-semibold text-card shadow-overlay">{PWA_COPY.offline}</span>
    </div>
  );
}

