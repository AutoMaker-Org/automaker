/**
 * Pipeline Query Hooks
 *
 * React Query hooks for fetching pipeline configuration.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { PipelineConfig } from '@/store/app-store';

/**
 * Fetch pipeline config for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with pipeline config
 *
 * @example
 * ```tsx
 * const { data: pipelineConfig, isLoading } = usePipelineConfig(currentProject?.path);
 * ```
 */
export function usePipelineConfig(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pipeline.config(projectPath ?? ''),
    queryFn: async (): Promise<PipelineConfig | null> => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      const result = await api.pipeline.getConfig(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch pipeline config');
      }
      return result.config ?? null;
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
  });
}
