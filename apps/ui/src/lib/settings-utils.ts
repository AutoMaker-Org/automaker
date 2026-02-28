/**
 * Shared settings utility functions
 */

export interface WorktreeSelection {
  path: string | null;
  branch: string;
}

/**
 * Check whether an unknown value is a valid worktree selection.
 */
export function isValidWorktreeSelection(value: unknown): value is WorktreeSelection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  const branch = entry.branch;
  const path = entry.path;

  if (typeof branch !== 'string' || branch.trim().length === 0) {
    return false;
  }

  if (path === null) {
    return true;
  }

  return typeof path === 'string' && path.trim().length > 0;
}

/**
 * Validate and sanitize currentWorktreeByProject entries.
 *
 * Keeps all valid entries (both main branch and feature worktrees).
 * The validation against actual worktrees happens in use-worktrees.ts
 * which resets to main branch if the selected worktree no longer exists.
 *
 * Only drops entries with invalid structure (not an object, missing/invalid
 * path or branch).
 */
export function sanitizeWorktreeByProject(
  raw: Record<string, unknown> | undefined
): Record<string, WorktreeSelection> {
  if (!raw) return {};
  const sanitized: Record<string, WorktreeSelection> = {};
  for (const [projectPath, worktree] of Object.entries(raw)) {
    if (isValidWorktreeSelection(worktree)) {
      sanitized[projectPath] = worktree;
    }
  }
  return sanitized;
}
