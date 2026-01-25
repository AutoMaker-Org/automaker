/**
 * Spec Query Hooks
 *
 * React Query hooks for fetching spec file content and regeneration status.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

interface SpecFileResult {
  content: string;
  exists: boolean;
}

interface SpecRegenerationStatusResult {
  isRunning: boolean;
  currentPhase?: string;
}

/**
 * Fetch spec file content for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with spec content and existence flag
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useSpecFile(currentProject?.path);
 * if (data?.exists) {
 *   console.log(data.content);
 * }
 * ```
 */
export function useSpecFile(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.spec.file(projectPath ?? ''),
    queryFn: async (): Promise<SpecFileResult> => {
      if (!projectPath) throw new Error('No project path');

      const api = getElectronAPI();
      const result = await api.readFile(`${projectPath}/.automaker/app_spec.txt`);

      if (result.success && result.content) {
        return {
          content: result.content,
          exists: true,
        };
      }

      return {
        content: '',
        exists: false,
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Check spec regeneration status for a project
 *
 * @param projectPath - Path to the project
 * @param enabled - Whether to enable the query (useful during regeneration)
 * @returns Query result with regeneration status
 *
 * @example
 * ```tsx
 * const { data } = useSpecRegenerationStatus(projectPath, isRegenerating);
 * if (data?.isRunning) {
 *   // Show loading indicator
 * }
 * ```
 */
export function useSpecRegenerationStatus(projectPath: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.specRegeneration.status(projectPath ?? ''),
    queryFn: async (): Promise<SpecRegenerationStatusResult> => {
      if (!projectPath) throw new Error('No project path');

      const api = getElectronAPI();
      if (!api.specRegeneration) {
        return { isRunning: false };
      }

      const status = await api.specRegeneration.status(projectPath);

      if (status.success) {
        return {
          isRunning: status.isRunning ?? false,
          currentPhase: status.currentPhase,
        };
      }

      return { isRunning: false };
    },
    enabled: !!projectPath && enabled,
    staleTime: 5000, // Check every 5 seconds when active
    refetchInterval: enabled ? 5000 : false,
  });
}
