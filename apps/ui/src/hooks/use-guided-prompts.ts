/**
 * Hook for fetching guided prompts from the backend API
 *
 * This hook provides the single source of truth for guided prompts,
 * fetched from the backend /api/ideation/prompts endpoint.
 */

import { useState, useEffect, useCallback } from 'react';
import type { IdeationPrompt, PromptCategory, IdeaCategory } from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';

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
  const [prompts, setPrompts] = useState<IdeationPrompt[]>([]);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      const result = await api.ideation?.getPrompts();

      if (result?.success) {
        setPrompts(result.prompts || []);
        setCategories(result.categories || []);
      } else {
        setError(result?.error || 'Failed to fetch prompts');
      }
    } catch (err) {
      console.error('Failed to fetch guided prompts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prompts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

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

  return {
    prompts,
    categories,
    isLoading,
    error,
    refetch: fetchPrompts,
    getPromptsByCategory,
    getPromptById,
    getCategoryById,
  };
}
