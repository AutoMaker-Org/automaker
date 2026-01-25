/**
 * Ideation Mutation Hooks
 *
 * React Query mutations for ideation operations like generating suggestions.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { IdeaCategory, IdeaSuggestion } from '@automaker/types';

/**
 * Input for generating ideation suggestions
 */
interface GenerateSuggestionsInput {
  promptId: string;
  category: IdeaCategory;
}

/**
 * Result from generating suggestions
 */
interface GenerateSuggestionsResult {
  suggestions: IdeaSuggestion[];
  promptId: string;
  category: IdeaCategory;
}

/**
 * Generate ideation suggestions based on a prompt
 *
 * @param projectPath - Path to the project
 * @returns Mutation for generating suggestions
 *
 * @example
 * ```tsx
 * const generateMutation = useGenerateIdeationSuggestions(projectPath);
 *
 * generateMutation.mutate({
 *   promptId: 'prompt-1',
 *   category: 'ux',
 * }, {
 *   onSuccess: (data) => {
 *     console.log('Generated', data.suggestions.length, 'suggestions');
 *   },
 * });
 * ```
 */
export function useGenerateIdeationSuggestions(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GenerateSuggestionsInput): Promise<GenerateSuggestionsResult> => {
      const { promptId, category } = input;

      const api = getElectronAPI();
      if (!api.ideation?.generateSuggestions) {
        throw new Error('Ideation API not available');
      }

      const result = await api.ideation.generateSuggestions(projectPath, promptId, category);

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate suggestions');
      }

      return {
        suggestions: result.suggestions ?? [],
        promptId,
        category,
      };
    },
    onSuccess: () => {
      // Invalidate ideation ideas cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.ideation.ideas(projectPath),
      });
    },
    // Toast notifications are handled by the component since it has access to prompt title
  });
}
