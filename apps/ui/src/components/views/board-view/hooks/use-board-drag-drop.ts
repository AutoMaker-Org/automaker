import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Feature } from '@/store/app-store';
import { useAppStore } from '@/store/app-store';
import { useAutoMode } from '@/hooks/use-auto-mode';
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
  currentProject: _currentProject,
  runningAutoTasks,
  persistFeatureUpdate,
  handleStartImplementation,
}: UseBoardDragDropProps) {
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const [pendingDependencyLink, setPendingDependencyLink] = useState<PendingDependencyLink | null>(
    null
  );
  // IMPORTANT: Use individual selectors instead of bare useAppStore() to prevent
  // subscribing to the entire store. Bare useAppStore() causes the host component
  // (BoardView) to re-render on EVERY store change, which cascades through effects
  // and triggers React error #185 (maximum update depth exceeded).
  const moveFeature = useAppStore((s) => s.moveFeature);
  const updateFeature = useAppStore((s) => s.updateFeature);
  const autoMode = useAutoMode();

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

          // Don't allow linking completed features (they're already done)
          if (draggedFeature.status === 'completed' || targetFeature.status === 'completed') {
            toast.error('Cannot link features', {
              description: 'Completed features cannot be linked.',
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

          // For main worktree, set branchName to undefined to indicate it should use main
          // For other worktrees, set branchName to the target branch
          const newBranchName: string | undefined = worktreeData.isMain ? undefined : targetBranch;

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

      // Determine if dragging is allowed based on status
      // Running in_progress features CAN be dragged to backlog (stops the agent)
      // but cannot be dragged to other columns

      let targetStatus: ColumnId | null = null;

      // Normalize the over ID: strip 'column-header-' prefix if the card was dropped
      // directly onto the column header droppable zone (e.g. 'column-header-backlog' → 'backlog')
      const effectiveOverId = overId.startsWith('column-header-')
        ? overId.replace('column-header-', '')
        : overId;

      // Check if we dropped on a column
      const column = COLUMNS.find((c) => c.id === effectiveOverId);
      if (column) {
        targetStatus = column.id;
      } else if (effectiveOverId.startsWith('pipeline_')) {
        // Pipeline step column (not in static COLUMNS list)
        targetStatus = effectiveOverId as ColumnId;
      } else {
        // Dropped on another feature - find its column
        const overFeature = features.find((f) => f.id === effectiveOverId);
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
          // If the feature is currently running, stop it first
          if (isRunningTask) {
            try {
              await autoMode.stopFeature(featureId);
              logger.info('Stopped running feature via drag to backlog:', featureId);
            } catch (error) {
              logger.error('Error stopping feature during drag to backlog:', error);
              toast.error('Failed to stop agent', {
                description: 'The feature will still be moved to backlog.',
              });
            }
          }
          moveFeature(featureId, 'backlog');
          persistFeatureUpdate(featureId, { status: 'backlog' });
          toast.info(
            isRunningTask
              ? 'Agent stopped and feature moved to backlog'
              : 'Feature moved to backlog',
            {
              description: `Moved to Backlog: ${draggedFeature.description.slice(
                0,
                50
              )}${draggedFeature.description.length > 50 ? '...' : ''}`,
            }
          );
        } else if (isRunningTask) {
          // Running features can only be dragged to backlog, not other columns
          logger.debug('Cannot drag running feature to', targetStatus);
          toast.error('Cannot move running feature', {
            description: 'Stop the agent first or drag to Backlog to stop and move.',
          });
          return;
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
      autoMode,
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
