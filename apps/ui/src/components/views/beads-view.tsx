/**
 * Beads View Component
 *
 * Main entry point for the Beads issue tracking system Kanban board.
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useBeadsIssues } from './beads-view/hooks/use-beads-issues';
import { useBeadsColumnIssues } from './beads-view/hooks/use-beads-column-issues';
import { useBeadsActions } from './beads-view/hooks/use-beads-actions';
import { useBeadsDragDrop } from './beads-view/hooks/use-beads-drag-drop';
import { BeadsHeader } from './beads-view/beads-header';
import { BeadsKanbanBoard } from './beads-view/beads-kanban-board';
import { CreateIssueDialog } from './beads-view/dialogs/create-issue-dialog';
import { EditIssueDialog } from './beads-view/dialogs/edit-issue-dialog';
import { DeleteIssueDialog } from './beads-view/dialogs/delete-issue-dialog';
import type { BeadsIssue, CreateBeadsIssueInput } from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

/**
 * Render the Beads Kanban board view for the current project.
 *
 * Wires Beads-related hooks to load and organize issues, manages create/edit/delete dialog
 * state and selected issue, handles status transitions and drag-and-drop, validates Beads
 * initialization before creating issues, and displays loading, error, or no-project states.
 *
 * @returns A React element containing the Beads Kanban board, header, and dialogs.
 */
export function BeadsView() {
  const { currentProject } = useAppStore();

  // Search state - must be declared before using in hooks
  const [searchQuery, setSearchQuery] = useState('');

  // Custom hooks
  const { issues, isLoading, error } = useBeadsIssues({ currentProject });
  const { columnIssuesMap, stats } = useBeadsColumnIssues({
    issues,
    searchQuery,
  });
  const { handleCreateIssue, handleUpdateIssue, handleDeleteIssue, handleStatusChange } =
    useBeadsActions({
      currentProject,
    });
  const { activeIssue, handleDragStart, handleDragEnd } = useBeadsDragDrop({
    issues,
    handleStatusChange,
  });

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<BeadsIssue | null>(null);

  // Helper to get blocking counts for an issue
  const getBlockingCounts = useCallback(
    (issue: BeadsIssue) => {
      const blockingCount = issues.filter((otherIssue) =>
        otherIssue.dependencies?.some((dep) => dep.issueId === issue.id && dep.type === 'blocks')
      ).length;

      const blockedCount =
        issue.dependencies?.filter((dep) => {
          const depIssue = issues.find((i) => i.id === dep.issueId);
          return (
            dep.type === 'blocks' &&
            depIssue &&
            (depIssue.status === 'open' || depIssue.status === 'in_progress')
          );
        }).length || 0;

      return { blockingCount, blockedCount };
    },
    [issues]
  );

  // Handle edit issue
  const handleEditIssue = useCallback((issue: BeadsIssue) => {
    setSelectedIssue(issue);
    setShowEditDialog(true);
  }, []);

  // Handle delete issue
  const handleDeleteIssueClick = useCallback((issue: BeadsIssue) => {
    setSelectedIssue(issue);
    setShowDeleteDialog(true);
  }, []);

  // Handle confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!selectedIssue || !currentProject) return false;

    const success = await handleDeleteIssue(selectedIssue.id, selectedIssue.title);

    if (success) {
      setShowDeleteDialog(false);
      setSelectedIssue(null);
    }

    return success;
  }, [selectedIssue, currentProject, handleDeleteIssue]);

  // Handle start issue
  const handleStartIssue = useCallback(
    async (issue: BeadsIssue) => {
      const success = await handleStatusChange(issue.id, 'in_progress');
      if (success) {
        toast.success('Issue started', {
          description: `Moved to In Progress: ${issue.title}`,
        });
      }
    },
    [handleStatusChange]
  );

  // Handle close issue
  const handleCloseIssue = useCallback(
    async (issue: BeadsIssue) => {
      const success = await handleStatusChange(issue.id, 'closed');
      if (success) {
        toast.success('Issue closed', {
          description: `Closed: ${issue.title}`,
        });
      }
    },
    [handleStatusChange]
  );

  // Validate beads is initialized
  const validateBeads = useCallback(async () => {
    if (!currentProject) return false;

    try {
      const api = getElectronAPI();
      if (!api.beads) return false;

      const validation = await api.beads.validate(currentProject.path);
      return validation.success && validation.initialized;
    } catch {
      return false;
    }
  }, [currentProject]);

  // Handle create issue
  const handleCreateClick = useCallback(async () => {
    const isValid = await validateBeads();
    if (!isValid) {
      toast.error('Beads not initialized', {
        description: 'Please initialize Beads in this project first by running "bd init"',
      });
      return;
    }
    setShowCreateDialog(true);
  }, [validateBeads]);

  // Handle create issue from dialog
  const handleCreateFromDialog = useCallback(
    async (input: CreateBeadsIssueInput) => {
      const result = await handleCreateIssue(input);
      return result !== null;
    },
    [handleCreateIssue]
  );

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading issues...</p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading issues</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // Show no project selected state
  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a project to use Beads</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <BeadsHeader
        projectName={currentProject.name}
        stats={stats}
        onAddIssue={handleCreateClick}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Kanban Board */}
      <BeadsKanbanBoard
        issues={issues}
        columnIssuesMap={columnIssuesMap}
        activeIssue={activeIssue}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        onEditIssue={handleEditIssue}
        onDeleteIssue={handleDeleteIssueClick}
        onStartIssue={handleStartIssue}
        onCloseIssue={handleCloseIssue}
      />

      {/* Dialogs */}
      <CreateIssueDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreateFromDialog}
      />

      <EditIssueDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        issue={selectedIssue}
        onUpdate={async (id, updates) => {
          const success = await handleUpdateIssue(id, updates);
          if (success) {
            setShowEditDialog(false);
            setSelectedIssue(null);
          }
          return success;
        }}
      />

      <DeleteIssueDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        issue={selectedIssue}
        blockingCount={selectedIssue ? getBlockingCounts(selectedIssue).blockingCount : 0}
        onDelete={handleConfirmDelete}
      />
    </div>
  );
}
