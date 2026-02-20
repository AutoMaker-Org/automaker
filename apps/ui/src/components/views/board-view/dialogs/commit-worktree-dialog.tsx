import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GitCommit,
  Sparkles,
  FilePlus,
  FileX,
  FilePen,
  FileText,
  File,
  ChevronDown,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { TruncatedFilePath } from '@/components/ui/truncated-file-path';
import type { FileStatus } from '@/types/electron';
import { parseDiff, type ParsedFileDiff } from '@/lib/diff-utils';

interface RemoteInfo {
  name: string;
  url: string;
}

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

const getFileIcon = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return <FilePlus className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
    case 'D':
      return <FileX className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
    case 'M':
    case 'U':
      return <FilePen className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    case 'R':
    case 'C':
      return <File className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'A':
      return 'Added';
    case '?':
      return 'Untracked';
    case 'D':
      return 'Deleted';
    case 'M':
      return 'Modified';
    case 'U':
      return 'Updated';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    default:
      return 'Changed';
  }
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'A':
    case '?':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'D':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'M':
    case 'U':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'R':
    case 'C':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

function DiffLine({
  type,
  content,
  lineNumber,
}: {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  lineNumber?: { old?: number; new?: number };
}) {
  const bgClass = {
    context: 'bg-transparent',
    addition: 'bg-green-500/10',
    deletion: 'bg-red-500/10',
    header: 'bg-blue-500/10',
  };

  const textClass = {
    context: 'text-foreground-secondary',
    addition: 'text-green-400',
    deletion: 'text-red-400',
    header: 'text-blue-400',
  };

  const prefix = {
    context: ' ',
    addition: '+',
    deletion: '-',
    header: '',
  };

  if (type === 'header') {
    return (
      <div className={cn('px-2 py-1 font-mono text-xs', bgClass[type], textClass[type])}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn('flex font-mono text-xs', bgClass[type])}>
      <span className="w-10 flex-shrink-0 text-right pr-1.5 text-muted-foreground select-none border-r border-border-glass text-[10px]">
        {lineNumber?.old ?? ''}
      </span>
      <span className="w-10 flex-shrink-0 text-right pr-1.5 text-muted-foreground select-none border-r border-border-glass text-[10px]">
        {lineNumber?.new ?? ''}
      </span>
      <span className={cn('w-4 flex-shrink-0 text-center select-none', textClass[type])}>
        {prefix[type]}
      </span>
      <span className={cn('flex-1 px-1.5 whitespace-pre-wrap break-all', textClass[type])}>
        {content || '\u00A0'}
      </span>
    </div>
  );
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

  // File selection state
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [diffContent, setDiffContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [isLoadingDiffs, setIsLoadingDiffs] = useState(false);

  // Push after commit state
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [remotesFetched, setRemotesFetched] = useState(false);
  const [remotesFetchError, setRemotesFetchError] = useState<string | null>(null);
  // Track whether the commit already succeeded so retries can skip straight to push
  const [commitSucceeded, setCommitSucceeded] = useState(false);

  // Parse diffs
  const parsedDiffs = useMemo(() => parseDiff(diffContent), [diffContent]);

  // Create a map of file path to parsed diff for quick lookup
  const diffsByFile = useMemo(() => {
    const map = new Map<string, ParsedFileDiff>();
    for (const diff of parsedDiffs) {
      map.set(diff.filePath, diff);
    }
    return map;
  }, [parsedDiffs]);

  // Fetch remotes when push option is enabled
  const fetchRemotesForWorktree = useCallback(
    async (worktreePath: string, signal?: { cancelled: boolean }) => {
      setIsLoadingRemotes(true);
      setRemotesFetchError(null);
      try {
        const api = getElectronAPI();
        if (api?.worktree?.listRemotes) {
          const result = await api.worktree.listRemotes(worktreePath);
          if (signal?.cancelled) return;
          setRemotesFetched(true);
          if (result.success && result.result) {
            const remoteInfos = result.result.remotes.map((r) => ({
              name: r.name,
              url: r.url,
            }));
            setRemotes(remoteInfos);
            // Auto-select 'origin' if available, otherwise first remote
            if (remoteInfos.length > 0) {
              const defaultRemote = remoteInfos.find((r) => r.name === 'origin') || remoteInfos[0];
              setSelectedRemote(defaultRemote.name);
            }
          }
        } else {
          // API not available — mark fetch as complete with an error so the UI
          // shows feedback instead of remaining in an empty/loading state.
          setRemotesFetchError('Remote listing not available');
          setRemotesFetched(true);
          return;
        }
      } catch (err) {
        if (signal?.cancelled) return;
        // Don't mark as successfully fetched — show an error with retry instead
        setRemotesFetchError(err instanceof Error ? err.message : 'Failed to fetch remotes');
        console.warn('Failed to fetch remotes:', err);
      } finally {
        if (!signal?.cancelled) setIsLoadingRemotes(false);
      }
    },
    []
  );

  useEffect(() => {
    if (pushAfterCommit && worktree && !remotesFetched && !remotesFetchError) {
      const signal = { cancelled: false };
      fetchRemotesForWorktree(worktree.path, signal);
      return () => {
        signal.cancelled = true;
      };
    }
  }, [pushAfterCommit, worktree, remotesFetched, remotesFetchError, fetchRemotesForWorktree]);

  // Load diffs when dialog opens
  useEffect(() => {
    if (open && worktree) {
      setIsLoadingDiffs(true);
      setFiles([]);
      setDiffContent('');
      setSelectedFiles(new Set());
      setExpandedFile(null);
      // Reset push state
      setPushAfterCommit(false);
      setRemotes([]);
      setSelectedRemote('');
      setIsPushing(false);
      setRemotesFetched(false);
      setRemotesFetchError(null);
      setCommitSucceeded(false);

      let cancelled = false;

      const loadDiffs = async () => {
        try {
          const api = getElectronAPI();
          if (api?.git?.getDiffs) {
            const result = await api.git.getDiffs(worktree.path);
            if (result.success) {
              const fileList = result.files ?? [];
              if (!cancelled) setFiles(fileList);
              if (!cancelled) setDiffContent(result.diff ?? '');
              // If any files are already staged, pre-select only staged files
              // Otherwise select all files by default
              const stagedFiles = fileList.filter((f) => {
                const idx = f.indexStatus ?? ' ';
                return idx !== ' ' && idx !== '?';
              });
              if (!cancelled) {
                if (stagedFiles.length > 0) {
                  // Also include untracked files that are staged (A status)
                  setSelectedFiles(new Set(stagedFiles.map((f) => f.path)));
                } else {
                  setSelectedFiles(new Set(fileList.map((f) => f.path)));
                }
              }
            } else {
              const errorMsg = result.error ?? 'Failed to load diffs';
              console.warn('Failed to load diffs for commit dialog:', errorMsg);
              if (!cancelled) {
                setError(errorMsg);
                toast.error(errorMsg);
              }
            }
          }
        } catch (err) {
          console.error('Failed to load diffs for commit dialog:', err);
          if (!cancelled) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load diffs';
            setError(errorMsg);
            toast.error(errorMsg);
          }
        } finally {
          if (!cancelled) setIsLoadingDiffs(false);
        }
      };

      loadDiffs();

      return () => {
        cancelled = true;
      };
    }
  }, [open, worktree]);

  const handleToggleFile = useCallback((filePath: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedFiles((prev) => {
      if (prev.size === files.length) {
        return new Set();
      }
      return new Set(files.map((f) => f.path));
    });
  }, [files]);

  const handleFileClick = useCallback((filePath: string) => {
    setExpandedFile((prev) => (prev === filePath ? null : filePath));
  }, []);

  /** Shared push helper — returns true if the push succeeded */
  const performPush = async (
    api: ReturnType<typeof getElectronAPI>,
    worktreePath: string,
    remoteName: string
  ): Promise<boolean> => {
    if (!api?.worktree?.push) {
      toast.error('Push API not available');
      return false;
    }
    setIsPushing(true);
    try {
      const pushResult = await api.worktree.push(worktreePath, false, remoteName);
      if (pushResult.success && pushResult.result) {
        toast.success('Pushed to remote', {
          description: pushResult.result.message,
        });
        return true;
      } else {
        toast.error(pushResult.error || 'Failed to push to remote');
        return false;
      }
    } catch (pushErr) {
      toast.error(pushErr instanceof Error ? pushErr.message : 'Failed to push to remote');
      return false;
    } finally {
      setIsPushing(false);
    }
  };

  const handleCommit = async () => {
    if (!worktree) return;

    const api = getElectronAPI();

    // If commit already succeeded on a previous attempt, skip straight to push (or close if no push needed)
    if (commitSucceeded) {
      if (pushAfterCommit && selectedRemote) {
        const ok = await performPush(api, worktree.path, selectedRemote);
        if (ok) {
          onCommitted();
          onOpenChange(false);
          setMessage('');
        }
      } else {
        onCommitted();
        onOpenChange(false);
        setMessage('');
      }
      return;
    }

    if (!message.trim() || selectedFiles.size === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      if (!api?.worktree?.commit) {
        setError('Worktree API not available');
        return;
      }

      // Pass selected files if not all files are selected
      const filesToCommit =
        selectedFiles.size === files.length ? undefined : Array.from(selectedFiles);

      const result = await api.worktree.commit(worktree.path, message, filesToCommit);

      if (result.success && result.result) {
        if (result.result.committed) {
          setCommitSucceeded(true);
          toast.success('Changes committed', {
            description: `Commit ${result.result.commitHash} on ${result.result.branch}`,
          });

          // Push after commit if enabled
          let pushSucceeded = false;
          if (pushAfterCommit && selectedRemote) {
            pushSucceeded = await performPush(api, worktree.path, selectedRemote);
          }

          // Only close the dialog when no push was requested or the push completed successfully.
          // If push failed, keep the dialog open so the user can retry.
          if (!pushAfterCommit || pushSucceeded) {
            onCommitted();
            onOpenChange(false);
            setMessage('');
          } else {
            // Commit succeeded but push failed — notify parent of commit but keep dialog open for retry
            onCommitted();
          }
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

  // When the commit succeeded but push failed, allow retrying the push without
  // requiring a commit message or file selection.
  const isPushRetry = commitSucceeded && pushAfterCommit && !isPushing;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      (e.metaKey || e.ctrlKey) &&
      !isLoading &&
      !isPushing &&
      !isGenerating
    ) {
      if (isPushRetry) {
        // Push retry only needs a selected remote
        if (selectedRemote) {
          handleCommit();
        }
      } else if (
        message.trim() &&
        selectedFiles.size > 0 &&
        !(pushAfterCommit && !selectedRemote)
      ) {
        handleCommit();
      }
    }
  };

  // Generate AI commit message when dialog opens (if enabled)
  useEffect(() => {
    if (open && worktree) {
      // Reset state
      setMessage('');
      setError(null);

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
            console.warn('Failed to generate commit message:', result.error);
            setMessage('');
          }
        } catch (err) {
          if (cancelled) return;
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

  const allSelected = selectedFiles.size === files.length && files.length > 0;

  // Prevent the dialog from being dismissed while a push is in progress.
  // Overlay clicks and Escape key both route through onOpenChange(false); we
  // intercept those here so the UI stays open until the push completes.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPushing) {
      // Ignore close requests during an active push.
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Commit Changes
          </DialogTitle>
          <DialogDescription>
            Commit changes in the{' '}
            <code className="font-mono bg-muted px-1 rounded">{worktree.branch}</code> worktree.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2 min-h-0 flex-1 overflow-hidden">
          {/* File Selection */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-medium flex items-center gap-2">
                Files to commit
                {isLoadingDiffs ? (
                  <Spinner size="sm" />
                ) : (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({selectedFiles.size}/{files.length} selected)
                  </span>
                )}
              </Label>
              {files.length > 0 && (
                <button
                  onClick={handleToggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {isLoadingDiffs ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground border border-border rounded-lg">
                <Spinner size="sm" className="mr-2" />
                <span className="text-sm">Loading changes...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground border border-border rounded-lg">
                <span className="text-sm">No changes detected</span>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto scrollbar-visible">
                {files.map((file) => {
                  const isChecked = selectedFiles.has(file.path);
                  const isExpanded = expandedFile === file.path;
                  const fileDiff = diffsByFile.get(file.path);
                  const additions = fileDiff?.additions ?? 0;
                  const deletions = fileDiff?.deletions ?? 0;
                  // Determine staging state from index/worktree status
                  const idx = file.indexStatus ?? ' ';
                  const wt = file.workTreeStatus ?? ' ';
                  const isStaged = idx !== ' ' && idx !== '?';
                  const isUnstaged = wt !== ' ' && wt !== '?';
                  const isUntracked = idx === '?' && wt === '?';

                  return (
                    <div key={file.path} className="border-b border-border last:border-b-0">
                      <div
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 transition-colors group',
                          isExpanded && 'bg-accent/30'
                        )}
                      >
                        {/* Checkbox */}
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleFile(file.path)}
                          className="flex-shrink-0"
                        />

                        {/* Clickable file row to show diff */}
                        <button
                          onClick={() => handleFileClick(file.path)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          )}
                          {getFileIcon(file.status)}
                          <TruncatedFilePath
                            path={file.path}
                            className="text-xs font-mono flex-1 text-foreground"
                          />
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0',
                              getStatusBadgeColor(file.status)
                            )}
                          >
                            {getStatusLabel(file.status)}
                          </span>
                          {isStaged && !isUnstaged && !isUntracked && (
                            <span className="text-[10px] px-1 py-0.5 rounded border font-medium flex-shrink-0 bg-green-500/15 text-green-400 border-green-500/30">
                              Staged
                            </span>
                          )}
                          {isStaged && isUnstaged && (
                            <span className="text-[10px] px-1 py-0.5 rounded border font-medium flex-shrink-0 bg-amber-500/15 text-amber-400 border-amber-500/30">
                              Partial
                            </span>
                          )}
                          {additions > 0 && (
                            <span className="text-[10px] text-green-400 flex-shrink-0">
                              +{additions}
                            </span>
                          )}
                          {deletions > 0 && (
                            <span className="text-[10px] text-red-400 flex-shrink-0">
                              -{deletions}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Expanded diff view */}
                      {isExpanded && fileDiff && (
                        <div className="bg-background border-t border-border max-h-[200px] overflow-y-auto scrollbar-visible">
                          {fileDiff.hunks.map((hunk, hunkIndex) => (
                            <div
                              key={hunkIndex}
                              className="border-b border-border-glass last:border-b-0"
                            >
                              {hunk.lines.map((line, lineIndex) => (
                                <DiffLine
                                  key={lineIndex}
                                  type={line.type}
                                  content={line.content}
                                  lineNumber={line.lineNumber}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {isExpanded && !fileDiff && (
                        <div className="px-4 py-3 text-xs text-muted-foreground bg-background border-t border-border">
                          {file.status === '?' ? (
                            <span>New file - diff preview not available</span>
                          ) : file.status === 'D' ? (
                            <span>File deleted</span>
                          ) : (
                            <span>Diff content not available</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Commit Message */}
          <div className="grid gap-1.5">
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
              className="min-h-[80px] font-mono text-sm"
              autoFocus
              disabled={isGenerating}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Push after commit option */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="push-after-commit"
                checked={pushAfterCommit}
                onCheckedChange={(checked) => setPushAfterCommit(checked === true)}
              />
              <Label
                htmlFor="push-after-commit"
                className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Push to remote after commit
              </Label>
            </div>

            {pushAfterCommit && (
              <div className="ml-6 flex flex-col gap-1.5">
                {isLoadingRemotes || (!remotesFetched && !remotesFetchError) ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" />
                    <span>Loading remotes...</span>
                  </div>
                ) : remotesFetchError ? (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <span>Failed to load remotes.</span>
                    <button
                      className="text-xs underline hover:text-foreground transition-colors"
                      onClick={() => {
                        if (worktree) {
                          setRemotesFetchError(null);
                        }
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : remotes.length === 0 && remotesFetched ? (
                  <p className="text-sm text-muted-foreground">
                    No remotes configured for this repository.
                  </p>
                ) : remotes.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="remote-select"
                      className="text-xs text-muted-foreground whitespace-nowrap"
                    >
                      Remote:
                    </Label>
                    <Select value={selectedRemote} onValueChange={setSelectedRemote}>
                      <SelectTrigger id="remote-select" className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Select remote" />
                      </SelectTrigger>
                      <SelectContent>
                        {remotes.map((remote) => (
                          <SelectItem key={remote.name} value={remote.name}>
                            <span className="font-medium">{remote.name}</span>
                            <span className="ml-2 text-muted-foreground text-xs inline-block truncate max-w-[200px] align-bottom">
                              {remote.url}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Cmd/Ctrl+Enter</kbd> to
            commit{pushAfterCommit ? ' & push' : ''}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading || isPushing || isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={
              isLoading ||
              isPushing ||
              isGenerating ||
              (isPushRetry
                ? !selectedRemote
                : !message.trim() ||
                  selectedFiles.size === 0 ||
                  (pushAfterCommit && !selectedRemote))
            }
          >
            {isLoading || isPushing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {isPushing ? 'Pushing...' : 'Committing...'}
              </>
            ) : isPushRetry ? (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Retry Push
              </>
            ) : (
              <>
                {pushAfterCommit ? (
                  <Upload className="w-4 h-4 mr-2" />
                ) : (
                  <GitCommit className="w-4 h-4 mr-2" />
                )}
                {pushAfterCommit ? 'Commit & Push' : 'Commit'}
                {selectedFiles.size > 0 && selectedFiles.size < files.length
                  ? ` (${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''})`
                  : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
