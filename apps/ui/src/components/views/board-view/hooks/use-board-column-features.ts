import { useMemo, useCallback, useState } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { resolveDependencies, getBlockingDependencies } from '@automaker/dependency-resolver';

type ColumnId = Feature['status'];

/** Number of backlog items to show per page */
const BACKLOG_PAGE_SIZE = 10;

interface UseBoardColumnFeaturesProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  currentWorktreePath: string | null; // Currently selected worktree path
  currentWorktreeBranch: string | null; // Branch name of the selected worktree (null = main)
  projectPath: string | null; // Main project path (for main worktree)
}

export function useBoardColumnFeatures({
  features,
  runningAutoTasks,
  searchQuery,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
}: UseBoardColumnFeaturesProps) {
  // State for backlog pagination - how many items to show
  const [backlogVisibleCount, setBacklogVisibleCount] = useState(BACKLOG_PAGE_SIZE);
  // State for showing only hidden features (filter mode)
  const [showOnlyHidden, setShowOnlyHidden] = useState(false);
  // Memoize column features to prevent unnecessary re-renders
  const columnFeaturesMap = useMemo(() => {
    const map: Record<ColumnId, Feature[]> = {
      backlog: [],
      in_progress: [],
      waiting_approval: [],
      verified: [],
      completed: [], // Completed features are shown in the archive modal, not as a column
    };

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
    const effectiveWorktreePath = currentWorktreePath || projectPath;
    // Use the branch name from the selected worktree
    // If we're selecting main (currentWorktreePath is null), currentWorktreeBranch
    // should contain the main branch's actual name, defaulting to "main"
    // If we're selecting a non-main worktree but can't find it, currentWorktreeBranch is null
    // In that case, we can't do branch-based filtering, so we'll handle it specially below
    const effectiveBranch = currentWorktreeBranch;

    filteredFeatures.forEach((f) => {
      // If feature has a running agent, always show it in "in_progress"
      const isRunning = runningAutoTasks.includes(f.id);

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
        matchesWorktree = projectPath
          ? useAppStore.getState().isPrimaryWorktreeBranch(projectPath, featureBranch)
          : false;
      } else {
        // Match by branch name
        matchesWorktree = featureBranch === effectiveBranch;
      }

      if (isRunning) {
        // Only show running tasks if they match the current worktree
        if (matchesWorktree) {
          map.in_progress.push(f);
        }
      } else {
        // Otherwise, use the feature's status (fallback to backlog for unknown statuses)
        const status = f.status as ColumnId;

        // Filter all items by worktree, including backlog
        // This ensures backlog items with a branch assigned only show in that branch
        if (status === 'backlog') {
          if (matchesWorktree) {
            map.backlog.push(f);
          }
        } else if (map[status]) {
          // Only show if matches current worktree or has no worktree assigned
          if (matchesWorktree) {
            map[status].push(f);
          }
        } else {
          // Unknown status, default to backlog
          if (matchesWorktree) {
            map.backlog.push(f);
          }
        }
      }
    });

    // Apply dependency-aware sorting to backlog
    // This ensures features appear in dependency order (dependencies before dependents)
    // Within the same dependency level, features are sorted by priority
    if (map.backlog.length > 0) {
      const { orderedFeatures } = resolveDependencies(map.backlog);

      // Get all features to check blocking dependencies against
      const allFeatures = features;
      const enableDependencyBlocking = useAppStore.getState().enableDependencyBlocking;

      // Sort blocked features to the end of the backlog
      // This keeps the dependency order within each group (unblocked/blocked)
      // Also sort hidden features to the very end
      const visible: Feature[] = [];
      const blocked: Feature[] = [];
      const hidden: Feature[] = [];

      for (const f of orderedFeatures) {
        if (f.hidden) {
          hidden.push(f);
        } else if (enableDependencyBlocking && getBlockingDependencies(f, allFeatures).length > 0) {
          blocked.push(f);
        } else {
          visible.push(f);
        }
      }

      // Order: visible (unblocked) -> blocked -> hidden
      map.backlog = [...visible, ...blocked, ...hidden];
    }

    return map;
  }, [
    features,
    runningAutoTasks,
    searchQuery,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath,
  ]);

  const getColumnFeatures = useCallback(
    (columnId: ColumnId) => {
      const allFeatures = columnFeaturesMap[columnId];
      // Apply pagination and hidden filter only to backlog column
      if (columnId === 'backlog') {
        // If showing only hidden, filter to just hidden features
        if (showOnlyHidden) {
          return allFeatures.filter((f) => f.hidden);
        }
        // Otherwise, show non-hidden features with pagination
        const nonHiddenFeatures = allFeatures.filter((f) => !f.hidden);
        return nonHiddenFeatures.slice(0, backlogVisibleCount);
      }
      return allFeatures;
    },
    [columnFeaturesMap, backlogVisibleCount, showOnlyHidden]
  );

  // Count hidden features in backlog
  const hiddenFeaturesCount = useMemo(() => {
    return columnFeaturesMap.backlog.filter((f) => f.hidden).length;
  }, [columnFeaturesMap.backlog]);

  // Calculate backlog pagination info (based on non-hidden features when not in hidden filter mode)
  const backlogPagination = useMemo(() => {
    const nonHiddenFeatures = columnFeaturesMap.backlog.filter((f) => !f.hidden);
    const totalCount = showOnlyHidden ? hiddenFeaturesCount : nonHiddenFeatures.length;
    const visibleCount = showOnlyHidden
      ? hiddenFeaturesCount
      : Math.min(backlogVisibleCount, totalCount);
    const hasMore = !showOnlyHidden && visibleCount < totalCount;
    const remainingCount = totalCount - visibleCount;
    return {
      totalCount,
      visibleCount,
      hasMore,
      remainingCount,
      hiddenCount: hiddenFeaturesCount,
      showOnlyHidden,
    };
  }, [columnFeaturesMap.backlog, backlogVisibleCount, hiddenFeaturesCount, showOnlyHidden]);

  // Show more backlog items (10 more)
  const showMoreBacklog = useCallback(() => {
    setBacklogVisibleCount((prev) => prev + BACKLOG_PAGE_SIZE);
  }, []);

  // Show all backlog items
  const showAllBacklog = useCallback(() => {
    setBacklogVisibleCount(Infinity);
  }, []);

  // Toggle showing only hidden features
  const toggleShowOnlyHidden = useCallback(() => {
    setShowOnlyHidden((prev) => !prev);
  }, []);

  // Reset backlog pagination (e.g., when search changes)
  const resetBacklogPagination = useCallback(() => {
    setBacklogVisibleCount(BACKLOG_PAGE_SIZE);
    setShowOnlyHidden(false);
  }, []);

  // Memoize completed features for the archive modal
  const completedFeatures = useMemo(() => {
    return features.filter((f) => f.status === 'completed');
  }, [features]);

  return {
    columnFeaturesMap,
    getColumnFeatures,
    completedFeatures,
    backlogPagination,
    showMoreBacklog,
    showAllBacklog,
    toggleShowOnlyHidden,
    resetBacklogPagination,
  };
}
