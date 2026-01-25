/**
 * Sessions Query Hooks
 *
 * React Query hooks for fetching session data.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { SessionListItem } from '@/types/electron';

/**
 * Fetch all sessions
 *
 * @param includeArchived - Whether to include archived sessions
 * @returns Query result with sessions array
 *
 * @example
 * ```tsx
 * const { data: sessions, isLoading } = useSessions(false);
 * ```
 */
export function useSessions(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.sessions.all(includeArchived),
    queryFn: async (): Promise<SessionListItem[]> => {
      const api = getElectronAPI();
      const result = await api.sessions.list(includeArchived);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch sessions');
      }
      return result.sessions ?? [];
    },
    staleTime: STALE_TIMES.SESSIONS,
  });
}

/**
 * Fetch session history
 *
 * @param sessionId - ID of the session
 * @returns Query result with session messages
 */
export function useSessionHistory(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sessions.history(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const api = getElectronAPI();
      const result = await api.agent.getHistory(sessionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch session history');
      }
      return {
        messages: result.messages ?? [],
        isRunning: result.isRunning ?? false,
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIMES.FEATURES, // Session history changes during conversations
  });
}

/**
 * Fetch session message queue
 *
 * @param sessionId - ID of the session
 * @returns Query result with queued messages
 */
export function useSessionQueue(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sessions.queue(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const api = getElectronAPI();
      const result = await api.agent.queueList(sessionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch queue');
      }
      return result.queue ?? [];
    },
    enabled: !!sessionId,
    staleTime: STALE_TIMES.RUNNING_AGENTS, // Queue changes frequently during use
  });
}
