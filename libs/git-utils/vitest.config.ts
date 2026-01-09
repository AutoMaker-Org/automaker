import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'git-utils',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/types.ts'],
      thresholds: {
        lines: 65,
        functions: 75,
        branches: 35,
        statements: 65,
      },
    },
  },
});
