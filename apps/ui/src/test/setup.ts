import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect
expect.extend(matchers);

// Clean up after each test
afterEach(() => {
  cleanup();
});

// Setup global fetch mock
beforeAll(() => {
  global.fetch = vi.fn();
});

afterAll(() => {
  vi.restoreAllMocks();
});
