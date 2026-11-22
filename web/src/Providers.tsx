import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createQueryClient,
  isTestEmail,
  setDeviceAnalyticsExcluded,
  setSessionAnalyticsExcluded,
  useIsAnalyticsExcluded,
  useIsPlatformAdmin,
} from './api';
import { ThemeProvider } from './lib/ThemeProvider';
import { useViewer, ViewerProvider } from './lib/viewer';
import { ToastProvider } from './ui';

/**
 * Keeps client-side analytics exclusion (Vercel Web Analytics + Command Centre)
 * in sync with the current viewer (#309):
 * - Platform admins are excluded and automatically mark their browser in
 *   localStorage so even signed-out visits on their own devices stay excluded.
 * - Admin +tag QA aliases (via is_analytics_excluded RPC) and reserved test
 *   domains (.test/.example/.invalid/localhost) are excluded for the session.
 */
function AnalyticsExclusionSync() {
  const { viewer } = useViewer();
  const viewerId = viewer?.id ?? null;
  const admin = useIsPlatformAdmin(viewerId);
  const serverExcluded = useIsAnalyticsExcluded(viewerId);

  useEffect(() => {
    if (admin.data === true) {
      setDeviceAnalyticsExcluded(true);
      setSessionAnalyticsExcluded(true);
      return;
    }
    if (serverExcluded.data === true || isTestEmail(viewer?.email)) {
      setSessionAnalyticsExcluded(true);
      return;
    }
    setSessionAnalyticsExcluded(false);
  }, [admin.data, serverExcluded.data, viewer?.email]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ViewerProvider>
          <AnalyticsExclusionSync />
          <ToastProvider>{children}</ToastProvider>
        </ViewerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
