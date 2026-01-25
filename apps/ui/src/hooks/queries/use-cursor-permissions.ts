/**
 * Cursor Permissions Query Hooks
 *
 * React Query hooks for fetching Cursor CLI permissions.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { CursorPermissionProfile } from '@automaker/types';

export interface CursorPermissionsData {
  activeProfile: CursorPermissionProfile | null;
  effectivePermissions: { allow: string[]; deny: string[] } | null;
  hasProjectConfig: boolean;
  availableProfiles: Array<{
    id: string;
    name: string;
    description: string;
    permissions: { allow: string[]; deny: string[] };
  }>;
}

/**
 * Fetch Cursor permissions for a project
 *
 * @param projectPath - Optional path to the project
 * @param enabled - Whether to enable the query
 * @returns Query result with permissions data
 *
 * @example
 * ```tsx
 * const { data: permissions, isLoading, refetch } = useCursorPermissions(projectPath);
 * ```
 */
export function useCursorPermissionsQuery(projectPath?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cursorPermissions.permissions(projectPath),
    queryFn: async (): Promise<CursorPermissionsData> => {
      const api = getHttpApiClient();
      const result = await api.setup.getCursorPermissions(projectPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to load permissions');
      }

      return {
        activeProfile: result.activeProfile || null,
        effectivePermissions: result.effectivePermissions || null,
        hasProjectConfig: result.hasProjectConfig || false,
        availableProfiles: result.availableProfiles || [],
      };
    },
    enabled,
    staleTime: STALE_TIMES.SETTINGS,
  });
}
