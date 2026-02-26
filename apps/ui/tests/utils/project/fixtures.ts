import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the workspace root - handle both running from apps/ui and from root
 */
export function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('apps/ui')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

const WORKSPACE_ROOT = getWorkspaceRoot();
const FIXTURE_PATH = path.join(WORKSPACE_ROOT, 'test/fixtures/projectA');
const SPEC_FILE_PATH = path.join(FIXTURE_PATH, '.automaker/app_spec.txt');
const CONTEXT_PATH = path.join(FIXTURE_PATH, '.automaker/context');
const MEMORY_PATH = path.join(FIXTURE_PATH, '.automaker/memory');

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

/**
 * Reset the fixture's app_spec.txt to original content
 */
export function resetFixtureSpec(): void {
  const dir = path.dirname(SPEC_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SPEC_FILE_PATH, ORIGINAL_SPEC_CONTENT);
}

/**
 * Reset the context directory to empty state
 */
export function resetContextDirectory(): void {
  if (fs.existsSync(CONTEXT_PATH)) {
    fs.rmSync(CONTEXT_PATH, { recursive: true });
  }
  fs.mkdirSync(CONTEXT_PATH, { recursive: true });
}

/**
 * Reset the memory directory to empty state
 */
export function resetMemoryDirectory(): void {
  if (fs.existsSync(MEMORY_PATH)) {
    fs.rmSync(MEMORY_PATH, { recursive: true });
  }
  fs.mkdirSync(MEMORY_PATH, { recursive: true });
}

/**
 * Resolve and validate a context fixture path to prevent path traversal
 */
function resolveContextFixturePath(filename: string): string {
  const resolved = path.resolve(CONTEXT_PATH, filename);
  const base = path.resolve(CONTEXT_PATH) + path.sep;
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
  const resolved = path.resolve(MEMORY_PATH, filename);
  const base = path.resolve(MEMORY_PATH) + path.sep;
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
 */
export async function setupProjectWithFixture(
  page: Page,
  projectPath: string = FIXTURE_PATH
): Promise<void> {
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
    };
    localStorage.setItem('automaker-settings-cache', JSON.stringify(settingsCache));

    // Disable splash screen in tests
    localStorage.setItem('automaker-disable-splash', 'true');
  }, projectPath);
}

/**
 * Get the fixture path
 */
export function getFixturePath(): string {
  return FIXTURE_PATH;
}

/**
 * Set up a mock project with the fixture path (for profile/settings tests that need a project).
 * Options such as customProfilesCount are reserved for future use (e.g. mocking server profile state).
 */
export async function setupMockProjectWithProfiles(
  page: Page,
  _options?: { customProfilesCount?: number }
): Promise<void> {
  await setupProjectWithFixture(page, FIXTURE_PATH);
}
