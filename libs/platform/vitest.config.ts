import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'platform',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        // Excellent coverage: 94.69% stmts, 80.48% branches, 97.14% funcs, 94.64% lines
        // All files now have comprehensive tests
        lines: 90,
        functions: 95,
        branches: 75,
        statements: 90,
      },
    },
  },
});
