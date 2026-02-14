/**
 * Git Integration E2E Test
 *
 * Verifies git status indicators in file tree, diff gutter in editor,
 * and git quick actions (diff view, stage/unstage) in the files view.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  authenticateForTests,
  handleLoginScreenIfPresent,
  waitForNetworkIdle,
  API_BASE_URL,
} from '../utils';

let tempDir: string;

/**
 * Set up a project in both server settings and localStorage
 * so the server doesn't override the client's project choice.
 */
async function setupGitTestProject(page: import('@playwright/test').Page, projectPath: string) {
  // First, authenticate so we can make API calls
  await authenticateForTests(page);

  // Update server settings to use our temp project
  const projectId = `git-test-${Date.now()}`;
  const project = {
    id: projectId,
    name: 'Git Test Project',
    path: projectPath,
    lastOpened: new Date().toISOString(),
  };

  // Update server settings via API
  await page.request.put(`${API_BASE_URL}/api/settings/global`, {
    data: {
      projects: [project],
      currentProjectId: projectId,
    },
  });

  // Set up localStorage to match
  await page.addInitScript(
    ({
      proj,
      projId,
    }: {
      proj: { id: string; name: string; path: string; lastOpened: string };
      projId: string;
    }) => {
      const appState = {
        state: {
          projects: [proj],
          currentProject: proj,
          currentView: 'files',
          theme: 'dark',
          sidebarOpen: true,
          skipSandboxWarning: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: 2,
      };
      localStorage.setItem('automaker-storage', JSON.stringify(appState));

      const setupState = {
        state: {
          isFirstRun: false,
          setupComplete: true,
          skipClaudeSetup: false,
        },
        version: 1,
      };
      localStorage.setItem('automaker-setup', JSON.stringify(setupState));
      sessionStorage.setItem('automaker-splash-shown', 'true');
    },
    { proj: project, projId: projectId }
  );
}

test.describe('Files View - Git Integration', () => {
  test.beforeAll(async () => {
    // Create a temporary git repo with tracked and modified files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automaker-git-test-'));

    // Create .automaker directory structure (required for project setup)
    fs.mkdirSync(path.join(tempDir, '.automaker', 'features'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.automaker', 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.automaker', 'app_spec.txt'),
      '<app_spec><name>Git Test Project</name></app_spec>'
    );

    // Initialize git repo and create initial commit
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@test.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });

    // Create and commit initial files
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const hello = "world";\n');
    fs.writeFileSync(
      path.join(tempDir, 'utils.ts'),
      'export function add(a: number, b: number) { return a + b; }\n'
    );
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project\n');

    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });

    // Now create modifications to produce git status indicators:
    // 1. Modified file
    fs.writeFileSync(
      path.join(tempDir, 'index.ts'),
      'export const hello = "world";\nexport const foo = "bar";\n'
    );
    // 2. New untracked file
    fs.writeFileSync(path.join(tempDir, 'newfile.ts'), 'export const isNew = true;\n');
  });

  test.afterAll(async () => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should show files view with git status indicators', async ({ page }) => {
    await setupGitTestProject(page, tempDir);

    // Navigate to files view
    await page.goto('/files');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    // Wait for files view to render
    await expect(page.locator('[data-testid="files-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for the file tree to load and show files
    await expect(async () => {
      const treeItems = page.locator('[data-testid^="file-tree-item-"]');
      const count = await treeItems.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    // Verify git status badges exist on modified/untracked files
    await expect(async () => {
      const gitBadges = page.locator('[data-testid^="git-status-"]');
      const badgeCount = await gitBadges.count();
      expect(badgeCount).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });

  test('should show git status indicator and actions when file is selected', async ({ page }) => {
    await setupGitTestProject(page, tempDir);

    await page.goto('/files');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="files-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for tree to load
    await expect(async () => {
      const treeItems = page.locator('[data-testid^="file-tree-item-"]');
      expect(await treeItems.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    // Click on index.ts (modified file) to open it
    const indexFile = page
      .locator('[data-testid^="file-tree-item-"]')
      .filter({ hasText: 'index.ts' })
      .first();
    await expect(indexFile).toBeVisible({ timeout: 5000 });
    await indexFile.click();

    // Wait for the editor to load the file content
    await expect(page.locator('[data-testid^="file-tab-"]')).toBeVisible({ timeout: 5000 });

    // Wait for status bar to show git status indicator
    await expect(page.locator('[data-testid="git-status-indicator"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify git quick action buttons are visible
    await expect(page.locator('[data-testid="toggle-diff-view"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="git-stage-button"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="git-unstage-button"]')).toBeVisible({ timeout: 5000 });
  });

  test('should toggle diff view when clicking diff button', async ({ page }) => {
    await setupGitTestProject(page, tempDir);

    await page.goto('/files');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="files-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for tree and click modified file
    await expect(async () => {
      const treeItems = page.locator('[data-testid^="file-tree-item-"]');
      expect(await treeItems.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    const indexFile = page
      .locator('[data-testid^="file-tree-item-"]')
      .filter({ hasText: 'index.ts' })
      .first();
    await indexFile.click();

    // Wait for file to load and status bar to appear
    await expect(page.locator('[data-testid="git-status-indicator"]')).toBeVisible({
      timeout: 10000,
    });

    // Click diff view button
    await page.locator('[data-testid="toggle-diff-view"]').click();

    // Verify diff view appears
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({ timeout: 5000 });

    // Click again to toggle back to editor
    await page.locator('[data-testid="toggle-diff-view"]').click();
    await expect(page.locator('[data-testid="diff-view"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('should stage and unstage a file', async ({ page }) => {
    await setupGitTestProject(page, tempDir);

    await page.goto('/files');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);
    await waitForNetworkIdle(page);

    await expect(page.locator('[data-testid="files-view"]')).toBeVisible({ timeout: 10000 });

    // Wait for tree and click modified file
    await expect(async () => {
      const treeItems = page.locator('[data-testid^="file-tree-item-"]');
      expect(await treeItems.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    const indexFile = page
      .locator('[data-testid^="file-tree-item-"]')
      .filter({ hasText: 'index.ts' })
      .first();
    await indexFile.click();

    // Wait for git status indicator
    await expect(page.locator('[data-testid="git-status-indicator"]')).toBeVisible({
      timeout: 10000,
    });

    // Stage the file (use force to bypass TanStack DevTools overlay)
    await page.locator('[data-testid="git-stage-button"]').click({ force: true });

    // Verify the file was staged via git
    await page.waitForTimeout(1000);
    const stagedStatus = execSync('git diff --cached --name-only', { cwd: tempDir })
      .toString()
      .trim();
    expect(stagedStatus).toContain('index.ts');

    // Unstage the file - use dispatchEvent to bypass overlay
    await page.locator('[data-testid="git-unstage-button"]').dispatchEvent('click');

    // Wait for the unstage to complete
    await page.waitForTimeout(2000);

    // Verify the file was unstaged
    const unstagedStatus = execSync('git diff --cached --name-only', { cwd: tempDir })
      .toString()
      .trim();
    expect(unstagedStatus).not.toContain('index.ts');
  });
});
