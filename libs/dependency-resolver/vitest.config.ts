import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'dependency-resolver',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 100,
        branches: 85,
        statements: 90,
      },
    },
  },
});
