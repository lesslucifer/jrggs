import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/unit-setup.ts'],
    globals: true,
  },
});
