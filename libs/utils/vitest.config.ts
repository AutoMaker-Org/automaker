import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'utils',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        // Excellent coverage: 94.3% stmts, 89.77% branches, 100% funcs, 94.21% lines
        // All files now have comprehensive tests
        lines: 90,
        functions: 95,
        branches: 85,
        statements: 90,
      },
    },
  },
});
