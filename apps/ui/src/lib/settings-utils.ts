/**
 * Shared settings utility functions
 */

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
  raw: Record<string, { path: string | null; branch: string }> | undefined
): Record<string, { path: string | null; branch: string }> {
  if (!raw) return {};
  const sanitized: Record<string, { path: string | null; branch: string }> = {};
  for (const [projectPath, worktree] of Object.entries(raw)) {
    // Only validate structure - keep both null (main) and non-null (worktree) paths
    // Runtime validation in use-worktrees.ts handles deleted worktrees
    if (
      typeof worktree === 'object' &&
      worktree !== null &&
      typeof worktree.branch === 'string' &&
      (worktree.path === null || typeof worktree.path === 'string')
    ) {
      sanitized[projectPath] = worktree;
    }
  }
  return sanitized;
}
