import { test, expect } from '@playwright/test';

test.describe('Pipeline Builder E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings page
    await page.goto('/settings');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('opens pipeline builder', async ({ page }) => {
    // Click on pipeline configuration section
    await page.click('[data-testid="pipeline-config-section"]');

    // Click "Visual Builder" button
    await page.click('button:has-text("Visual Builder")');

    // Check if pipeline builder modal is open
    await expect(page.locator('h1:has-text("Visual Pipeline Builder")')).toBeVisible();
  });

  test('drags and drops pipeline steps', async ({ page }) => {
    // Open pipeline builder
    await page.click('[data-testid="pipeline-config-section"]');
    await page.click('button:has-text("Visual Builder")');

    // Get first step element
    const firstStep = page.locator('[data-testid="pipeline-step"]').first();
    const secondStep = page.locator('[data-testid="pipeline-step"]').nth(1);

    // Get initial order
    const firstStepText = await firstStep.locator('h4').textContent();
    const secondStepText = await secondStep.locator('h4').textContent();

    // Drag first step and drop on second step
    await firstStep.dragTo(secondStep);

    // Verify order changed
    const newFirstStep = page.locator('[data-testid="pipeline-step"]').first();
    const newFirstStepText = await newFirstStep.locator('h4').textContent();

    expect(newFirstStepText).toBe(secondStepText);
  });

  test('adds new pipeline step', async ({ page }) => {
    // Open pipeline builder
    await page.click('[data-testid="pipeline-config-section"]');
    await page.click('button:has-text("Visual Builder")');

    // Get initial step count
    const initialSteps = await page.locator('[data-testid="pipeline-step"]').count();

    // Click "Security" button to add security step
    await page.click('button:has-text("Security")');

    // Verify step was added
    const newSteps = await page.locator('[data-testid="pipeline-step"]').count();
    expect(newSteps).toBe(initialSteps + 1);

    // Verify the new step is visible
    await expect(page.locator('text=New security step')).toBeVisible();
  });

  test('exports pipeline configuration', async ({ page }) => {
    // Start download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.click('button:has-text("Export")');

    // Wait for download
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toBe('pipeline-config.json');
  });

  test('imports pipeline configuration', async ({ page }) => {
    // Create a test file
    const testConfig = {
      version: '1.0',
      enabled: true,
      steps: [
        {
          id: 'test-step',
          type: 'review',
          name: 'Test Review Step',
          model: 'opus',
          required: true,
          autoTrigger: true,
          config: {},
        },
      ],
    };

    // Upload the file
    await page.setInputFiles('input[type="file"][accept*="json"]', {
      name: 'test-pipeline.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testConfig, null, 2)),
    });

    // Verify the imported step appears
    await expect(page.locator('text=Test Review Step')).toBeVisible();
  });

  test('validates pipeline configuration', async ({ page }) => {
    // Open pipeline builder
    await page.click('[data-testid="pipeline-config-section"]');
    await page.click('button:has-text("Visual Builder")');

    // Enable pipeline without steps
    await page.uncheck('input[type="checkbox"]:has-text("Enable pipeline")');
    await page.check('input[type="checkbox"]:has-text("Enable pipeline")');

    // Try to save with no steps
    await page.click('button:has-text("Save Pipeline")');

    // Should show validation error
    await expect(page.locator('text=Pipeline is enabled but has no steps')).toBeVisible();

    // Should not close the modal
    await expect(page.locator('h1:has-text("Visual Pipeline Builder")')).toBeVisible();
  });

  test('configures individual step settings', async ({ page }) => {
    // Open pipeline builder
    await page.click('[data-testid="pipeline-config-section"]');
    await page.click('button:has-text("Visual Builder")');

    // Add a review step
    await page.click('button:has-text("Review")');

    // Click settings button on the step
    await page.locator('[data-testid="pipeline-step"] button').first().click();

    // Verify step configuration dialog opens
    await expect(page.locator('h2:has-text("Review Step Configuration")')).toBeVisible();

    // Change step name
    await page.fill('input[name="name"]', 'Custom Review Step');

    // Save configuration
    await page.click('button:has-text("Save")');

    // Verify name changed
    await expect(page.locator('text=Custom Review Step')).toBeVisible();
  });
});
