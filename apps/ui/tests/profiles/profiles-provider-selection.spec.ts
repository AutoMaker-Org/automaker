/**
 * Profiles Provider Selection E2E Test
 *
 * Tests for provider tabs and profile filtering in Profiles view
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
  selectProviderTab,
  getActiveProviderTab,
} from '../utils';

test.describe('Profiles Provider Selection', () => {
  test('should display provider tabs', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // Verify provider tabs are visible
    const providerTabs = page.locator('[data-testid="provider-tabs"]');
    await expect(providerTabs).toBeVisible();

    // Verify both provider tabs exist
    const claudeTab = page.locator('[data-testid="provider-tab-claude"]');
    const cursorTab = page.locator('[data-testid="provider-tab-cursor"]');

    await expect(claudeTab).toBeVisible();
    await expect(cursorTab).toBeVisible();

    // Verify tab labels
    await expect(claudeTab).toContainText('Claude (SDK)');
    await expect(cursorTab).toContainText('Cursor CLI');
  });

  test('should switch between provider tabs', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // Default should be Claude
    const claudeTab = page.locator('[data-testid="provider-tab-claude"]');
    await expect(claudeTab).toHaveAttribute('data-state', 'active');

    // Switch to Cursor CLI
    await selectProviderTab(page, 'cursor');

    // Verify Cursor tab is now active
    const cursorTab = page.locator('[data-testid="provider-tab-cursor"]');
    await expect(cursorTab).toHaveAttribute('data-state', 'active');
    await expect(claudeTab).toHaveAttribute('data-state', 'inactive');
  });

  test('should filter built-in profiles by provider', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // On Claude tab, should see Claude built-in profiles
    const claudeProfiles = page.locator('[data-testid^="profile-card-"]');
    const claudeProfileCount = await claudeProfiles.count();
    expect(claudeProfileCount).toBeGreaterThan(0);

    // Switch to Cursor CLI
    await selectProviderTab(page, 'cursor');
    await page.waitForTimeout(300);

    // Should see different profiles (Cursor built-in profiles)
    const cursorProfiles = page.locator('[data-testid^="profile-card-"]');
    const cursorProfileCount = await cursorProfiles.count();

    // Both providers should have built-in profiles
    expect(cursorProfileCount).toBeGreaterThan(0);
  });

  test('should create profile and show under Claude tab', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // Verify we're on Claude tab (default)
    const claudeTab = page.locator('[data-testid="provider-tab-claude"]');
    await expect(claudeTab).toHaveAttribute('data-state', 'active');

    // Create a new profile (profiles are created with Claude models)
    await clickNewProfileButton(page);

    await fillProfileForm(page, {
      name: 'Test Profile',
      description: 'A test profile',
      icon: 'Zap',
      model: 'sonnet',
      thinkingLevel: 'medium',
    });

    await saveProfile(page);
    await waitForSuccessToast(page, 'Profile created');

    // Verify profile appears under Claude tab
    const claudeCustomCount = await countCustomProfiles(page);
    expect(claudeCustomCount).toBe(1);

    // Switch to Cursor tab
    await selectProviderTab(page, 'cursor');
    await page.waitForTimeout(300);

    // Custom profile should not appear under Cursor tab (it's a Claude profile)
    const cursorCustomCount = await countCustomProfiles(page);
    expect(cursorCustomCount).toBe(0);
  });

  test('should show correct profile count per provider', async ({ page }) => {
    await setupMockProjectWithProfiles(page, { customProfilesCount: 0 });
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToProfiles(page);

    // Get Claude custom profile count
    const claudeCustomCount = await countCustomProfiles(page);

    // Switch to Cursor
    await selectProviderTab(page, 'cursor');
    await page.waitForTimeout(300);

    // Get Cursor custom profile count
    const cursorCustomCount = await countCustomProfiles(page);

    // Both should start at 0 for custom profiles
    expect(claudeCustomCount).toBe(0);
    expect(cursorCustomCount).toBe(0);
  });
});
