import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// package.json sets "type": "module", so this config is ESM and __dirname does
// not exist — it worked only because Vite's config loader happens to shim it.
// Under plain `node vite.config.ts` it is undefined and the '@' alias resolves
// off the filesystem root. Derive the directory properly instead.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  build: {
    // The app shipped as a single ~634 kB chunk, so every route paid for every
    // screen before anything was interactive. Split vendor libraries out so
    // they cache independently of app code.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-router')) return 'vendor-router';
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
