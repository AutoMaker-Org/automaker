import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText } from 'lucide-react';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface ViewWorktreeChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  projectPath: string;
}

export function ViewWorktreeChangesDialog({
  open,
  onOpenChange,
  worktree,
  projectPath,
}: ViewWorktreeChangesDialogProps) {
  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-w-full max-h-full sm:w-[90vw] sm:max-w-[900px] sm:max-h-[100vh] sm:h-auto sm:rounded-xl rounded-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            View Changes
          </DialogTitle>
          <DialogDescription>
            Changes in the{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code> worktree.
            {worktree.changedFilesCount !== undefined && worktree.changedFilesCount > 0 && (
              <span className="ml-1">
                ({worktree.changedFilesCount} file
                {worktree.changedFilesCount > 1 ? 's' : ''} changed)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 sm:min-h-[600px] sm:max-h-[60vh]  overflow-y-auto scrollbar-visible -mx-6 -mb-6">
          <div className="h-full px-6 pb-6">
            <GitDiffPanel
              projectPath={projectPath}
              featureId={worktree.branch}
              useWorktrees={true}
              compact={false}
              className="mt-4"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
