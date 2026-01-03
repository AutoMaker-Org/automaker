/**
 * Open Project End-to-End Test
 *
 * Tests opening an existing project directory from the welcome view.
 * This verifies that:
 * 1. An existing directory can be opened as a project
 * 2. The .automaker directory is initialized if it doesn't exist
 * 3. The project is loaded and shown in the board view
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  setupWelcomeView,
  authenticateForTests,
  handleLoginScreenIfPresent,
} from '../utils';

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath('open-project-test');

test.describe('Open Project', () => {
  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('should open an existing project directory from recent projects', async ({ page }) => {
    const projectName = `existing-project-${Date.now()}`;
    const projectPath = path.join(TEST_TEMP_DIR, projectName);
    const projectId = `project-${Date.now()}`;

    // Create the project directory with some files to simulate an existing codebase
    fs.mkdirSync(projectPath, { recursive: true });

    // Create a package.json to simulate a real project
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: projectName,
          version: '1.0.0',
          description: 'A test project for e2e testing',
        },
        null,
        2
      )
    );

    // Create a README.md
    fs.writeFileSync(path.join(projectPath, 'README.md'), `# ${projectName}\n\nA test project.`);

    // Create a src directory with an index.ts file
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'src', 'index.ts'),
      'export const hello = () => console.log("Hello World");'
    );

    // Set up welcome view with the project in recent projects (but NOT as current project)
    await setupWelcomeView(page, {
      recentProjects: [
        {
          id: projectId,
          name: projectName,
          path: projectPath,
          lastOpened: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        },
      ],
    });

    // Navigate to the app
    await authenticateForTests(page);
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for welcome view to be visible
    await expect(page.locator('[data-testid="welcome-view"]')).toBeVisible({ timeout: 10000 });

    // Verify we see the "Recent Projects" section
    await expect(page.getByText('Recent Projects')).toBeVisible({ timeout: 5000 });

    // Click on the recent project to open it
    const recentProjectCard = page.locator(`[data-testid="recent-project-${projectId}"]`);
    await expect(recentProjectCard).toBeVisible();
    await recentProjectCard.click();

    // Wait for the board view to appear (project was opened)
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // Verify the project name appears in the project selector (sidebar)
    await expect(
      page.locator('[data-testid="project-selector"]').getByText(projectName)
    ).toBeVisible({ timeout: 5000 });

    // Verify .automaker directory was created (initialized for the first time)
    // Use polling since file creation may be async
    const automakerDir = path.join(projectPath, '.automaker');
    await expect(async () => {
      expect(fs.existsSync(automakerDir)).toBe(true);
    }).toPass({ timeout: 10000 });

    // Verify the required structure was created by initializeProject:
    // - .automaker/categories.json
    // - .automaker/features directory
    // - .automaker/context directory
    // Note: app_spec.txt is NOT created automatically for existing projects
    const categoriesPath = path.join(automakerDir, 'categories.json');
    await expect(async () => {
      expect(fs.existsSync(categoriesPath)).toBe(true);
    }).toPass({ timeout: 10000 });

    // Verify subdirectories were created
    expect(fs.existsSync(path.join(automakerDir, 'features'))).toBe(true);
    expect(fs.existsSync(path.join(automakerDir, 'context'))).toBe(true);

    // Verify the original project files still exist (weren't modified)
    expect(fs.existsSync(path.join(projectPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'src', 'index.ts'))).toBe(true);
  });
});
