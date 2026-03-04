// @ts-nocheck - column filtering logic with dependency resolution and status mapping
import { useMemo, useCallback, useEffect } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import {
  createFeatureMap,
  getBlockingDependenciesFromMap,
  resolveDependencies,
} from '@automaker/dependency-resolver';

type ColumnId = Feature['status'];

/**
 * Extract creation time from a feature, falling back to the timestamp
 * embedded in the feature ID (format: feature-{timestamp}-{random}).
 */
function getFeatureCreatedTime(feature: Feature): number {
  if (feature.createdAt) {
    return new Date(feature.createdAt).getTime();
  }
  // Fallback: extract timestamp from feature ID (e.g., "feature-1772299989679-185nwyp5kc7")
  const match = feature.id.match(/^feature-(\d+)-/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Sort features newest-first while respecting dependency ordering.
 *
 * Groups features into dependency chains and sorts the chains by the newest
 * feature in each chain (descending). Within each chain, dependencies appear
 * before their dependents (topological order preserved).
 *
 * Features without any dependency relationships are treated as single-item chains
 * and sorted by their own creation time.
 */
function sortNewestWithDependencies(features: Feature[]): Feature[] {
  if (features.length <= 1) return features;

  const featureMap = new Map(features.map((f) => [f.id, f]));
  const featureSet = new Set(features.map((f) => f.id));

  // Build adjacency: parent -> children (dependency -> dependents) scoped to this list
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string[]>();
  for (const f of features) {
    childrenOf.set(f.id, []);
    parentOf.set(f.id, []);
  }
  for (const f of features) {
    for (const depId of f.dependencies || []) {
      if (featureSet.has(depId)) {
        childrenOf.get(depId)!.push(f.id);
        parentOf.get(f.id)!.push(depId);
      }
    }
  }

  // Find connected components (dependency chains/groups)
  const visited = new Set<string>();
  const components: string[][] = [];

  function collectComponent(startId: string): string[] {
    const component: string[] = [];
    const stack = [startId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);
      // Traverse both directions to find full connected component
      for (const childId of childrenOf.get(id) || []) {
        if (!visited.has(childId)) stack.push(childId);
      }
      for (const pid of parentOf.get(id) || []) {
        if (!visited.has(pid)) stack.push(pid);
      }
    }
    return component;
  }

  for (const f of features) {
    if (!visited.has(f.id)) {
      components.push(collectComponent(f.id));
    }
  }

  // For each component, find the newest feature time (used to sort components)
  // and produce a topological ordering within the component
  const sortedComponents: { newestTime: number; ordered: Feature[] }[] = [];

  for (const component of components) {
    let newestTime = 0;
    for (const id of component) {
      const t = getFeatureCreatedTime(featureMap.get(id)!);
      if (t > newestTime) newestTime = t;
    }

    // Topological sort within component (dependencies first)
    // Use the existing order from `features` as a stable fallback
    const componentSet = new Set(component);
    const inDegree = new Map<string, number>();
    for (const id of component) {
      let deg = 0;
      for (const pid of parentOf.get(id) || []) {
        if (componentSet.has(pid)) deg++;
      }
      inDegree.set(id, deg);
    }

    const queue: Feature[] = [];
    for (const id of component) {
      if (inDegree.get(id) === 0) {
        queue.push(featureMap.get(id)!);
      }
    }
    // Within same level, sort newest first
    queue.sort((a, b) => getFeatureCreatedTime(b) - getFeatureCreatedTime(a));

    const ordered: Feature[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);
      for (const childId of childrenOf.get(current.id) || []) {
        if (!componentSet.has(childId)) continue;
        const newDeg = (inDegree.get(childId) || 1) - 1;
        inDegree.set(childId, newDeg);
        if (newDeg === 0) {
          queue.push(featureMap.get(childId)!);
          queue.sort((a, b) => getFeatureCreatedTime(b) - getFeatureCreatedTime(a));
        }
      }
    }

    // Append any remaining (circular deps) at end
    for (const id of component) {
      if (!ordered.some((f) => f.id === id)) {
        ordered.push(featureMap.get(id)!);
      }
    }

    sortedComponents.push({ newestTime, ordered });
  }

  // Sort components by newest feature time (descending)
  sortedComponents.sort((a, b) => b.newestTime - a.newestTime);

  // Flatten: each component's internal order is preserved
  return sortedComponents.flatMap((c) => c.ordered);
}

interface UseBoardColumnFeaturesProps {
  features: Feature[];
  runningAutoTasks: string[];
  runningAutoTasksAllWorktrees: string[]; // Running tasks across ALL worktrees (prevents backlog flash during event timing gaps)
  searchQuery: string;
  currentWorktreePath: string | null; // Currently selected worktree path
  currentWorktreeBranch: string | null; // Branch name of the selected worktree (null = main)
  projectPath: string | null; // Main project path (for main worktree)
  sortNewestCardOnTop?: boolean; // When true, sort cards by most recent (createdAt desc) in all columns
}

export function useBoardColumnFeatures({
  features,
  runningAutoTasks,
  runningAutoTasksAllWorktrees,
  searchQuery,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
  sortNewestCardOnTop = false,
}: UseBoardColumnFeaturesProps) {
  // Get recently completed features from store for race condition protection
  const recentlyCompletedFeatures = useAppStore((state) => state.recentlyCompletedFeatures);
  const clearRecentlyCompletedFeatures = useAppStore(
    (state) => state.clearRecentlyCompletedFeatures
  );

  // Clear recently completed features when the cache refreshes with updated statuses.
  //
  // RACE CONDITION SCENARIO THIS PREVENTS:
  // 1. Feature completes on server -> status becomes 'verified'/'completed' on disk
  // 2. Server emits auto_mode_feature_complete event
  // 3. Frontend receives event -> removes feature from runningTasks, adds to recentlyCompletedFeatures
  // 4. React Query invalidates features query, triggers async refetch
  // 5. RACE: Before refetch completes, component may re-render with stale cache data
  //    where status='backlog' and feature is no longer in runningTasks
  // 6. This hook prevents the feature from appearing in backlog during that window
  //
  // When the refetch completes with fresh data (status='verified'/'completed'),
  // this effect clears the recentlyCompletedFeatures set since it's no longer needed.
  // Clear recently completed features when the cache refreshes with updated statuses.
  // IMPORTANT: Only depend on `features` (not `recentlyCompletedFeatures`) to avoid a
  // re-trigger loop where clearing the set creates a new reference that re-fires this effect.
  // Read recentlyCompletedFeatures from the store directly to get the latest value without
  // subscribing to it as a dependency.
  useEffect(() => {
    const currentRecentlyCompleted = useAppStore.getState().recentlyCompletedFeatures;
    if (currentRecentlyCompleted.size === 0) return;

    const hasUpdatedStatus = Array.from(currentRecentlyCompleted).some((featureId) => {
      const feature = features.find((f) => f.id === featureId);
      return feature && (feature.status === 'verified' || feature.status === 'completed');
    });

    if (hasUpdatedStatus) {
      clearRecentlyCompletedFeatures();
    }
  }, [features, clearRecentlyCompletedFeatures]);

  // Memoize column features to prevent unnecessary re-renders
  const columnFeaturesMap = useMemo(() => {
    // Use a more flexible type to support dynamic pipeline statuses
    const map: Record<string, Feature[]> = {
      backlog: [],
      in_progress: [],
      waiting_approval: [],
      verified: [],
      completed: [], // Completed features are shown in the archive modal, not as a column
    };
    const featureMap = createFeatureMap(features);
    const runningTaskIds = new Set(runningAutoTasks);
    // Track ALL running tasks across all worktrees to prevent features from
    // briefly appearing in backlog during the timing gap between when the server
    // starts executing a feature and when the UI receives the event/status update.
    const allRunningTaskIds = new Set(runningAutoTasksAllWorktrees);
    // Get recently completed features for additional race condition protection
    // These features should not appear in backlog even if cache has stale status
    const recentlyCompleted = recentlyCompletedFeatures;

    // Filter features by search query (case-insensitive)
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filteredFeatures = normalizedQuery
      ? features.filter(
          (f) =>
            f.description.toLowerCase().includes(normalizedQuery) ||
            f.category?.toLowerCase().includes(normalizedQuery)
        )
      : features;

    // Determine the effective worktree path and branch for filtering
    // If currentWorktreePath is null, we're on the main worktree
    // Use the branch name from the selected worktree
    // If we're selecting main (currentWorktreePath is null), currentWorktreeBranch
    // should contain the main branch's actual name, defaulting to "main"
    // If we're selecting a non-main worktree but can't find it, currentWorktreeBranch is null
    // In that case, we can't do branch-based filtering, so we'll handle it specially below
    const effectiveBranch = currentWorktreeBranch;

    filteredFeatures.forEach((f) => {
      // If feature has a running agent, always show it in "in_progress"
      const isRunning = runningTaskIds.has(f.id);

      // Check if feature matches the current worktree by branchName
      // Features without branchName are considered unassigned (show only on primary worktree)
      const featureBranch = f.branchName;

      let matchesWorktree: boolean;
      if (!featureBranch) {
        // No branch assigned - show only on primary worktree
        const isViewingPrimary = currentWorktreePath === null;
        matchesWorktree = isViewingPrimary;
      } else if (effectiveBranch === null) {
        // We're viewing main but branch hasn't been initialized yet
        // (worktrees disabled or haven't loaded yet).
        // Show features assigned to primary worktree's branch.
        if (projectPath) {
          const worktrees = useAppStore.getState().worktreesByProject[projectPath] ?? [];
          if (worktrees.length === 0) {
            // Worktrees not loaded yet - fallback to showing features on common default branches
            // This prevents features from disappearing during initial load
            matchesWorktree =
              featureBranch === 'main' || featureBranch === 'master' || featureBranch === 'develop';
          } else {
            matchesWorktree = useAppStore
              .getState()
              .isPrimaryWorktreeBranch(projectPath, featureBranch);
          }
        } else {
          matchesWorktree = false;
        }
      } else {
        // Match by branch name
        matchesWorktree = featureBranch === effectiveBranch;
      }

      // Use the feature's status (fallback to backlog for unknown statuses)
      const status = f.status || 'backlog';

      // IMPORTANT:
      // Historically, we forced "running" features into in_progress so they never disappeared
      // during stale reload windows. With pipelines, a feature can legitimately be running while
      // its status is `pipeline_*`, so we must respect that status to render it in the right column.
      // NOTE: runningAutoTasks is already worktree-scoped, so if a feature is in runningAutoTasks,
      // it's already running for the current worktree. However, we still need to check matchesWorktree
      // to ensure the feature's branchName matches the current worktree's branch.
      if (isRunning) {
        // If feature is running but doesn't match worktree, it might be a timing issue where
        // the feature was started for a different worktree. Still show it if it's running to
        // prevent disappearing features, but log a warning.
        if (!matchesWorktree) {
          // This can happen if:
          // 1. Feature was started for a different worktree (bug)
          // 2. Timing issue where branchName hasn't been set yet
          // 3. User switched worktrees while feature was starting
          // Still show it in in_progress to prevent it from disappearing
          console.debug(
            `Feature ${f.id} is running but branchName (${featureBranch}) doesn't match current worktree branch (${effectiveBranch}) - showing anyway to prevent disappearing`
          );
          map.in_progress.push(f);
          return;
        }

        if (status.startsWith('pipeline_')) {
          if (!map[status]) map[status] = [];
          map[status].push(f);
          return;
        }

        // If it's running and has a known non-backlog status, keep it in that status.
        // Otherwise, fallback to in_progress as the "active work" column.
        if (status !== 'backlog' && map[status]) {
          map[status].push(f);
        } else {
          map.in_progress.push(f);
        }
        return;
      }

      // Not running (on this worktree): place by status (and worktree filter)
      // Filter all items by worktree, including backlog
      // This ensures backlog items with a branch assigned only show in that branch
      //
      // 'merge_conflict', 'ready', and 'interrupted' are backlog-lane statuses that don't
      // have dedicated columns:
      // - 'merge_conflict': Automatic merge failed; user must resolve conflicts before restart
      // - 'ready': Feature has an approved plan, waiting to be picked up for execution
      // - 'interrupted': Feature execution was aborted (e.g., user stopped it, server restart)
      // Both display in the backlog column and need the same allRunningTaskIds race-condition
      // protection as 'backlog' to prevent briefly flashing in backlog when already executing.
      if (
        status === 'backlog' ||
        status === 'merge_conflict' ||
        status === 'ready' ||
        status === 'interrupted'
      ) {
        // IMPORTANT: Check if this feature is running on ANY worktree before placing in backlog.
        // This prevents a race condition where the feature has started executing on the server
        // (and is tracked in a different worktree's running list) but the disk status hasn't
        // been updated yet or the UI hasn't received the worktree-scoped event.
        // In that case, the feature would briefly flash in the backlog column.
        if (allRunningTaskIds.has(f.id)) {
          // Feature is running somewhere - show in in_progress if it matches this worktree,
          // otherwise skip it (it will appear on the correct worktree's board)
          if (matchesWorktree) {
            map.in_progress.push(f);
          }
        } else if (recentlyCompleted.has(f.id)) {
          // Feature recently completed - skip placing in backlog to prevent race condition
          // where stale cache has status='backlog' but feature actually completed.
          // The feature will be placed correctly once the cache refreshes.
          // Log for debugging (can remove after verification)
          console.debug(
            `Feature ${f.id} recently completed - skipping backlog placement during cache refresh`
          );
        } else if (matchesWorktree) {
          map.backlog.push(f);
        }
      } else if (map[status]) {
        // Only show if matches current worktree or has no worktree assigned
        if (matchesWorktree) {
          map[status].push(f);
        }
      } else if (status.startsWith('pipeline_')) {
        // Handle pipeline statuses - initialize array if needed
        if (matchesWorktree) {
          if (!map[status]) {
            map[status] = [];
          }
          map[status].push(f);
        }
      } else {
        // Unknown status - apply same allRunningTaskIds protection and default to backlog
        if (allRunningTaskIds.has(f.id)) {
          if (matchesWorktree) {
            map.in_progress.push(f);
          }
        } else if (matchesWorktree) {
          map.backlog.push(f);
        }
      }
    });

    // Apply dependency-aware sorting to backlog
    // This ensures features appear in dependency order (dependencies before dependents)
    // Within the same dependency level, features are sorted by priority
    if (map.backlog.length > 0) {
      const { orderedFeatures } = resolveDependencies(map.backlog);

      // Get all features to check blocking dependencies against
      const enableDependencyBlocking = useAppStore.getState().enableDependencyBlocking;

      // Sort blocked features to the end of the backlog
      // This keeps the dependency order within each group (unblocked/blocked)
      if (enableDependencyBlocking) {
        const unblocked: Feature[] = [];
        const blocked: Feature[] = [];

        for (const f of orderedFeatures) {
          if (getBlockingDependenciesFromMap(f, featureMap).length > 0) {
            blocked.push(f);
          } else {
            unblocked.push(f);
          }
        }

        if (sortNewestCardOnTop) {
          // Sort each group newest-first while keeping dependency chains nested
          map.backlog = [
            ...sortNewestWithDependencies(unblocked),
            ...sortNewestWithDependencies(blocked),
          ];
        } else {
          map.backlog = [...unblocked, ...blocked];
        }
      } else {
        if (sortNewestCardOnTop) {
          map.backlog = sortNewestWithDependencies(orderedFeatures);
        } else {
          map.backlog = orderedFeatures;
        }
      }
    }

    // Apply newest-on-top sorting to non-backlog columns when enabled
    // (Backlog is handled above with dependency-aware sorting)
    if (sortNewestCardOnTop) {
      for (const columnId of Object.keys(map)) {
        if (columnId === 'backlog') continue;
        map[columnId] = [...map[columnId]].sort((a, b) => {
          const aTime = getFeatureCreatedTime(a);
          const bTime = getFeatureCreatedTime(b);
          return bTime - aTime; // desc: newest first
        });
      }
    }

    return map;
  }, [
    features,
    runningAutoTasks,
    runningAutoTasksAllWorktrees,
    searchQuery,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath,
    recentlyCompletedFeatures,
    sortNewestCardOnTop,
  ]);

  const getColumnFeatures = useCallback(
    (columnId: ColumnId) => {
      return columnFeaturesMap[columnId] || [];
    },
    [columnFeaturesMap]
  );

  // Memoize completed features for the archive modal
  const completedFeatures = useMemo(() => {
    return features.filter((f) => f.status === 'completed');
  }, [features]);

  return {
    columnFeaturesMap,
    getColumnFeatures,
    completedFeatures,
  };
}
