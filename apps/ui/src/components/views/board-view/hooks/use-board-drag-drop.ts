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
      //
      // Board flow: Backlog → Ready → Assigned → In Progress → [Pipeline] → In Review → Waiting Approval → Verified → Done
      // "Blocked" can be reached from any status (and returned from)

      const truncDesc = (desc: string) => `${desc.slice(0, 50)}${desc.length > 50 ? '...' : ''}`;

      // Helper to move feature with toast
      const doMove = (
        status: typeof targetStatus,
        label: string,
        variant: 'info' | 'success' = 'info'
      ) => {
        moveFeature(featureId, status);
        persistFeatureUpdate(featureId, { status, justFinishedAt: undefined });
        if (variant === 'success') {
          toast.success(`Feature ${label}`, { description: truncDesc(draggedFeature.description) });
        } else {
          toast.info(`Feature moved to ${label}`, {
            description: truncDesc(draggedFeature.description),
          });
        }
      };

      if (
        targetStatus === 'in_progress' &&
        (draggedFeature.status === 'backlog' ||
          draggedFeature.status === 'ready' ||
          draggedFeature.status === 'assigned')
      ) {
        // Starting implementation from backlog/ready/assigned
        await handleStartImplementation(draggedFeature);
      } else if (targetStatus === 'blocked') {
        // Any status can move to blocked
        doMove('blocked', 'Blocked');
      } else if (draggedFeature.status === 'blocked') {
        // From blocked, allow moving to any column
        if (targetStatus === 'in_progress') {
          await handleStartImplementation(draggedFeature);
        } else {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        }
      } else if (draggedFeature.status === 'backlog') {
        // Backlog can move to ready, assigned, or any earlier column
        doMove(targetStatus, targetStatus.replace(/_/g, ' '));
      } else if (draggedFeature.status === 'ready') {
        // Ready can move to assigned, backlog, or in_progress
        doMove(targetStatus, targetStatus.replace(/_/g, ' '));
      } else if (draggedFeature.status === 'assigned') {
        // Assigned can move back to ready/backlog
        doMove(targetStatus, targetStatus.replace(/_/g, ' '));
      } else if (draggedFeature.status === 'in_progress') {
        if (targetStatus === 'backlog' || targetStatus === 'ready') {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        } else if (targetStatus === 'in_review') {
          doMove('in_review', 'In Review');
        } else if (targetStatus === 'verified' && draggedFeature.skipTests) {
          doMove('verified', 'verified', 'success');
        }
      } else if (draggedFeature.status === 'in_review') {
        // From in_review: can go to waiting_approval, verified, or back
        if (targetStatus === 'waiting_approval') {
          doMove('waiting_approval', 'Waiting Approval');
        } else if (targetStatus === 'verified') {
          doMove('verified', 'verified', 'success');
        } else if (targetStatus === 'backlog' || targetStatus === 'in_progress') {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        }
      } else if (draggedFeature.status === 'waiting_approval') {
        if (targetStatus === 'verified') {
          doMove('verified', 'verified', 'success');
        } else if (targetStatus === 'backlog' || targetStatus === 'in_review') {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        }
      } else if (draggedFeature.status === 'verified') {
        if (targetStatus === 'done') {
          doMove('done', 'Done', 'success');
        } else if (targetStatus === 'waiting_approval' || targetStatus === 'backlog') {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        }
      } else if (draggedFeature.status === 'done') {
        // Done can be moved back to verified or backlog if needed
        if (targetStatus === 'verified' || targetStatus === 'backlog') {
          doMove(targetStatus, targetStatus.replace(/_/g, ' '));
        }
      } else {
        // Generic fallback for any other status combination
        moveFeature(featureId, targetStatus);
        persistFeatureUpdate(featureId, { status: targetStatus });
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
