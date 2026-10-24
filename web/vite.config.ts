import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// v2 app. Deliberately independent of the root (v1) vite config: v1 keeps
// serving publisense.app from main until cutover (docs/v2/FOUNDATION.md §11, step 9).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
