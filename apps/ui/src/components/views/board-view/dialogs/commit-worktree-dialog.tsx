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
import { GitCommit, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface CommitWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onCommitted: () => void;
}

export function CommitWorktreeDialog({
  open,
  onOpenChange,
  worktree,
  onCommitted,
}: CommitWorktreeDialogProps) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enableAiCommitMessages = useAppStore((state) => state.enableAiCommitMessages);

  const handleCommit = async () => {
    if (!worktree || !message.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.commit) {
        setError('Worktree API not available');
        return;
      }
      const result = await api.worktree.commit(worktree.path, message);

      if (result.success && result.result) {
        if (result.result.committed) {
          toast.success('Changes committed', {
            description: `Commit ${result.result.commitHash} on ${result.result.branch}`,
          });
          onCommitted();
          onOpenChange(false);
          setMessage('');
        } else {
          toast.info('No changes to commit', {
            description: result.result.message,
          });
        }
      } else {
        setError(result.error || 'Failed to commit changes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent commit while loading or while AI is generating a message
    if (e.key === 'Enter' && e.metaKey && !isLoading && !isGenerating && message.trim()) {
      handleCommit();
    }
  };

  // Generate AI commit message when dialog opens (if enabled)
  useEffect(() => {
    if (open && worktree) {
      // Reset state
      setMessage('');
      setError(null);

      // Only generate AI commit message if enabled
      if (!enableAiCommitMessages) {
        return;
      }

      setIsGenerating(true);
      let cancelled = false;

      const generateMessage = async () => {
        try {
          const api = getElectronAPI();
          if (!api?.worktree?.generateCommitMessage) {
            if (!cancelled) {
              setIsGenerating(false);
            }
            return;
          }

          const result = await api.worktree.generateCommitMessage(worktree.path);

          if (cancelled) return;

          if (result.success && result.message) {
            setMessage(result.message);
          } else {
            // Don't show error toast, just log it and leave message empty
            console.warn('Failed to generate commit message:', result.error);
            setMessage('');
          }
        } catch (err) {
          if (cancelled) return;
          // Don't show error toast for generation failures
          console.warn('Error generating commit message:', err);
          setMessage('');
        } finally {
          if (!cancelled) {
            setIsGenerating(false);
          }
        }
      };

      generateMessage();

      return () => {
        cancelled = true;
      };
    }
  }, [open, worktree, enableAiCommitMessages]);

  if (!worktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Commit Changes
          </DialogTitle>
          <DialogDescription>
            Commit changes in the{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code> worktree.
            {worktree.changedFilesCount && (
              <span className="ml-1">
                ({worktree.changedFilesCount} file
                {worktree.changedFilesCount > 1 ? 's' : ''} changed)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="commit-message" className="flex items-center gap-2">
              Commit Message
              {isGenerating && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  Generating...
                </span>
              )}
            </Label>
            <Textarea
              id="commit-message"
              placeholder={
                isGenerating ? 'Generating commit message...' : 'Describe your changes...'
              }
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="min-h-[100px] font-mono text-sm"
              autoFocus
              disabled={isGenerating}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Cmd+Enter</kbd> to commit
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading || isGenerating}
          >
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={isLoading || isGenerating || !message.trim()}>
            {isLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="w-4 h-4 mr-2" />
                Commit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
