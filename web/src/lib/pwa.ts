/**
 * PWA plumbing (public/sw.js, public/manifest.webmanifest).
 * - registerServiceWorker: production builds only. When a new deploy's worker
 *   is installed and waiting, `onUpdate` gets an `apply` that activates it and
 *   reloads once it takes control.
 * - Installing is left to the browser's own UI (Chrome's prompt and menu,
 *   iOS Share, then Add to Home Screen). The site shows no install button.
 */

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
