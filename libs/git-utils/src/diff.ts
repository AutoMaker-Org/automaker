/**
 * Git diff generation utilities
 */

import { createLogger } from '@automaker/utils';
import { secureFs } from '@automaker/platform';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BINARY_EXTENSIONS, type FileStatus } from './types.js';
import { isGitRepo, parseGitStatus } from './status.js';

const execAsync = promisify(exec);
const logger = createLogger('GitUtils');

// Max file size for generating synthetic diffs (1MB)
const MAX_SYNTHETIC_DIFF_SIZE = 1024 * 1024;

/**
 * Check if a file is likely binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Create a synthetic diff for a new file with the given content lines
 * This helper reduces duplication in diff generation logic
 */
function createNewFileDiff(relativePath: string, mode: string, contentLines: string[]): string {
  const lineCount = contentLines.length;
  const addedLines = contentLines.map((line) => `+${line}`).join('\n');

  return `diff --git a/${relativePath} b/${relativePath}
new file mode ${mode}
index 0000000..0000000
--- /dev/null
+++ b/${relativePath}
@@ -0,0 +${lineCount === 1 ? '1' : `1,${lineCount}`} @@
${addedLines}
`;
}

/**
 * Generate a synthetic unified diff for an untracked (new) file
 * This is needed because `git diff HEAD` doesn't include untracked files
 *
 * If the path is a directory, this will recursively generate diffs for all files inside
 */
export async function generateSyntheticDiffForNewFile(
  basePath: string,
  relativePath: string
): Promise<string> {
  // Remove trailing slash if present (git status reports directories with trailing /)
  const cleanPath = relativePath.endsWith('/') ? relativePath.slice(0, -1) : relativePath;
  const fullPath = path.join(basePath, cleanPath);

  try {
    // Get file stats to check size and type
    const stats = await secureFs.stat(fullPath);

    // Check if it's a directory first (before binary check)
    // This handles edge cases like directories named "images.png/"
    if (stats.isDirectory()) {
      const filesInDir = await listAllFilesInDirectory(basePath, cleanPath);
      if (filesInDir.length === 0) {
        // Empty directory
        return createNewFileDiff(cleanPath, '040000', ['[Empty directory]']);
      }
      // Generate diffs for all files in the directory sequentially
      // Using sequential processing to avoid exhausting file descriptors on large directories
      const diffs: string[] = [];
      for (const filePath of filesInDir) {
        diffs.push(await generateSyntheticDiffForNewFile(basePath, filePath));
      }
      return diffs.join('');
    }

    // Check if it's a binary file (after directory check to handle dirs with binary extensions)
    if (isBinaryFile(cleanPath)) {
      return `diff --git a/${cleanPath} b/${cleanPath}
new file mode 100644
index 0000000..0000000
Binary file ${cleanPath} added
`;
    }

    const fileSize = Number(stats.size);
    if (fileSize > MAX_SYNTHETIC_DIFF_SIZE) {
      const sizeKB = Math.round(fileSize / 1024);
      return createNewFileDiff(cleanPath, '100644', [`[File too large to display: ${sizeKB}KB]`]);
    }

    // Read file content
    const content = (await secureFs.readFile(fullPath, 'utf-8')) as string;
    const hasTrailingNewline = content.endsWith('\n');
    const lines = content.split('\n');

    // Remove trailing empty line if the file ends with newline
    if (lines.length > 0 && lines.at(-1) === '') {
      lines.pop();
    }

    // Generate diff format
    const lineCount = lines.length;
    const addedLines = lines.map((line) => `+${line}`).join('\n');

    let diff = `diff --git a/${cleanPath} b/${cleanPath}
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/${cleanPath}
@@ -0,0 +1,${lineCount} @@
${addedLines}`;

    // Add "No newline at end of file" indicator if needed
    if (!hasTrailingNewline && content.length > 0) {
      diff += '\n\\ No newline at end of file';
    }

    return diff + '\n';
  } catch (error) {
    // Log the error for debugging
    logger.error(`Failed to generate synthetic diff for ${fullPath}:`, error);
    // Return a placeholder diff
    return createNewFileDiff(cleanPath, '100644', ['[Unable to read file content]']);
  }
}

/**
 * Generate synthetic diffs for all untracked files and combine with existing diff
 */
export async function appendUntrackedFileDiffs(
  basePath: string,
  existingDiff: string,
  files: Array<{ status: string; path: string }>
): Promise<string> {
  // Find untracked files (status "?")
  const untrackedFiles = files.filter((f) => f.status === '?');

  if (untrackedFiles.length === 0) {
    return existingDiff;
  }

  // Generate synthetic diffs for each untracked file
  const syntheticDiffs = await Promise.all(
    untrackedFiles.map((f) => generateSyntheticDiffForNewFile(basePath, f.path))
  );

  // Combine existing diff with synthetic diffs
  const combinedDiff = existingDiff + syntheticDiffs.join('');

  return combinedDiff;
}

/**
 * List all files in a directory recursively (for non-git repositories)
 * Excludes hidden files/folders and common build artifacts
 */
export async function listAllFilesInDirectory(
  basePath: string,
  relativePath: string = ''
): Promise<string[]> {
  const files: string[] = [];
  const fullPath = path.join(basePath, relativePath);

  // Directories to skip
  const skipDirs = new Set([
    'node_modules',
    '.git',
    '.automaker',
    'dist',
    'build',
    '.next',
    '.nuxt',
    '__pycache__',
    '.cache',
    'coverage',
    '.venv',
    'venv',
    'target',
    'vendor',
    '.gradle',
    'out',
    'tmp',
    '.tmp',
  ]);

  try {
    const entries = await secureFs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/folders (except we want to allow some)
      if (entry.name.startsWith('.') && entry.name !== '.env') {
        continue;
      }

      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          const subFiles = await listAllFilesInDirectory(basePath, entryRelPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        files.push(entryRelPath);
      }
    }
  } catch (error) {
    // Log the error to help diagnose file system issues
    logger.error(`Error reading directory ${fullPath}:`, error);
  }

  return files;
}

/**
 * Generate diffs for all files in a non-git directory
 * Treats all files as "new" files
 */
export async function generateDiffsForNonGitDirectory(
  basePath: string
): Promise<{ diff: string; files: FileStatus[] }> {
  const allFiles = await listAllFilesInDirectory(basePath);

  const files: FileStatus[] = allFiles.map((filePath) => ({
    status: '?',
    path: filePath,
    statusText: 'New',
  }));

  // Generate synthetic diffs for all files
  const syntheticDiffs = await Promise.all(
    files.map((f) => generateSyntheticDiffForNewFile(basePath, f.path))
  );

  return {
    diff: syntheticDiffs.join(''),
    files,
  };
}

/**
 * Get git repository diffs for a given path
 * Handles both git repos and non-git directories
 */
export async function getGitRepositoryDiffs(
  repoPath: string
): Promise<{ diff: string; files: FileStatus[]; hasChanges: boolean }> {
  // Check if it's a git repository
  const isRepo = await isGitRepo(repoPath);

  if (!isRepo) {
    // Not a git repo - list all files and treat them as new
    const result = await generateDiffsForNonGitDirectory(repoPath);
    return {
      diff: result.diff,
      files: result.files,
      hasChanges: result.files.length > 0,
    };
  }

  // Get git diff and status
  const { stdout: diff } = await execAsync('git diff HEAD', {
    cwd: repoPath,
    maxBuffer: 10 * 1024 * 1024,
  });
  const { stdout: status } = await execAsync('git status --porcelain', {
    cwd: repoPath,
  });

  const files = parseGitStatus(status);

  // Generate synthetic diffs for untracked (new) files
  const combinedDiff = await appendUntrackedFileDiffs(repoPath, diff, files);

  return {
    diff: combinedDiff,
    files,
    hasChanges: files.length > 0,
  };
}
