import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// App client. Contract in docs/foundation.md.
// 1. Vercel serves dist/404.html, with a real 404 status, for any URL that no
//    file or rewrite in vercel.json matches. It is the app itself, which then
//    renders its NotFound page.
// 2. Stamp dist/sw.js with a build hash so every deploy produces a byte-different
//    worker and triggers the "New version available · Refresh" prompt.
const postBuildAssets = (): Plugin => ({
  name: 'publisense-post-build',
  apply: 'build',
  closeBundle() {
    const out = fileURLToPath(new URL('./dist/', import.meta.url));
    copyFileSync(`${out}index.html`, `${out}404.html`);
    const html = readFileSync(`${out}index.html`, 'utf8');
    const stamp = createHash('sha256')
      .update(html)
      .update(process.env.VERCEL_GIT_COMMIT_SHA ?? '')
      .digest('hex')
      .slice(0, 8);
    const swPath = `${out}sw.js`;
    const sw = readFileSync(swPath, 'utf8').replace("const VERSION = 'v1';", `const VERSION = 'v1-${stamp}';`);
    writeFileSync(swPath, sw);
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), postBuildAssets()],
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
