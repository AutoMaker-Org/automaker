/**
 * Delete Worktree with Features E2E Test
 *
 * Tests deleting a worktree with features:
 * 1. Delete worktree without deleting features (features move to main)
 * 2. Delete worktree with deleting features (features are removed)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
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
import { addFeature, getKanbanColumn } from '../utils/views/board';

const execAsync = promisify(exec);
const TEST_TEMP_DIR = createTempDirPath('delete-worktree-tests');

// Helper to enable worktrees in settings
async function enableWorktrees(page: any) {
  await page.click('[data-testid="settings-button"]');
  await page.waitForSelector('[data-testid="settings-view"]', { timeout: 5000 });

  // Click on Feature Defaults section
  const featureDefaultsSection = page.getByRole('button', { name: /Feature Defaults/i });
  await featureDefaultsSection.click();
  await page.waitForTimeout(500);

  // Scroll to and enable worktrees checkbox
  const worktreeCheckbox = page.locator('[data-testid="use-worktrees-checkbox"]');
  await worktreeCheckbox.scrollIntoViewIfNeeded();
  await worktreeCheckbox.waitFor({ state: 'visible', timeout: 5000 });
  const isChecked = await worktreeCheckbox.isChecked();
  if (!isChecked) {
    await worktreeCheckbox.click();
    await page.waitForTimeout(500);
  }

  // Navigate back to board using keyboard shortcut
  await page.keyboard.press('k');
  await waitForBoardView(page);

  // Expand worktree panel if collapsed (click the expand button)
  const expandButton = page.getByRole('button', { name: /expand worktree panel/i });
  const isExpandButtonVisible = await expandButton.isVisible().catch(() => false);
  if (isExpandButtonVisible) {
    await expandButton.click();
    await page.waitForTimeout(500);
  }
}

// Helper to create a worktree via the Create Worktree dialog
async function createWorktree(page: any, branchName: string) {
  const createWorktreeButton = page.getByRole('button', { name: 'Create new worktree' });
  await createWorktreeButton.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Fill in the branch name and submit
  const branchInput = page.locator('[role="dialog"] input');
  await branchInput.waitFor({ state: 'visible', timeout: 5000 });
  await branchInput.click();
  await page.keyboard.press('Control+a');
  await branchInput.fill(branchName);
  await page.keyboard.press('Enter');

  // Wait for worktree to be created - check for the success toast
  const successToast = page.locator(`text=/Worktree created for branch.*${branchName}/i`);
  await successToast.waitFor({ state: 'visible', timeout: 10000 });

  // Wait for UI to update
  await page.waitForTimeout(2000);
}

// Helper to get all feature IDs for a branch
function getFeaturesForBranch(projectPath: string, branchName: string): string[] {
  const featuresDir = path.join(projectPath, '.automaker', 'features');
  if (!fs.existsSync(featuresDir)) return [];

  const featureIds: string[] = [];
  const entries = fs.readdirSync(featuresDir);

  for (const featureId of entries) {
    const featureJsonPath = path.join(featuresDir, featureId, 'feature.json');
    if (fs.existsSync(featureJsonPath)) {
      const featureData = JSON.parse(fs.readFileSync(featureJsonPath, 'utf-8'));
      if (featureData.branchName === branchName) {
        featureIds.push(featureId);
      }
    }
  }

  return featureIds;
}

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

test.describe('Delete Worktree with Features', () => {
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

  test('should move features to main when deleting worktree without checkbox', async ({ page }) => {
    test.setTimeout(90000);

    // Setup project and enable worktrees
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Enable worktrees
    await enableWorktrees(page);

    // Create a new worktree branch "feature-branch"
    await createWorktree(page, 'feature-branch');

    // Add 2 features to the feature-branch
    await addFeature(page, 'Feature 1 for feature-branch', { branch: 'feature-branch' });
    await page.waitForTimeout(500);
    await addFeature(page, 'Feature 2 for feature-branch', { branch: 'feature-branch' });
    await page.waitForTimeout(500);

    // Verify features are visible in backlog on feature-branch
    const backlogColumn = await getKanbanColumn(page, 'backlog');
    const feature1Card = backlogColumn.locator('text=Feature 1 for feature-branch');
    const feature2Card = backlogColumn.locator('text=Feature 2 for feature-branch');
    await expect(feature1Card).toBeVisible();
    await expect(feature2Card).toBeVisible();

    // Open worktree actions dropdown
    const featureBranchTab = page.getByRole('button', { name: /^feature-branch\s+\d+$/ });
    await featureBranchTab.waitFor({ state: 'visible', timeout: 10000 });

    // Get the parent container and find the actions dropdown (three dots button)
    const worktreeContainer = featureBranchTab.locator('..');
    const actionsDropdown = worktreeContainer.locator('button').last(); // Last button in the group is the actions menu
    await actionsDropdown.click();
    await page.waitForTimeout(300);

    // Click delete option
    const deleteOption = page.getByRole('menuitem', { name: /delete/i });
    await deleteOption.click();

    // Wait for delete dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify the affected feature count is shown
    const affectedFeaturesWarning = page.locator('text=/2 features.*assigned to this branch/i');
    await expect(affectedFeaturesWarning).toBeVisible();

    // DO NOT check the "Delete backlog" checkbox - leave it unchecked
    const deleteBacklogCheckbox = page.locator('[id="delete-features"]');
    const isDeleteBacklogChecked = await deleteBacklogCheckbox.isChecked();
    expect(isDeleteBacklogChecked).toBe(false);

    // Confirm deletion
    const deleteButton = page.getByRole('button', { name: /^Delete$/i });
    await deleteButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Switch to main branch (count is optional - may be 0)
    const mainBranchTab = page.getByRole('button', { name: /^main(\s+\d+)?$/ });
    await mainBranchTab.waitFor({ state: 'visible', timeout: 5000 });
    await mainBranchTab.click();
    await page.waitForTimeout(1000);

    // Verify features are now visible on main branch (moved from feature-branch)
    const mainBacklogColumn = await getKanbanColumn(page, 'backlog');
    const movedFeature1 = mainBacklogColumn.locator('text=Feature 1 for feature-branch').first();
    const movedFeature2 = mainBacklogColumn.locator('text=Feature 2 for feature-branch').first();
    await expect(movedFeature1).toBeVisible({ timeout: 5000 });
    await expect(movedFeature2).toBeVisible({ timeout: 5000 });

    // Verify features on disk have been reassigned to main
    const mainFeatures = getFeaturesForBranch(testRepo.path, 'main');
    expect(mainFeatures.length).toBeGreaterThanOrEqual(2);

    // Verify no features remain for feature-branch
    const featureBranchFeatures = getFeaturesForBranch(testRepo.path, 'feature-branch');
    expect(featureBranchFeatures.length).toBe(0);

    // Verify feature-branch tab is gone
    await expect(featureBranchTab).not.toBeVisible();
  });

  test('should delete features when deleting worktree with checkbox checked', async ({ page }) => {
    test.setTimeout(90000);

    // Setup project and enable worktrees
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Enable worktrees
    await enableWorktrees(page);

    // Create a new worktree branch "delete-branch"
    await createWorktree(page, 'delete-branch');

    // Add 3 features to the delete-branch
    await addFeature(page, 'Feature to be deleted 1', { branch: 'delete-branch' });
    await page.waitForTimeout(500);
    await addFeature(page, 'Feature to be deleted 2', { branch: 'delete-branch' });
    await page.waitForTimeout(500);
    await addFeature(page, 'Feature to be deleted 3', { branch: 'delete-branch' });
    await page.waitForTimeout(500);

    // Verify features are visible in backlog on delete-branch
    const backlogColumn = await getKanbanColumn(page, 'backlog');
    const feature1Card = backlogColumn.locator('text=Feature to be deleted 1');
    await expect(feature1Card).toBeVisible();

    // Open worktree actions dropdown
    const deleteBranchTab = page.getByRole('button', { name: /^delete-branch\s+\d+$/ });
    await deleteBranchTab.waitFor({ state: 'visible', timeout: 10000 });

    // Get the parent container and find the actions dropdown (three dots button)
    const worktreeContainer = deleteBranchTab.locator('..');
    const actionsDropdown = worktreeContainer.locator('button').last();
    await actionsDropdown.click();
    await page.waitForTimeout(300);

    // Click delete option
    const deleteOption = page.getByRole('menuitem', { name: /delete/i });
    await deleteOption.click();

    // Wait for delete dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Check the "Delete backlog" checkbox
    const deleteBacklogCheckbox = page.locator('[id="delete-features"]');
    await expect(deleteBacklogCheckbox).toBeVisible();
    await deleteBacklogCheckbox.click();
    await page.waitForTimeout(300);

    // Verify the warning message is hidden when checkbox is checked
    const affectedFeaturesWarning = page.locator(
      'text=/features.*will be unassigned and moved to the main worktree/i'
    );
    await expect(affectedFeaturesWarning).not.toBeVisible();

    // Confirm deletion
    const deleteButton = page.getByRole('button', { name: /^Delete$/i });
    await deleteButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Switch to main branch (count is optional - may be 0)
    const mainBranchTab = page.getByRole('button', { name: /^main(\s+\d+)?$/ });
    await mainBranchTab.waitFor({ state: 'visible', timeout: 5000 });
    await mainBranchTab.click();
    await page.waitForTimeout(1000);

    // Verify features are NOT on main branch (they were deleted)
    const mainBacklogColumn = await getKanbanColumn(page, 'backlog');
    const deletedFeature1 = mainBacklogColumn.locator('text=Feature to be deleted 1');
    const deletedFeature2 = mainBacklogColumn.locator('text=Feature to be deleted 2');
    const deletedFeature3 = mainBacklogColumn.locator('text=Feature to be deleted 3');
    await expect(deletedFeature1).not.toBeVisible();
    await expect(deletedFeature2).not.toBeVisible();
    await expect(deletedFeature3).not.toBeVisible();

    // Verify features were actually deleted from disk (not just moved)
    const deleteBranchFeatures = getFeaturesForBranch(testRepo.path, 'delete-branch');
    expect(deleteBranchFeatures.length).toBe(0);

    // Also verify they're not on main branch
    const featuresDir = path.join(testRepo.path, '.automaker', 'features');
    const allFeatures = fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir) : [];

    // Check that no feature contains the "deleted" text in description
    for (const featureId of allFeatures) {
      const featureJsonPath = path.join(featuresDir, featureId, 'feature.json');
      if (fs.existsSync(featureJsonPath)) {
        const featureData = JSON.parse(fs.readFileSync(featureJsonPath, 'utf-8'));
        expect(featureData.description).not.toContain('Feature to be deleted');
      }
    }

    // Verify delete-branch tab is gone
    await expect(deleteBranchTab).not.toBeVisible();
  });

  test('should show feature count in delete dialog', async ({ page }) => {
    test.setTimeout(90000);

    // Setup project and enable worktrees
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Enable worktrees
    await enableWorktrees(page);

    // Create worktree
    await createWorktree(page, 'count-test');

    // Add exactly 5 features
    for (let i = 1; i <= 5; i++) {
      await addFeature(page, `Count test feature ${i}`, { branch: 'count-test' });
      await page.waitForTimeout(400);
    }

    // Open delete dialog
    const countTestTab = page.getByRole('button', { name: /^count-test\s+\d+$/ });
    await countTestTab.waitFor({ state: 'visible', timeout: 10000 });

    // Get the parent container and find the actions dropdown (three dots button)
    const worktreeContainer = countTestTab.locator('..');
    const actionsDropdown = worktreeContainer.locator('button').last();
    await actionsDropdown.click();
    await page.waitForTimeout(300);

    const deleteOption = page.getByRole('menuitem', { name: /delete/i });
    await deleteOption.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify checkbox shows correct count
    const deleteBacklogLabel = page.locator('text=/Delete backlog.*5 features/i');
    await expect(deleteBacklogLabel).toBeVisible();

    // Verify warning shows correct count
    const warningMessage = page.locator('text=/5 features are assigned to this branch/i');
    await expect(warningMessage).toBeVisible();

    // Cancel
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();
  });

  test('should delete git branch when "Also delete the branch" is checked', async ({ page }) => {
    test.setTimeout(90000);

    // Setup project and enable worktrees
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Enable worktrees
    await enableWorktrees(page);

    // Create a new worktree branch "branch-to-delete"
    await createWorktree(page, 'branch-to-delete');

    // Verify branch exists before deletion
    const { stdout: beforeBranches } = await execAsync('git branch', { cwd: testRepo.path });
    expect(beforeBranches).toContain('branch-to-delete');

    // Open worktree actions dropdown
    const branchTab = page.getByRole('button', { name: /^branch-to-delete(\s+\d+)?$/ });
    await branchTab.waitFor({ state: 'visible', timeout: 10000 });

    const worktreeContainer = branchTab.locator('..');
    const actionsDropdown = worktreeContainer.locator('button').last();
    await actionsDropdown.click();
    await page.waitForTimeout(300);

    // Click delete option
    const deleteOption = page.getByRole('menuitem', { name: /delete/i });
    await deleteOption.click();

    // Wait for delete dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Check the "Also delete the branch" checkbox
    const deleteBranchCheckbox = page.locator('[id="delete-branch"]');
    await expect(deleteBranchCheckbox).toBeVisible();
    await deleteBranchCheckbox.click();
    await page.waitForTimeout(300);

    // Confirm deletion
    const deleteButton = page.getByRole('button', { name: /^Delete$/i });
    await deleteButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Verify git branch was deleted
    const { stdout: afterBranches } = await execAsync('git branch', { cwd: testRepo.path });
    expect(afterBranches).not.toContain('branch-to-delete');

    // Verify worktree tab is gone
    await expect(branchTab).not.toBeVisible();
  });

  test('should keep git branch when "Also delete the branch" is unchecked', async ({ page }) => {
    test.setTimeout(90000);

    // Setup project and enable worktrees
    await setupProjectWithPath(page, testRepo.path);
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Enable worktrees
    await enableWorktrees(page);

    // Create a new worktree branch "branch-to-keep"
    await createWorktree(page, 'branch-to-keep');

    // Verify branch exists before deletion
    const { stdout: beforeBranches } = await execAsync('git branch', { cwd: testRepo.path });
    expect(beforeBranches).toContain('branch-to-keep');

    // Open worktree actions dropdown
    const branchTab = page.getByRole('button', { name: /^branch-to-keep(\s+\d+)?$/ });
    await branchTab.waitFor({ state: 'visible', timeout: 10000 });

    const worktreeContainer = branchTab.locator('..');
    const actionsDropdown = worktreeContainer.locator('button').last();
    await actionsDropdown.click();
    await page.waitForTimeout(300);

    // Click delete option
    const deleteOption = page.getByRole('menuitem', { name: /delete/i });
    await deleteOption.click();

    // Wait for delete dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify the "Also delete the branch" checkbox exists and is checked by default
    const deleteBranchCheckbox = page.locator('[id="delete-branch"]');
    await expect(deleteBranchCheckbox).toBeVisible();
    const isChecked = await deleteBranchCheckbox.isChecked();

    // If checked, uncheck it to keep the branch
    if (isChecked) {
      await deleteBranchCheckbox.click();
      await page.waitForTimeout(300);
    }

    // Confirm deletion
    const deleteButton = page.getByRole('button', { name: /^Delete$/i });
    await deleteButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Verify git branch still exists
    const { stdout: afterBranches } = await execAsync('git branch', { cwd: testRepo.path });
    expect(afterBranches).toContain('branch-to-keep');

    // Verify worktree tab is gone (worktree deleted but branch kept)
    await expect(branchTab).not.toBeVisible();
  });
});
