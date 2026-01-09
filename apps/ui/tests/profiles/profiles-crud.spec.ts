/**
 * AI Profiles E2E Test
 *
 * Happy path: Create a new profile
 */

import { test, expect } from '@playwright/test';
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
} from '../utils';

test.describe('AI Profiles', () => {
  test('should create a new profile', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // Get initial custom profile count (may be 0 or more due to server settings hydration)
    const initialCount = await countCustomProfiles(page);

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

    // Wait for the new profile to appear in the list (replaces arbitrary timeout)
    // The count should increase by 1 from the initial count
    await expect(async () => {
      const customCount = await countCustomProfiles(page);
      expect(customCount).toBe(initialCount + 1);
    }).toPass({ timeout: 5000 });

    // Verify the count is correct (final assertion)
    const finalCount = await countCustomProfiles(page);
    expect(finalCount).toBe(initialCount + 1);
  });
});
