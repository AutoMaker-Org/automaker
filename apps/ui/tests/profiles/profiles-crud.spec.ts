/**
 * AI Profiles E2E Test
 *
 * Happy path: Create a new profile
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  setupMockProjectWithProfiles,
  waitForNetworkIdle,
  navigateToProfiles,
  clickNewProfileButton,
  fillProfileForm,
  saveProfile,
  waitForSuccessToast,
  countCustomProfiles,
  authenticateForTests,
  handleLoginScreenIfPresent,
  createTempDirPath,
  cleanupTempDir,
} from '../utils';

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath('profiles-test');

test.describe('AI Profiles', () => {
  test.beforeAll(async () => {
    // Create test temp directory (required for project path validation)
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should create a new profile', async ({ page }) => {
    await setupMockProjectWithProfiles(page, {
      customProfilesCount: 0,
      projectPath: TEST_TEMP_DIR,
    });
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    await clickNewProfileButton(page);

    await fillProfileForm(page, {
      name: 'Test Profile',
      description: 'A test profile',
      icon: 'Brain',
      model: 'sonnet',
      thinkingLevel: 'medium',
    });

    await saveProfile(page);

    await waitForSuccessToast(page, 'Profile created');

    const customCount = await countCustomProfiles(page);
    expect(customCount).toBe(1);
  });
});
