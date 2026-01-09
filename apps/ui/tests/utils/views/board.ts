import { Page, Locator } from '@playwright/test';

/**
 * Get a kanban card by feature ID
 */
export async function getKanbanCard(page: Page, featureId: string): Promise<Locator> {
  return page.locator(`[data-testid="kanban-card-${featureId}"]`);
}

/**
 * Get a kanban column by its ID
 */
export async function getKanbanColumn(page: Page, columnId: string): Promise<Locator> {
  return page.locator(`[data-testid="kanban-column-${columnId}"]`);
}

/**
 * Get the width of a kanban column
 */
export async function getKanbanColumnWidth(page: Page, columnId: string): Promise<number> {
  const column = page.locator(`[data-testid="kanban-column-${columnId}"]`);
  const box = await column.boundingBox();
  return box?.width ?? 0;
}

/**
 * Check if a kanban column has CSS columns (masonry) layout
 */
export async function hasKanbanColumnMasonryLayout(page: Page, columnId: string): Promise<boolean> {
  const column = page.locator(`[data-testid="kanban-column-${columnId}"]`);
  const contentDiv = column.locator('> div').nth(1); // Second child is the content area

  const columnCount = await contentDiv.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.columnCount;
  });

  return columnCount === '2';
}

/**
 * Drag a kanban card from one column to another
 */
export async function dragKanbanCard(
  page: Page,
  featureId: string,
  targetColumnId: string
): Promise<void> {
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  const targetColumn = page.locator(`[data-testid="kanban-column-${targetColumnId}"]`);

  // Perform drag and drop
  await dragHandle.dragTo(targetColumn);
}

/**
 * Click the view output button on a kanban card
 */
export async function clickViewOutput(page: Page, featureId: string): Promise<void> {
  // Try the running version first, then the in-progress version
  const runningBtn = page.locator(`[data-testid="view-output-${featureId}"]`);
  const inProgressBtn = page.locator(`[data-testid="view-output-inprogress-${featureId}"]`);

  if (await runningBtn.isVisible()) {
    await runningBtn.click();
  } else if (await inProgressBtn.isVisible()) {
    await inProgressBtn.click();
  } else {
    throw new Error(`View output button not found for feature ${featureId}`);
  }
}

/**
 * Check if the drag handle is visible for a specific feature card
 */
export async function isDragHandleVisibleForFeature(
  page: Page,
  featureId: string
): Promise<boolean> {
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  return await dragHandle.isVisible().catch(() => false);
}

/**
 * Get the drag handle element for a specific feature card
 */
export async function getDragHandleForFeature(page: Page, featureId: string): Promise<Locator> {
  return page.locator(`[data-testid="drag-handle-${featureId}"]`);
}

// ============================================================================
// Add Feature Dialog
// ============================================================================

/**
 * Click the add feature button
 */
export async function clickAddFeature(page: Page): Promise<void> {
  await page.click('[data-testid="add-feature-button"]');
  await page.waitForSelector('[data-testid="add-feature-dialog"]', {
    timeout: 5000,
  });
}

/**
 * Fill in the add feature dialog
 */
export async function fillAddFeatureDialog(
  page: Page,
  description: string,
  options?: { branch?: string; category?: string }
): Promise<void> {
  // Fill description (using the dropzone textarea)
  const descriptionInput = page.locator('[data-testid="add-feature-dialog"] textarea').first();
  await descriptionInput.fill(description);

  // Fill branch if provided
  if (options?.branch) {
    // Check if "Use current selected branch" option exists and matches our desired branch
    const currentBranchRadio = page.locator('[id="feature-current"]');
    const currentBranchLabel = page.locator('label[for="feature-current"]');

    const currentBranchExists = await currentBranchRadio.isVisible().catch(() => false);
    let useCurrentBranch = false;

    if (currentBranchExists) {
      const labelText = await currentBranchLabel.textContent();
      // Check if the label contains our desired branch name
      if (labelText?.includes(options.branch)) {
        useCurrentBranch = true;
      }
    }

    if (useCurrentBranch) {
      // Select "Use current selected branch" radio option
      await currentBranchRadio.click();
      await page.waitForTimeout(200);
    } else {
      // Select "Other branch" radio option
      const otherBranchRadio = page
        .locator('[data-testid="feature-radio-group"]')
        .locator('[id="feature-other"]');
      await otherBranchRadio.waitFor({ state: 'visible', timeout: 5000 });
      await otherBranchRadio.click();
      // Wait for the branch input to appear
      await page.waitForTimeout(300);

      // Now click on the branch input (autocomplete)
      const branchInput = page.locator('[data-testid="feature-input"]');
      await branchInput.waitFor({ state: 'visible', timeout: 5000 });
      await branchInput.click();
      // Wait for the popover to open
      await page.waitForTimeout(300);
      // Type in the command input
      const commandInput = page.locator('[cmdk-input]');
      await commandInput.fill(options.branch);
      // Press Enter to select/create the branch
      await commandInput.press('Enter');
      // Wait for popover to close
      await page.waitForTimeout(200);
    }
  }

  // Fill category if provided (it's also a combobox autocomplete)
  if (options?.category) {
    const categoryButton = page.locator('[data-testid="feature-category-input"]');
    await categoryButton.click();
    await page.waitForTimeout(300);
    const commandInput = page.locator('[cmdk-input]');
    await commandInput.fill(options.category);
    await commandInput.press('Enter');
    await page.waitForTimeout(200);
  }
}

/**
 * Confirm the add feature dialog
 */
export async function confirmAddFeature(page: Page): Promise<void> {
  await page.click('[data-testid="confirm-add-feature"]');
  // Wait for dialog to close
  await page.waitForFunction(() => !document.querySelector('[data-testid="add-feature-dialog"]'), {
    timeout: 5000,
  });
}

/**
 * Add a feature with all steps in one call
 */
export async function addFeature(
  page: Page,
  description: string,
  options?: { branch?: string; category?: string }
): Promise<void> {
  await clickAddFeature(page);
  await fillAddFeatureDialog(page, description, options);
  await confirmAddFeature(page);
}

// ============================================================================
// Worktree Selector
// ============================================================================

/**
 * Get the worktree selector element
 */
export async function getWorktreeSelector(page: Page): Promise<Locator> {
  return page.locator('[data-testid="worktree-selector"]');
}

/**
 * Click on a branch button in the worktree selector
 */
export async function selectWorktreeBranch(page: Page, branchName: string): Promise<void> {
  const branchButton = page.getByRole('button', {
    name: new RegExp(branchName, 'i'),
  });
  await branchButton.click();
  await page.waitForTimeout(500); // Wait for UI to update
}

/**
 * Get the currently selected branch in the worktree selector
 */
export async function getSelectedWorktreeBranch(page: Page): Promise<string | null> {
  // The main branch button has aria-pressed="true" when selected
  const selectedButton = page.locator(
    '[data-testid="worktree-selector"] button[aria-pressed="true"]'
  );
  const text = await selectedButton.textContent().catch(() => null);
  return text?.trim() || null;
}

/**
 * Check if a branch button is visible in the worktree selector
 */
export async function isWorktreeBranchVisible(page: Page, branchName: string): Promise<boolean> {
  const branchButton = page.getByRole('button', {
    name: new RegExp(branchName, 'i'),
  });
  return await branchButton.isVisible().catch(() => false);
}
