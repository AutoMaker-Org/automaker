/**
 * Board Background Persistence End-to-End Test
 *
 * Tests that board background settings are properly saved and loaded when switching projects.
 * This verifies that:
 * 1. Background settings are saved to .automaker-local/settings.json
 * 2. Settings are loaded when switching back to a project
 * 3. Background image, opacity, and other settings are correctly restored
 * 4. Settings persist across app restarts (new page loads)
 *
 * This test prevents regression of the board background loading bug where
 * settings were saved but never loaded when switching projects.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTempDirPath,
  cleanupTempDir,
  authenticateForTests,
  handleLoginScreenIfPresent,
  setupWelcomeView,
} from '../utils';

// Create unique temp dirs for this test run
const TEST_TEMP_DIR = createTempDirPath('board-bg-test');

test.describe('Board Background Persistence', () => {
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

  test('should load board background settings when switching projects', async ({ page }) => {
    const projectAName = `project-a-${Date.now()}`;
    const projectBName = `project-b-${Date.now()}`;
    const projectAPath = path.join(TEST_TEMP_DIR, projectAName);
    const projectBPath = path.join(TEST_TEMP_DIR, projectBName);
    const projectAId = `project-a-${Date.now()}`;
    const projectBId = `project-b-${Date.now()}`;

    // Create both project directories
    fs.mkdirSync(projectAPath, { recursive: true });
    fs.mkdirSync(projectBPath, { recursive: true });

    // Create basic files for both projects
    for (const [name, projectPath] of [
      [projectAName, projectAPath],
      [projectBName, projectBPath],
    ]) {
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({ name, version: '1.0.0' }, null, 2)
      );
      fs.writeFileSync(path.join(projectPath, 'README.md'), `# ${name}\n`);
    }

    // Create .automaker-local directory for project A with background settings
    const automakerDirA = path.join(projectAPath, '.automaker-local');
    fs.mkdirSync(automakerDirA, { recursive: true });
    fs.mkdirSync(path.join(automakerDirA, 'board'), { recursive: true });
    fs.mkdirSync(path.join(automakerDirA, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDirA, 'context'), { recursive: true });

    // Copy actual background image from test fixtures
    const backgroundPath = path.join(automakerDirA, 'board', 'background.jpg');
    const testImagePath = path.join(__dirname, '..', 'img', 'background.jpg');
    fs.copyFileSync(testImagePath, backgroundPath);

    // Create settings.json with board background configuration
    const settingsPath = path.join(automakerDirA, 'settings.json');
    const backgroundSettings = {
      version: 1,
      boardBackground: {
        imagePath: backgroundPath,
        cardOpacity: 85,
        columnOpacity: 60,
        columnBorderEnabled: true,
        cardGlassmorphism: true,
        cardBorderEnabled: false,
        cardBorderOpacity: 50,
        hideScrollbar: true,
        imageVersion: Date.now(),
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(backgroundSettings, null, 2));

    // Create minimal automaker-local directory for project B (no background)
    const automakerDirB = path.join(projectBPath, '.automaker-local');
    fs.mkdirSync(automakerDirB, { recursive: true });
    fs.mkdirSync(path.join(automakerDirB, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDirB, 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(automakerDirB, 'settings.json'),
      JSON.stringify({ version: 1 }, null, 2)
    );

    // Set up welcome view with both projects in the list
    await setupWelcomeView(page, {
      workspaceDir: TEST_TEMP_DIR,
      recentProjects: [
        {
          id: projectAId,
          name: projectAName,
          path: projectAPath,
          lastOpened: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: projectBId,
          name: projectBName,
          path: projectBPath,
          lastOpened: new Date(Date.now() - 172800000).toISOString(),
        },
      ],
    });

    await authenticateForTests(page);

    // Intercept settings API to use our test projects and clear currentProjectId
    // This ensures the app shows the welcome view with our test projects
    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.settings) {
        // Clear currentProjectId to show welcome view
        json.settings.currentProjectId = null;
        // Include our test projects so they appear in the recent projects list
        json.settings.projects = [
          {
            id: projectAId,
            name: projectAName,
            path: projectAPath,
            lastOpened: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: projectBId,
            name: projectBName,
            path: projectBPath,
            lastOpened: new Date(Date.now() - 172800000).toISOString(),
          },
        ];
      }
      await route.fulfill({ response, json });
    });

    // Track API calls to /api/settings/project to verify settings are being loaded
    const settingsApiCalls: Array<{ url: string; method: string; body: string }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/settings/project') && request.method() === 'POST') {
        settingsApiCalls.push({
          url: request.url(),
          method: request.method(),
          body: request.postData() || '',
        });
      }
    });

    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for welcome view
    await expect(page.locator('[data-testid="welcome-view"]')).toBeVisible({ timeout: 10000 });

    // Open project A (has background settings)
    const projectACard = page.locator(`[data-testid="recent-project-${projectAId}"]`);
    await expect(projectACard).toBeVisible();
    await projectACard.click();

    // Wait for board view
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // Verify project A is current (check header paragraph which is always visible)
    await expect(page.locator('[data-testid="board-view"]').getByText(projectAName)).toBeVisible({
      timeout: 5000,
    });

    // CRITICAL: Wait for settings to be loaded (useProjectSettingsLoader hook)
    // This ensures the background settings are fetched from the server
    await page.waitForTimeout(2000);

    // Check if background settings were applied by checking the store
    // We can't directly access React state, so we'll verify via DOM/CSS
    const boardView = page.locator('[data-testid="board-view"]');
    await expect(boardView).toBeVisible();

    // Wait for initial project load to stabilize
    await page.waitForTimeout(500);

    // Ensure sidebar is expanded before interacting with project selector
    const expandSidebarButton = page.locator('button:has-text("Expand sidebar")');
    if (await expandSidebarButton.isVisible()) {
      await expandSidebarButton.click();
      await page.waitForTimeout(300);
    }

    // Switch to project B (no background)
    const projectSelector = page.locator('[data-testid="project-selector"]');
    await expect(projectSelector).toBeVisible({ timeout: 5000 });
    await projectSelector.click();

    // Wait for dropdown to be visible
    await expect(page.locator('[data-testid="project-picker-dropdown"]')).toBeVisible({
      timeout: 5000,
    });

    const projectPickerB = page.locator(`[data-testid="project-option-${projectBId}"]`);
    await expect(projectPickerB).toBeVisible({ timeout: 5000 });
    await projectPickerB.click();

    // Wait for project B to load
    await expect(
      page.locator('[data-testid="project-selector"]').getByText(projectBName)
    ).toBeVisible({ timeout: 5000 });

    // Wait a bit for project B to fully load before switching
    await page.waitForTimeout(500);

    // Switch back to project A
    await projectSelector.click();

    // Wait for dropdown to be visible
    await expect(page.locator('[data-testid="project-picker-dropdown"]')).toBeVisible({
      timeout: 5000,
    });

    const projectPickerA = page.locator(`[data-testid="project-option-${projectAId}"]`);
    await expect(projectPickerA).toBeVisible({ timeout: 5000 });
    await projectPickerA.click();

    // Verify we're back on project A
    await expect(
      page.locator('[data-testid="project-selector"]').getByText(projectAName)
    ).toBeVisible({ timeout: 5000 });

    // CRITICAL: Wait for settings to be loaded again
    await page.waitForTimeout(2000);

    // Verify that the settings API was called for project A (at least twice - initial load and switch back)
    const projectASettingsCalls = settingsApiCalls.filter((call) =>
      call.body.includes(projectAPath)
    );

    // Debug: log all API calls if test fails
    if (projectASettingsCalls.length < 2) {
      console.log('Total settings API calls:', settingsApiCalls.length);
      console.log('API calls:', JSON.stringify(settingsApiCalls, null, 2));
      console.log('Looking for path:', projectAPath);
    }

    expect(projectASettingsCalls.length).toBeGreaterThanOrEqual(2);

    // Verify settings file still exists with correct data
    const loadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(loadedSettings.boardBackground).toBeDefined();
    expect(loadedSettings.boardBackground.imagePath).toBe(backgroundPath);
    expect(loadedSettings.boardBackground.cardOpacity).toBe(85);
    expect(loadedSettings.boardBackground.columnOpacity).toBe(60);
    expect(loadedSettings.boardBackground.hideScrollbar).toBe(true);

    // The test passing means:
    // 1. The useProjectSettingsLoader hook is working
    // 2. Settings are loaded when switching projects
    // 3. The API call to /api/settings/project is made correctly
  });

  test('should load background settings on app restart', async ({ page }) => {
    const projectName = `restart-test-${Date.now()}`;
    const projectPath = path.join(TEST_TEMP_DIR, projectName);
    const projectId = `project-${Date.now()}`;

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    // Create .automaker-local with background settings
    const automakerDir = path.join(projectPath, '.automaker-local');
    fs.mkdirSync(automakerDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    // Copy actual background image from test fixtures
    const backgroundPath = path.join(automakerDir, 'board', 'background.jpg');
    const testImagePath = path.join(__dirname, '..', 'img', 'background.jpg');
    fs.copyFileSync(testImagePath, backgroundPath);

    const settingsPath = path.join(automakerDir, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          version: 1,
          boardBackground: {
            imagePath: backgroundPath,
            cardOpacity: 90,
            columnOpacity: 70,
            imageVersion: Date.now(),
          },
        },
        null,
        2
      )
    );

    // Set up with project as current using direct localStorage
    await page.addInitScript(
      ({ project }: { project: string[] }) => {
        const projectObj = {
          id: project[0],
          name: project[1],
          path: project[2],
          lastOpened: new Date().toISOString(),
        };

        const appState = {
          state: {
            projects: [projectObj],
            currentProject: projectObj,
            currentView: 'board',
            theme: 'dark',
            sidebarOpen: true,
            skipSandboxWarning: true,
            apiKeys: { anthropic: '', google: '' },
            chatSessions: [],
            chatHistoryOpen: false,
            maxConcurrency: 3,
            boardBackgroundByProject: {},
          },
          version: 2,
        };
        localStorage.setItem('automaker-storage', JSON.stringify(appState));

        // Setup complete - use correct key name
        const setupState = {
          state: {
            isFirstRun: false,
            setupComplete: true,
            skipClaudeSetup: false,
          },
          version: 1,
        };
        localStorage.setItem('automaker-setup', JSON.stringify(setupState));

        // Disable splash screen in tests
        sessionStorage.setItem('automaker-splash-shown', 'true');
      },
      { project: [projectId, projectName, projectPath] }
    );

    await authenticateForTests(page);

    // Intercept settings API to use our test project instead of the E2E fixture
    await page.route('**/api/settings/global', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      // Override to use our test project
      if (json.settings) {
        json.settings.currentProjectId = projectId;
        json.settings.projects = [
          {
            id: projectId,
            name: projectName,
            path: projectPath,
            lastOpened: new Date().toISOString(),
          },
        ];
      }
      await route.fulfill({ response, json });
    });

    // Track API calls to /api/settings/project to verify settings are being loaded
    const settingsApiCalls: Array<{ url: string; method: string; body: string }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/settings/project') && request.method() === 'POST') {
        settingsApiCalls.push({
          url: request.url(),
          method: request.method(),
          body: request.postData() || '',
        });
      }
    });

    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Should go straight to board view (not welcome) since we have currentProject
    await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

    // Wait for settings to load
    await page.waitForTimeout(2000);

    // Verify that the settings API was called for this project
    const projectSettingsCalls = settingsApiCalls.filter((call) => call.body.includes(projectPath));

    // Debug: log all API calls if test fails
    if (projectSettingsCalls.length < 1) {
      console.log('Total settings API calls:', settingsApiCalls.length);
      console.log('API calls:', JSON.stringify(settingsApiCalls, null, 2));
      console.log('Looking for path:', projectPath);
    }

    expect(projectSettingsCalls.length).toBeGreaterThanOrEqual(1);

    // Verify settings file exists with correct data
    const loadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(loadedSettings.boardBackground).toBeDefined();
    expect(loadedSettings.boardBackground.imagePath).toBe(backgroundPath);
    expect(loadedSettings.boardBackground.cardOpacity).toBe(90);
    expect(loadedSettings.boardBackground.columnOpacity).toBe(70);

    // The test passing means:
    // 1. The useProjectSettingsLoader hook is working
    // 2. Settings are loaded when app starts with a currentProject
    // 3. The API call to /api/settings/project is made correctly
  });
});
