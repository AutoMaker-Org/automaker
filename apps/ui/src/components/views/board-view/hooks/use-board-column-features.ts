// @ts-nocheck - column filtering logic with dependency resolution and status mapping
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import {
  createFeatureMap,
  getBlockingDependenciesFromMap,
  resolveDependencies,
} from '@automaker/dependency-resolver';

type ColumnId = Feature['status'];

interface UseBoardColumnFeaturesProps {
  features: Feature[];
  runningAutoTasks: string[];
  runningAutoTasksAllWorktrees: string[]; // Running tasks across ALL worktrees (prevents backlog flash during event timing gaps)
  searchQuery: string;
  currentWorktreePath: string | null; // Currently selected worktree path
  currentWorktreeBranch: string | null; // Branch name of the selected worktree (null = main)
  projectPath: string | null; // Main project path (for main worktree)
}

export function useBoardColumnFeatures({
  features,
  runningAutoTasks,
  runningAutoTasksAllWorktrees,
  searchQuery,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
}: UseBoardColumnFeaturesProps) {
  // Get recently completed features from store for race condition protection
  const recentlyCompletedFeatures = useAppStore((state) => state.recentlyCompletedFeatures);
  const clearRecentlyCompletedFeatures = useAppStore(
    (state) => state.clearRecentlyCompletedFeatures
  );

  // Track previous feature IDs to detect when features list has been refreshed
  const prevFeatureIdsRef = useRef<Set<string>>(new Set());

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
  useEffect(() => {
    const currentIds = new Set(features.map((f) => f.id));

    // Check if any recently completed features now have terminal statuses in the new data
    // If so, we can clear the tracking since the cache is now fresh
    const hasUpdatedStatus = Array.from(recentlyCompletedFeatures).some((featureId) => {
      const feature = features.find((f) => f.id === featureId);
      return feature && (feature.status === 'verified' || feature.status === 'completed');
    });

    if (hasUpdatedStatus) {
      clearRecentlyCompletedFeatures();
    }

    prevFeatureIdsRef.current = currentIds;
  }, [features, recentlyCompletedFeatures, clearRecentlyCompletedFeatures]);

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

        map.backlog = [...unblocked, ...blocked];
      } else {
        map.backlog = orderedFeatures;
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
