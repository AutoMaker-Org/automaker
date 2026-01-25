/**
 * Git Query Hooks
 *
 * React Query hooks for git operations.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

/**
 * Fetch git diffs for a project (main project, not worktree)
 *
 * @param projectPath - Path to the project
 * @param enabled - Whether to enable the query
 * @returns Query result with files and diff content
 */
export function useGitDiffs(projectPath: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.git.diffs(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.git.getDiffs(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch diffs');
      }
      return {
        files: result.files ?? [],
        diff: result.diff ?? '',
      };
    },
    enabled: !!projectPath && enabled,
    staleTime: STALE_TIMES.WORKTREES,
  });
}
