import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Create a deterministic temp directory path for a test suite.
 * The directory is NOT created on disk — call fs.mkdirSync in beforeAll.
 */
export function createTempDirPath(prefix: string): string {
  return path.join(os.tmpdir(), `automaker-test-${prefix}-${process.pid}`);
}

/**
 * Remove a temp directory and all its contents.
 * Silently ignores errors (e.g. directory already removed).
 */
export function cleanupTempDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
