/**
 * Spec Mutation Hooks
 *
 * React Query mutations for spec operations like creating, regenerating, and saving.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { FeatureCount } from '@/components/views/spec-view/types';

/**
 * Input for creating a spec
 */
interface CreateSpecInput {
  projectOverview: string;
  generateFeatures: boolean;
  analyzeProject: boolean;
  featureCount?: FeatureCount;
}

/**
 * Input for regenerating a spec
 */
interface RegenerateSpecInput {
  projectDefinition: string;
  generateFeatures: boolean;
  analyzeProject: boolean;
  featureCount?: FeatureCount;
}

/**
 * Create a new spec for a project
 *
 * This mutation triggers an async spec creation process. Progress and completion
 * are delivered via WebSocket events (spec_regeneration_progress, spec_regeneration_complete).
 *
 * @param projectPath - Path to the project
 * @returns Mutation for creating specs
 *
 * @example
 * ```tsx
 * const createMutation = useCreateSpec(projectPath);
 *
 * createMutation.mutate({
 *   projectOverview: 'A todo app with...',
 *   generateFeatures: true,
 *   analyzeProject: true,
 *   featureCount: 50,
 * });
 * ```
 */
export function useCreateSpec(projectPath: string) {
  return useMutation({
    mutationFn: async (input: CreateSpecInput) => {
      const { projectOverview, generateFeatures, analyzeProject, featureCount } = input;

      const api = getElectronAPI();
      if (!api.specRegeneration) {
        throw new Error('Spec regeneration API not available');
      }

      const result = await api.specRegeneration.create(
        projectPath,
        projectOverview.trim(),
        generateFeatures,
        analyzeProject,
        generateFeatures ? featureCount : undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to start spec creation');
      }

      return result;
    },
    // Toast/state updates are handled by the component since it tracks WebSocket events
  });
}

/**
 * Regenerate an existing spec
 *
 * @param projectPath - Path to the project
 * @returns Mutation for regenerating specs
 */
export function useRegenerateSpec(projectPath: string) {
  return useMutation({
    mutationFn: async (input: RegenerateSpecInput) => {
      const { projectDefinition, generateFeatures, analyzeProject, featureCount } = input;

      const api = getElectronAPI();
      if (!api.specRegeneration) {
        throw new Error('Spec regeneration API not available');
      }

      const result = await api.specRegeneration.generate(
        projectPath,
        projectDefinition.trim(),
        generateFeatures,
        analyzeProject,
        generateFeatures ? featureCount : undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to start spec regeneration');
      }

      return result;
    },
  });
}

/**
 * Generate features from existing spec
 *
 * @param projectPath - Path to the project
 * @returns Mutation for generating features
 */
export function useGenerateFeatures(projectPath: string) {
  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        throw new Error('Spec regeneration API not available');
      }

      const result = await api.specRegeneration.generateFeatures(projectPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start feature generation');
      }

      return result;
    },
  });
}

/**
 * Save spec file content
 *
 * @param projectPath - Path to the project
 * @returns Mutation for saving spec
 *
 * @example
 * ```tsx
 * const saveMutation = useSaveSpec(projectPath);
 *
 * saveMutation.mutate(specContent, {
 *   onSuccess: () => setHasChanges(false),
 * });
 * ```
 */
export function useSaveSpec(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      // Guard against empty projectPath to prevent writing to invalid locations
      if (!projectPath || projectPath.trim() === '') {
        throw new Error('Invalid project path: cannot save spec without a valid project');
      }

      const api = getElectronAPI();

      await api.writeFile(`${projectPath}/.automaker/app_spec.txt`, content);

      return { content };
    },
    onSuccess: () => {
      // Invalidate spec file cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.spec.file(projectPath),
      });
      toast.success('Spec saved');
    },
    onError: (error) => {
      toast.error('Failed to save spec', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
