import { Page, Locator } from '@playwright/test';
import { clickElement } from '../core/interactions';
import { waitForElement, waitForElementHidden } from '../core/waiting';

/**
 * Dismiss the sandbox warning dialog if it appears.
 * This dialog blocks pointer events and must be accepted before interacting
 * with elements behind it.
 */
export async function dismissSandboxWarningIfVisible(page: Page): Promise<void> {
  const sandboxAcceptBtn = page.locator('button:has-text("I Accept the Risks")');
  const sandboxVisible = await sandboxAcceptBtn
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (sandboxVisible) {
    await sandboxAcceptBtn.click();
    await page
      .locator('[role="dialog"][data-state="open"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 3000 })
      .catch(() => {});
  }
}

/**
 * Check if the add feature dialog is visible
 */
export async function isAddFeatureDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="add-feature-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Check if the add context file dialog is visible
 */
export async function isAddContextDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="add-context-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Check if the edit feature dialog is visible
 */
export async function isEditFeatureDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="edit-feature-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the edit feature dialog to be visible
 */
export async function waitForEditFeatureDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, 'edit-feature-dialog', options);
}

/**
 * Get the edit feature description input/textarea element
 */
export async function getEditFeatureDescriptionInput(page: Page): Promise<Locator> {
  return page.locator('[data-testid="edit-feature-description"]');
}

/**
 * Check if the edit feature description field is a textarea
 */
export async function isEditFeatureDescriptionTextarea(page: Page): Promise<boolean> {
  const element = page.locator('[data-testid="edit-feature-description"]');
  const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
  return tagName === 'textarea';
}

/**
 * Open the edit dialog for a specific feature
 */
export async function openEditFeatureDialog(page: Page, featureId: string): Promise<void> {
  await clickElement(page, `edit-feature-${featureId}`);
  await waitForEditFeatureDialog(page);
}

/**
 * Fill the edit feature description field
 */
export async function fillEditFeatureDescription(page: Page, value: string): Promise<void> {
  const input = await getEditFeatureDescriptionInput(page);
  await input.fill(value);
}

/**
 * Click the confirm edit feature button
 */
export async function confirmEditFeature(page: Page): Promise<void> {
  await clickElement(page, 'confirm-edit-feature');
}

/**
 * Get the delete confirmation dialog
 */
export async function getDeleteConfirmationDialog(page: Page): Promise<Locator> {
  return page.locator('[data-testid="delete-confirmation-dialog"]');
}

/**
 * Check if the delete confirmation dialog is visible
 */
export async function isDeleteConfirmationDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="delete-confirmation-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the delete confirmation dialog to appear
 */
export async function waitForDeleteConfirmationDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, 'delete-confirmation-dialog', options);
}

/**
 * Wait for the delete confirmation dialog to be hidden
 */
export async function waitForDeleteConfirmationDialogHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, 'delete-confirmation-dialog', options);
}

/**
 * Click the confirm delete button in the delete confirmation dialog
 */
export async function clickConfirmDeleteButton(page: Page): Promise<void> {
  await clickElement(page, 'confirm-delete-button');
}

/**
 * Click the cancel delete button in the delete confirmation dialog
 */
export async function clickCancelDeleteButton(page: Page): Promise<void> {
  await clickElement(page, 'cancel-delete-button');
}

/**
 * Check if the follow-up dialog is visible
 */
export async function isFollowUpDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="follow-up-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the follow-up dialog to be visible
 */
export async function waitForFollowUpDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, 'follow-up-dialog', options);
}

/**
 * Wait for the follow-up dialog to be hidden
 */
export async function waitForFollowUpDialogHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, 'follow-up-dialog', options);
}

/**
 * Click the confirm follow-up button in the follow-up dialog
 */
export async function clickConfirmFollowUp(page: Page): Promise<void> {
  await clickElement(page, 'confirm-follow-up');
}

/**
 * Check if the project initialization dialog is visible
 */
export async function isProjectInitDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="project-init-dialog"]');
  return await dialog.isVisible();
}

/**
 * Wait for the project initialization dialog to appear
 */
export async function waitForProjectInitDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, 'project-init-dialog', options);
}

/**
 * Close the project initialization dialog
 */
export async function closeProjectInitDialog(page: Page): Promise<void> {
  const closeButton = page.locator('[data-testid="close-init-dialog"]');
  await closeButton.click();
}
