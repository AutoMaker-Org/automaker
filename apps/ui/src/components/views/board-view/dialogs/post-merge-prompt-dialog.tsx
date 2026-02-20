/**
 * Post-Merge Prompt Dialog
 *
 * Shown after a pull or stash apply results in a clean merge (no conflicts).
 * Presents the user with two options:
 * 1. Commit the merge — automatically stage all merge-result files and open commit dialog
 * 2. Merge manually — leave the working tree as-is for manual review
 *
 * The user's choice can be persisted as a preference to avoid repeated prompts.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GitMerge, GitCommitHorizontal, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MergePostAction = 'commit' | 'manual' | null;

interface PostMergePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Branch name where the merge happened */
  branchName: string;
  /** Number of files affected by the merge */
  mergeFileCount: number;
  /** List of files affected by the merge */
  mergeAffectedFiles?: string[];
  /** Called when the user chooses to commit the merge */
  onCommitMerge: () => void;
  /** Called when the user chooses to handle the merge manually */
  onMergeManually: () => void;
  /** Current saved preference (null = ask every time) */
  savedPreference?: MergePostAction;
  /** Called when the user changes the preference */
  onSavePreference?: (preference: MergePostAction) => void;
}

export function PostMergePromptDialog({
  open,
  onOpenChange,
  branchName,
  mergeFileCount,
  mergeAffectedFiles,
  onCommitMerge,
  onMergeManually,
  savedPreference,
  onSavePreference,
}: PostMergePromptDialogProps) {
  const [rememberChoice, setRememberChoice] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Reset transient state each time the dialog is opened
  useEffect(() => {
    if (open) {
      setRememberChoice(false);
      setShowFiles(false);
    }
  }, [open]);

  const handleCommitMerge = useCallback(() => {
    if (rememberChoice && onSavePreference) {
      onSavePreference('commit');
    }
    onCommitMerge();
    onOpenChange(false);
  }, [rememberChoice, onSavePreference, onCommitMerge, onOpenChange]);

  const handleMergeManually = useCallback(() => {
    if (rememberChoice && onSavePreference) {
      onSavePreference('manual');
    }
    onMergeManually();
    onOpenChange(false);
  }, [rememberChoice, onSavePreference, onMergeManually, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] w-full max-w-full sm:rounded-xl rounded-none dialog-fullscreen-mobile">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-500" />
            Merge Complete
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <span className="block">
                A merge was successfully completed on{' '}
                <code className="font-mono bg-muted px-1 rounded">{branchName}</code>
                {mergeFileCount > 0 && (
                  <span>
                    {' '}
                    affecting {mergeFileCount} file{mergeFileCount !== 1 ? 's' : ''}
                  </span>
                )}
                . How would you like to proceed?
              </span>

              {mergeAffectedFiles && mergeAffectedFiles.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowFiles(!showFiles)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    {showFiles ? 'Hide' : 'Show'} affected files ({mergeAffectedFiles.length})
                  </button>
                  {showFiles && (
                    <div className="mt-1.5 border border-border rounded-lg overflow-hidden max-h-[150px] overflow-y-auto scrollbar-visible">
                      {mergeAffectedFiles.map((file) => (
                        <div
                          key={file}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border last:border-b-0 hover:bg-accent/30"
                        >
                          <GitMerge className="w-3 h-3 text-purple-500 flex-shrink-0" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground font-medium mb-2">
                  Choose how to proceed:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>
                    <strong>Commit Merge</strong> &mdash; Stage all merge files and open the commit
                    dialog with a pre-populated merge commit message
                  </li>
                  <li>
                    <strong>Review Manually</strong> &mdash; Leave the working tree as-is so you can
                    review changes and commit at your own pace
                  </li>
                </ul>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Remember choice option */}
        {onSavePreference && (
          <div className="flex items-center gap-2 px-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={rememberChoice}
                onCheckedChange={(checked) => setRememberChoice(checked)}
                className="rounded border-border"
              />
              <Settings className="w-3 h-3" />
              Remember my choice for future merges
            </label>
            {savedPreference && (
              <button
                onClick={() => onSavePreference(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                Reset preference
              </button>
            )}
          </div>
        )}

        <DialogFooter className={cn('flex-col sm:flex-row gap-2')}>
          <Button variant="outline" onClick={handleMergeManually} className="w-full sm:w-auto">
            <FileText className="w-4 h-4 mr-2" />
            Review Manually
          </Button>
          <Button
            onClick={handleCommitMerge}
            className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
          >
            <GitCommitHorizontal className="w-4 h-4 mr-2" />
            Commit Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
