import { useMemo, useCallback } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { resolveDependencies, getBlockingDependencies } from '@automaker/dependency-resolver';

type ColumnId = Feature['status'];

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

      // Use the feature's status (fallback to backlog for unknown statuses)
      const status = f.status || 'backlog';

      // IMPORTANT:
      // Historically, we forced "running" features into in_progress so they never disappeared
      // during stale reload windows. With pipelines, a feature can legitimately be running while
      // its status is `pipeline_*`, so we must respect that status to render it in the right column.
      if (isRunning) {
        if (!matchesWorktree) return;

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

      // Not running: place by status (and worktree filter)
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
      } else if (status.startsWith('pipeline_')) {
        // Handle pipeline statuses - initialize array if needed
        if (matchesWorktree) {
          if (!map[status]) {
            map[status] = [];
          }
          map[status].push(f);
        }
      } else {
        // Unknown status, default to backlog
        if (matchesWorktree) {
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
      const allFeatures = features;
      const enableDependencyBlocking = useAppStore.getState().enableDependencyBlocking;

      // Sort blocked features to the end of the backlog
      // This keeps the dependency order within each group (unblocked/blocked)
      if (enableDependencyBlocking) {
        const unblocked: Feature[] = [];
        const blocked: Feature[] = [];

        for (const f of orderedFeatures) {
          if (getBlockingDependencies(f, allFeatures).length > 0) {
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
    searchQuery,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath,
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
