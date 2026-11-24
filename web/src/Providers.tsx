import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import {
  beforeSendVercelAnalytics,
  createQueryClient,
  getDeviceAnalyticsExcluded,
  isAutomatedBrowser,
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
 * in sync with the current viewer (#309, 0073):
 * - Platform admins are excluded and automatically mark their browser in
 *   localStorage so even signed-out visits on their own devices stay excluded.
 * - Excluded accounts (private.analytics_excluded_user, admin +tag QA aliases via
 *   is_analytics_excluded RPC, @publisense.app, and reserved test domains) are
 *   excluded for the session.
 * - Vercel Web Analytics stays unmounted until session restoration and (when signed
 *   in) the server exclusion check settle, so incognito QA sessions never leak an
 *   initial pageview before is_analytics_excluded() returns.
 */
function AnalyticsExclusionSync({ analytics = false }: { analytics?: boolean }) {
  const { viewer, ready } = useViewer();
  const viewerId = viewer?.id ?? null;
  const admin = useIsPlatformAdmin(viewerId);
  const serverExcluded = useIsAnalyticsExcluded(viewerId);

  const pendingSignedInCheck = Boolean(viewerId) && (serverExcluded.isPending || admin.isPending);
  const viewerExcluded = admin.data === true || serverExcluded.data === true || isTestEmail(viewer?.email);
  const blocked = viewerExcluded || getDeviceAnalyticsExcluded() || isAutomatedBrowser();

  useEffect(() => {
    if (admin.data === true) {
      setDeviceAnalyticsExcluded(true);
      setSessionAnalyticsExcluded(true);
      return;
    }
    if (viewerExcluded || pendingSignedInCheck) {
      setSessionAnalyticsExcluded(true);
      return;
    }
    setSessionAnalyticsExcluded(false);
  }, [admin.data, viewerExcluded, pendingSignedInCheck]);

  if (!analytics || !ready || pendingSignedInCheck || blocked) return null;
  return <Analytics beforeSend={beforeSendVercelAnalytics} />;
}

export function Providers({ children, analytics = false }: { children: ReactNode; analytics?: boolean }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ViewerProvider>
          <AnalyticsExclusionSync analytics={analytics} />
          <ToastProvider>{children}</ToastProvider>
        </ViewerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
