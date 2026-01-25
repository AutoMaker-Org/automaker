/**
 * CLI Status Query Hooks
 *
 * React Query hooks for fetching CLI tool status (Claude, Cursor, Codex, etc.)
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

/**
 * Fetch Claude CLI status
 *
 * @returns Query result with Claude CLI status
 */
export function useClaudeCliStatus() {
  return useQuery({
    queryKey: queryKeys.cli.claude(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getClaudeStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Claude status');
      }
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch Cursor CLI status
 *
 * @returns Query result with Cursor CLI status
 */
export function useCursorCliStatus() {
  return useQuery({
    queryKey: queryKeys.cli.cursor(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getCursorStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Cursor status');
      }
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch Codex CLI status
 *
 * @returns Query result with Codex CLI status
 */
export function useCodexCliStatus() {
  return useQuery({
    queryKey: queryKeys.cli.codex(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getCodexStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Codex status');
      }
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch OpenCode CLI status
 *
 * @returns Query result with OpenCode CLI status
 */
export function useOpencodeCliStatus() {
  return useQuery({
    queryKey: queryKeys.cli.opencode(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getOpencodeStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch OpenCode status');
      }
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch GitHub CLI status
 *
 * @returns Query result with GitHub CLI status
 */
export function useGitHubCliStatus() {
  return useQuery({
    queryKey: queryKeys.cli.github(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getGhStatus();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch GitHub CLI status');
      }
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch API keys status
 *
 * @returns Query result with API keys status
 */
export function useApiKeysStatus() {
  return useQuery({
    queryKey: queryKeys.cli.apiKeys(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getApiKeys();
      return result;
    },
    staleTime: STALE_TIMES.CLI_STATUS,
  });
}

/**
 * Fetch platform info
 *
 * @returns Query result with platform info
 */
export function usePlatformInfo() {
  return useQuery({
    queryKey: queryKeys.cli.platform(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.setup.getPlatform();
      if (!result.success) {
        throw new Error('Failed to fetch platform info');
      }
      return result;
    },
    staleTime: Infinity, // Platform info never changes
  });
}
