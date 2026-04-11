import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/apis/**/*.test.ts'],
    setupFiles: ['test/integration-hook.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    globals: true,
  },
});
