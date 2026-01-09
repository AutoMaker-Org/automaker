import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use projects instead of deprecated workspace
    // Glob patterns auto-discover projects with vitest.config.ts
    projects: ['libs/*/vitest.config.ts', 'apps/server/vitest.config.ts'],
  },
});
