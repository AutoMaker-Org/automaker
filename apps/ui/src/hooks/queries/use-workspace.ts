/**
 * Workspace Query Hooks
 *
 * React Query hooks for workspace operations.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

interface WorkspaceDirectory {
  name: string;
  path: string;
}

/**
 * Fetch workspace directories
 *
 * @param enabled - Whether to enable the query
 * @returns Query result with directories
 *
 * @example
 * ```tsx
 * const { data: directories, isLoading, error } = useWorkspaceDirectories(open);
 * ```
 */
export function useWorkspaceDirectories(enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspace.directories(),
    queryFn: async (): Promise<WorkspaceDirectory[]> => {
      const api = getHttpApiClient();
      const result = await api.workspace.getDirectories();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load directories');
      }
      return result.directories ?? [];
    },
    enabled,
    staleTime: STALE_TIMES.SETTINGS,
  });
}
