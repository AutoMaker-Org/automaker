/**
 * Worktree metadata storage utilities
 * Stores worktree-specific data in .automaker/worktrees/:branch/worktree.json
 */

import * as secureFs from './secure-fs.js';
import * as path from 'path';
import type { PRState, WorktreePRInfo } from '@automaker/types';

// Re-export types for backwards compatibility
export type { PRState, WorktreePRInfo };

/** Maximum length for sanitized branch names in filesystem paths */
const MAX_SANITIZED_BRANCH_PATH_LENGTH = 200;

export interface WorktreeMetadata {
  branch: string;
  createdAt: string;
  pr?: WorktreePRInfo;
  /** Whether the init script has been executed for this worktree */
  initScriptRan?: boolean;
  /** Status of the init script execution */
  initScriptStatus?: 'running' | 'success' | 'failed';
  /** Error message if init script failed */
  initScriptError?: string;
}

/**
 * Sanitize branch name for cross-platform filesystem safety
 */
function sanitizeBranchName(branch: string): string {
  // Replace characters that are invalid or problematic on various filesystems:
  // - Forward and backslashes (path separators)
  // - Windows invalid chars: : * ? " < > |
  // - Other potentially problematic chars
  let safeBranch = branch
    .replace(/[/\\:*?"<>|]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/\.+$/g, '') // Remove trailing dots (Windows issue)
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

  // Truncate to safe length (leave room for path components)
  safeBranch = safeBranch.substring(0, MAX_SANITIZED_BRANCH_PATH_LENGTH);

  // Handle Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const windowsReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (windowsReserved.test(safeBranch) || safeBranch.length === 0) {
    safeBranch = `_${safeBranch || 'branch'}`;
  }

  return safeBranch;
}

/**
 * Get the path to the worktree metadata directory
 */
function getWorktreeMetadataDir(projectPath: string, branch: string): string {
  const safeBranch = sanitizeBranchName(branch);
  return path.join(projectPath, '.automaker', 'worktrees', safeBranch);
}

/**
 * Get the path to the worktree metadata file
 */
function getWorktreeMetadataPath(projectPath: string, branch: string): string {
  return path.join(getWorktreeMetadataDir(projectPath, branch), 'worktree.json');
}

/**
 * Read worktree metadata for a branch
 */
export async function readWorktreeMetadata(
  projectPath: string,
  branch: string
): Promise<WorktreeMetadata | null> {
  try {
    const metadataPath = getWorktreeMetadataPath(projectPath, branch);
    const content = (await secureFs.readFile(metadataPath, 'utf-8')) as string;
    return JSON.parse(content) as WorktreeMetadata;
  } catch (error) {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Write worktree metadata for a branch
 */
export async function writeWorktreeMetadata(
  projectPath: string,
  branch: string,
  metadata: WorktreeMetadata
): Promise<void> {
  const metadataDir = getWorktreeMetadataDir(projectPath, branch);
  const metadataPath = getWorktreeMetadataPath(projectPath, branch);

  // Ensure directory exists
  await secureFs.mkdir(metadataDir, { recursive: true });

  // Write metadata
  await secureFs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Update PR info in worktree metadata
 */
export async function updateWorktreePRInfo(
  projectPath: string,
  branch: string,
  prInfo: WorktreePRInfo
): Promise<void> {
  // Read existing metadata or create new
  let metadata = await readWorktreeMetadata(projectPath, branch);

  if (!metadata) {
    metadata = {
      branch,
      createdAt: new Date().toISOString(),
    };
  }

  // Update PR info
  metadata.pr = prInfo;

  // Write back
  await writeWorktreeMetadata(projectPath, branch, metadata);
}

/**
 * Get PR info for a branch from metadata
 */
export async function getWorktreePRInfo(
  projectPath: string,
  branch: string
): Promise<WorktreePRInfo | null> {
  const metadata = await readWorktreeMetadata(projectPath, branch);
  return metadata?.pr || null;
}

/**
 * Read all worktree metadata for a project
 */
export async function readAllWorktreeMetadata(
  projectPath: string
): Promise<Map<string, WorktreeMetadata>> {
  const result = new Map<string, WorktreeMetadata>();
  const worktreesDir = path.join(projectPath, '.automaker', 'worktrees');

  try {
    const dirs = await secureFs.readdir(worktreesDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const metadataPath = path.join(worktreesDir, dir.name, 'worktree.json');
        try {
          const content = (await secureFs.readFile(metadataPath, 'utf-8')) as string;
          const metadata = JSON.parse(content) as WorktreeMetadata;
          result.set(metadata.branch, metadata);
        } catch {
          // Skip if file doesn't exist or can't be read
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return result;
}

/**
 * Delete worktree metadata for a branch
 */
export async function deleteWorktreeMetadata(projectPath: string, branch: string): Promise<void> {
  const metadataDir = getWorktreeMetadataDir(projectPath, branch);
  try {
    await secureFs.rm(metadataDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
}
