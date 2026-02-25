/**
 * E2E tests for AgentOutputModal responsive behavior
 * These tests verify the modal width changes across different screen sizes
 */

import { test, expect } from '@playwright/test';
import { setupRealProject } from '../../utils/project/setup';
import { waitForAgentOutputModal, getAgentOutputModalDescription } from '../../utils/components/modals';

test.describe('AgentOutputModal Responsive Behavior', () => {
  test.describe('Mobile View (< 640px)', () => {
    test('should use full width on mobile screens', async ({ page }) => {
      // Set up a project
      const projectPath = '/test/mobile-project';
      await setupRealProject(page, projectPath, 'Mobile Project');

      // Navigate to board view
      await page.goto('/board');

      // Open agent output modal
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Mobile responsive test');
      await page.click('[data-testid="confirm-add-feature"]');

      // Wait for modal to appear
      await waitForAgentOutputModal(page);

      // Check mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      const modal = page.locator('[data-testid="agent-output-modal"]');

      // Check if it uses full width on mobile
      const modalWidth = await modal.evaluate((el) => el.offsetWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      expect(modalWidth).toBeGreaterThan(viewportWidth - 40); // 2rem margin
      expect(modalWidth).toBeLessThan(viewportWidth - 20);
    });

    test('should have proper max width constraint on mobile', async ({ page }) => {
      const projectPath = '/test/mobile-max-width';
      await setupRealProject(page, projectPath, 'Mobile Max Width');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Max width test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 320, height: 568 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          width: style.width,
          maxWidth: style.maxWidth,
        };
      });

      expect(modalComputedStyle.maxWidth).toBe('calc(100% - 2rem)');
    });
  });

  test.describe('Small View (640px - 768px)', () => {
    test('should use 60vw on small screens', async ({ page }) => {
      const projectPath = '/test/small-view-project';
      await setupRealProject(page, projectPath, 'Small View Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Small view test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 640, height: 768 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          width: style.width,
          maxWidth: style.maxWidth,
        };
      });

      expect(modalComputedStyle.width).toMatch(/60vw/);
      expect(modalComputedStyle.maxWidth).toMatch(/60vw/);
    });

    test('should have 80vh height on small screens', async ({ page }) => {
      const projectPath = '/test/small-height-project';
      await setupRealProject(page, projectPath, 'Small Height Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Small height test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 640, height: 768 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          height: style.height,
          maxHeight: style.maxHeight,
        };
      });

      expect(modalComputedStyle.maxHeight).toMatch(/80vh/);
    });
  });

  test.describe('Tablet View (≥ 768px)', () => {
    test('should use 90vw on tablet screens', async ({ page }) => {
      const projectPath = '/test/tablet-project';
      await setupRealProject(page, projectPath, 'Tablet Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Tablet responsive test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 768, height: 1024 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          width: style.width,
          maxWidth: style.maxWidth,
        };
      });

      expect(modalComputedStyle.width).toMatch(/90vw/);
      expect(modalComputedStyle.maxWidth).toMatch(/90vw/);
    });

    test('should have 1200px max width on tablet', async ({ page }) => {
      const projectPath = '/test/tablet-max-project';
      await setupRealProject(page, projectPath, 'Tablet Max Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Tablet max width test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 768, height: 1024 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          width: style.width,
          maxWidth: style.maxWidth,
        };
      });

      expect(modalComputedStyle.maxWidth).toMatch(/1200px/);
    });

    test('should have 85vh height on tablet screens', async ({ page }) => {
      const projectPath = '/test/tablet-height-project';
      await setupRealProject(page, projectPath, 'Tablet Height Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Tablet height test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 768, height: 1024 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          height: style.height,
          maxHeight: style.maxHeight,
        };
      });

      expect(modalComputedStyle.maxHeight).toMatch(/85vh/);
    });

    test('should maintain correct height on larger tablets', async ({ page }) => {
      const projectPath = '/test/large-tablet-project';
      await setupRealProject(page, projectPath, 'Large Tablet Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Large tablet test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 1024, height: 1366 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const modalComputedStyle = await modal.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          height: style.height,
          maxHeight: style.maxHeight,
        };
      });

      expect(modalComputedStyle.maxHeight).toMatch(/85vh/);
    });
  });

  test.describe('Responsive Transitions', () => {
    test('should update modal size when resizing from mobile to tablet', async ({ page }) => {
      const projectPath = '/test/resize-project';
      await setupRealProject(page, projectPath, 'Resize Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Resize test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);

      // Start with mobile size
      await page.setViewportSize({ width: 375, height: 667 });
      let modalComputedStyle = await page.locator('[data-testid="agent-output-modal"]').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.width;
      });

      expect(modalComputedStyle).toMatch(/calc\(100% - 2rem\)/);

      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });

      // Wait for a moment for CSS to recalculate
      await page.waitForTimeout(100);

      modalComputedStyle = await page.locator('[data-testid="agent-output-modal"]').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.width;
      });

      expect(modalComputedStyle).toMatch(/90vw/);
    });

    test('should update modal size when resizing from tablet to mobile', async ({ page }) => {
      const projectPath = '/test/resize-mobile-project';
      await setupRealProject(page, projectPath, 'Resize Mobile Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Resize mobile test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);

      // Start with tablet size
      await page.setViewportSize({ width: 768, height: 1024 });
      let modalComputedStyle = await page.locator('[data-testid="agent-output-modal"]').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.width;
      });

      expect(modalComputedStyle).toMatch(/90vw/);

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });

      // Wait for a moment for CSS to recalculate
      await page.waitForTimeout(100);

      modalComputedStyle = await page.locator('[data-testid="agent-output-modal"]').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.width;
      });

      expect(modalComputedStyle).toMatch(/calc\(100% - 2rem\)/);
    });
  });

  test.describe('Content Responsiveness', () => {
    test('should display content correctly on tablet view', async ({ page }) => {
      const projectPath = '/test/content-responsive-project';
      await setupRealProject(page, projectPath, 'Content Responsive Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Content responsive test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 768, height: 1024 });

      // Check that content is visible and properly formatted
      const modal = page.locator('[data-testid="agent-output-modal"]');
      const contentArea = modal.locator('.flex-1');

      // Content area should be visible
      await expect(contentArea).toBeVisible();

      // Content should have proper scrolling
      await expect(contentArea).toHaveClass(/overflow-y-auto/);

      // Check that description is visible
      const description = await getAgentOutputModalDescription(page);
      expect(description).toContain('Content responsive test');
    });

    test('should maintain readability on tablet with wider width', async ({ page }) => {
      const projectPath = '/test/readability-project';
      await setupRealProject(page, projectPath, 'Readability Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Test long text that should wrap properly on wider tablet screens for better readability and user experience');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 1200, height: 800 });

      const modal = page.locator('[data-testid="agent-output-modal"]');
      const description = modal.locator('[data-testid="agent-output-description"]');

      // Check that long text wraps properly
      const descriptionText = await description.textContent();
      expect(descriptionText).toBeDefined();
      expect(descriptionText!.length).toBeGreaterThan(0);
    });
  });

  test.describe('Modal Functionality Across Screens', () => {
    test('should maintain functionality while resizing', async ({ page }) => {
      const projectPath = '/test/functionality-project';
      await setupRealProject(page, projectPath, 'Functionality Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'Functionality test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);

      // Test on mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible();

      // Test on tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.locator('[data-testid="agent-output-modal"]')).toBeVisible();

      // Test view mode switching on tablet
      const logsButton = page.getByTestId('view-mode-parsed');
      await expect(logsButton).toBeVisible();
      await logsButton.click();
      await expect(page.locator('role="log"')).toBeVisible();

      // Close modal and verify
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="agent-output-modal"]')).not.toBeVisible();
    });

    test('should handle view mode buttons on tablet', async ({ page }) => {
      const projectPath = '/test/view-buttons-project';
      await setupRealProject(page, projectPath, 'View Buttons Project');

      await page.goto('/board');
      await page.click('[data-testid="add-feature-button"]');
      await page.fill('[data-testid="feature-input"]', 'View buttons test');
      await page.click('[data-testid="confirm-add-feature"]');

      await waitForAgentOutputModal(page);
      await page.setViewportSize({ width: 768, height: 1024 });

      // Test all view mode buttons
      const summaryButton = page.getByTestId('view-mode-summary');
      const logsButton = page.getByTestId('view-mode-parsed');
      const rawButton = page.getByTestId('view-mode-raw');

      await expect(summaryButton).toBeVisible();
      await expect(logsButton).toBeVisible();
      await expect(rawButton).toBeVisible();

      // Test switching to raw view
      await rawButton.click();
      const contentArea = page.locator('.flex-1');
      await expect(contentArea).toHaveText(/Agent Output/);
    });
  });
});