/**
 * Features Query Hooks
 *
 * React Query hooks for fetching and managing features data.
 * These hooks replace manual useState/useEffect patterns with
 * automatic caching, deduplication, and background refetching.
 */

import { useMemo } from 'react';
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

/**
 * Bump this version whenever the Feature shape changes so stale localStorage
 * entries with incompatible schemas are automatically discarded.
 */
const FEATURES_CACHE_VERSION = 1;

/** Maximum number of per-project cache entries to keep in localStorage (LRU). */
const MAX_FEATURES_CACHE_ENTRIES = 10;

interface PersistedFeaturesCache {
  /** Schema version — mismatched versions are treated as stale and discarded. */
  schemaVersion: number;
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
    // Reject entries written by an older (or newer) schema version
    if (parsed.schemaVersion !== FEATURES_CACHE_VERSION) {
      // Remove the stale entry so it doesn't accumulate
      window.localStorage.removeItem(`${FEATURES_CACHE_PREFIX}${projectPath}`);
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
      schemaVersion: FEATURES_CACHE_VERSION,
      timestamp: Date.now(),
      features,
    };
    window.localStorage.setItem(`${FEATURES_CACHE_PREFIX}${projectPath}`, JSON.stringify(payload));
  } catch {
    // Best effort cache only.
  }
  // Run lightweight eviction after every write to keep localStorage bounded
  evictStaleFeaturesCache();
}

/**
 * Scan localStorage for feature-cache entries, sort by timestamp (LRU),
 * and remove entries beyond MAX_FEATURES_CACHE_ENTRIES so orphaned project
 * caches don't accumulate indefinitely.
 */
function evictStaleFeaturesCache(): void {
  if (typeof window === 'undefined') return;
  try {
    // First pass: collect all matching keys without mutating localStorage.
    // Iterating forward while calling removeItem() shifts indexes and can skip keys.
    const allKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(FEATURES_CACHE_PREFIX)) {
        allKeys.push(key);
      }
    }

    // Second pass: classify collected keys — remove stale/corrupt, keep valid.
    const validEntries: Array<{ key: string; timestamp: number }> = [];
    const keysToRemove: string[] = [];
    for (const key of allKeys) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { timestamp?: number; schemaVersion?: number };
        // Evict entries with wrong schema version
        if (parsed.schemaVersion !== FEATURES_CACHE_VERSION) {
          keysToRemove.push(key);
          continue;
        }
        validEntries.push({
          key,
          timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0,
        });
      } catch {
        // Corrupt entry — mark for removal
        keysToRemove.push(key);
      }
    }

    // Remove stale/corrupt entries
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }

    // Enforce max entries: sort by timestamp (newest first), remove excess oldest
    if (validEntries.length <= MAX_FEATURES_CACHE_ENTRIES) return;
    validEntries.sort((a, b) => b.timestamp - a.timestamp);
    for (let i = MAX_FEATURES_CACHE_ENTRIES; i < validEntries.length; i++) {
      window.localStorage.removeItem(validEntries[i].key);
    }
  } catch {
    // Best effort — never break the app for cache housekeeping failures.
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
  // Memoize the persisted cache read so it only runs when projectPath changes,
  // not on every render. Both initialData and initialDataUpdatedAt reference
  // the same memoized value to avoid a redundant second localStorage read.
  const persisted = useMemo(
    () => (projectPath ? readPersistedFeatures(projectPath) : null),
    [projectPath]
  );

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
    initialData: () => persisted?.features,
    initialDataUpdatedAt: () => persisted?.timestamp,
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
