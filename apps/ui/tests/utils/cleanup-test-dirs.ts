/**
 * Cleanup leftover E2E test artifact directories.
 * Used by globalSetup (start of run) and globalTeardown (end of run) to ensure:
 * - test/board-bg-test-*, test/edit-feature-test-*, etc. are removed
 * - test/fixtures/.worker-* (worker-isolated fixture copies) are removed
 *
 * Per-spec afterAll hooks clean up their own dirs, but when workers crash,
 * runs are aborted, or afterAll fails, dirs can be left behind.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from './core/safe-paths';

/** Prefixes used by createTempDirPath() across all spec files */
const TEST_DIR_PREFIXES = [
  'board-bg-test',
  'edit-feature-test',
  'open-project-test',
  'opus-thinking-level-none',
  'project-creation-test',
  'agent-session-test',
  'running-task-display-test',
  'planning-mode-verification-test',
  'list-view-priority-test',
  'skip-tests-toggle-test',
  'manual-review-test',
  'feature-backlog-test',
  'responsive-modal-test',
  'success-log-contrast',
] as const;

/**
 * Remove worker-isolated fixture copies (test/fixtures/.worker-*).
 * These are created during test runs for parallel workers and should be
 * cleaned up after tests complete (or at start of next run).
 */
export function cleanupLeftoverFixtureWorkerDirs(): void {
  const fixturesBase = path.join(getWorkspaceRoot(), 'test', 'fixtures');
  if (!fs.existsSync(fixturesBase)) return;

  const entries = fs.readdirSync(fixturesBase, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('.worker-')) {
      const dirPath = path.join(fixturesBase, entry.name);
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log('[Cleanup] Removed fixture worker dir', entry.name);
      } catch (err) {
        console.warn('[Cleanup] Failed to remove', dirPath, err);
      }
    }
  }
}

export function cleanupLeftoverTestDirs(): void {
  const testBase = path.join(getWorkspaceRoot(), 'test');
  if (!fs.existsSync(testBase)) return;

  const entries = fs.readdirSync(testBase, { withFileTypes: true });
  for (const prefix of TEST_DIR_PREFIXES) {
    const pattern = prefix + '-';
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(pattern)) {
        const dirPath = path.join(testBase, entry.name);
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log('[Cleanup] Removed', entry.name);
        } catch (err) {
          console.warn('[Cleanup] Failed to remove', dirPath, err);
        }
      }
    }
  }
}
