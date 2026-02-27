/**
 * Safe path helpers for E2E tests
 * Ensures test project paths never point at the main repo, avoiding git branch/merge side effects.
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Resolve the workspace root - handle both running from apps/ui and from monorepo root
 */
export function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('apps/ui')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

/** Base directory for all test-only project paths (under workspace root) */
export const TEST_BASE_DIR = path.join(getWorkspaceRoot(), 'test');

/**
 * Assert that a project path is safe for E2E tests (never the main repo root).
 * Safe paths must be either:
 * - Under workspace root's test/ directory (e.g. test/fixtures/projectA, test/open-project-test-xxx)
 * - Under the OS temp directory (e.g. /tmp/automaker-e2e-workspace)
 *
 * This prevents tests from checking out or modifying branches in the main project's git repo.
 *
 * @throws Error if path is the workspace root or outside allowed test directories
 */
export function assertSafeProjectPath(projectPath: string): void {
  const normalized = path.resolve(projectPath);
  const workspaceRoot = path.resolve(getWorkspaceRoot());
  const testBase = path.resolve(TEST_BASE_DIR);
  const tmpDir = path.resolve(os.tmpdir());

  if (normalized === workspaceRoot) {
    throw new Error(
      `E2E project path must not be the workspace root (${workspaceRoot}). ` +
        'Use a path under test/ or os.tmpdir() to avoid affecting the main project git state.'
    );
  }

  const underTest = normalized.startsWith(testBase + path.sep) || normalized === testBase;
  const underTmp = normalized.startsWith(tmpDir + path.sep) || normalized === tmpDir;
  if (!underTest && !underTmp) {
    throw new Error(
      `E2E project path must be under test/ or temp directory to avoid affecting main project git. ` +
        `Got: ${normalized} (workspace root: ${workspaceRoot})`
    );
  }
}
