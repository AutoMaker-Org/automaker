import { defineConfig } from 'vitest/config';

// Prevent shell/global NODE_ENV=production from breaking test-only assumptions.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    // Use projects instead of deprecated workspace
    // Glob patterns auto-discover projects with vitest.config.ts
    projects: [
      'libs/*/vitest.config.ts',
      'apps/server/vitest.config.ts',
      'apps/ui/vitest.config.ts',
    ],
  },
});
