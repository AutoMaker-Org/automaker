/**
 * Settings Query Hooks
 *
 * React Query hooks for fetching global and project settings.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { GlobalSettings, ProjectSettings } from '@automaker/types';

/**
 * Fetch global settings
 *
 * @returns Query result with global settings
 *
 * @example
 * ```tsx
 * const { data: settings, isLoading } = useGlobalSettings();
 * ```
 */
export function useGlobalSettings() {
  return useQuery({
    queryKey: queryKeys.settings.global(),
    queryFn: async (): Promise<GlobalSettings> => {
      const api = getElectronAPI();
      const result = await api.settings.getGlobal();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch global settings');
      }
      return result.settings as GlobalSettings;
    },
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Fetch project-specific settings
 *
 * @param projectPath - Path to the project
 * @returns Query result with project settings
 */
export function useProjectSettings(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.settings.project(projectPath ?? ''),
    queryFn: async (): Promise<ProjectSettings> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.settings.getProject(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch project settings');
      }
      return result.settings as ProjectSettings;
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Fetch settings status (migration status, etc.)
 *
 * @returns Query result with settings status
 */
export function useSettingsStatus() {
  return useQuery({
    queryKey: queryKeys.settings.status(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.settings.getStatus();
      return result;
    },
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Fetch credentials status (masked API keys)
 *
 * @returns Query result with credentials info
 */
export function useCredentials() {
  return useQuery({
    queryKey: queryKeys.settings.credentials(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.settings.getCredentials();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch credentials');
      }
      return result.credentials;
    },
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Discover agents for a project
 *
 * @param projectPath - Path to the project
 * @param sources - Sources to search ('user' | 'project')
 * @returns Query result with discovered agents
 */
export function useDiscoveredAgents(
  projectPath: string | undefined,
  sources?: Array<'user' | 'project'>
) {
  return useQuery({
    // Include sources in query key so different source combinations have separate caches
    queryKey: queryKeys.settings.agents(projectPath ?? '', sources),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.settings.discoverAgents(projectPath, sources);
      if (!result.success) {
        throw new Error(result.error || 'Failed to discover agents');
      }
      return result.agents ?? [];
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
  });
}
