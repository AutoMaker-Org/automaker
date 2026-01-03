/**
 * Worktree Integration E2E Test
 *
 * Happy path: Display worktree selector with main branch
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  waitForNetworkIdle,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  setupProjectWithPath,
  waitForBoardView,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('worktree-tests');

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

test.describe('Worktree Integration', () => {
  let testRepo: TestRepo;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should display worktree selector with main branch', async ({ page }) => {
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const branchLabel = page.getByText('Branch:');
    await expect(branchLabel).toBeVisible({ timeout: 10000 });

    const mainBranchButton = page.locator('[data-testid="worktree-branch-main"]');
    await expect(mainBranchButton).toBeVisible({ timeout: 15000 });
  });
});
