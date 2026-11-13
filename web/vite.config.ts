import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// App client. Contract in docs/foundation.md.
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/@tanstack/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/')) return 'vendor';
          if (id.includes('/src/pages/Admin')) return 'admin';
          if (id.includes('/src/manage/')) return 'manage';
        },
      },
    },
  },
});
