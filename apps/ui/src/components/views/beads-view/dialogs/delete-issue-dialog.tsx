import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { BeadsIssue } from '@automaker/types';

interface DeleteIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: BeadsIssue | null;
  blockingCount: number;
  onDelete: () => Promise<boolean>;
  isDeleting?: boolean;
}

/**
 * Render a confirmation dialog for deleting a Beads issue.
 *
 * Shows the issue's title and ID, an optional warning when the issue blocks others,
 * and actions to cancel or confirm deletion.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked with the new open state
 * @param issue - The issue to delete; when null nothing is shown in the dialog body
 * @param blockingCount - Number of other issues blocked by this issue; used to show a warning when > 0
 * @param onDelete - Async handler invoked when the user confirms deletion
 * @param isDeleting - When true, disables actions and shows a "Deleting..." label on the confirm button
 * @returns The dialog element for confirming and performing issue deletion
 */
export function DeleteIssueDialog({
  open,
  onOpenChange,
  issue,
  blockingCount,
  onDelete,
  isDeleting = false,
}: DeleteIssueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Issue
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this issue? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {issue && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium">Title:</span> {issue.title}
              </div>
              <div className="text-sm">
                <span className="font-medium">ID:</span> {issue.id}
              </div>
              {blockingCount > 0 && (
                <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-md">
                  <p className="text-sm text-orange-700 dark:text-orange-400">
                    <strong>Warning:</strong> This issue blocks {blockingCount} other{' '}
                    {blockingCount === 1 ? 'issue' : 'issues'}. Deleting it may affect their
                    dependency tracking.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
