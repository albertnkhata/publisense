import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// v2 app. Deliberately independent of the root (v1) vite config: v1 keeps
// serving publisense.app from main until cutover (docs/v2/FOUNDATION.md §11, step 9).
// Vercel serves dist/404.html, with a real 404 status, for any URL that no
// file or rewrite in vercel.json matches. It is the app itself, which then
// renders its NotFound page.
const notFoundPage = (): Plugin => ({
  name: 'publisense-404-html',
  apply: 'build',
  closeBundle() {
    const out = fileURLToPath(new URL('./dist/', import.meta.url));
    copyFileSync(`${out}index.html`, `${out}404.html`);
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), notFoundPage()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
