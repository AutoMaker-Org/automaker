import { useState, useCallback } from 'react';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { BeadsIssue } from '@automaker/types';
import type { BeadsColumnId } from '../constants';

interface UseBeadsDragDropProps {
  issues: BeadsIssue[];
  handleStatusChange: (
    issueId: string,
    newStatus: 'open' | 'in_progress' | 'closed'
  ) => Promise<boolean>;
}

/**
 * Provides drag-and-drop handlers and the currently active issue for managing bead issue status changes.
 *
 * @param issues - The list of bead issues available on the board.
 * @param handleStatusChange - Callback invoked with `(issueId, newStatus)` to persist a status update for an issue.
 * @returns An object containing:
 *  - `activeIssue`: the issue currently being dragged, or `null` when none is active
 *  - `handleDragStart`: handler to call when a drag starts (sets `activeIssue`)
 *  - `handleDragEnd`: handler to call when a drag ends (determines target column/status and invokes `handleStatusChange` if the status should change)
 */
export function useBeadsDragDrop({ issues, handleStatusChange }: UseBeadsDragDropProps) {
  const [activeIssue, setActiveIssue] = useState<BeadsIssue | null>(null);

  // Map column IDs to Beads statuses
  const columnToStatus: Record<BeadsColumnId, 'open' | 'in_progress' | 'closed'> = {
    backlog: 'open',
    ready: 'open',
    in_progress: 'in_progress',
    blocked: 'open',
    done: 'closed',
  };

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const issue = issues.find((i) => i.id === active.id);
      if (issue) {
        setActiveIssue(issue);
      }
    },
    [issues]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveIssue(null);

      if (!over) return;

      const issueId = active.id as string;
      const overId = over.id as string;

      // Find the issue being dragged
      const draggedIssue = issues.find((i) => i.id === issueId);
      if (!draggedIssue) return;

      let targetColumn: BeadsColumnId | null = null;

      // Check if we dropped on a column
      const columnIds: BeadsColumnId[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];
      if (columnIds.includes(overId as BeadsColumnId)) {
        targetColumn = overId as BeadsColumnId;
      } else {
        // Dropped on another issue - find its column
        const overIssue = issues.find((i) => i.id === overId);
        if (overIssue) {
          // Determine which column the over issue is in
          const blockers = overIssue.dependencies?.some(
            (dep) =>
              dep.type === 'blocks' &&
              issues.find(
                (i) => i.id === dep.issueId && (i.status === 'open' || i.status === 'in_progress')
              )
          );

          if (overIssue.status === 'closed') {
            targetColumn = 'done';
          } else if (overIssue.status === 'in_progress') {
            targetColumn = 'in_progress';
          } else if (blockers) {
            targetColumn = 'blocked';
          } else if (overIssue.status === 'open') {
            targetColumn = 'ready';
          } else {
            targetColumn = 'backlog';
          }
        }
      }

      if (!targetColumn) return;

      // Map column to status
      const newStatus = columnToStatus[targetColumn];

      // Check if status is actually changing
      if (newStatus === draggedIssue.status) return;

      // Update the issue status
      await handleStatusChange(issueId, newStatus);
    },
    [issues, handleStatusChange]
  );

  return {
    activeIssue,
    handleDragStart,
    handleDragEnd,
  };
}
