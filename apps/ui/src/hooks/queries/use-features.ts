/**
 * Features Query Hooks
 *
 * React Query hooks for fetching and managing features data.
 * These hooks replace manual useState/useEffect patterns with
 * automatic caching, deduplication, and background refetching.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import { createSmartPollingInterval, getGlobalEventsRecent } from '@/hooks/use-event-recency';
import type { Feature } from '@/store/app-store';

const FEATURES_REFETCH_ON_FOCUS = false;
const FEATURES_REFETCH_ON_RECONNECT = false;
const FEATURES_POLLING_INTERVAL = 30000;
/** Default polling interval for agent output when WebSocket is inactive */
const AGENT_OUTPUT_POLLING_INTERVAL = 5000;
const FEATURES_CACHE_PREFIX = 'automaker:features-cache:';

interface PersistedFeaturesCache {
  timestamp: number;
  features: Feature[];
}

function readPersistedFeatures(projectPath: string): PersistedFeaturesCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${FEATURES_CACHE_PREFIX}${projectPath}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFeaturesCache;
    if (!parsed || !Array.isArray(parsed.features) || typeof parsed.timestamp !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedFeatures(projectPath: string, features: Feature[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedFeaturesCache = {
      timestamp: Date.now(),
      features,
    };
    window.localStorage.setItem(`${FEATURES_CACHE_PREFIX}${projectPath}`, JSON.stringify(payload));
  } catch {
    // Best effort cache only.
  }
}

/**
 * Fetch all features for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with features array
 *
 * @example
 * ```tsx
 * const { data: features, isLoading, error } = useFeatures(currentProject?.path);
 * ```
 */
export function useFeatures(projectPath: string | undefined) {
  const persisted = projectPath ? readPersistedFeatures(projectPath) : null;

  return useQuery({
    queryKey: queryKeys.features.all(projectPath ?? ''),
    queryFn: async (): Promise<Feature[]> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.features?.getAll(projectPath);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch features');
      }
      const features = (result.features ?? []) as Feature[];
      writePersistedFeatures(projectPath, features);
      return features;
    },
    enabled: !!projectPath,
    initialData: persisted?.features,
    initialDataUpdatedAt: persisted?.timestamp,
    staleTime: STALE_TIMES.FEATURES,
    refetchInterval: createSmartPollingInterval(FEATURES_POLLING_INTERVAL),
    refetchOnWindowFocus: FEATURES_REFETCH_ON_FOCUS,
    refetchOnReconnect: FEATURES_REFETCH_ON_RECONNECT,
  });
}

interface UseFeatureOptions {
  enabled?: boolean;
  /** Override polling interval (ms). Use false to disable polling. */
  pollingInterval?: number | false;
}

/**
 * Fetch a single feature by ID
 *
 * @param projectPath - Path to the project
 * @param featureId - ID of the feature to fetch
 * @param options - Query options including enabled and polling interval
 * @returns Query result with single feature
 */
export function useFeature(
  projectPath: string | undefined,
  featureId: string | undefined,
  options: UseFeatureOptions = {}
) {
  const { enabled = true, pollingInterval } = options;

  return useQuery({
    queryKey: queryKeys.features.single(projectPath ?? '', featureId ?? ''),
    queryFn: async (): Promise<Feature | null> => {
      if (!projectPath || !featureId) throw new Error('Missing project path or feature ID');
      const api = getElectronAPI();
      const result = await api.features?.get(projectPath, featureId);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch feature');
      }
      return (result.feature as Feature) ?? null;
    },
    enabled: !!projectPath && !!featureId && enabled,
    staleTime: STALE_TIMES.FEATURES,
    // When a polling interval is specified, disable it if WebSocket events are recent
    refetchInterval:
      pollingInterval === false || pollingInterval === undefined
        ? pollingInterval
        : () => (getGlobalEventsRecent() ? false : pollingInterval),
    refetchOnWindowFocus: FEATURES_REFETCH_ON_FOCUS,
    refetchOnReconnect: FEATURES_REFETCH_ON_RECONNECT,
  });
}

interface UseAgentOutputOptions {
  enabled?: boolean;
  /** Override polling interval (ms). Use false to disable polling. */
  pollingInterval?: number | false;
}

/**
 * Fetch agent output for a feature
 *
 * @param projectPath - Path to the project
 * @param featureId - ID of the feature
 * @param options - Query options including enabled and polling interval
 * @returns Query result with agent output string
 */
export function useAgentOutput(
  projectPath: string | undefined,
  featureId: string | undefined,
  options: UseAgentOutputOptions = {}
) {
  const { enabled = true, pollingInterval } = options;

  return useQuery({
    queryKey: queryKeys.features.agentOutput(projectPath ?? '', featureId ?? ''),
    queryFn: async (): Promise<string> => {
      if (!projectPath || !featureId) throw new Error('Missing project path or feature ID');
      const api = getElectronAPI();
      const result = await api.features?.getAgentOutput(projectPath, featureId);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch agent output');
      }
      return result.content ?? '';
    },
    enabled: !!projectPath && !!featureId && enabled,
    staleTime: STALE_TIMES.AGENT_OUTPUT,
    // Use provided polling interval or default smart behavior
    refetchInterval:
      pollingInterval !== undefined
        ? pollingInterval
        : (query) => {
            // Disable polling when WebSocket events are recent (within 5s)
            // WebSocket invalidation handles updates in real-time
            if (getGlobalEventsRecent()) {
              return false;
            }
            // Only poll if we have data and it's not empty (indicating active task)
            if (query.state.data && query.state.data.length > 0) {
              return AGENT_OUTPUT_POLLING_INTERVAL;
            }
            return false;
          },
    refetchOnWindowFocus: FEATURES_REFETCH_ON_FOCUS,
    refetchOnReconnect: FEATURES_REFETCH_ON_RECONNECT,
  });
}
