/**
 * Git worktree utilities for testing
 * Provides helpers for creating test git repos and managing worktrees
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Page } from '@playwright/test';
import { sanitizeBranchName, TIMEOUTS } from '../core/constants';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

export interface FeatureData {
  id: string;
  category: string;
  description: string;
  status: string;
  branchName?: string;
  worktreePath?: string;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the workspace root directory (internal use only)
 * Note: Also exported from project/fixtures.ts for broader use
 */
function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('apps/ui')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

/**
 * Create a unique temp directory path for tests
 */
export function createTempDirPath(prefix: string = 'temp-worktree-tests'): string {
  const uniqueId = `${process.pid}-${Math.random().toString(36).substring(2, 9)}`;
  return path.join(getWorkspaceRoot(), 'test', `${prefix}-${uniqueId}`);
}

/**
 * Get the expected worktree path for a branch
 */
export function getWorktreePath(projectPath: string, branchName: string): string {
  const sanitizedName = sanitizeBranchName(branchName);
  return path.join(projectPath, '.worktrees', sanitizedName);
}

// ============================================================================
// Git Repository Management
// ============================================================================

/**
 * Create a temporary git repository for testing
 */
export async function createTestGitRepo(tempDir: string): Promise<TestRepo> {
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tmpDir = path.join(tempDir, `test-repo-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Use environment variables instead of git config to avoid affecting user's git config
  // These env vars override git config without modifying it
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test User',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test User',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  // Initialize git repo with explicit branch name to avoid CI environment differences
  // Use -b main to set initial branch (git 2.28+), falling back to branch -M for older versions
  try {
    await execAsync('git init -b main', { cwd: tmpDir, env: gitEnv });
  } catch {
    // Fallback for older git versions that don't support -b flag
    await execAsync('git init', { cwd: tmpDir, env: gitEnv });
  }

  // Create initial commit
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n');
  await execAsync('git add .', { cwd: tmpDir, env: gitEnv });
  await execAsync('git commit -m "Initial commit"', { cwd: tmpDir, env: gitEnv });

  // Ensure branch is named 'main' (handles both new repos and older git versions)
  await execAsync('git branch -M main', { cwd: tmpDir, env: gitEnv });

  // Create .automaker directories
  const automakerDir = path.join(tmpDir, '.automaker');
  const featuresDir = path.join(automakerDir, 'features');
  fs.mkdirSync(featuresDir, { recursive: true });

  // Create empty categories.json to avoid ENOENT errors in tests
  fs.writeFileSync(path.join(automakerDir, 'categories.json'), '[]');

  return {
    path: tmpDir,
    cleanup: async () => {
      await cleanupTestRepo(tmpDir);
    },
  };
}

/**
 * Cleanup a test git repository
 */
export async function cleanupTestRepo(repoPath: string): Promise<void> {
  try {
    // Remove all worktrees first
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: repoPath,
    }).catch(() => ({ stdout: '' }));

    const worktrees = stdout
      .split('\n\n')
      .slice(1) // Skip main worktree
      .map((block) => {
        const pathLine = block.split('\n').find((line) => line.startsWith('worktree '));
        return pathLine ? pathLine.replace('worktree ', '') : null;
      })
      .filter(Boolean);

    for (const worktreePath of worktrees) {
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: repoPath,
        });
      } catch {
        // Ignore errors
      }
    }

    // Remove the repository
    fs.rmSync(repoPath, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup test repo:', error);
  }
}

/**
 * Cleanup a temp directory and all its contents
 */
export function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Execute a git command in a repository
 */
export async function gitExec(
  repoPath: string,
  command: string
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(`git ${command}`, { cwd: repoPath });
}

/**
 * Get list of git worktrees
 */
export async function listWorktrees(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: repoPath,
    });

    return stdout
      .split('\n\n')
      .slice(1) // Skip main worktree
      .map((block) => {
        const pathLine = block.split('\n').find((line) => line.startsWith('worktree '));
        if (!pathLine) return null;
        // Normalize path separators to OS native (git on Windows returns forward slashes)
        const worktreePath = pathLine.replace('worktree ', '');
        return path.normalize(worktreePath);
      })
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/**
 * Get list of git branches
 */
export async function listBranches(repoPath: string): Promise<string[]> {
  const { stdout } = await execAsync('git branch --list', { cwd: repoPath });
  return stdout
    .split('\n')
    .map((line) => line.trim().replace(/^[*+]\s*/, ''))
    .filter(Boolean);
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
  return stdout.trim();
}

/**
 * Create a git branch
 */
export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  await execAsync(`git branch ${branchName}`, { cwd: repoPath });
}

/**
 * Checkout a git branch
 */
export async function checkoutBranch(repoPath: string, branchName: string): Promise<void> {
  await execAsync(`git checkout ${branchName}`, { cwd: repoPath });
}

/**
 * Create a git worktree using git command directly
 */
export async function createWorktreeDirectly(
  repoPath: string,
  branchName: string,
  worktreePath?: string
): Promise<string> {
  const sanitizedName = sanitizeBranchName(branchName);
  const targetPath = worktreePath || path.join(repoPath, '.worktrees', sanitizedName);

  await execAsync(`git worktree add "${targetPath}" -b ${branchName}`, { cwd: repoPath });
  return targetPath;
}

/**
 * Add and commit a file
 */
export async function commitFile(
  repoPath: string,
  filePath: string,
  content: string,
  message: string
): Promise<void> {
  // Use environment variables instead of git config to avoid affecting user's git config
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test User',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test User',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  fs.writeFileSync(path.join(repoPath, filePath), content);
  await execAsync(`git add "${filePath}"`, { cwd: repoPath, env: gitEnv });
  await execAsync(`git commit -m "${message}"`, { cwd: repoPath, env: gitEnv });
}

/**
 * Get the latest commit message
 */
export async function getLatestCommitMessage(repoPath: string): Promise<string> {
  const { stdout } = await execAsync('git log --oneline -1', { cwd: repoPath });
  return stdout.trim();
}

// ============================================================================
// Feature File Management
// ============================================================================

/**
 * Create a feature file in the test repo
 */
export function createTestFeature(
  repoPath: string,
  featureId: string,
  featureData: FeatureData
): void {
  const featuresDir = path.join(repoPath, '.automaker', 'features');
  const featureDir = path.join(featuresDir, featureId);

  fs.mkdirSync(featureDir, { recursive: true });
  fs.writeFileSync(path.join(featureDir, 'feature.json'), JSON.stringify(featureData, null, 2));
}

/**
 * Read a feature file from the test repo
 */
export function readTestFeature(repoPath: string, featureId: string): FeatureData | null {
  const featureFilePath = path.join(repoPath, '.automaker', 'features', featureId, 'feature.json');

  if (!fs.existsSync(featureFilePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(featureFilePath, 'utf-8'));
}

/**
 * List all feature directories in the test repo
 */
export function listTestFeatures(repoPath: string): string[] {
  const featuresDir = path.join(repoPath, '.automaker', 'features');

  if (!fs.existsSync(featuresDir)) {
    return [];
  }

  return fs.readdirSync(featuresDir);
}

// ============================================================================
// Project Setup for Tests
// ============================================================================

/**
 * Set up localStorage with a project pointing to a test repo
 */
export async function setupProjectWithPath(page: Page, projectPath: string): Promise<void> {
  await page.addInitScript((pathArg: string) => {
    const mockProject = {
      id: 'test-project-worktree',
      name: 'Worktree Test Project',
      path: pathArg,
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        currentView: 'board',
        theme: 'dark',
        sidebarOpen: true,
        skipSandboxWarning: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
        useWorktrees: true, // Enable worktree feature for tests
        currentWorktreeByProject: {
          [pathArg]: { path: null, branch: 'main' }, // Initialize to main branch
        },
        worktreesByProject: {},
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Mark setup as complete to skip the setup wizard
    const setupState = {
      state: {
        isFirstRun: false,
        setupComplete: true,
        currentStep: 'complete',
        skipClaudeSetup: false,
      },
      version: 0, // setup-store.ts doesn't specify a version, so zustand defaults to 0
    };
    localStorage.setItem('automaker-setup', JSON.stringify(setupState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, projectPath);
}

/**
 * Set up localStorage with a project pointing to a test repo with worktrees DISABLED
 * Use this to test scenarios where the worktree feature flag is off
 */
export async function setupProjectWithPathNoWorktrees(
  page: Page,
  projectPath: string
): Promise<void> {
  await page.addInitScript((pathArg: string) => {
    const mockProject = {
      id: 'test-project-no-worktree',
      name: 'Test Project (No Worktrees)',
      path: pathArg,
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        currentView: 'board',
        theme: 'dark',
        sidebarOpen: true,
        skipSandboxWarning: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
        useWorktrees: false, // Worktree feature DISABLED
        currentWorktreeByProject: {},
        worktreesByProject: {},
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Mark setup as complete to skip the setup wizard
    const setupState = {
      state: {
        isFirstRun: false,
        setupComplete: true,
        currentStep: 'complete',
        skipClaudeSetup: false,
      },
      version: 0, // setup-store.ts doesn't specify a version, so zustand defaults to 0
    };
    localStorage.setItem('automaker-setup', JSON.stringify(setupState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, projectPath);
}

/**
 * Set up localStorage with a project that has STALE worktree data
 * The currentWorktreeByProject points to a worktree path that no longer exists
 * This simulates the scenario where a user previously selected a worktree that was later deleted
 */
export async function setupProjectWithStaleWorktree(
  page: Page,
  projectPath: string
): Promise<void> {
  await page.addInitScript((pathArg: string) => {
    const mockProject = {
      id: 'test-project-stale-worktree',
      name: 'Stale Worktree Test Project',
      path: pathArg,
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        currentView: 'board',
        theme: 'dark',
        sidebarOpen: true,
        skipSandboxWarning: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
        useWorktrees: true, // Enable worktree feature for tests
        currentWorktreeByProject: {
          // This is STALE data - pointing to a worktree path that doesn't exist
          [pathArg]: { path: '/non/existent/worktree/path', branch: 'feature/deleted-branch' },
        },
        worktreesByProject: {},
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Mark setup as complete to skip the setup wizard
    const setupState = {
      state: {
        isFirstRun: false,
        setupComplete: true,
        currentStep: 'complete',
        skipClaudeSetup: false,
      },
      version: 0, // setup-store.ts doesn't specify a version, so zustand defaults to 0
    };
    localStorage.setItem('automaker-setup', JSON.stringify(setupState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, projectPath);
}

// ============================================================================
// Wait Utilities
// ============================================================================

/**
 * Wait for the board view to load
 * Navigates to /board first since the index route shows WelcomeView
 * Handles zustand store hydration timing (may show "no-project" briefly)
 */
export async function waitForBoardView(page: Page): Promise<void> {
  // Navigate directly to /board route (index route shows welcome view)
  const currentUrl = page.url();
  if (!currentUrl.includes('/board')) {
    await page.goto('/board');
    await page.waitForLoadState('load');
  }

  // Wait for either board-view (success) or board-view-no-project (store not hydrated yet)
  // Then poll until board-view appears (zustand hydrates from localStorage)
  await page.waitForFunction(
    () => {
      const boardView = document.querySelector('[data-testid="board-view"]');
      // Return true only when board-view is visible (store hydrated with project)
      return boardView !== null;
    },
    { timeout: TIMEOUTS.long }
  );
}

/**
 * Wait for the worktree selector to be visible
 */
export async function waitForWorktreeSelector(page: Page): Promise<void> {
  await page
    .waitForSelector('[data-testid="worktree-selector"]', { timeout: TIMEOUTS.medium })
    .catch(() => {
      // Fallback: wait for "Branch:" text
      return page.getByText('Branch:').waitFor({ timeout: TIMEOUTS.medium });
    });
}
