/**
 * Global teardown for all E2E tests.
 * Runs once after all tests (and all workers) have finished.
 * Cleans up any leftover test artifact directories (board-bg-test-*, edit-feature-test-*, etc.)
 * that may remain when afterAll hooks didn't run (e.g. worker crash, aborted run).
 */

import { FullConfig } from '@playwright/test';
import { cleanupLeftoverTestDirs } from './utils/cleanup-test-dirs';

async function globalTeardown(_config: FullConfig) {
  cleanupLeftoverTestDirs();
  console.log('[GlobalTeardown] Cleanup complete');
}

export default globalTeardown;
