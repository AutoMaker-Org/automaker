/**
 * Ideation Query Hooks
 *
 * React Query hooks for fetching ideation prompts and ideas.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

/**
 * Fetch ideation prompts
 *
 * @returns Query result with prompts and categories
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useIdeationPrompts();
 * const { prompts, categories } = data ?? { prompts: [], categories: [] };
 * ```
 */
export function useIdeationPrompts() {
  return useQuery({
    queryKey: queryKeys.ideation.prompts(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.ideation?.getPrompts();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch prompts');
      }
      return {
        prompts: result.prompts ?? [],
        categories: result.categories ?? [],
      };
    },
    staleTime: STALE_TIMES.SETTINGS, // Prompts rarely change
  });
}

/**
 * Fetch ideas for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with ideas array
 */
export function useIdeas(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ideation.ideas(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.ideation?.listIdeas(projectPath);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch ideas');
      }
      return result.ideas ?? [];
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.FEATURES,
  });
}

/**
 * Fetch a single idea by ID
 *
 * @param projectPath - Path to the project
 * @param ideaId - ID of the idea
 * @returns Query result with single idea
 */
export function useIdea(projectPath: string | undefined, ideaId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ideation.idea(projectPath ?? '', ideaId ?? ''),
    queryFn: async () => {
      if (!projectPath || !ideaId) throw new Error('Missing project path or idea ID');
      const api = getElectronAPI();
      const result = await api.ideation?.getIdea(projectPath, ideaId);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch idea');
      }
      return result.idea;
    },
    enabled: !!projectPath && !!ideaId,
    staleTime: STALE_TIMES.FEATURES,
  });
}
