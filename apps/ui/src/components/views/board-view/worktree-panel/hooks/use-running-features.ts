import { useCallback } from 'react';
import type { WorktreeInfo, FeatureInfo } from '../types';

interface UseRunningFeaturesOptions {
  runningFeatureIds: string[];
  features: FeatureInfo[];
}

export function useRunningFeatures({ runningFeatureIds, features }: UseRunningFeaturesOptions) {
  const hasRunningFeatures = useCallback(
    (worktree: WorktreeInfo) => {
      if (runningFeatureIds.length === 0) return false;

      return runningFeatureIds.some((featureId) => {
        const feature = features.find((f) => f.id === featureId);
        if (!feature) return false;

        // Match by branchName only (worktreePath is no longer stored)
        if (feature.branchName) {
          // Check if branch names match - this handles both main worktree (any primary branch name)
          // and feature worktrees
          return worktree.branch === feature.branchName;
        }

        // No branch assigned - belongs to main worktree
        return worktree.isMain;
      });
    },
    [runningFeatureIds, features]
  );

  return {
    hasRunningFeatures,
  };
}
