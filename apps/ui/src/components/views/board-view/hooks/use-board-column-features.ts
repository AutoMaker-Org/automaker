import { useMemo, useCallback } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { resolveDependencies, getBlockingDependencies } from '@automaker/dependency-resolver';
import type { PipelineConfig } from '@automaker/types';

interface UseBoardColumnFeaturesProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  currentWorktreePath: string | null; // Currently selected worktree path
  currentWorktreeBranch: string | null; // Branch name of the selected worktree (null = main)
  projectPath: string | null; // Main project path (for main worktree)
  pipelineConfig?: PipelineConfig | null; // Pipeline configuration for dynamic columns
}

export function useBoardColumnFeatures({
  features,
  runningAutoTasks,
  searchQuery,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
  pipelineConfig,
}: UseBoardColumnFeaturesProps) {
  // Get the function reference to avoid React anti-pattern
  const isPrimaryWorktreeBranch = useAppStore((state) => state.isPrimaryWorktreeBranch);

  // Memoize column features to prevent unnecessary re-renders
  const columnFeaturesMap = useMemo(() => {
    // Build the initial map with base columns
    const map: Record<string, Feature[]> = {
      backlog: [],
      in_progress: [],
      waiting_approval: [],
      verified: [],
      completed: [], // Completed features are shown in the archive modal, not as a column
    };

    // Add pipeline step columns if pipeline is enabled
    if (pipelineConfig?.enabled) {
      for (const step of pipelineConfig.steps) {
        map[step.id] = [];
      }
    }

    // Filter features by search query (case-insensitive)
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filteredFeatures = normalizedQuery
      ? features.filter(
          (f) =>
            f.description.toLowerCase().includes(normalizedQuery) ||
            f.category?.toLowerCase().includes(normalizedQuery)
        )
      : features;

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
      // Note: branchName comes from base Feature, cast to handle TypeScript index signature issue
      const featureBranch = f.branchName as string | undefined;

      let matchesWorktree: boolean;
      if (!featureBranch) {
        // No branch assigned - show only on primary worktree
        const isViewingPrimary = currentWorktreePath === null;
        matchesWorktree = isViewingPrimary;
      } else if (effectiveBranch === null) {
        // We're viewing main but branch hasn't been initialized yet
        // (worktrees disabled or haven't loaded yet).
        // Show features assigned to primary worktree's branch.
        matchesWorktree = projectPath ? isPrimaryWorktreeBranch(projectPath, featureBranch) : false;
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
        const status = f.status as string;

        // Filter all items by worktree, including backlog
        // This ensures backlog items with a branch assigned only show in that branch
        if (status === 'backlog') {
          if (matchesWorktree) {
            map.backlog.push(f);
          }
        } else if (map[status] !== undefined) {
          // Status matches a known column (including pipeline steps)
          if (matchesWorktree) {
            map[status].push(f);
          }
        } else {
          // Unknown status - check if it's a pipeline step status (stepId:status format)
          // Features with pipeline step status are placed in the corresponding step column
          // Note: currentPipelineStep comes from base Feature type via index signature
          const currentStep = f.currentPipelineStep as string | undefined;
          if (pipelineConfig?.enabled && currentStep) {
            if (map[currentStep] !== undefined && matchesWorktree) {
              map[currentStep].push(f);
            } else if (matchesWorktree) {
              // Feature is in a pipeline step that doesn't have a column, show in in_progress
              map.in_progress.push(f);
            }
          } else if (matchesWorktree) {
            // Unknown status with no pipeline context, default to backlog
            map.backlog.push(f);
          }
        }
      }
    });

    // Apply dependency-aware sorting to backlog
    // This ensures features appear in dependency order (dependencies before dependents)
    // Within the same dependency level, features are sorted by priority
    if (map.backlog.length > 0) {
      // Cast to satisfy the dependency-resolver's Feature type (which is a subset of app-store Feature)
      const { orderedFeatures } = resolveDependencies(
        map.backlog as Parameters<typeof resolveDependencies>[0]
      );

      // Get all features to check blocking dependencies against
      const allFeatures = features;
      const enableDependencyBlocking = useAppStore.getState().enableDependencyBlocking;

      // Sort blocked features to the end of the backlog
      // This keeps the dependency order within each group (unblocked/blocked)
      if (enableDependencyBlocking) {
        const unblocked: Feature[] = [];
        const blocked: Feature[] = [];

        for (const f of orderedFeatures) {
          // Cast back to app-store Feature type
          const feature = f as Feature;
          if (
            getBlockingDependencies(
              feature as Parameters<typeof getBlockingDependencies>[0],
              allFeatures as Parameters<typeof getBlockingDependencies>[1]
            ).length > 0
          ) {
            blocked.push(feature);
          } else {
            unblocked.push(feature);
          }
        }

        map.backlog = [...unblocked, ...blocked];
      } else {
        // Cast orderedFeatures back to app-store Feature type
        map.backlog = orderedFeatures as Feature[];
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
    pipelineConfig,
  ]);

  const getColumnFeatures = useCallback(
    (columnId: string) => {
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
