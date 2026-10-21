import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: the app config carries the React and
// Tailwind plugins, which the tests do not need, and mixing the two makes a test
// failure look like a build failure.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
