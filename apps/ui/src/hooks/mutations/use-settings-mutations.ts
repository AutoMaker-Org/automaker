/**
 * Settings Mutations
 *
 * React Query mutations for updating global and project settings.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

interface UpdateGlobalSettingsOptions {
  /** Show success toast (default: true) */
  showSuccessToast?: boolean;
}

/**
 * Update global settings
 *
 * @param options - Configuration options
 * @returns Mutation for updating global settings
 *
 * @example
 * ```tsx
 * const mutation = useUpdateGlobalSettings();
 * mutation.mutate({ enableSkills: true });
 *
 * // With custom success handling (no default toast)
 * const mutation = useUpdateGlobalSettings({ showSuccessToast: false });
 * mutation.mutate({ enableSkills: true }, {
 *   onSuccess: () => toast.success('Skills enabled'),
 * });
 * ```
 */
export function useUpdateGlobalSettings(options: UpdateGlobalSettingsOptions = {}) {
  const { showSuccessToast = true } = options;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      // Use updateGlobal for partial updates
      const result = await api.settings.updateGlobal(settings);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update settings');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.global() });
      if (showSuccessToast) {
        toast.success('Settings saved');
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to save settings', {
        description: error.message,
      });
    },
  });
}

/**
 * Update project settings
 *
 * @param projectPath - Optional path to the project (can also pass via mutation variables)
 * @returns Mutation for updating project settings
 */
interface ProjectSettingsWithPath {
  projectPath: string;
  settings: Record<string, unknown>;
}

export function useUpdateProjectSettings(projectPath?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: Record<string, unknown> | ProjectSettingsWithPath) => {
      // Support both call patterns:
      // 1. useUpdateProjectSettings(projectPath) then mutate(settings)
      // 2. useUpdateProjectSettings() then mutate({ projectPath, settings })
      let path: string;
      let settings: Record<string, unknown>;

      if (
        typeof variables === 'object' &&
        'projectPath' in variables &&
        'settings' in variables &&
        typeof variables.projectPath === 'string' &&
        typeof variables.settings === 'object'
      ) {
        path = variables.projectPath;
        settings = variables.settings as Record<string, unknown>;
      } else if (projectPath) {
        path = projectPath;
        settings = variables as Record<string, unknown>;
      } else {
        throw new Error('Project path is required');
      }

      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      const result = await api.settings.updateProject(path, settings);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update project settings');
      }
      return { ...result, projectPath: path };
    },
    onSuccess: (data) => {
      const path = data.projectPath || projectPath;
      if (path) {
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.project(path) });
      }
      toast.success('Project settings saved');
    },
    onError: (error: Error) => {
      toast.error('Failed to save project settings', {
        description: error.message,
      });
    },
  });
}

/**
 * Save credentials (API keys)
 *
 * @returns Mutation for saving credentials
 */
export function useSaveCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { anthropic?: string; google?: string; openai?: string }) => {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      const result = await api.settings.updateCredentials({ apiKeys: credentials });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save credentials');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.credentials() });
      queryClient.invalidateQueries({ queryKey: queryKeys.cli.apiKeys() });
      toast.success('Credentials saved');
    },
    onError: (error: Error) => {
      toast.error('Failed to save credentials', {
        description: error.message,
      });
    },
  });
}
