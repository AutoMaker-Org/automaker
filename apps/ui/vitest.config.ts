import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Ensure UI tests never inherit production mode from outer shells.
process.env.NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui',
    reporters: ['verbose'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/features/**'],
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@automaker/ui': path.resolve(__dirname, './src'),
      '@automaker/types': path.resolve(__dirname, '../../libs/types/src/index.ts'),
    },
  },
});
