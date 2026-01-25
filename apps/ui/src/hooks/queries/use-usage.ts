/**
 * Usage Query Hooks
 *
 * React Query hooks for fetching Claude, Codex, z.ai, and Gemini API usage data.
 * These hooks include automatic polling for real-time usage updates.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { ClaudeUsage, CodexUsage, ZaiUsage, GeminiUsage } from '@/store/app-store';

/** Polling interval for usage data (60 seconds) */
const USAGE_POLLING_INTERVAL = 60 * 1000;
const USAGE_REFETCH_ON_FOCUS = false;
const USAGE_REFETCH_ON_RECONNECT = false;

/**
 * Fetch Claude API usage data
 *
 * @param enabled - Whether the query should run (default: true)
 * @returns Query result with Claude usage data
 *
 * @example
 * ```tsx
 * const { data: usage, isLoading } = useClaudeUsage(isPopoverOpen);
 * ```
 */
export function useClaudeUsage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.usage.claude(),
    queryFn: async (): Promise<ClaudeUsage> => {
      const api = getElectronAPI();
      if (!api.claude) {
        throw new Error('Claude API bridge unavailable');
      }
      const result = await api.claude.getUsage();
      // Check if result is an error response
      if ('error' in result) {
        throw new Error(result.message || result.error);
      }
      return result;
    },
    enabled,
    staleTime: STALE_TIMES.USAGE,
    refetchInterval: enabled ? USAGE_POLLING_INTERVAL : false,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: USAGE_REFETCH_ON_FOCUS,
    refetchOnReconnect: USAGE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch Codex API usage data
 *
 * @param enabled - Whether the query should run (default: true)
 * @returns Query result with Codex usage data
 *
 * @example
 * ```tsx
 * const { data: usage, isLoading } = useCodexUsage(isPopoverOpen);
 * ```
 */
export function useCodexUsage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.usage.codex(),
    queryFn: async (): Promise<CodexUsage> => {
      const api = getElectronAPI();
      if (!api.codex) {
        throw new Error('Codex API bridge unavailable');
      }
      const result = await api.codex.getUsage();
      // Check if result is an error response
      if ('error' in result) {
        throw new Error(result.message || result.error);
      }
      return result;
    },
    enabled,
    staleTime: STALE_TIMES.USAGE,
    refetchInterval: enabled ? USAGE_POLLING_INTERVAL : false,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: USAGE_REFETCH_ON_FOCUS,
    refetchOnReconnect: USAGE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch z.ai API usage data
 *
 * @param enabled - Whether the query should run (default: true)
 * @returns Query result with z.ai usage data
 *
 * @example
 * ```tsx
 * const { data: usage, isLoading } = useZaiUsage(isPopoverOpen);
 * ```
 */
export function useZaiUsage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.usage.zai(),
    queryFn: async (): Promise<ZaiUsage> => {
      const api = getElectronAPI();
      if (!api.zai) {
        throw new Error('z.ai API bridge unavailable');
      }
      const result = await api.zai.getUsage();
      // Check if result is an error response
      if ('error' in result) {
        throw new Error(result.message || result.error);
      }
      return result;
    },
    enabled,
    staleTime: STALE_TIMES.USAGE,
    refetchInterval: enabled ? USAGE_POLLING_INTERVAL : false,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: USAGE_REFETCH_ON_FOCUS,
    refetchOnReconnect: USAGE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch Gemini API usage/status data
 *
 * @param enabled - Whether the query should run (default: true)
 * @returns Query result with Gemini usage data
 *
 * @example
 * ```tsx
 * const { data: usage, isLoading } = useGeminiUsage(isPopoverOpen);
 * ```
 */
export function useGeminiUsage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.usage.gemini(),
    queryFn: async (): Promise<GeminiUsage> => {
      const api = getElectronAPI();
      if (!api.gemini) {
        throw new Error('Gemini API bridge unavailable');
      }
      const result = await api.gemini.getUsage();
      // Server always returns a response with 'authenticated' field, even on error
      // So we can safely cast to GeminiUsage
      return result as GeminiUsage;
    },
    enabled,
    staleTime: STALE_TIMES.USAGE,
    refetchInterval: enabled ? USAGE_POLLING_INTERVAL : false,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: USAGE_REFETCH_ON_FOCUS,
    refetchOnReconnect: USAGE_REFETCH_ON_RECONNECT,
  });
}
