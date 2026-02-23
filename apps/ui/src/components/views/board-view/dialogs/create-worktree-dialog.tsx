import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GitBranch,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Globe,
  RefreshCw,
  Cloud,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { BranchAutocomplete } from '@/components/ui/branch-autocomplete';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Parse git/worktree error messages and return user-friendly versions
 */
function parseWorktreeError(error: string): { title: string; description?: string } {
  const errorLower = error.toLowerCase();

  // Worktree already exists
  if (errorLower.includes('already exists') && errorLower.includes('worktree')) {
    return {
      title: 'A worktree with this name already exists',
      description: 'Try a different branch name or delete the existing worktree first.',
    };
  }

  // Branch already checked out in another worktree
  if (
    errorLower.includes('already checked out') ||
    errorLower.includes('is already used by worktree')
  ) {
    return {
      title: 'This branch is already in use',
      description: 'The branch is checked out in another worktree. Use a different branch name.',
    };
  }

  // Branch name conflicts with existing branch
  if (errorLower.includes('already exists') && errorLower.includes('branch')) {
    return {
      title: 'A branch with this name already exists',
      description: 'The worktree will use the existing branch, or try a different name.',
    };
  }

  // Not a git repository
  if (errorLower.includes('not a git repository')) {
    return {
      title: 'Not a git repository',
      description: 'Initialize git in this project first with "git init".',
    };
  }

  // Lock file exists (another git operation in progress)
  if (errorLower.includes('.lock') || errorLower.includes('lock file')) {
    return {
      title: 'Another git operation is in progress',
      description: 'Wait for it to complete or remove stale lock files.',
    };
  }

  // Permission denied
  if (errorLower.includes('permission denied') || errorLower.includes('access denied')) {
    return {
      title: 'Permission denied',
      description: 'Check file permissions for the project directory.',
    };
  }

  // Default: return original error but cleaned up
  return {
    title: error.replace(/^(fatal|error):\s*/i, '').split('\n')[0],
  };
}

interface CreatedWorktreeInfo {
  path: string;
  branch: string;
}

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onCreated: (worktree: CreatedWorktreeInfo) => void;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  onCreated,
}: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ title: string; description?: string } | null>(null);

  // Base branch selection state
  const [showBaseBranch, setShowBaseBranch] = useState(false);
  const [baseBranch, setBaseBranch] = useState('');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<
    Array<{ name: string; isRemote: boolean }>
  >([]);
  // When the branch list fetch fails, store a message to show the user and
  // allow free-form branch entry via allowCreate as a fallback.
  const [branchFetchError, setBranchFetchError] = useState<string | null>(null);

  // Remote selection state
  const [selectedRemote, setSelectedRemote] = useState<string>('local');
  const [availableRemotes, setAvailableRemotes] = useState<Array<{ name: string; url: string }>>(
    []
  );
  const [remoteBranches, setRemoteBranches] = useState<
    Map<string, Array<{ name: string; fullRef: string }>>
  >(new Map());

  // AbortController ref so in-flight branch fetches can be cancelled when the dialog closes
  const branchFetchAbortRef = useRef<AbortController | null>(null);

  // Fetch available branches and remotes when the base branch section is expanded
  const fetchBranches = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectPath) return;

      setIsLoadingBranches(true);
      try {
        const api = getHttpApiClient();

        // Fetch both branches and remotes in parallel
        const [branchResult, remotesResult] = await Promise.all([
          api.worktree.listBranches(projectPath, true, signal),
          api.worktree.listRemotes(projectPath),
        ]);

        // If the fetch was aborted while awaiting, bail out to avoid stale state writes
        if (signal?.aborted) return;

        // Process branches
        if (branchResult.success && branchResult.result) {
          setBranchFetchError(null);
          setAvailableBranches(
            branchResult.result.branches.map((b: { name: string; isRemote: boolean }) => ({
              name: b.name,
              isRemote: b.isRemote,
            }))
          );
        } else {
          // API returned success: false — treat as an error
          const message =
            branchResult.error || 'Failed to load branches. You can type a branch name manually.';
          setBranchFetchError(message);
          setAvailableBranches([{ name: 'main', isRemote: false }]);
        }

        // Process remotes
        if (remotesResult.success && remotesResult.result) {
          const remotes = remotesResult.result.remotes;
          setAvailableRemotes(
            remotes.map((r: { name: string; url: string; branches: unknown[] }) => ({
              name: r.name,
              url: r.url,
            }))
          );

          // Build remote branches map for filtering
          const branchesMap = new Map<string, Array<{ name: string; fullRef: string }>>();
          remotes.forEach(
            (r: {
              name: string;
              url: string;
              branches: Array<{ name: string; fullRef: string }>;
            }) => {
              branchesMap.set(r.name, r.branches || []);
            }
          );
          setRemoteBranches(branchesMap);
        }
      } catch (err) {
        // If aborted, don't update state
        if (signal?.aborted) return;

        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load branches. You can type a branch name manually.';
        setBranchFetchError(message);
        // Provide 'main' as a safe fallback so the autocomplete is not empty,
        // and enable free-form entry (allowCreate) so the user can still type
        // any branch name when the remote list is unavailable.
        setAvailableBranches([{ name: 'main', isRemote: false }]);
        setAvailableRemotes([]);
        setRemoteBranches(new Map());
      } finally {
        if (!signal?.aborted) {
          setIsLoadingBranches(false);
        }
      }
    },
    [projectPath]
  );

  // Fetch branches when the base branch section is expanded
  useEffect(() => {
    if (open && showBaseBranch) {
      // Abort any previous in-flight fetch
      branchFetchAbortRef.current?.abort();
      const controller = new AbortController();
      branchFetchAbortRef.current = controller;
      fetchBranches(controller.signal);
    }
    return () => {
      branchFetchAbortRef.current?.abort();
      branchFetchAbortRef.current = null;
    };
  }, [open, showBaseBranch, fetchBranches]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Abort any in-flight branch fetch to prevent stale writes
      branchFetchAbortRef.current?.abort();
      branchFetchAbortRef.current = null;

      setBranchName('');
      setBaseBranch('');
      setShowBaseBranch(false);
      setError(null);
      setAvailableBranches([]);
      setBranchFetchError(null);
      setIsLoadingBranches(false);
      setSelectedRemote('local');
      setAvailableRemotes([]);
      setRemoteBranches(new Map());
    }
  }, [open]);

  // Build branch name list for the autocomplete, filtered by selected remote
  const branchNames = useMemo(() => {
    // If "local" is selected, show only local branches
    if (selectedRemote === 'local') {
      return availableBranches.filter((b) => !b.isRemote).map((b) => b.name);
    }

    // If a specific remote is selected, show only branches from that remote
    const remoteBranchList = remoteBranches.get(selectedRemote);
    if (remoteBranchList) {
      return remoteBranchList.map((b) => b.fullRef);
    }

    // Fallback: filter from available branches by remote prefix
    return availableBranches
      .filter((b) => b.isRemote && b.name.startsWith(`${selectedRemote}/`))
      .map((b) => b.name);
  }, [availableBranches, selectedRemote, remoteBranches]);

  // Determine if the selected base branch is a remote branch.
  // Also detect manually entered remote-style names (e.g. "origin/feature")
  // so the UI shows the "Remote branch — will fetch latest" hint even when
  // the branch isn't in the fetched availableBranches list.
  const isRemoteBaseBranch = useMemo(() => {
    if (!baseBranch) return false;
    // If the branch list couldn't be fetched, availableBranches is a fallback
    // and may not reflect reality — suppress the remote hint to avoid misleading the user.
    if (branchFetchError) return false;
    // Check fetched branch list first
    const knownRemote = availableBranches.some((b) => b.name === baseBranch && b.isRemote);
    if (knownRemote) return true;
    // Heuristic: if the branch contains '/' and isn't a known local branch,
    // treat it as a remote ref (e.g. "origin/main")
    if (baseBranch.includes('/')) {
      const isKnownLocal = availableBranches.some((b) => b.name === baseBranch && !b.isRemote);
      return !isKnownLocal;
    }
    return false;
  }, [baseBranch, availableBranches, branchFetchError]);

  const handleCreate = async () => {
    if (!branchName.trim()) {
      setError({ title: 'Branch name is required' });
      return;
    }

    // Validate branch name (git-compatible)
    const validBranchRegex = /^[a-zA-Z0-9._/-]+$/;
    if (!validBranchRegex.test(branchName)) {
      setError({
        title: 'Invalid branch name',
        description: 'Use only letters, numbers, dots, underscores, hyphens, and slashes.',
      });
      return;
    }

    // Validate baseBranch using the same allowed-character check as branchName to prevent
    // shell-special characters or invalid git ref names from reaching the API.
    const trimmedBaseBranch = baseBranch.trim();
    if (trimmedBaseBranch && !validBranchRegex.test(trimmedBaseBranch)) {
      setError({
        title: 'Invalid base branch name',
        description: 'Use only letters, numbers, dots, underscores, hyphens, and slashes.',
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.create) {
        setError({ title: 'Worktree API not available' });
        return;
      }

      // Pass the validated baseBranch if one was selected (otherwise defaults to HEAD)
      const effectiveBaseBranch = trimmedBaseBranch || undefined;
      const result = await api.worktree.create(projectPath, branchName, effectiveBaseBranch);

      if (result.success && result.worktree) {
        const baseDesc = effectiveBaseBranch ? ` from ${effectiveBaseBranch}` : '';
        const commitInfo = result.worktree.baseCommitHash
          ? ` (${result.worktree.baseCommitHash})`
          : '';

        // Show sync result feedback
        const syncResult = result.worktree.syncResult;
        if (syncResult?.diverged) {
          // Branch had diverged — warn the user
          toast.warning(`Worktree created for branch "${result.worktree.branch}"`, {
            description: `${syncResult.message}`,
            duration: 8000,
          });
        } else if (syncResult && !syncResult.synced && syncResult.message) {
          // Sync was attempted but failed (network error, etc.)
          toast.warning(`Worktree created for branch "${result.worktree.branch}"`, {
            description: `Created with local copy. ${syncResult.message}`,
            duration: 6000,
          });
        } else {
          // Normal success — include commit info if available
          toast.success(`Worktree created for branch "${result.worktree.branch}"`, {
            description: result.worktree.isNew
              ? `New branch created${baseDesc}${commitInfo}`
              : `Using existing branch${commitInfo}`,
          });
        }

        onCreated({ path: result.worktree.path, branch: result.worktree.branch });
        onOpenChange(false);
        setBranchName('');
        setBaseBranch('');
      } else {
        setError(parseWorktreeError(result.error || 'Failed to create worktree'));
      }
    } catch (err) {
      setError(
        parseWorktreeError(err instanceof Error ? err.message : 'Failed to create worktree')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && branchName.trim()) {
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Create New Worktree
          </DialogTitle>
          <DialogDescription>
            Create a new git worktree with its own branch. This allows you to work on multiple
            features in parallel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-feature"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="font-mono text-sm"
              autoFocus
            />
          </div>

          {/* Base Branch Section - collapsible */}
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setShowBaseBranch(!showBaseBranch)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
              {showBaseBranch ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Base Branch</span>
              {baseBranch && !showBaseBranch && (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono ml-1">
                  {baseBranch}
                </code>
              )}
            </button>

            {showBaseBranch && (
              <div className="grid gap-2 pl-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Select a local or remote branch as the starting point
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      branchFetchAbortRef.current?.abort();
                      const controller = new AbortController();
                      branchFetchAbortRef.current = controller;
                      void fetchBranches(controller.signal);
                    }}
                    disabled={isLoadingBranches}
                    className="h-6 px-2 text-xs"
                  >
                    {isLoadingBranches ? (
                      <Spinner size="xs" className="mr-1" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Refresh
                  </Button>
                </div>

                {branchFetchError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    <span>Could not load branches: {branchFetchError}</span>
                  </div>
                )}

                {/* Remote Selector */}
                <div className="grid gap-1.5">
                  <Label htmlFor="remote-select" className="text-xs text-muted-foreground">
                    Source
                  </Label>
                  <Select
                    value={selectedRemote}
                    onValueChange={(value) => {
                      setSelectedRemote(value);
                      // Clear base branch when switching remotes
                      setBaseBranch('');
                    }}
                    disabled={isLoadingBranches}
                  >
                    <SelectTrigger id="remote-select" className="h-8">
                      <SelectValue placeholder="Select source..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5" />
                          <span>Local Branches</span>
                        </div>
                      </SelectItem>
                      {availableRemotes.map((remote) => (
                        <SelectItem key={remote.name} value={remote.name}>
                          <div className="flex items-center gap-2">
                            <Cloud className="w-3.5 h-3.5" />
                            <span>{remote.name}</span>
                            {remote.url && (
                              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                                ({remote.url})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <BranchAutocomplete
                  value={baseBranch}
                  onChange={(value) => {
                    setBaseBranch(value);
                    setError(null);
                  }}
                  branches={branchNames}
                  placeholder={
                    selectedRemote === 'local'
                      ? 'Select local branch (default: HEAD)...'
                      : `Select branch from ${selectedRemote}...`
                  }
                  disabled={isLoadingBranches}
                  allowCreate={!!branchFetchError || selectedRemote === 'local'}
                />

                {isRemoteBaseBranch && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="w-3 h-3" />
                    <span>Remote branch — will fetch latest before creating worktree</span>
                  </div>
                )}
                {!isRemoteBaseBranch && baseBranch && !branchFetchError && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3" />
                    <span>Will sync with remote tracking branch if available</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">{error.title}</p>
                {error.description && (
                  <p className="text-xs text-destructive/80">{error.description}</p>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Examples:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>
                <code className="bg-muted px-1 rounded">feature/user-auth</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">fix/login-bug</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">hotfix/security-patch</code>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading || !branchName.trim()}>
            {isLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {baseBranch.trim() ? 'Syncing & Creating...' : 'Creating...'}
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4 mr-2" />
                Create Worktree
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
