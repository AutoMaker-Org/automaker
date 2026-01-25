/**
 * Models Query Hooks
 *
 * React Query hooks for fetching available AI models.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

interface CodexModel {
  id: string;
  label: string;
  description: string;
  hasThinking: boolean;
  supportsVision: boolean;
  tier: 'premium' | 'standard' | 'basic';
  isDefault: boolean;
}

interface OpencodeModel {
  id: string;
  name: string;
  modelString: string;
  provider: string;
  description: string;
  supportsTools: boolean;
  supportsVision: boolean;
  tier: string;
  default?: boolean;
}

/**
 * Fetch available models
 *
 * @returns Query result with available models
 */
export function useAvailableModels() {
  return useQuery({
    queryKey: queryKeys.models.available(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.model.getAvailable();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch available models');
      }
      return result.models ?? [];
    },
    staleTime: STALE_TIMES.MODELS,
  });
}

/**
 * Fetch Codex models
 *
 * @param refresh - Force refresh from server
 * @returns Query result with Codex models
 */
export function useCodexModels(refresh = false) {
  return useQuery({
    queryKey: queryKeys.models.codex(),
    queryFn: async (): Promise<CodexModel[]> => {
      const api = getElectronAPI();
      const result = await api.codex.getModels(refresh);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Codex models');
      }
      return (result.models ?? []) as CodexModel[];
    },
    staleTime: STALE_TIMES.MODELS,
  });
}

/**
 * Fetch OpenCode models
 *
 * @param refresh - Force refresh from server
 * @returns Query result with OpenCode models
 */
export function useOpencodeModels(refresh = false) {
  return useQuery({
    queryKey: queryKeys.models.opencode(),
    queryFn: async (): Promise<OpencodeModel[]> => {
      const api = getElectronAPI();
      const result = await api.setup.getOpencodeModels(refresh);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch OpenCode models');
      }
      return (result.models ?? []) as OpencodeModel[];
    },
    staleTime: STALE_TIMES.MODELS,
  });
}

/**
 * Fetch OpenCode providers
 *
 * @returns Query result with OpenCode providers
 */
export function useOpencodeProviders() {
  return useQuery({
    queryKey: queryKeys.models.opencodeProviders(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getOpencodeProviders();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch OpenCode providers');
      }
      return result.providers ?? [];
    },
    staleTime: STALE_TIMES.MODELS,
  });
}

/**
 * Fetch model providers status
 *
 * @returns Query result with provider status
 */
export function useModelProviders() {
  return useQuery({
    queryKey: queryKeys.models.providers(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.model.checkProviders();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch providers');
      }
      return result.providers ?? {};
    },
    staleTime: STALE_TIMES.MODELS,
  });
}
