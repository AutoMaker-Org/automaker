import { Page, Locator } from '@playwright/test';
import { clickElement, fillInput } from '../core/interactions';
import { waitForElement, waitForElementHidden } from '../core/waiting';
import { getByTestId } from '../core/elements';
import { navigateToView } from '../navigation/views';

/**
 * Navigate to the profiles view
 */
export async function navigateToProfiles(page: Page): Promise<void> {
  // Click the profiles navigation button
  await navigateToView(page, 'profiles');

  // Wait for profiles view to be visible
  await page.waitForSelector('[data-testid="profiles-view"]', {
    state: 'visible',
    timeout: 10000,
  });
}

// ============================================================================
// Profile List Operations
// ============================================================================

/**
 * Get a specific profile card by ID
 */
export async function getProfileCard(page: Page, profileId: string): Promise<Locator> {
  return getByTestId(page, `profile-card-${profileId}`);
}

/**
 * Get all profile cards (both built-in and custom)
 */
export async function getProfileCards(page: Page): Promise<Locator> {
  return page.locator('[data-testid^="profile-card-"]');
}

/**
 * Get only custom profile cards
 */
export async function getCustomProfiles(page: Page): Promise<Locator> {
  // Custom profiles don't have the "Built-in" badge
  return page.locator('[data-testid^="profile-card-"]').filter({
    hasNot: page.locator('text="Built-in"'),
  });
}

/**
 * Get only built-in profile cards
 */
export async function getBuiltInProfiles(page: Page): Promise<Locator> {
  // Built-in profiles have the lock icon and "Built-in" text
  return page.locator('[data-testid^="profile-card-"]:has-text("Built-in")');
}

/**
 * Count the number of custom profiles
 */
export async function countCustomProfiles(page: Page): Promise<number> {
  const customProfiles = await getCustomProfiles(page);
  return customProfiles.count();
}

/**
 * Count the number of built-in profiles
 */
export async function countBuiltInProfiles(page: Page): Promise<number> {
  const builtInProfiles = await getBuiltInProfiles(page);
  return await builtInProfiles.count();
}

/**
 * Get all custom profile IDs
 */
export async function getCustomProfileIds(page: Page): Promise<string[]> {
  const allCards = await page.locator('[data-testid^="profile-card-"]').all();
  const customIds: string[] = [];

  for (const card of allCards) {
    const builtInText = card.locator('text="Built-in"');
    const isBuiltIn = (await builtInText.count()) > 0;
    if (!isBuiltIn) {
      const testId = await card.getAttribute('data-testid');
      if (testId) {
        // Extract ID from "profile-card-{id}"
        const profileId = testId.replace('profile-card-', '');
        customIds.push(profileId);
      }
    }
  }

  return customIds;
}

/**
 * Get the first custom profile ID (useful after creating a profile)
 */
export async function getFirstCustomProfileId(page: Page): Promise<string | null> {
  const ids = await getCustomProfileIds(page);
  return ids.length > 0 ? ids[0] : null;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Click the "New Profile" button in the header
 */
export async function clickNewProfileButton(page: Page): Promise<void> {
  await clickElement(page, 'add-profile-button');
  await waitForElement(page, 'add-profile-dialog');
}

/**
 * Click the empty state card to create a new profile
 */
export async function clickEmptyState(page: Page): Promise<void> {
  const emptyState = page.locator(
    '.group.rounded-xl.border.border-dashed[class*="cursor-pointer"]'
  );
  await emptyState.click();
  await waitForElement(page, 'add-profile-dialog');
}

/**
 * Fill the profile form with data
 */
export async function fillProfileForm(
  page: Page,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    model?: string;
    thinkingLevel?: string;
  }
): Promise<void> {
  if (data.name !== undefined) {
    await fillProfileName(page, data.name);
  }
  if (data.description !== undefined) {
    await fillProfileDescription(page, data.description);
  }
  if (data.icon !== undefined) {
    await selectIcon(page, data.icon);
  }
  if (data.model !== undefined) {
    await selectModel(page, data.model);
  }
  if (data.thinkingLevel !== undefined) {
    await selectThinkingLevel(page, data.thinkingLevel);
  }
}

/**
 * Click the save button to create/update a profile
 */
export async function saveProfile(page: Page): Promise<void> {
  await clickElement(page, 'save-profile-button');
  // Wait for dialog to close
  await waitForElementHidden(page, 'add-profile-dialog').catch(() => {});
  await waitForElementHidden(page, 'edit-profile-dialog').catch(() => {});
}

/**
 * Click the cancel button in the profile dialog
 */
export async function cancelProfileDialog(page: Page): Promise<void> {
  // Look for cancel button in dialog footer
  const cancelButton = page.locator('button:has-text("Cancel")');
  await cancelButton.click();
  // Wait for dialog to close
  await waitForElementHidden(page, 'add-profile-dialog').catch(() => {});
  await waitForElementHidden(page, 'edit-profile-dialog').catch(() => {});
}

/**
 * Click the edit button for a specific profile
 */
export async function clickEditProfile(page: Page, profileId: string): Promise<void> {
  await clickElement(page, `edit-profile-${profileId}`);
  await waitForElement(page, 'edit-profile-dialog');
}

/**
 * Click the delete button for a specific profile
 */
export async function clickDeleteProfile(page: Page, profileId: string): Promise<void> {
  await clickElement(page, `delete-profile-${profileId}`);
  await waitForElement(page, 'delete-profile-confirm-dialog');
}

/**
 * Confirm profile deletion in the dialog
 */
export async function confirmDeleteProfile(page: Page): Promise<void> {
  await clickElement(page, 'confirm-delete-profile-button');
  await waitForElementHidden(page, 'delete-profile-confirm-dialog');
}

/**
 * Cancel profile deletion
 */
export async function cancelDeleteProfile(page: Page): Promise<void> {
  await clickElement(page, 'cancel-delete-button');
  await waitForElementHidden(page, 'delete-profile-confirm-dialog');
}

// ============================================================================
// Form Field Operations
// ============================================================================

/**
 * Fill the profile name field
 */
export async function fillProfileName(page: Page, name: string): Promise<void> {
  await fillInput(page, 'profile-name-input', name);
}

/**
 * Fill the profile description field
 */
export async function fillProfileDescription(page: Page, description: string): Promise<void> {
  await fillInput(page, 'profile-description-input', description);
}

/**
 * Select an icon for the profile
 * @param iconName - Name of the icon: Brain, Zap, Scale, Cpu, Rocket, Sparkles
 */
export async function selectIcon(page: Page, iconName: string): Promise<void> {
  await clickElement(page, `icon-select-${iconName}`);
}

/**
 * Select a model for the profile
 * @param modelId - Model ID: haiku, sonnet, opus
 */
export async function selectModel(page: Page, modelId: string): Promise<void> {
  await clickElement(page, `model-select-${modelId}`);
}

/**
 * Select a thinking level for the profile
 * @param level - Thinking level: none, low, medium, high, ultrathink
 */
export async function selectThinkingLevel(page: Page, level: string): Promise<void> {
  await clickElement(page, `thinking-select-${level}`);
}

/**
 * Get the currently selected icon
 */
export async function getSelectedIcon(page: Page): Promise<string | null> {
  // Find the icon button with primary background
  const selectedIcon = page.locator('[data-testid^="icon-select-"][class*="bg-primary"]');
  const testId = await selectedIcon.getAttribute('data-testid');
  return testId ? testId.replace('icon-select-', '') : null;
}

/**
 * Get the currently selected model
 */
export async function getSelectedModel(page: Page): Promise<string | null> {
  // Find the model button with primary background
  const selectedModel = page.locator('[data-testid^="model-select-"][class*="bg-primary"]');
  const testId = await selectedModel.getAttribute('data-testid');
  return testId ? testId.replace('model-select-', '') : null;
}

/**
 * Get the currently selected thinking level
 */
export async function getSelectedThinkingLevel(page: Page): Promise<string | null> {
  // Find the thinking level button with amber background
  const selectedLevel = page.locator('[data-testid^="thinking-select-"][class*="bg-amber-500"]');
  const testId = await selectedLevel.getAttribute('data-testid');
  return testId ? testId.replace('thinking-select-', '') : null;
}

// ============================================================================
// Dialog Operations
// ============================================================================

/**
 * Check if the add profile dialog is open
 */
export async function isAddProfileDialogOpen(page: Page): Promise<boolean> {
  const dialog = await getByTestId(page, 'add-profile-dialog');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Check if the edit profile dialog is open
 */
export async function isEditProfileDialogOpen(page: Page): Promise<boolean> {
  const dialog = await getByTestId(page, 'edit-profile-dialog');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Check if the delete confirmation dialog is open
 */
export async function isDeleteConfirmDialogOpen(page: Page): Promise<boolean> {
  const dialog = await getByTestId(page, 'delete-profile-confirm-dialog');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for any profile dialog to close
 * This ensures all dialog animations complete before proceeding
 */
export async function waitForDialogClose(page: Page): Promise<void> {
  // Wait for all profile dialogs to be hidden
  await Promise.all([
    waitForElementHidden(page, 'add-profile-dialog').catch(() => {}),
    waitForElementHidden(page, 'edit-profile-dialog').catch(() => {}),
    waitForElementHidden(page, 'delete-profile-confirm-dialog').catch(() => {}),
  ]);

  // Also wait for any Radix dialog overlay to be removed (handles animation)
  await page
    .locator('[data-radix-dialog-overlay]')
    .waitFor({ state: 'hidden', timeout: 2000 })
    .catch(() => {
      // Overlay may not exist
    });
}

// ============================================================================
// Profile Card Inspection
// ============================================================================

/**
 * Get the profile name from a card
 */
export async function getProfileName(page: Page, profileId: string): Promise<string> {
  const card = await getProfileCard(page, profileId);
  const nameElement = card.locator('h3');
  return await nameElement.textContent().then((text) => text?.trim() || '');
}

/**
 * Get the profile description from a card
 */
export async function getProfileDescription(page: Page, profileId: string): Promise<string> {
  const card = await getProfileCard(page, profileId);
  const descElement = card.locator('p').first();
  return await descElement.textContent().then((text) => text?.trim() || '');
}

/**
 * Get the profile model badge text from a card
 */
export async function getProfileModel(page: Page, profileId: string): Promise<string> {
  const card = await getProfileCard(page, profileId);
  const modelBadge = card.locator(
    'span[class*="border-primary"]:has-text("haiku"), span[class*="border-primary"]:has-text("sonnet"), span[class*="border-primary"]:has-text("opus")'
  );
  return await modelBadge.textContent().then((text) => text?.trim() || '');
}

/**
 * Get the profile thinking level badge text from a card
 */
export async function getProfileThinkingLevel(
  page: Page,
  profileId: string
): Promise<string | null> {
  const card = await getProfileCard(page, profileId);
  const thinkingBadge = card.locator('span[class*="border-amber-500"]');
  const isVisible = await thinkingBadge.isVisible().catch(() => false);
  if (!isVisible) return null;
  return await thinkingBadge.textContent().then((text) => text?.trim() || '');
}

/**
 * Check if a profile has the built-in badge
 */
export async function isBuiltInProfile(page: Page, profileId: string): Promise<boolean> {
  const card = await getProfileCard(page, profileId);
  const builtInBadge = card.locator('span:has-text("Built-in")');
  return await builtInBadge.isVisible().catch(() => false);
}

/**
 * Check if the edit button is visible for a profile
 */
export async function isEditButtonVisible(page: Page, profileId: string): Promise<boolean> {
  const card = await getProfileCard(page, profileId);
  // Hover over card to make buttons visible
  await card.hover();
  const editButton = await getByTestId(page, `edit-profile-${profileId}`);
  // Wait for button to become visible after hover (handles CSS transition)
  try {
    await editButton.waitFor({ state: 'visible', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the delete button is visible for a profile
 */
export async function isDeleteButtonVisible(page: Page, profileId: string): Promise<boolean> {
  const card = await getProfileCard(page, profileId);
  // Hover over card to make buttons visible
  await card.hover();
  const deleteButton = await getByTestId(page, `delete-profile-${profileId}`);
  // Wait for button to become visible after hover (handles CSS transition)
  try {
    await deleteButton.waitFor({ state: 'visible', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Drag & Drop
// ============================================================================

/**
 * Drag a profile from one position to another
 * Uses the drag handle and dnd-kit library pattern
 *
 * Note: dnd-kit requires pointer events with specific timing for drag recognition.
 * Manual mouse operations are needed because Playwright's dragTo doesn't work
 * reliably with dnd-kit's pointer-based drag detection.
 *
 * @param fromIndex - 0-based index of the profile to drag
 * @param toIndex - 0-based index of the target position
 */
export async function dragProfile(page: Page, fromIndex: number, toIndex: number): Promise<void> {
  // Get all profile cards
  const cards = await page.locator('[data-testid^="profile-card-"]').all();

  if (fromIndex >= cards.length || toIndex >= cards.length) {
    throw new Error(
      `Invalid drag indices: fromIndex=${fromIndex}, toIndex=${toIndex}, total=${cards.length}`
    );
  }

  const fromCard = cards[fromIndex];
  const toCard = cards[toIndex];

  // Get the drag handle within the source card
  const dragHandle = fromCard.locator('[data-testid^="profile-drag-handle-"]');

  // Ensure drag handle is visible and ready
  await dragHandle.waitFor({ state: 'visible', timeout: 5000 });

  // Get bounding boxes
  const handleBox = await dragHandle.boundingBox();
  const toBox = await toCard.boundingBox();

  if (!handleBox || !toBox) {
    throw new Error('Unable to get bounding boxes for drag operation');
  }

  // Start position (center of drag handle)
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  // End position (center of target card)
  const endX = toBox.x + toBox.width / 2;
  const endY = toBox.y + toBox.height / 2;

  // Perform manual drag operation
  // dnd-kit needs pointer events in a specific sequence
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // dnd-kit requires a brief hold before recognizing the drag gesture
  // This is a library requirement, not an arbitrary timeout
  await page.waitForTimeout(150);

  // Move to target in steps for smoother drag recognition
  await page.mouse.move(endX, endY, { steps: 10 });

  // Brief pause before drop
  await page.waitForTimeout(100);

  await page.mouse.up();

  // Wait for reorder animation to complete
  await page.waitForTimeout(200);
}

/**
 * Get the current order of all profile IDs
 * Returns array of profile IDs in display order
 */
export async function getProfileOrder(page: Page): Promise<string[]> {
  const cards = await page.locator('[data-testid^="profile-card-"]').all();
  const ids: string[] = [];

  for (const card of cards) {
    const testId = await card.getAttribute('data-testid');
    if (testId) {
      // Extract profile ID from data-testid="profile-card-{id}"
      const profileId = testId.replace('profile-card-', '');
      ids.push(profileId);
    }
  }

  return ids;
}

// ============================================================================
// Header Actions
// ============================================================================

/**
 * Click the "Refresh Defaults" button
 */
export async function clickRefreshDefaults(page: Page): Promise<void> {
  await clickElement(page, 'refresh-profiles-button');
}
