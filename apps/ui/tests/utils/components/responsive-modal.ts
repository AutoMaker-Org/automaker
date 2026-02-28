/**
 * Responsive testing utilities for modal components
 * These utilities help test responsive behavior across different screen sizes
 */

import { Page, expect } from '@playwright/test';
import { waitForElement } from '../core/waiting';

/**
 * Wait for viewport resize to stabilize by polling element dimensions
 * until they stop changing. Much more reliable than a fixed timeout.
 */
async function waitForLayoutStable(page: Page, testId: string, timeout = 2000): Promise<void> {
  await page.waitForFunction(
    ({ testId: tid, timeout: t }) => {
      return new Promise<boolean>((resolve) => {
        const el = document.querySelector(`[data-testid="${tid}"]`);
        if (!el) {
          resolve(true);
          return;
        }
        let lastWidth = el.clientWidth;
        let lastHeight = el.clientHeight;
        let stableCount = 0;
        const interval = setInterval(() => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w === lastWidth && h === lastHeight) {
            stableCount++;
            if (stableCount >= 3) {
              clearInterval(interval);
              resolve(true);
            }
          } else {
            stableCount = 0;
            lastWidth = w;
            lastHeight = h;
          }
        }, 50);
        setTimeout(() => {
          clearInterval(interval);
          resolve(true);
        }, t);
      });
    },
    { testId, timeout },
    { timeout: timeout + 500 }
  );
}

/**
 * Viewport sizes for different device types
 */
export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  mobileLarge: { width: 414, height: 896 },
  tablet: { width: 768, height: 1024 },
  tabletLarge: { width: 1024, height: 1366 },
  desktop: { width: 1280, height: 720 },
  desktopLarge: { width: 1920, height: 1080 },
} as const;

/**
 * Expected responsive classes for AgentOutputModal
 */
export const EXPECTED_CLASSES = {
  mobile: {
    width: ['w-full', 'max-w-[calc(100%-2rem)]'],
    height: ['max-h-[85dvh]'],
  },
  small: {
    width: ['sm:w-[60vw]', 'sm:max-w-[60vw]'],
    height: ['sm:max-h-[80vh]'],
  },
  tablet: {
    width: ['md:w-[90vw]', 'md:max-w-[1200px]'],
    height: ['md:max-h-[85vh]'],
  },
} as const;

/**
 * Get the computed width of the modal in pixels
 */
export async function getModalWidth(page: Page): Promise<number> {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  return await modal.evaluate((el) => el.offsetWidth);
}

/**
 * Get the computed height of the modal in pixels
 */
export async function getModalHeight(page: Page): Promise<number> {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  return await modal.evaluate((el) => el.offsetHeight);
}

/**
 * Get the computed style properties of the modal
 */
export async function getModalComputedStyle(page: Page): Promise<{
  width: string;
  height: string;
  maxWidth: string;
  maxHeight: string;
}> {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  return await modal.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      width: style.width,
      height: style.height,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
    };
  });
}

/**
 * Check if modal has expected classes for a specific viewport
 */
export async function expectModalResponsiveClasses(
  page: Page,
  viewport: keyof typeof VIEWPORTS,
  expectedClasses: string[]
): Promise<void> {
  const modal = page.locator('[data-testid="agent-output-modal"]');

  for (const className of expectedClasses) {
    await expect(modal).toContainClass(className);
  }
}

/**
 * Test modal width across different viewports
 */
export async function testModalWidthAcrossViewports(
  page: Page,
  viewports: Array<keyof typeof VIEWPORTS>
): Promise<void> {
  for (const viewport of viewports) {
    const size = VIEWPORTS[viewport];

    // Set viewport
    await page.setViewportSize(size);

    // Wait for any responsive transitions
    await waitForLayoutStable(page, 'agent-output-modal');

    // Get modal width
    const modalWidth = await getModalWidth(page);
    const viewportWidth = size.width;

    // Check constraints based on viewport
    if (viewport === 'mobile' || viewport === 'mobileLarge') {
      // Mobile: should be close to full width with 2rem margins
      expect(modalWidth).toBeGreaterThan(viewportWidth - 40);
      expect(modalWidth).toBeLessThan(viewportWidth - 20);
    } else if (viewport === 'tablet' || viewport === 'tabletLarge') {
      // Tablet: should be around 90vw but not exceed max-w-[1200px]
      const expected90vw = Math.floor(viewportWidth * 0.9);
      expect(modalWidth).toBeLessThanOrEqual(expected90vw);
      expect(modalWidth).toBeLessThanOrEqual(1200);
    } else if (viewport === 'desktop' || viewport === 'desktopLarge') {
      // Desktop: should be bounded by viewport and max-width constraints
      const expectedMaxWidth = Math.floor(viewportWidth * 0.9);
      const modalHeight = await getModalHeight(page);
      const viewportHeight = size.height;
      const expectedMaxHeight = Math.floor(viewportHeight * 0.9);
      expect(modalWidth).toBeLessThanOrEqual(expectedMaxWidth);
      expect(modalWidth).toBeLessThanOrEqual(1200);
      expect(modalWidth).toBeGreaterThan(0);
      expect(modalHeight).toBeLessThanOrEqual(expectedMaxHeight);
      expect(modalHeight).toBeGreaterThan(0);
    }
  }
}

/**
 * Test modal height across different viewports
 */
export async function testModalHeightAcrossViewports(
  page: Page,
  viewports: Array<keyof typeof VIEWPORTS>
): Promise<void> {
  for (const viewport of viewports) {
    const size = VIEWPORTS[viewport];

    // Set viewport
    await page.setViewportSize(size);

    // Wait for any responsive transitions
    await waitForLayoutStable(page, 'agent-output-modal');

    // Get modal height
    const modalHeight = await getModalHeight(page);
    const viewportHeight = size.height;

    // Check constraints based on viewport
    if (viewport === 'mobile' || viewport === 'mobileLarge') {
      // Mobile: should be max-h-[85dvh]
      const expected85dvh = Math.floor(viewportHeight * 0.85);
      expect(modalHeight).toBeLessThanOrEqual(expected85dvh);
    } else if (viewport === 'tablet' || viewport === 'tabletLarge') {
      // Tablet: should be max-h-[85vh]
      const expected85vh = Math.floor(viewportHeight * 0.85);
      expect(modalHeight).toBeLessThanOrEqual(expected85vh);
    }
  }
}

/**
 * Test modal responsiveness during resize
 */
export async function testModalResponsiveResize(
  page: Page,
  fromViewport: keyof typeof VIEWPORTS,
  toViewport: keyof typeof VIEWPORTS
): Promise<void> {
  // Set initial viewport
  await page.setViewportSize(VIEWPORTS[fromViewport]);
  await waitForLayoutStable(page, 'agent-output-modal');

  // Get initial modal dimensions (used for comparison context)
  await getModalComputedStyle(page);

  // Resize to new viewport
  await page.setViewportSize(VIEWPORTS[toViewport]);
  await waitForLayoutStable(page, 'agent-output-modal');

  // Get new modal dimensions
  const newDimensions = await getModalComputedStyle(page);

  // Verify dimensions changed appropriately using resolved pixel values
  const toSize = VIEWPORTS[toViewport];
  if (fromViewport === 'mobile' && toViewport === 'tablet') {
    const widthPx = parseFloat(newDimensions.width);
    const maxWidthPx = parseFloat(newDimensions.maxWidth);
    const expected90vw = toSize.width * 0.9;
    expect(widthPx).toBeLessThanOrEqual(expected90vw + 2);
    expect(maxWidthPx).toBeGreaterThanOrEqual(1200);
  } else if (fromViewport === 'tablet' && toViewport === 'mobile') {
    const widthPx = parseFloat(newDimensions.width);
    const maxWidthPx = parseFloat(newDimensions.maxWidth);
    expect(widthPx).toBeGreaterThan(toSize.width - 60);
    expect(maxWidthPx).toBeLessThan(1200);
  }
}

/**
 * Verify modal maintains functionality across viewports
 */
export async function verifyModalFunctionalityAcrossViewports(
  page: Page,
  viewports: Array<keyof typeof VIEWPORTS>
): Promise<void> {
  for (const viewport of viewports) {
    const size = VIEWPORTS[viewport];

    // Set viewport
    await page.setViewportSize(size);
    await waitForLayoutStable(page, 'agent-output-modal');

    // Verify modal is visible
    const modal = await waitForElement(page, 'agent-output-modal');
    await expect(modal).toBeVisible();

    // Verify modal content is visible
    const description = page.locator('[data-testid="agent-output-description"]');
    await expect(description).toBeVisible();

    // Verify view mode buttons are visible
    if (
      viewport === 'tablet' ||
      viewport === 'tabletLarge' ||
      viewport === 'desktop' ||
      viewport === 'desktopLarge'
    ) {
      const logsButton = page.getByTestId('view-mode-parsed');
      await expect(logsButton).toBeVisible();
    }
  }
}
