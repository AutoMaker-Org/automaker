import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type {
  BeadsIssue,
  CreateBeadsIssueInput,
  UpdateBeadsIssueInput,
  BeadsIssueStatus,
} from '@automaker/types';

interface UseBeadsActionsProps {
  currentProject: { path: string } | null;
}

/**
 * Provide handlers to create, update, delete, and change the status of Beads issues for the current project.
 *
 * @param currentProject - The currently selected project (object with `path`) or `null` if none is selected
 * @returns An object exposing four handlers:
 * - `handleCreateIssue`: creates an issue and returns the created `BeadsIssue` if successful, or `null` on failure.
 * - `handleUpdateIssue`: updates an issue and returns `true` on success, or `false` on failure.
 * - `handleDeleteIssue`: deletes an issue and returns `true` on success, or `false` on failure.
 * - `handleStatusChange`: updates only the issue status and returns `true` on success, or `false` on failure.
 */
export function useBeadsActions({ currentProject }: UseBeadsActionsProps) {
  const { addBeadsIssue, updateBeadsIssue, removeBeadsIssue } = useAppStore();

  const handleCreateIssue = useCallback(
    async (input: CreateBeadsIssueInput): Promise<BeadsIssue | null> => {
      if (!currentProject) {
        toast.error('No project selected');
        return null;
      }

      try {
        const api = getElectronAPI();
        if (!api.beads) {
          toast.error('Beads API not available');
          return null;
        }

        const result = await api.beads.create(currentProject.path, input);

        if (result.success && result.issue) {
          addBeadsIssue(currentProject.path, result.issue);
          toast.success('Issue created', {
            description: `Created: ${result.issue.title}`,
          });
          return result.issue;
        } else {
          toast.error('Failed to create issue', {
            description: result.error || 'Unknown error',
          });
          return null;
        }
      } catch (error) {
        console.error('[Beads] Error creating issue:', error);
        toast.error('Failed to create issue', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      }
    },
    [currentProject, addBeadsIssue]
  );

  const handleUpdateIssue = useCallback(
    async (issueId: string, updates: UpdateBeadsIssueInput): Promise<boolean> => {
      if (!currentProject) {
        toast.error('No project selected');
        return false;
      }

      try {
        const api = getElectronAPI();
        if (!api.beads) {
          toast.error('Beads API not available');
          return false;
        }

        const result = await api.beads.update(currentProject.path, issueId, updates);

        if (result.success && result.issue) {
          updateBeadsIssue(currentProject.path, issueId, result.issue);
          toast.success('Issue updated');
          return true;
        } else {
          toast.error('Failed to update issue', {
            description: result.error || 'Unknown error',
          });
          return false;
        }
      } catch (error) {
        console.error('[Beads] Error updating issue:', error);
        toast.error('Failed to update issue', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
      }
    },
    [currentProject, updateBeadsIssue]
  );

  const handleDeleteIssue = useCallback(
    async (issueId: string, issueTitle: string): Promise<boolean> => {
      if (!currentProject) {
        toast.error('No project selected');
        return false;
      }

      try {
        const api = getElectronAPI();
        if (!api.beads) {
          toast.error('Beads API not available');
          return false;
        }

        const result = await api.beads.delete(currentProject.path, issueId);

        if (result.success) {
          removeBeadsIssue(currentProject.path, issueId);
          toast.success('Issue deleted', {
            description: `Deleted: ${issueTitle}`,
          });
          return true;
        } else {
          toast.error('Failed to delete issue', {
            description: result.error || 'Unknown error',
          });
          return false;
        }
      } catch (error) {
        console.error('[Beads] Error deleting issue:', error);
        toast.error('Failed to delete issue', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
      }
    },
    [currentProject, removeBeadsIssue]
  );

  const handleStatusChange = useCallback(
    async (issueId: string, newStatus: BeadsIssueStatus): Promise<boolean> => {
      return handleUpdateIssue(issueId, { status: newStatus });
    },
    [handleUpdateIssue]
  );

  return {
    handleCreateIssue,
    handleUpdateIssue,
    handleDeleteIssue,
    handleStatusChange,
  };
}
