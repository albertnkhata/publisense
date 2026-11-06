import { useSyncExternalStore } from 'react';

/**
 * PWA plumbing (public/sw.js, public/manifest.webmanifest).
 * - registerServiceWorker: production builds only. When a new deploy's worker
 *   is installed and waiting, `onUpdate` gets an `apply` that activates it and
 *   reloads once it takes control.
 * - Install prompt: Chrome/Edge/Android fire `beforeinstallprompt`; we hold it
 *   so the account menu can offer "Install app". iOS never fires it (Share,
 *   then Add to Home Screen), so the item simply doesn't show there.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initInstallPrompt(target: Window = window): void {
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** True while the browser will show its install dialog. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );
}

/** Show the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // A controller already exists, so a newly installed worker is an update (not the first install).
      const offer = (w: ServiceWorker | null) => {
        if (!w || !navigator.serviceWorker.controller) return;
        onUpdate(() => {
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          });
          w.postMessage('SKIP_WAITING');
        });
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') offer(w);
        });
      });
      // Long-lived tabs: look for a new deploy hourly.
      window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    } catch {
      // No service worker: the app works exactly as before.
    }
  });
}
