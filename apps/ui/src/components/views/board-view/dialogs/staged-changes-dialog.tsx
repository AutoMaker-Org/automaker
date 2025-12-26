import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { GitMerge, GitCommit, Loader2, ExternalLink, XCircle, FileCode } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { Feature } from '@/store/app-store';

interface StagedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  suggestedMessage: string;
  diffSummary: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  projectPath: string;
  onCommitted: () => void;
  onAbort: () => void;
}

export function StagedChangesDialog({
  open,
  onOpenChange,
  feature,
  suggestedMessage,
  diffSummary,
  filesChanged,
  insertions,
  deletions,
  projectPath,
  onCommitted,
  onAbort,
}: StagedChangesDialogProps) {
  const [commitMessage, setCommitMessage] = useState(suggestedMessage);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update commit message when suggestedMessage changes
  useEffect(() => {
    setCommitMessage(suggestedMessage);
  }, [suggestedMessage]);

  const handleCommit = async () => {
    if (!feature || !commitMessage.trim()) return;

    setIsCommitting(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.commit) {
        setError('Commit API not available');
        return;
      }

      // Commit in the main project path (changes are already staged there)
      const result = await api.worktree.commit(projectPath, commitMessage);

      if (result.success && result.result?.committed) {
        toast.success('Changes committed successfully', {
          description: `Commit ${result.result.commitHash} on ${result.result.branch}`,
        });
        onCommitted();
        onOpenChange(false);
      } else if (result.success && !result.result?.committed) {
        toast.info('No changes to commit', {
          description: result.result?.message || 'All changes may have been unstaged',
        });
      } else {
        setError(result.error || 'Failed to commit changes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleAbort = async () => {
    setIsAborting(true);
    setError(null);

    try {
      // The abort is handled by calling git merge --abort in the parent
      onAbort();
      toast.info('Merge aborted', {
        description: 'Staged changes have been discarded',
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abort');
    } finally {
      setIsAborting(false);
    }
  };

  const handleOpenInEditor = async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.openInEditor) {
        toast.error('Editor API not available');
        return;
      }

      const result = await api.worktree.openInEditor(projectPath);
      if (result.success) {
        toast.success('Opened in editor', {
          description: result.result?.message || 'Review the staged changes',
        });
      } else {
        toast.error('Failed to open in editor', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error('Failed to open in editor');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !isCommitting && commitMessage.trim()) {
      handleCommit();
    }
  };

  if (!feature) return null;

  const isLoading = isCommitting || isAborting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-500" />
            Changes Staged Successfully
          </DialogTitle>
          <DialogDescription>
            Changes from{' '}
            <code className="font-mono bg-muted px-1 rounded">feature/{feature.id}</code> have been
            staged. Review and commit when ready.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Diff Summary */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileCode className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Changes Summary</span>
            </div>
            <div className="font-mono text-sm text-muted-foreground">
              <span className="text-foreground">{filesChanged}</span> file
              {filesChanged !== 1 ? 's' : ''} changed
              {insertions > 0 && (
                <>
                  , <span className="text-green-500">+{insertions}</span>
                </>
              )}
              {deletions > 0 && (
                <>
                  , <span className="text-red-500">-{deletions}</span>
                </>
              )}
            </div>
            {diffSummary && diffSummary !== 'No changes staged' && (
              <p className="text-xs text-muted-foreground mt-1">{diffSummary}</p>
            )}
          </div>

          {/* Commit Message */}
          <div className="grid gap-2">
            <Label htmlFor="commit-message">Commit Message</Label>
            <Textarea
              id="commit-message"
              placeholder="Describe your changes..."
              value={commitMessage}
              onChange={(e) => {
                setCommitMessage(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="min-h-[100px] font-mono text-sm"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Cmd+Enter</kbd> to commit
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleAbort}
            disabled={isLoading}
            className="sm:mr-auto"
          >
            {isAborting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Aborting...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Merge
              </>
            )}
          </Button>

          <Button variant="secondary" onClick={handleOpenInEditor} disabled={isLoading}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Review in Editor
          </Button>

          <Button onClick={handleCommit} disabled={isLoading || !commitMessage.trim()}>
            {isCommitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="w-4 h-4 mr-2" />
                Commit Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
