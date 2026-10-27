import * as Sentry from '@sentry/react';

/**
 * Error monitoring. Inactive unless VITE_SENTRY_DSN is set at build time, so
 * local dev, tests and preview builds without the variable send nothing.
 * No PII: no IPs, cookies or request bodies; user identity is never attached.
 * Events go through our own /api/monitoring tunnel (same origin, so blockers
 * that drop *.sentry.io requests don't hide errors); it forwards only to this
 * project's DSN.
 */
export const MONITORING_TUNNEL = '/api/monitoring';

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();

export const monitoringEnabled = Boolean(dsn);

export function initMonitoring(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tunnel: MONITORING_TUNNEL,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // Noise from extensions and flaky networks, not our bugs.
    ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', /^Load failed$/, /Failed to fetch dynamically imported module/],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],
  });
}

/** Root options for createRoot: report React render errors when monitoring is on. */
export const rootErrorOptions = dsn
  ? {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    }
  : {};
