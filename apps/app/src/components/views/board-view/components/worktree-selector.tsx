"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  Plus,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  Download,
  Upload,
  GitBranchPlus,
  Check,
  Search,
  Play,
  Square,
  Globe,
  Loader2,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean; // Is this the currently checked out branch?
  hasWorktree: boolean; // Does this branch have an active worktree?
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface DevServerInfo {
  worktreePath: string;
  port: number;
  url: string;
}

interface FeatureInfo {
  id: string;
  worktreePath?: string;
}

interface WorktreeSelectorProps {
  projectPath: string;
  onCreateWorktree: () => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  runningFeatureIds?: string[];
  features?: FeatureInfo[];
  /** Increment this to trigger a refresh without unmounting the component */
  refreshTrigger?: number;
}

export function WorktreeSelector({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
  runningFeatureIds = [],
  features = [],
  refreshTrigger = 0,
}: WorktreeSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [runningDevServers, setRunningDevServers] = useState<Map<string, DevServerInfo>>(new Map());
  const currentWorktree = useAppStore((s) => s.getCurrentWorktree(projectPath));
  const setCurrentWorktree = useAppStore((s) => s.setCurrentWorktree);
  const setWorktreesInStore = useAppStore((s) => s.setWorktrees);

  const fetchWorktrees = useCallback(async () => {
    if (!projectPath) return;
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listAll) {
        console.warn("Worktree API not available");
        return;
      }
      const result = await api.worktree.listAll(projectPath, true);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
        setWorktreesInStore(projectPath, result.worktrees);
      }
    } catch (error) {
      console.error("Failed to fetch worktrees:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, setWorktreesInStore]);

  const fetchDevServers = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listDevServers) {
        return;
      }
      const result = await api.worktree.listDevServers();
      if (result.success && result.result?.servers) {
        const serversMap = new Map<string, DevServerInfo>();
        for (const server of result.result.servers) {
          serversMap.set(server.worktreePath, server);
        }
        setRunningDevServers(serversMap);
      }
    } catch (error) {
      console.error("Failed to fetch dev servers:", error);
    }
  }, []);

  const fetchBranches = useCallback(async (worktreePath: string) => {
    setIsLoadingBranches(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listBranches) {
        console.warn("List branches API not available");
        return;
      }
      const result = await api.worktree.listBranches(worktreePath);
      if (result.success && result.result) {
        setBranches(result.result.branches);
        setAheadCount(result.result.aheadCount || 0);
        setBehindCount(result.result.behindCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch branches:", error);
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    fetchWorktrees();
    fetchDevServers();
  }, [fetchWorktrees, fetchDevServers]);

  // Refresh when refreshTrigger changes (but skip the initial render)
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchWorktrees();
    }
  }, [refreshTrigger, fetchWorktrees]);

  // Initialize selection to main if not set
  useEffect(() => {
    if (worktrees.length > 0 && currentWorktree === undefined) {
      setCurrentWorktree(projectPath, null); // null = main worktree
    }
  }, [worktrees, currentWorktree, projectPath, setCurrentWorktree]);

  const handleSelectWorktree = async (worktree: WorktreeInfo) => {
    // Simply select the worktree in the UI
    setCurrentWorktree(projectPath, worktree.isMain ? null : worktree.path);
  };

  const handleStartDevServer = async (worktree: WorktreeInfo) => {
    if (isStartingDevServer) return;
    setIsStartingDevServer(true);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.startDevServer) {
        toast.error("Start dev server API not available");
        return;
      }

      // Use projectPath for main, worktree.path for others
      const targetPath = worktree.isMain ? projectPath : worktree.path;
      const result = await api.worktree.startDevServer(projectPath, targetPath);

      if (result.success && result.result) {
        // Update running servers map
        setRunningDevServers((prev) => {
          const next = new Map(prev);
          next.set(targetPath, {
            worktreePath: result.result!.worktreePath,
            port: result.result!.port,
            url: result.result!.url,
          });
          return next;
        });
        toast.success(`Dev server started on port ${result.result.port}`);
      } else {
        toast.error(result.error || "Failed to start dev server");
      }
    } catch (error) {
      console.error("Start dev server failed:", error);
      toast.error("Failed to start dev server");
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const handleStopDevServer = async (worktree: WorktreeInfo) => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.stopDevServer) {
        toast.error("Stop dev server API not available");
        return;
      }

      // Use projectPath for main, worktree.path for others
      const targetPath = worktree.isMain ? projectPath : worktree.path;
      const result = await api.worktree.stopDevServer(targetPath);

      if (result.success) {
        // Update running servers map
        setRunningDevServers((prev) => {
          const next = new Map(prev);
          next.delete(targetPath);
          return next;
        });
        toast.success(result.result?.message || "Dev server stopped");
      } else {
        toast.error(result.error || "Failed to stop dev server");
      }
    } catch (error) {
      console.error("Stop dev server failed:", error);
      toast.error("Failed to stop dev server");
    }
  };

  const handleOpenDevServerUrl = (worktree: WorktreeInfo) => {
    const targetPath = worktree.isMain ? projectPath : worktree.path;
    const serverInfo = runningDevServers.get(targetPath);
    if (serverInfo) {
      window.open(serverInfo.url, "_blank");
    }
  };

  // Helper to get the path key for a worktree (for looking up in runningDevServers)
  const getWorktreeKey = (worktree: WorktreeInfo) => {
    return worktree.isMain ? projectPath : worktree.path;
  };

  // Helper to check if a worktree has running features
  const hasRunningFeatures = (worktree: WorktreeInfo) => {
    if (runningFeatureIds.length === 0) return false;

    const worktreeKey = getWorktreeKey(worktree);

    // Check if any running feature belongs to this worktree
    return runningFeatureIds.some((featureId) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return false;

      // For main worktree, check features with no worktreePath or matching projectPath
      if (worktree.isMain) {
        return !feature.worktreePath || feature.worktreePath === projectPath;
      }

      // For other worktrees, check if worktreePath matches
      return feature.worktreePath === worktreeKey;
    });
  };

  const handleActivateWorktree = async (worktree: WorktreeInfo) => {
    if (isActivating) return;
    setIsActivating(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.activate) {
        toast.error("Activate worktree API not available");
        return;
      }
      const result = await api.worktree.activate(projectPath, worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // After activation, refresh to show updated state
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to activate worktree");
      }
    } catch (error) {
      console.error("Activate worktree failed:", error);
      toast.error("Failed to activate worktree");
    } finally {
      setIsActivating(false);
    }
  };

  const handleSwitchToBranch = async (branchName: string) => {
    if (isActivating) return;
    setIsActivating(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.activate) {
        toast.error("Activate API not available");
        return;
      }
      // Pass null as worktreePath to switch to a branch without a worktree
      // We'll need to update the activate endpoint to handle this case
      const result = await api.worktree.switchBranch(projectPath, branchName);
      if (result.success && result.result) {
        toast.success(result.result.message);
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to switch branch");
      }
    } catch (error) {
      console.error("Switch branch failed:", error);
      toast.error("Failed to switch branch");
    } finally {
      setIsActivating(false);
    }
  };

  const handleOpenInEditor = async (worktree: WorktreeInfo) => {
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.openInEditor) {
        console.warn("Open in editor API not available");
        return;
      }
      const result = await api.worktree.openInEditor(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Open in editor failed:", error);
    }
  };

  const handleSwitchBranch = async (worktree: WorktreeInfo, branchName: string) => {
    if (isSwitching || branchName === worktree.branch) return;
    setIsSwitching(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.switchBranch) {
        toast.error("Switch branch API not available");
        return;
      }
      const result = await api.worktree.switchBranch(worktree.path, branchName);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // Refresh worktrees to get updated branch info
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to switch branch");
      }
    } catch (error) {
      console.error("Switch branch failed:", error);
      toast.error("Failed to switch branch");
    } finally {
      setIsSwitching(false);
    }
  };

  const handlePull = async (worktree: WorktreeInfo) => {
    if (isPulling) return;
    setIsPulling(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.pull) {
        toast.error("Pull API not available");
        return;
      }
      const result = await api.worktree.pull(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // Refresh worktrees to get updated status
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to pull latest changes");
      }
    } catch (error) {
      console.error("Pull failed:", error);
      toast.error("Failed to pull latest changes");
    } finally {
      setIsPulling(false);
    }
  };

  const handlePush = async (worktree: WorktreeInfo) => {
    if (isPushing) return;
    setIsPushing(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.push) {
        toast.error("Push API not available");
        return;
      }
      const result = await api.worktree.push(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // Refresh to update ahead/behind counts
        fetchBranches(worktree.path);
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to push changes");
      }
    } catch (error) {
      console.error("Push failed:", error);
      toast.error("Failed to push changes");
    } finally {
      setIsPushing(false);
    }
  };

  // The "selected" worktree is based on UI state, not git's current branch
  // currentWorktree is null for main, or the worktree path for others
  const selectedWorktree = currentWorktree
    ? worktrees.find((w) => w.path === currentWorktree)
    : worktrees.find((w) => w.isMain);

  if (worktrees.length === 0 && !isLoading) {
    // No git repo or loading
    return null;
  }

  // Render a worktree tab with branch selector (for main) and actions dropdown
  const renderWorktreeTab = (worktree: WorktreeInfo) => {
    // Selection is based on UI state, not git's current branch
    // Default to main selected if currentWorktree is null or undefined
    const isSelected = worktree.isMain
      ? currentWorktree === null || currentWorktree === undefined
      : worktree.path === currentWorktree;

    const isRunning = hasRunningFeatures(worktree);

    return (
      <div key={worktree.path} className="flex items-center">
        {/* Main branch: clickable button + separate branch switch dropdown */}
        {worktree.isMain ? (
          <>
            {/* Clickable button to select/preview main */}
            <Button
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 px-3 text-xs font-mono gap-1.5 border-r-0 rounded-l-md rounded-r-none",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && "bg-secondary/50 hover:bg-secondary"
              )}
              onClick={() => handleSelectWorktree(worktree)}
              disabled={isActivating}
              title="Click to preview main"
            >
              {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
              {isActivating && !isRunning && <RefreshCw className="w-3 h-3 animate-spin" />}
              {worktree.branch}
              {worktree.hasChanges && (
                <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                  {worktree.changedFilesCount}
                </span>
              )}
            </Button>
            {/* Branch switch dropdown button */}
            <DropdownMenu onOpenChange={(open) => {
              if (open) {
                fetchBranches(worktree.path);
                setBranchFilter("");
              }
            }}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 w-7 p-0 rounded-none border-r-0",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected && "bg-secondary/50 hover:bg-secondary"
                  )}
                  title="Switch branch"
                >
                  <GitBranch className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs">Switch Branch</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Search input */}
                <div className="px-2 py-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter branches..."
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      className="h-7 pl-7 text-xs"
                      autoFocus
                    />
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-[250px] overflow-y-auto">
                  {isLoadingBranches ? (
                    <DropdownMenuItem disabled className="text-xs">
                      <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Loading branches...
                    </DropdownMenuItem>
                  ) : (() => {
                    const filteredBranches = branches.filter((b) =>
                      b.name.toLowerCase().includes(branchFilter.toLowerCase())
                    );
                    if (filteredBranches.length === 0) {
                      return (
                        <DropdownMenuItem disabled className="text-xs">
                          {branchFilter ? "No matching branches" : "No branches found"}
                        </DropdownMenuItem>
                      );
                    }
                    return filteredBranches.map((branch) => (
                      <DropdownMenuItem
                        key={branch.name}
                        onClick={() => handleSwitchBranch(worktree, branch.name)}
                        disabled={isSwitching || branch.name === worktree.branch}
                        className="text-xs font-mono"
                      >
                        {branch.name === worktree.branch ? (
                          <Check className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                        ) : (
                          <span className="w-3.5 mr-2 flex-shrink-0" />
                        )}
                        <span className="truncate">{branch.name}</span>
                      </DropdownMenuItem>
                    ));
                  })()}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onCreateBranch(worktree)}
                  className="text-xs"
                >
                  <GitBranchPlus className="w-3.5 h-3.5 mr-2" />
                  Create New Branch...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          // Non-main branches - click to switch to this branch
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-mono gap-1.5 rounded-l-md rounded-r-none border-r-0",
              isSelected && "bg-primary text-primary-foreground",
              !isSelected && "bg-secondary/50 hover:bg-secondary",
              !worktree.hasWorktree && !isSelected && "opacity-70" // Dim if no active worktree
            )}
            onClick={() => handleSelectWorktree(worktree)}
            disabled={isActivating}
            title={worktree.hasWorktree
              ? "Click to switch to this worktree's branch"
              : "Click to switch to this branch"}
          >
            {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
            {isActivating && !isRunning && <RefreshCw className="w-3 h-3 animate-spin" />}
            {worktree.branch}
            {worktree.hasChanges && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                {worktree.changedFilesCount}
              </span>
            )}
          </Button>
        )}

        {/* Dev server indicator */}
        {runningDevServers.has(getWorktreeKey(worktree)) && (
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 w-7 p-0 rounded-none border-r-0",
              isSelected && "bg-primary text-primary-foreground",
              !isSelected && "bg-secondary/50 hover:bg-secondary",
              "text-green-500"
            )}
            onClick={() => handleOpenDevServerUrl(worktree)}
            title={`Open dev server (port ${runningDevServers.get(getWorktreeKey(worktree))?.port})`}
          >
            <Globe className="w-3 h-3" />
          </Button>
        )}

        {/* Actions dropdown */}
        <DropdownMenu onOpenChange={(open) => {
          if (open) {
            fetchBranches(worktree.path);
          }
        }}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 w-7 p-0 rounded-l-none",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && "bg-secondary/50 hover:bg-secondary"
              )}
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {/* Dev server controls */}
            {runningDevServers.has(getWorktreeKey(worktree)) ? (
              <>
                <DropdownMenuLabel className="text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Dev Server Running (:{runningDevServers.get(getWorktreeKey(worktree))?.port})
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => handleOpenDevServerUrl(worktree)}
                  className="text-xs"
                >
                  <Globe className="w-3.5 h-3.5 mr-2" />
                  Open in Browser
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStopDevServer(worktree)}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <Square className="w-3.5 h-3.5 mr-2" />
                  Stop Dev Server
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => handleStartDevServer(worktree)}
                  disabled={isStartingDevServer}
                  className="text-xs"
                >
                  <Play className={cn("w-3.5 h-3.5 mr-2", isStartingDevServer && "animate-pulse")} />
                  {isStartingDevServer ? "Starting..." : "Start Dev Server"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Pull option */}
            <DropdownMenuItem
              onClick={() => handlePull(worktree)}
              disabled={isPulling}
              className="text-xs"
            >
              <Download className={cn("w-3.5 h-3.5 mr-2", isPulling && "animate-pulse")} />
              {isPulling ? "Pulling..." : "Pull"}
              {behindCount > 0 && (
                <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {behindCount} behind
                </span>
              )}
            </DropdownMenuItem>
            {/* Push option */}
            <DropdownMenuItem
              onClick={() => handlePush(worktree)}
              disabled={isPushing || aheadCount === 0}
              className="text-xs"
            >
              <Upload className={cn("w-3.5 h-3.5 mr-2", isPushing && "animate-pulse")} />
              {isPushing ? "Pushing..." : "Push"}
              {aheadCount > 0 && (
                <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                  {aheadCount} ahead
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Open in editor */}
            <DropdownMenuItem
              onClick={() => handleOpenInEditor(worktree)}
              className="text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Open in Editor
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Commit changes */}
            {worktree.hasChanges && (
              <DropdownMenuItem
                onClick={() => onCommit(worktree)}
                className="text-xs"
              >
                <GitCommit className="w-3.5 h-3.5 mr-2" />
                Commit Changes
              </DropdownMenuItem>
            )}
            {/* Show PR option if not on main branch, or if on main with changes */}
            {(worktree.branch !== "main" || worktree.hasChanges) && (
              <DropdownMenuItem
                onClick={() => onCreatePR(worktree)}
                className="text-xs"
              >
                <GitPullRequest className="w-3.5 h-3.5 mr-2" />
                Create Pull Request
              </DropdownMenuItem>
            )}
            {/* Only show delete for non-main worktrees */}
            {!worktree.isMain && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteWorktree(worktree)}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Worktree
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">Branch:</span>

      {/* Worktree Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {worktrees.map((worktree) => renderWorktreeTab(worktree))}

        {/* Add Worktree Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onCreateWorktree}
          title="Create new worktree"
        >
          <Plus className="w-4 h-4" />
        </Button>

        {/* Refresh Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={fetchWorktrees}
          disabled={isLoading}
          title="Refresh worktrees"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
