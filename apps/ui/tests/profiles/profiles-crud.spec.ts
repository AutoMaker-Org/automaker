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
