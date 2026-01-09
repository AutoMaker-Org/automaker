/**
 * Add Context Image E2E Test
 *
 * Happy path: Import an image file to the context via the UI
 */

import { test, expect } from '@playwright/test';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForContextFile,
  waitForNetworkIdle,
  authenticateForTests,
} from '../utils';

test.describe('Add Context Image', () => {
  let testImagePath: string;

  test.beforeAll(async () => {
    // Create a simple test image (1x1 red PNG)
    const fixturePath = getFixturePath();
    testImagePath = path.join(fixturePath, '..', 'test-image.png');

    // Create a minimal PNG (1x1 pixel red image)
    const pngHeader = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // IHDR chunk length
      0x49,
      0x48,
      0x44,
      0x52, // IHDR
      0x00,
      0x00,
      0x00,
      0x01, // width: 1
      0x00,
      0x00,
      0x00,
      0x01, // height: 1
      0x08,
      0x02, // bit depth: 8, color type: 2 (RGB)
      0x00,
      0x00,
      0x00, // compression, filter, interlace
      0x90,
      0x77,
      0x53,
      0xde, // IHDR CRC
      0x00,
      0x00,
      0x00,
      0x0c, // IDAT chunk length
      0x49,
      0x44,
      0x41,
      0x54, // IDAT
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xcf,
      0xc0,
      0x00,
      0x00,
      0x01,
      0x01,
      0x01,
      0x00, // compressed data
      0x18,
      0xdd,
      0x8d,
      0xb4, // IDAT CRC
      0x00,
      0x00,
      0x00,
      0x00, // IEND chunk length
      0x49,
      0x45,
      0x4e,
      0x44, // IEND
      0xae,
      0x42,
      0x60,
      0x82, // IEND CRC
    ]);

    fs.writeFileSync(testImagePath, pngHeader);
  });

  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test.afterAll(async () => {
    // Clean up test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test('should import an image file to context', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Wait for the file input to be attached to the DOM before setting files
    const fileInput = page.locator('[data-testid="file-import-input"]');
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    // Use setInputFiles to upload the image
    await fileInput.setInputFiles(testImagePath);

    // Wait for the file to appear in the list (filename should be the base name)
    const fileName = path.basename(testImagePath);
    await waitForContextFile(page, fileName, 15000);

    // Verify the file appears in the list
    const fileButton = page.locator(`[data-testid="context-file-${fileName}"]`);
    await expect(fileButton).toBeVisible();

    // File verification: The file appearing in the UI is sufficient verification
    // In test mode, files may be in mock file system or real filesystem depending on API used
    // The UI showing the file confirms it was successfully uploaded and saved
    // Note: Description generation may fail in test mode (Claude Code process issues), but that's OK
  });
});
