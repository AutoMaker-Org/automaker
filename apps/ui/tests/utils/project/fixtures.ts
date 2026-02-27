import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, assertSafeProjectPath } from '../core/safe-paths';

export { getWorkspaceRoot };

const WORKSPACE_ROOT = getWorkspaceRoot();
const FIXTURE_PATH = path.join(WORKSPACE_ROOT, 'test/fixtures/projectA');

// Original spec content for resetting between tests
const ORIGINAL_SPEC_CONTENT = `<app_spec>
  <name>Test Project A</name>
  <description>A test fixture project for Playwright testing</description>
  <tech_stack>
    <item>TypeScript</item>
    <item>React</item>
  </tech_stack>
</app_spec>
`;

// Worker-isolated fixture path to avoid conflicts when running tests in parallel.
// Each Playwright worker gets its own copy of the fixture directory.
let _workerFixturePath: string | null = null;

/**
 * Bootstrap the shared fixture directory if it doesn't exist.
 * The fixture contains a nested .git/ dir so it can't be tracked by the
 * parent repo — in CI this directory won't exist after checkout.
 */
function ensureFixtureExists(): void {
  if (fs.existsSync(FIXTURE_PATH)) return;

  fs.mkdirSync(path.join(FIXTURE_PATH, '.automaker/context'), { recursive: true });

  fs.writeFileSync(path.join(FIXTURE_PATH, '.automaker/app_spec.txt'), ORIGINAL_SPEC_CONTENT);
  fs.writeFileSync(path.join(FIXTURE_PATH, '.automaker/categories.json'), '[]');
  fs.writeFileSync(
    path.join(FIXTURE_PATH, '.automaker/context/context-metadata.json'),
    '{"files": {}}'
  );
}

/**
 * Get a worker-isolated fixture path. Creates a copy of the fixture directory
 * for this worker process so parallel tests don't conflict.
 * Falls back to the shared fixture path for backwards compatibility.
 */
function getWorkerFixturePath(): string {
  if (_workerFixturePath) return _workerFixturePath;

  // Ensure the source fixture exists (may not in CI)
  ensureFixtureExists();

  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `E2E source fixture is missing at ${FIXTURE_PATH}. ` +
        'Run the setup script to create it: from apps/ui, run `node scripts/setup-e2e-fixtures.mjs` (or use `pnpm test`, which runs it via pretest).'
    );
  }

  // Use process.pid + a unique suffix to isolate per-worker
  const workerId = process.env.TEST_WORKER_INDEX || process.pid.toString();
  const workerDir = path.join(WORKSPACE_ROOT, `test/fixtures/.worker-${workerId}`);

  // Copy projectA fixture to worker directory if it doesn't exist
  if (!fs.existsSync(workerDir)) {
    fs.cpSync(FIXTURE_PATH, workerDir, { recursive: true });
  }

  _workerFixturePath = workerDir;
  return workerDir;
}

/**
 * Get the worker-isolated context path
 */
function getWorkerContextPath(): string {
  return path.join(getWorkerFixturePath(), '.automaker/context');
}

/**
 * Get the worker-isolated memory path
 */
function getWorkerMemoryPath(): string {
  return path.join(getWorkerFixturePath(), '.automaker/memory');
}

/**
 * Get the worker-isolated spec file path
 */
function getWorkerSpecPath(): string {
  return path.join(getWorkerFixturePath(), '.automaker/app_spec.txt');
}

/**
 * Reset the fixture's app_spec.txt to original content
 */
export function resetFixtureSpec(): void {
  const specPath = getWorkerSpecPath();
  const dir = path.dirname(specPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(specPath, ORIGINAL_SPEC_CONTENT);
}

/**
 * Reset the context directory to empty state
 */
export function resetContextDirectory(): void {
  const contextPath = getWorkerContextPath();
  if (fs.existsSync(contextPath)) {
    fs.rmSync(contextPath, { recursive: true });
  }
  fs.mkdirSync(contextPath, { recursive: true });
}

/**
 * Reset the memory directory to empty state
 */
export function resetMemoryDirectory(): void {
  const memoryPath = getWorkerMemoryPath();
  if (fs.existsSync(memoryPath)) {
    fs.rmSync(memoryPath, { recursive: true });
  }
  fs.mkdirSync(memoryPath, { recursive: true });
}

/**
 * Resolve and validate a context fixture path to prevent path traversal
 */
function resolveContextFixturePath(filename: string): string {
  const contextPath = getWorkerContextPath();
  const resolved = path.resolve(contextPath, filename);
  const base = path.resolve(contextPath) + path.sep;
  if (!resolved.startsWith(base)) {
    throw new Error(`Invalid context filename: ${filename}`);
  }
  return resolved;
}

/**
 * Create a context file directly on disk (for test setup)
 */
export function createContextFileOnDisk(filename: string, content: string): void {
  const filePath = resolveContextFixturePath(filename);
  fs.writeFileSync(filePath, content);
}

/**
 * Resolve and validate a memory fixture path to prevent path traversal
 */
function resolveMemoryFixturePath(filename: string): string {
  const memoryPath = getWorkerMemoryPath();
  const resolved = path.resolve(memoryPath, filename);
  const base = path.resolve(memoryPath) + path.sep;
  if (!resolved.startsWith(base)) {
    throw new Error(`Invalid memory filename: ${filename}`);
  }
  return resolved;
}

/**
 * Create a memory file directly on disk (for test setup)
 */
export function createMemoryFileOnDisk(filename: string, content: string): void {
  const filePath = resolveMemoryFixturePath(filename);
  fs.writeFileSync(filePath, content);
}

/**
 * Check if a context file exists on disk
 */
export function contextFileExistsOnDisk(filename: string): boolean {
  const filePath = resolveContextFixturePath(filename);
  return fs.existsSync(filePath);
}

/**
 * Check if a memory file exists on disk
 */
export function memoryFileExistsOnDisk(filename: string): boolean {
  const filePath = resolveMemoryFixturePath(filename);
  return fs.existsSync(filePath);
}

/**
 * Set up localStorage with a project pointing to our test fixture
 * Note: In CI, setup wizard is also skipped via NEXT_PUBLIC_SKIP_SETUP env var
 * Project path must be under test/ or temp to avoid affecting the main project's git.
 * Defaults to a worker-isolated copy of the fixture to support parallel test execution.
 */
export async function setupProjectWithFixture(
  page: Page,
  projectPath: string = getWorkerFixturePath()
): Promise<void> {
  assertSafeProjectPath(projectPath);
  await page.addInitScript((pathArg: string) => {
    const mockProject = {
      id: 'test-project-fixture',
      name: 'projectA',
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
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Also mark setup as complete (fallback for when NEXT_PUBLIC_SKIP_SETUP isn't set)
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

    // Set settings cache so the fast-hydrate path uses our fixture project.
    // Without this, a stale settings cache from a previous test can override
    // the project we just set in automaker-storage.
    const settingsCache = {
      setupComplete: true,
      isFirstRun: false,
      projects: [
        {
          id: mockProject.id,
          name: mockProject.name,
          path: mockProject.path,
          lastOpened: mockProject.lastOpened,
        },
      ],
      currentProjectId: mockProject.id,
      theme: 'dark',
      sidebarOpen: true,
      maxConcurrency: 3,
      skipSandboxWarning: true,
    };
    localStorage.setItem('automaker-settings-cache', JSON.stringify(settingsCache));

    // Disable splash screen in tests
    localStorage.setItem('automaker-disable-splash', 'true');
  }, projectPath);
}

/**
 * Get the fixture path (worker-isolated for parallel test execution)
 */
export function getFixturePath(): string {
  return getWorkerFixturePath();
}

/**
 * Set up a mock project with the fixture path (for profile/settings tests that need a project).
 * Options such as customProfilesCount are reserved for future use (e.g. mocking server profile state).
 */
export async function setupMockProjectWithProfiles(
  page: Page,
  _options?: { customProfilesCount?: number }
): Promise<void> {
  await setupProjectWithFixture(page);
}
