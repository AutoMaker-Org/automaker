import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { BranchAutocomplete } from '@/components/ui/branch-autocomplete';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GitPullRequest, ExternalLink, Sparkles, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { useWorktreeBranches } from '@/hooks/queries';

interface RemoteInfo {
  name: string;
  url: string;
  branches?: string[];
}

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  projectPath: string | null;
  onCreated: (prUrl?: string) => void;
  /** Default base branch for the PR (defaults to 'main' if not provided) */
  defaultBaseBranch?: string;
}

export function CreatePRDialog({
  open,
  onOpenChange,
  worktree,
  projectPath,
  onCreated,
  defaultBaseBranch = 'main',
}: CreatePRDialogProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch);
  const [commitMessage, setCommitMessage] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [showBrowserFallback, setShowBrowserFallback] = useState(false);
  // Track whether an operation completed that warrants a refresh
  const operationCompletedRef = useRef(false);

  // Remote selection state
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  // Target remote: which remote to create the PR against (may differ from push remote)
  const [selectedTargetRemote, setSelectedTargetRemote] = useState<string>('');
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(false);
  // Keep a ref in sync with selectedRemote so fetchRemotes can read the latest value
  // without needing it in its dependency array (which would cause re-fetch loops)
  const selectedRemoteRef = useRef<string>(selectedRemote);
  const selectedTargetRemoteRef = useRef<string>(selectedTargetRemote);
  useEffect(() => {
    selectedRemoteRef.current = selectedRemote;
  }, [selectedRemote]);
  useEffect(() => {
    selectedTargetRemoteRef.current = selectedTargetRemote;
  }, [selectedTargetRemote]);

  // Generate description state
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Use React Query for branch fetching - only enabled when dialog is open
  const { data: branchesData, isLoading: isLoadingBranches } = useWorktreeBranches(
    open ? worktree?.path : undefined,
    true // Include remote branches for PR base branch selection
  );

  // Determine if push remote selection is needed:
  // Show when there are unpushed commits, no remote tracking branch, or uncommitted changes
  // (uncommitted changes will be committed first, then pushed)
  const branchHasRemote = branchesData?.hasRemoteBranch ?? false;
  const branchAheadCount = branchesData?.aheadCount ?? 0;
  const needsPush = !branchHasRemote || branchAheadCount > 0 || !!worktree?.hasChanges;

  // Determine the active remote to scope branches to.
  // For multi-remote: use the selected target remote.
  // For single remote: automatically scope to that remote.
  const activeRemote = useMemo(() => {
    if (remotes.length === 1) return remotes[0].name;
    if (selectedTargetRemote) return selectedTargetRemote;
    return '';
  }, [remotes, selectedTargetRemote]);

  // Filter branches by the active remote and strip remote prefixes for display.
  // Returns display names (e.g. "main") without remote prefix.
  // Also builds a map from display name → full ref (e.g. "origin/main") for PR creation.
  const { branches, branchFullRefMap } = useMemo(() => {
    if (!branchesData?.branches)
      return { branches: [], branchFullRefMap: new Map<string, string>() };

    const refMap = new Map<string, string>();

    // If we have an active remote with branch info from the remotes endpoint, use that as the source
    const activeRemoteInfo = activeRemote
      ? remotes.find((r) => r.name === activeRemote)
      : undefined;

    if (activeRemoteInfo?.branches && activeRemoteInfo.branches.length > 0) {
      // Use the remote's branch list — these are already short names (e.g. "main")
      const filteredBranches = activeRemoteInfo.branches
        .filter((branchName) => {
          // Exclude the current worktree branch
          return branchName !== worktree?.branch;
        })
        .map((branchName) => {
          // Map display name to full ref
          const fullRef = `${activeRemote}/${branchName}`;
          refMap.set(branchName, fullRef);
          return branchName;
        });

      return { branches: filteredBranches, branchFullRefMap: refMap };
    }

    // Fallback: if no remote info available, use the branches from the branches endpoint
    // Filter and strip prefixes
    const seen = new Set<string>();
    const filteredBranches: string[] = [];

    for (const b of branchesData.branches) {
      // Skip the current worktree branch
      if (b.name === worktree?.branch) continue;

      if (b.isRemote) {
        // Remote branch: check if it belongs to the active remote
        const slashIndex = b.name.indexOf('/');
        if (slashIndex === -1) continue;

        const remoteName = b.name.substring(0, slashIndex);
        const branchName = b.name.substring(slashIndex + 1);

        // If we have an active remote, only include branches from that remote
        if (activeRemote && remoteName !== activeRemote) continue;

        // Strip the remote prefix for display
        if (!seen.has(branchName)) {
          seen.add(branchName);
          filteredBranches.push(branchName);
          refMap.set(branchName, b.name);
        }
      } else {
        // Local branch — only include if it has a remote counterpart on the active remote
        // or if no active remote is set (no remotes at all)
        if (!activeRemote) {
          if (!seen.has(b.name)) {
            seen.add(b.name);
            filteredBranches.push(b.name);
            refMap.set(b.name, b.name);
          }
        }
        // When active remote is set, skip local-only branches — the remote version
        // will be included from the remote branches above
      }
    }

    return { branches: filteredBranches, branchFullRefMap: refMap };
  }, [branchesData?.branches, worktree?.branch, activeRemote, remotes]);

  // When branches change (e.g. target remote changed), reset base branch if current selection is no longer valid
  useEffect(() => {
    if (branches.length > 0 && baseBranch && !branches.includes(baseBranch)) {
      // Current base branch is not in the filtered list — pick the best match
      // Strip any existing remote prefix from the current base branch for comparison
      const strippedBaseBranch = baseBranch.includes('/')
        ? baseBranch.substring(baseBranch.indexOf('/') + 1)
        : baseBranch;

      // Check if the stripped version exists in the list
      if (branches.includes(strippedBaseBranch)) {
        setBaseBranch(strippedBaseBranch);
      } else {
        const mainBranch = branches.find((b) => b === 'main' || b === 'master');
        setBaseBranch(mainBranch || branches[0]);
      }
    }
  }, [branches, baseBranch]);

  // Fetch remotes when dialog opens
  const fetchRemotes = useCallback(async () => {
    if (!worktree) return;

    setIsLoadingRemotes(true);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        const remoteInfos: RemoteInfo[] = result.result.remotes.map(
          (r: { name: string; url: string; branches?: { name: string }[] }) => ({
            name: r.name,
            url: r.url,
            branches: r.branches?.map((b: { name: string }) => b.name) || [],
          })
        );
        setRemotes(remoteInfos);

        // Preserve existing push remote selection if it's still valid; otherwise fall back to 'origin' or first remote
        if (remoteInfos.length > 0) {
          const remoteNames = remoteInfos.map((r) => r.name);
          const currentSelection = selectedRemoteRef.current;
          const currentSelectionStillExists =
            currentSelection !== '' && remoteNames.includes(currentSelection);
          if (!currentSelectionStillExists) {
            const defaultRemote = remoteInfos.find((r) => r.name === 'origin') || remoteInfos[0];
            setSelectedRemote(defaultRemote.name);
          }

          // Preserve existing target remote selection if it's still valid
          const currentTargetSelection = selectedTargetRemoteRef.current;
          const currentTargetStillExists =
            currentTargetSelection !== '' && remoteNames.includes(currentTargetSelection);
          if (!currentTargetStillExists) {
            // Default target remote: 'upstream' if it exists (fork workflow), otherwise same as push remote
            const defaultTarget =
              remoteInfos.find((r) => r.name === 'upstream') ||
              remoteInfos.find((r) => r.name === 'origin') ||
              remoteInfos[0];
            setSelectedTargetRemote(defaultTarget.name);
          }
        }
      }
    } catch {
      // Silently fail - remotes selector will just not show
    } finally {
      setIsLoadingRemotes(false);
    }
  }, [worktree]);

  useEffect(() => {
    if (open && worktree) {
      fetchRemotes();
    }
  }, [open, worktree, fetchRemotes]);

  // Common state reset function to avoid duplication
  const resetState = useCallback(() => {
    setTitle('');
    setBody('');
    setCommitMessage('');
    setBaseBranch(defaultBaseBranch);
    setIsDraft(false);
    setError(null);
    setPrUrl(null);
    setBrowserUrl(null);
    setShowBrowserFallback(false);
    setRemotes([]);
    setSelectedRemote('');
    setSelectedTargetRemote('');
    setIsGeneratingDescription(false);
    operationCompletedRef.current = false;
  }, [defaultBaseBranch]);

  // Reset state when dialog opens or worktree changes
  useEffect(() => {
    // Reset all state on both open and close
    resetState();
  }, [open, worktree?.path, resetState]);

  const handleGenerateDescription = async () => {
    if (!worktree) return;

    setIsGeneratingDescription(true);

    try {
      const api = getHttpApiClient();
      // Resolve the display name to the actual branch name for the API
      const resolvedRef = branchFullRefMap.get(baseBranch) || baseBranch;
      // Only strip the remote prefix if the resolved ref differs from the original
      // (indicating it was resolved from a full ref like "origin/main").
      // This preserves local branch names that contain slashes (e.g. "release/1.0").
      const branchNameForApi =
        resolvedRef !== baseBranch && resolvedRef.includes('/')
          ? resolvedRef.substring(resolvedRef.indexOf('/') + 1)
          : resolvedRef;
      const result = await api.worktree.generatePRDescription(worktree.path, branchNameForApi);

      if (result.success) {
        if (result.title) {
          setTitle(result.title);
        }
        if (result.body) {
          setBody(result.body);
        }
        toast.success('PR description generated');
      } else {
        toast.error('Failed to generate description', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      toast.error('Failed to generate description', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleCreate = async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.createPR) {
        setError('Worktree API not available');
        return;
      }
      // Resolve the display branch name to the full ref for the API call.
      // The baseBranch state holds the display name (e.g. "main"), but the API
      // may need the short name without the remote prefix. We pass the display name
      // since the backend handles branch resolution. However, if the full ref is
      // available, we can use it for more precise targeting.
      const resolvedBaseBranch = branchFullRefMap.get(baseBranch) || baseBranch;
      // Only strip the remote prefix if the resolved ref differs from the original
      // (indicating it was resolved from a full ref like "origin/main").
      // This preserves local branch names that contain slashes (e.g. "release/1.0").
      const baseBranchForApi =
        resolvedBaseBranch !== baseBranch && resolvedBaseBranch.includes('/')
          ? resolvedBaseBranch.substring(resolvedBaseBranch.indexOf('/') + 1)
          : resolvedBaseBranch;

      const result = await api.worktree.createPR(worktree.path, {
        projectPath: projectPath || undefined,
        commitMessage: commitMessage || undefined,
        prTitle: title || worktree.branch,
        prBody: body || `Changes from branch ${worktree.branch}`,
        baseBranch: baseBranchForApi,
        draft: isDraft,
        remote: selectedRemote || undefined,
        targetRemote: remotes.length > 1 ? selectedTargetRemote || undefined : undefined,
      });

      if (result.success && result.result) {
        if (result.result.prCreated && result.result.prUrl) {
          setPrUrl(result.result.prUrl);
          // Mark operation as completed for refresh on close
          operationCompletedRef.current = true;

          // Show different message based on whether PR already existed
          if (result.result.prAlreadyExisted) {
            toast.success('Pull request found!', {
              description: `PR already exists for ${result.result.branch}`,
              action: {
                label: 'View PR',
                onClick: () => window.open(result.result!.prUrl!, '_blank', 'noopener,noreferrer'),
              },
            });
          } else {
            toast.success('Pull request created!', {
              description: `PR created from ${result.result.branch}`,
              action: {
                label: 'View PR',
                onClick: () => window.open(result.result!.prUrl!, '_blank', 'noopener,noreferrer'),
              },
            });
          }
          // Don't call onCreated() here - keep dialog open to show success message
          // onCreated() will be called when user closes the dialog
        } else {
          // Branch was pushed successfully
          const prError = result.result.prError;
          const hasBrowserUrl = !!result.result.browserUrl;

          // Check if we should show browser fallback
          if (!result.result.prCreated && hasBrowserUrl) {
            // If gh CLI is not available, show browser fallback UI
            if (prError === 'gh_cli_not_available' || !result.result.ghCliAvailable) {
              setBrowserUrl(result.result.browserUrl ?? null);
              setShowBrowserFallback(true);
              // Mark operation as completed - branch was pushed successfully
              operationCompletedRef.current = true;
              toast.success('Branch pushed', {
                description: result.result.committed
                  ? `Commit ${result.result.commitHash} pushed to ${result.result.branch}`
                  : `Branch ${result.result.branch} pushed`,
              });
              // Don't call onCreated() here - we want to keep the dialog open to show the browser URL
              setIsLoading(false);
              return; // Don't close dialog, show browser fallback UI
            }

            // gh CLI is available but failed - show error with browser option
            if (prError) {
              // Parse common gh CLI errors for better messages
              let errorMessage = prError;
              if (prError.includes('No commits between')) {
                errorMessage =
                  'No new commits to create PR. Make sure your branch has changes compared to the base branch.';
              } else if (prError.includes('already exists')) {
                errorMessage = 'A pull request already exists for this branch.';
              } else if (prError.includes('not logged in') || prError.includes('auth')) {
                errorMessage = "GitHub CLI not authenticated. Run 'gh auth login' in terminal.";
              }

              // Show error but also provide browser option
              setBrowserUrl(result.result.browserUrl ?? null);
              setShowBrowserFallback(true);
              // Mark operation as completed - branch was pushed even though PR creation failed
              operationCompletedRef.current = true;
              toast.error('PR creation failed', {
                description: errorMessage,
                duration: 8000,
              });
              // Don't call onCreated() here - we want to keep the dialog open to show the browser URL
              setIsLoading(false);
              return;
            }
          }

          // Show success toast for push
          toast.success('Branch pushed', {
            description: result.result.committed
              ? `Commit ${result.result.commitHash} pushed to ${result.result.branch}`
              : `Branch ${result.result.branch} pushed`,
          });

          // No browser URL available, just close
          if (!result.result.prCreated) {
            if (!hasBrowserUrl) {
              toast.info('PR not created', {
                description:
                  'Could not determine repository URL. GitHub CLI (gh) may not be installed or authenticated.',
                duration: 8000,
              });
            }
          }
          onCreated();
          onOpenChange(false);
        }
      } else {
        setError(result.error || 'Failed to create pull request');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Only call onCreated() if an actual operation completed
    // This prevents unnecessary refreshes when user cancels
    if (operationCompletedRef.current) {
      // Pass the PR URL if one was created
      onCreated(prUrl || undefined);
    }
    onOpenChange(false);
    // State reset is handled by useEffect when open becomes false
  };

  if (!worktree) return null;

  const shouldShowBrowserFallback = showBrowserFallback && browserUrl;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Create Pull Request
          </DialogTitle>
          <DialogDescription className="break-words">
            {worktree.hasChanges ? 'Push changes and create' : 'Create'} a pull request from{' '}
            <code className="font-mono bg-muted px-1 rounded break-all">{worktree.branch}</code>
          </DialogDescription>
        </DialogHeader>

        {prUrl ? (
          <div className="py-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
              <GitPullRequest className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Pull Request Created!</h3>
              <p className="text-sm text-muted-foreground mt-1">Your PR is ready for review</p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => window.open(prUrl, '_blank', 'noopener,noreferrer')}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Pull Request
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : shouldShowBrowserFallback ? (
          <div className="py-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10">
              <GitPullRequest className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Branch Pushed!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your changes have been pushed to GitHub.
                <br />
                Click below to create a pull request in your browser.
              </p>
            </div>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  if (browserUrl) {
                    window.open(browserUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="gap-2 w-full"
                size="lg"
              >
                <ExternalLink className="w-4 h-4" />
                Create PR in Browser
              </Button>
              <div className="p-2 bg-muted rounded text-xs break-all font-mono">{browserUrl}</div>
              <p className="text-xs text-muted-foreground">
                Tip: Install the GitHub CLI (<code className="bg-muted px-1 rounded">gh</code>) to
                create PRs directly from the app
              </p>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-4 overflow-y-auto min-h-0 flex-1">
              {worktree.hasChanges && (
                <div className="grid gap-2">
                  <Label htmlFor="commit-message">
                    Commit Message <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="commit-message"
                    placeholder="Leave empty to auto-generate"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {worktree.changedFilesCount} uncommitted file(s) will be committed
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pr-title">PR Title</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={isGeneratingDescription || isLoading}
                    className="h-6 px-2 text-xs"
                    title={
                      worktree.hasChanges
                        ? 'Generate title and description from commits and uncommitted changes'
                        : 'Generate title and description from commits'
                    }
                  >
                    {isGeneratingDescription ? (
                      <>
                        <Spinner size="xs" className="mr-1" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                </div>
                <Input
                  id="pr-title"
                  placeholder={worktree.branch}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pr-body">Description</Label>
                <Textarea
                  id="pr-body"
                  placeholder="Describe the changes in this PR..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              <div className="flex flex-col gap-4">
                {/* Push remote selector - only show when multiple remotes and there are commits to push */}
                {remotes.length > 1 && needsPush && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="remote-select">Push to Remote</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchRemotes}
                        disabled={isLoadingRemotes}
                        className="h-6 px-2 text-xs"
                      >
                        {isLoadingRemotes ? (
                          <Spinner size="xs" className="mr-1" />
                        ) : (
                          <RefreshCw className="w-3 h-3 mr-1" />
                        )}
                        Refresh
                      </Button>
                    </div>
                    <Select value={selectedRemote} onValueChange={setSelectedRemote}>
                      <SelectTrigger id="remote-select">
                        <SelectValue placeholder="Select a remote" />
                      </SelectTrigger>
                      <SelectContent>
                        {remotes.map((remote) => (
                          <SelectItem
                            key={remote.name}
                            value={remote.name}
                            description={
                              <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {remote.url}
                              </span>
                            }
                          >
                            <span className="font-medium">{remote.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Target remote selector - which remote to create PR against */}
                {remotes.length > 1 && (
                  <div className="grid gap-2">
                    <Label htmlFor="target-remote-select">Create PR Against</Label>
                    <Select value={selectedTargetRemote} onValueChange={setSelectedTargetRemote}>
                      <SelectTrigger id="target-remote-select">
                        <SelectValue placeholder="Select target remote" />
                      </SelectTrigger>
                      <SelectContent>
                        {remotes.map((remote) => (
                          <SelectItem
                            key={remote.name}
                            value={remote.name}
                            description={
                              <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {remote.url}
                              </span>
                            }
                          >
                            <span className="font-medium">{remote.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The remote repository where the pull request will be created
                    </p>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="base-branch">Base Remote Branch</Label>
                  <BranchAutocomplete
                    value={baseBranch}
                    onChange={setBaseBranch}
                    branches={branches}
                    placeholder="Select base branch..."
                    disabled={isLoadingBranches || isLoadingRemotes}
                    allowCreate={false}
                    emptyMessage={
                      activeRemote
                        ? `No branches found on remote "${activeRemote}".`
                        : 'No matching branches found.'
                    }
                    data-testid="base-branch-autocomplete"
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="draft"
                      checked={isDraft}
                      onCheckedChange={(checked) => setIsDraft(checked === true)}
                    />
                    <Label htmlFor="draft" className="cursor-pointer">
                      Create as draft
                    </Label>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter className="shrink-0 pt-2 border-t">
              <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <GitPullRequest className="w-4 h-4 mr-2" />
                    Create PR
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
