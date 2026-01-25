import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Feature } from '@/store/app-store';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { COLUMNS, ColumnId } from '../constants';

const logger = createLogger('BoardDragDrop');

export interface PendingDependencyLink {
  draggedFeature: Feature;
  targetFeature: Feature;
}

interface UseBoardDragDropProps {
  features: Feature[];
  currentProject: { path: string; id: string } | null;
  runningAutoTasks: string[];
  persistFeatureUpdate: (featureId: string, updates: Partial<Feature>) => Promise<void>;
  handleStartImplementation: (feature: Feature) => Promise<boolean>;
}

export function useBoardDragDrop({
  features,
  currentProject,
  runningAutoTasks,
  persistFeatureUpdate,
  handleStartImplementation,
}: UseBoardDragDropProps) {
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const [pendingDependencyLink, setPendingDependencyLink] = useState<PendingDependencyLink | null>(
    null
  );
  const { moveFeature, updateFeature } = useAppStore();

  // Note: getOrCreateWorktreeForFeature removed - worktrees are now created server-side
  // at execution time based on feature.branchName

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const feature = features.find((f) => f.id === active.id);
      if (feature) {
        setActiveFeature(feature);
      }
    },
    [features]
  );

  // Clear pending dependency link
  const clearPendingDependencyLink = useCallback(() => {
    setPendingDependencyLink(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveFeature(null);

      if (!over) return;

      const featureId = active.id as string;
      const overId = over.id as string;

      // Find the feature being dragged
      const draggedFeature = features.find((f) => f.id === featureId);
      if (!draggedFeature) return;

      // Check if this is a running task (non-skipTests, TDD)
      const isRunningTask = runningAutoTasks.includes(featureId);

      // Check if dropped on another card (for creating dependency links)
      if (overId.startsWith('card-drop-')) {
        const cardData = over.data.current as {
          type: string;
          featureId: string;
        };

        if (cardData?.type === 'card') {
          const targetFeatureId = cardData.featureId;

          // Don't link to self
          if (targetFeatureId === featureId) {
            return;
          }

          const targetFeature = features.find((f) => f.id === targetFeatureId);
          if (!targetFeature) return;

          // Only allow linking backlog features (both must be in backlog)
          if (draggedFeature.status !== 'backlog' || targetFeature.status !== 'backlog') {
            toast.error('Cannot link features', {
              description: 'Both features must be in the backlog to create a dependency link.',
            });
            return;
          }

          // Set pending dependency link to trigger dialog
          setPendingDependencyLink({
            draggedFeature,
            targetFeature,
          });
          return;
        }
      }

      // Check if dropped on a worktree tab
      if (overId.startsWith('worktree-drop-')) {
        // Handle dropping on a worktree - change the feature's branchName
        const worktreeData = over.data.current as {
          type: string;
          branch: string;
          path: string;
          isMain: boolean;
        };

        if (worktreeData?.type === 'worktree') {
          // Don't allow moving running tasks to a different worktree
          if (isRunningTask) {
            logger.debug('Cannot move running feature to different worktree');
            toast.error('Cannot move feature', {
              description: 'This feature is currently running and cannot be moved.',
            });
            return;
          }

          const targetBranch = worktreeData.branch;
          const currentBranch = draggedFeature.branchName;

          // For main worktree, set branchName to null to indicate it should use main
          // (must use null not undefined so it serializes to JSON for the API call)
          // For other worktrees, set branchName to the target branch
          const newBranchName = worktreeData.isMain ? null : targetBranch;

          // If already on the same branch, nothing to do
          // For main worktree: feature with null/undefined branchName is already on main
          // For other worktrees: compare branch names directly
          const isAlreadyOnTarget = worktreeData.isMain
            ? !currentBranch // null or undefined means already on main
            : currentBranch === targetBranch;

          if (isAlreadyOnTarget) {
            return;
          }

          // Update feature's branchName
          updateFeature(featureId, { branchName: newBranchName });
          await persistFeatureUpdate(featureId, { branchName: newBranchName });

          const branchDisplay = worktreeData.isMain ? targetBranch : targetBranch;
          toast.success('Feature moved to branch', {
            description: `Moved to ${branchDisplay}: ${draggedFeature.description.slice(0, 40)}${draggedFeature.description.length > 40 ? '...' : ''}`,
          });
          return;
        }
      }

      // Determine if dragging is allowed based on status and skipTests
      // - Backlog items can always be dragged
      // - waiting_approval items can always be dragged (to allow manual verification via drag)
      // - verified items can always be dragged (to allow moving back to waiting_approval)
      // - in_progress items can be dragged (but not if they're currently running)
      // - Non-skipTests (TDD) items that are in progress cannot be dragged if they are running
      if (draggedFeature.status === 'in_progress') {
        // Only allow dragging in_progress if it's not currently running
        if (isRunningTask) {
          logger.debug('Cannot drag feature - currently running');
          return;
        }
      }

      let targetStatus: ColumnId | null = null;

      // Check if we dropped on a column
      const column = COLUMNS.find((c) => c.id === overId);
      if (column) {
        targetStatus = column.id;
      } else {
        // Dropped on another feature - find its column
        const overFeature = features.find((f) => f.id === overId);
        if (overFeature) {
          targetStatus = overFeature.status;
        }
      }

      if (!targetStatus) return;

      // Same column, nothing to do
      if (targetStatus === draggedFeature.status) return;

      // Handle different drag scenarios
      // Note: Worktrees are created server-side at execution time based on feature.branchName
      if (draggedFeature.status === 'backlog') {
        // From backlog
        if (targetStatus === 'in_progress') {
          // Use helper function to handle concurrency check and start implementation
          // Server will derive workDir from feature.branchName
          await handleStartImplementation(draggedFeature);
        } else {
          moveFeature(featureId, targetStatus);
          persistFeatureUpdate(featureId, { status: targetStatus });
        }
      } else if (draggedFeature.status === 'waiting_approval') {
        // waiting_approval features can be dragged to verified for manual verification
        // NOTE: This check must come BEFORE skipTests check because waiting_approval
        // features often have skipTests=true, and we want status-based handling first
        if (targetStatus === 'verified') {
          moveFeature(featureId, 'verified');
          // Clear justFinishedAt timestamp when manually verifying via drag
          persistFeatureUpdate(featureId, {
            status: 'verified',
            justFinishedAt: undefined,
          });
          toast.success('Feature verified', {
            description: `Manually verified: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        } else if (targetStatus === 'backlog') {
          // Allow moving waiting_approval cards back to backlog
          moveFeature(featureId, 'backlog');
          // Clear justFinishedAt timestamp when moving back to backlog
          persistFeatureUpdate(featureId, {
            status: 'backlog',
            justFinishedAt: undefined,
          });
          toast.info('Feature moved to backlog', {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        }
      } else if (draggedFeature.status === 'in_progress') {
        // Handle in_progress features being moved
        if (targetStatus === 'backlog') {
          // Allow moving in_progress cards back to backlog
          moveFeature(featureId, 'backlog');
          persistFeatureUpdate(featureId, { status: 'backlog' });
          toast.info('Feature moved to backlog', {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        } else if (targetStatus === 'verified' && draggedFeature.skipTests) {
          // Manual verify via drag (only for skipTests features)
          moveFeature(featureId, 'verified');
          persistFeatureUpdate(featureId, { status: 'verified' });
          toast.success('Feature verified', {
            description: `Marked as verified: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        }
      } else if (draggedFeature.skipTests) {
        // skipTests feature being moved between verified and waiting_approval
        if (targetStatus === 'waiting_approval' && draggedFeature.status === 'verified') {
          // Move verified feature back to waiting_approval
          moveFeature(featureId, 'waiting_approval');
          persistFeatureUpdate(featureId, { status: 'waiting_approval' });
          toast.info('Feature moved back', {
            description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        } else if (targetStatus === 'backlog') {
          // Allow moving skipTests cards back to backlog (from verified)
          moveFeature(featureId, 'backlog');
          persistFeatureUpdate(featureId, { status: 'backlog' });
          toast.info('Feature moved to backlog', {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        }
      } else if (draggedFeature.status === 'verified') {
        // Handle verified TDD (non-skipTests) features being moved back
        if (targetStatus === 'waiting_approval') {
          // Move verified feature back to waiting_approval
          moveFeature(featureId, 'waiting_approval');
          persistFeatureUpdate(featureId, { status: 'waiting_approval' });
          toast.info('Feature moved back', {
            description: `Moved back to Waiting Approval: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        } else if (targetStatus === 'backlog') {
          // Allow moving verified cards back to backlog
          moveFeature(featureId, 'backlog');
          persistFeatureUpdate(featureId, { status: 'backlog' });
          toast.info('Feature moved to backlog', {
            description: `Moved to Backlog: ${draggedFeature.description.slice(
              0,
              50
            )}${draggedFeature.description.length > 50 ? '...' : ''}`,
          });
        }
      }
    },
    [
      features,
      runningAutoTasks,
      moveFeature,
      updateFeature,
      persistFeatureUpdate,
      handleStartImplementation,
    ]
  );

  return {
    activeFeature,
    handleDragStart,
    handleDragEnd,
    pendingDependencyLink,
    clearPendingDependencyLink,
  };
}
