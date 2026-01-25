/**
 * Hook for fetching guided prompts from the backend API
 *
 * This hook provides the single source of truth for guided prompts,
 * with caching via React Query.
 */

import { useCallback, useMemo } from 'react';
import type { IdeationPrompt, PromptCategory, IdeaCategory } from '@automaker/types';
import { useIdeationPrompts } from '@/hooks/queries';

interface UseGuidedPromptsReturn {
  prompts: IdeationPrompt[];
  categories: PromptCategory[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getPromptsByCategory: (category: IdeaCategory) => IdeationPrompt[];
  getPromptById: (id: string) => IdeationPrompt | undefined;
  getCategoryById: (id: IdeaCategory) => PromptCategory | undefined;
}

export function useGuidedPrompts(): UseGuidedPromptsReturn {
  const { data, isLoading, error, refetch } = useIdeationPrompts();

  const prompts = data?.prompts ?? [];
  const categories = data?.categories ?? [];

  const getPromptsByCategory = useCallback(
    (category: IdeaCategory): IdeationPrompt[] => {
      return prompts.filter((p) => p.category === category);
    },
    [prompts]
  );

  const getPromptById = useCallback(
    (id: string): IdeationPrompt | undefined => {
      return prompts.find((p) => p.id === id);
    },
    [prompts]
  );

  const getCategoryById = useCallback(
    (id: IdeaCategory): PromptCategory | undefined => {
      return categories.find((c) => c.id === id);
    },
    [categories]
  );

  // Convert async refetch to match the expected interface
  const handleRefetch = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Convert error to string for backward compatibility
  const errorMessage = useMemo(() => {
    if (!error) return null;
    return error instanceof Error ? error.message : String(error);
  }, [error]);

  return {
    prompts,
    categories,
    isLoading,
    error: errorMessage,
    refetch: handleRefetch,
    getPromptsByCategory,
    getPromptById,
    getCategoryById,
  };
}
