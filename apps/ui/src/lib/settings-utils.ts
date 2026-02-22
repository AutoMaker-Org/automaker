/**
 * Shared settings utility functions
 */

/**
 * Drop currentWorktreeByProject entries with non-null paths.
 * Non-null paths reference worktree directories that may have been deleted,
 * and restoring them causes crash loops (board renders invalid worktree
 * -> error boundary reloads -> restores same stale path).
 */
export function sanitizeWorktreeByProject(
  raw: Record<string, { path: string | null; branch: string }> | undefined
): Record<string, { path: string | null; branch: string }> {
  if (!raw) return {};
  const sanitized: Record<string, { path: string | null; branch: string }> = {};
  for (const [projectPath, worktree] of Object.entries(raw)) {
    if (
      typeof worktree === 'object' &&
      worktree !== null &&
      'path' in worktree &&
      worktree.path === null
    ) {
      sanitized[projectPath] = worktree;
    }
  }
  return sanitized;
}
