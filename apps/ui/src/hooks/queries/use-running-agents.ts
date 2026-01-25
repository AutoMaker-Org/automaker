/**
 * Running Agents Query Hook
 *
 * React Query hook for fetching currently running agents.
 * This data is invalidated by WebSocket events when agents start/stop.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI, type RunningAgent } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

const RUNNING_AGENTS_REFETCH_ON_FOCUS = false;
const RUNNING_AGENTS_REFETCH_ON_RECONNECT = false;

interface RunningAgentsResult {
  agents: RunningAgent[];
  count: number;
}

/**
 * Fetch all currently running agents
 *
 * @returns Query result with running agents and total count
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useRunningAgents();
 * const { agents, count } = data ?? { agents: [], count: 0 };
 * ```
 */
export function useRunningAgents() {
  return useQuery({
    queryKey: queryKeys.runningAgents.all(),
    queryFn: async (): Promise<RunningAgentsResult> => {
      const api = getElectronAPI();
      const result = await api.runningAgents.getAll();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch running agents');
      }
      return {
        agents: result.runningAgents ?? [],
        count: result.totalCount ?? 0,
      };
    },
    staleTime: STALE_TIMES.RUNNING_AGENTS,
    // Note: Don't use refetchInterval here - rely on WebSocket invalidation
    // for real-time updates instead of polling
    refetchOnWindowFocus: RUNNING_AGENTS_REFETCH_ON_FOCUS,
    refetchOnReconnect: RUNNING_AGENTS_REFETCH_ON_RECONNECT,
  });
}

/**
 * Get running agents count
 * This is a selector that derives count from the main query
 *
 * @returns Query result with just the count
 */
export function useRunningAgentsCount() {
  const query = useRunningAgents();
  return {
    ...query,
    data: query.data?.count ?? 0,
  };
}
