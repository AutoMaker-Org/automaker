import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Trash2,
  MoreHorizontal,
  GitCommit,
  GitPullRequest,
  Download,
  Upload,
  Play,
  Square,
  Globe,
  MessageSquare,
  GitMerge,
  AlertCircle,
  RefreshCw,
  Copy,
  Eye,
  ScrollText,
  Sparkles,
  Terminal,
  SquarePlus,
  SplitSquareHorizontal,
  Undo2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { WorktreeInfo, DevServerInfo, PRInfo, GitRepoStatus } from '../types';
import { TooltipWrapper } from './tooltip-wrapper';
import { useAvailableEditors, useEffectiveDefaultEditor } from '../hooks/use-available-editors';
import {
  useAvailableTerminals,
  useEffectiveDefaultTerminal,
} from '../hooks/use-available-terminals';
import { getEditorIcon } from '@/components/icons/editor-icons';
import { getTerminalIcon } from '@/components/icons/terminal-icons';
import { useAppStore } from '@/store/app-store';

interface WorktreeActionsDropdownProps {
  worktree: WorktreeInfo;
  isSelected: boolean;
  aheadCount: number;
  behindCount: number;
  hasRemoteBranch: boolean;
  isPulling: boolean;
  isPushing: boolean;
  isStartingDevServer: boolean;
  isDevServerRunning: boolean;
  devServerInfo?: DevServerInfo;
  gitRepoStatus: GitRepoStatus;
  /** When true, renders as a standalone button (not attached to another element) */
  standalone?: boolean;
  /** Whether auto mode is running for this worktree */
  isAutoModeRunning?: boolean;
  onOpenChange: (open: boolean) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onPushNewBranch: (worktree: WorktreeInfo) => void;
  onOpenInEditor: (worktree: WorktreeInfo, editorCommand?: string) => void;
  onOpenInIntegratedTerminal: (worktree: WorktreeInfo, mode?: 'tab' | 'split') => void;
  onOpenInExternalTerminal: (worktree: WorktreeInfo, terminalId?: string) => void;
  onViewChanges: (worktree: WorktreeInfo) => void;
  onDiscardChanges: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
  onViewDevServerLogs: (worktree: WorktreeInfo) => void;
  onRunInitScript: (worktree: WorktreeInfo) => void;
  onToggleAutoMode?: (worktree: WorktreeInfo) => void;
  onMerge: (worktree: WorktreeInfo) => void;
  hasInitScript: boolean;
}

export function WorktreeActionsDropdown({
  worktree,
  isSelected,
  aheadCount,
  behindCount,
  hasRemoteBranch,
  isPulling,
  isPushing,
  isStartingDevServer,
  isDevServerRunning,
  devServerInfo,
  gitRepoStatus,
  standalone = false,
  isAutoModeRunning = false,
  onOpenChange,
  onPull,
  onPush,
  onPushNewBranch,
  onOpenInEditor,
  onOpenInIntegratedTerminal,
  onOpenInExternalTerminal,
  onViewChanges,
  onDiscardChanges,
  onCommit,
  onCreatePR,
  onAddressPRComments,
  onResolveConflicts,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
  onViewDevServerLogs,
  onRunInitScript,
  onToggleAutoMode,
  onMerge,
  hasInitScript,
}: WorktreeActionsDropdownProps) {
  // Get available editors for the "Open In" submenu
  const { editors } = useAvailableEditors();

  // Use shared hook for effective default editor
  const effectiveDefaultEditor = useEffectiveDefaultEditor(editors);

  // Get other editors (excluding the default) for the submenu
  const otherEditors = editors.filter((e) => e.command !== effectiveDefaultEditor?.command);

  // Get icon component for the effective editor (avoid IIFE in JSX)
  const DefaultEditorIcon = effectiveDefaultEditor
    ? getEditorIcon(effectiveDefaultEditor.command)
    : null;

  // Get available terminals for the "Open In Terminal" submenu
  const { terminals, hasExternalTerminals } = useAvailableTerminals();

  // Use shared hook for effective default terminal (null = integrated terminal)
  const effectiveDefaultTerminal = useEffectiveDefaultTerminal(terminals);

  // Get the user's preferred mode for opening terminals (new tab vs split)
  const openTerminalMode = useAppStore((s) => s.terminalState.openTerminalMode);

  // Get icon component for the effective terminal
  const DefaultTerminalIcon = effectiveDefaultTerminal
    ? getTerminalIcon(effectiveDefaultTerminal.id)
    : Terminal;

  // Check if there's a PR associated with this worktree from stored metadata
  const hasPR = !!worktree.pr;

  // Check git operations availability
  const canPerformGitOps = gitRepoStatus.isGitRepo && gitRepoStatus.hasCommits;
  const gitOpsDisabledReason = !gitRepoStatus.isGitRepo
    ? 'Not a git repository'
    : !gitRepoStatus.hasCommits
      ? 'Repository has no commits yet'
      : null;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={standalone ? 'outline' : isSelected ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-7 w-7 p-0',
            !standalone && 'rounded-l-none',
            standalone && 'h-8 w-8 shrink-0',
            !standalone && isSelected && 'bg-primary text-primary-foreground',
            !standalone && !isSelected && 'bg-secondary/50 hover:bg-secondary'
          )}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Warning label when git operations are not available */}
        {!canPerformGitOps && (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {gitOpsDisabledReason}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {isDevServerRunning ? (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Dev Server Running (:{devServerInfo?.port})
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onOpenDevServerUrl(worktree)}
              className="text-xs"
              aria-label={`Open dev server on port ${devServerInfo?.port} in browser`}
            >
              <Globe className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
              Open in Browser
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewDevServerLogs(worktree)} className="text-xs">
              <ScrollText className="w-3.5 h-3.5 mr-2" />
              View Logs
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStopDevServer(worktree)}
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
              onClick={() => onStartDevServer(worktree)}
              disabled={isStartingDevServer}
              className="text-xs"
            >
              <Play className={cn('w-3.5 h-3.5 mr-2', isStartingDevServer && 'animate-pulse')} />
              {isStartingDevServer ? 'Starting...' : 'Start Dev Server'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {/* Auto Mode toggle */}
        {onToggleAutoMode && (
          <>
            {isAutoModeRunning ? (
              <DropdownMenuItem onClick={() => onToggleAutoMode(worktree)} className="text-xs">
                <span className="flex items-center mr-2">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="ml-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </span>
                Stop Auto Mode
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onToggleAutoMode(worktree)} className="text-xs">
                <Zap className="w-3.5 h-3.5 mr-2" />
                Start Auto Mode
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          <DropdownMenuItem
            onClick={() => canPerformGitOps && onPull(worktree)}
            disabled={isPulling || !canPerformGitOps}
            className={cn('text-xs', !canPerformGitOps && 'opacity-50 cursor-not-allowed')}
          >
            <Download className={cn('w-3.5 h-3.5 mr-2', isPulling && 'animate-pulse')} />
            {isPulling ? 'Pulling...' : 'Pull'}
            {!canPerformGitOps && <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />}
            {canPerformGitOps && behindCount > 0 && (
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
                {behindCount} behind
              </span>
            )}
          </DropdownMenuItem>
        </TooltipWrapper>
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          <DropdownMenuItem
            onClick={() => {
              if (!canPerformGitOps) return;
              if (!hasRemoteBranch) {
                onPushNewBranch(worktree);
              } else {
                onPush(worktree);
              }
            }}
            disabled={isPushing || (hasRemoteBranch && aheadCount === 0) || !canPerformGitOps}
            className={cn('text-xs', !canPerformGitOps && 'opacity-50 cursor-not-allowed')}
          >
            <Upload className={cn('w-3.5 h-3.5 mr-2', isPushing && 'animate-pulse')} />
            {isPushing ? 'Pushing...' : 'Push'}
            {!canPerformGitOps && <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />}
            {canPerformGitOps && !hasRemoteBranch && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                <Sparkles className="w-2.5 h-2.5" />
                new
              </span>
            )}
            {canPerformGitOps && hasRemoteBranch && aheadCount > 0 && (
              <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                {aheadCount} ahead
              </span>
            )}
          </DropdownMenuItem>
        </TooltipWrapper>
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          <DropdownMenuItem
            onClick={() => canPerformGitOps && onResolveConflicts(worktree)}
            disabled={!canPerformGitOps}
            className={cn(
              'text-xs text-purple-500 focus:text-purple-600',
              !canPerformGitOps && 'opacity-50 cursor-not-allowed'
            )}
          >
            <GitMerge className="w-3.5 h-3.5 mr-2" />
            Pull & Resolve Conflicts
            {!canPerformGitOps && <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />}
          </DropdownMenuItem>
        </TooltipWrapper>
        <DropdownMenuSeparator />
        {/* Open in editor - split button: click main area for default, chevron for other options */}
        {effectiveDefaultEditor && (
          <DropdownMenuSub>
            <div className="flex items-center">
              {/* Main clickable area - opens in default editor */}
              <DropdownMenuItem
                onClick={() => onOpenInEditor(worktree, effectiveDefaultEditor.command)}
                className="text-xs flex-1 pr-0 rounded-r-none"
              >
                {DefaultEditorIcon && <DefaultEditorIcon className="w-3.5 h-3.5 mr-2" />}
                Open in {effectiveDefaultEditor.name}
              </DropdownMenuItem>
              {/* Chevron trigger for submenu with other editors and Copy Path */}
              <DropdownMenuSubTrigger className="text-xs px-1 rounded-l-none border-l border-border/30 h-8" />
            </div>
            <DropdownMenuSubContent>
              {/* Other editors */}
              {otherEditors.map((editor) => {
                const EditorIcon = getEditorIcon(editor.command);
                return (
                  <DropdownMenuItem
                    key={editor.command}
                    onClick={() => onOpenInEditor(worktree, editor.command)}
                    className="text-xs"
                  >
                    <EditorIcon className="w-3.5 h-3.5 mr-2" />
                    {editor.name}
                  </DropdownMenuItem>
                );
              })}
              {otherEditors.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(worktree.path);
                    toast.success('Path copied to clipboard');
                  } catch {
                    toast.error('Failed to copy path to clipboard');
                  }
                }}
                className="text-xs"
              >
                <Copy className="w-3.5 h-3.5 mr-2" />
                Copy Path
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {/* Open in terminal - always show with integrated + external options */}
        <DropdownMenuSub>
          <div className="flex items-center">
            {/* Main clickable area - opens in default terminal (integrated or external) */}
            <DropdownMenuItem
              onClick={() => {
                if (effectiveDefaultTerminal) {
                  // External terminal is the default
                  onOpenInExternalTerminal(worktree, effectiveDefaultTerminal.id);
                } else {
                  // Integrated terminal is the default - use user's preferred mode
                  const mode = openTerminalMode === 'newTab' ? 'tab' : 'split';
                  onOpenInIntegratedTerminal(worktree, mode);
                }
              }}
              className="text-xs flex-1 pr-0 rounded-r-none"
            >
              <DefaultTerminalIcon className="w-3.5 h-3.5 mr-2" />
              Open in {effectiveDefaultTerminal?.name ?? 'Terminal'}
            </DropdownMenuItem>
            {/* Chevron trigger for submenu with all terminals */}
            <DropdownMenuSubTrigger className="text-xs px-1 rounded-l-none border-l border-border/30 h-8" />
          </div>
          <DropdownMenuSubContent>
            {/* Automaker Terminal - with submenu for new tab vs split */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                <Terminal className="w-3.5 h-3.5 mr-2" />
                Terminal
                {!effectiveDefaultTerminal && (
                  <span className="ml-auto mr-2 text-[10px] text-muted-foreground">(default)</span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => onOpenInIntegratedTerminal(worktree, 'tab')}
                  className="text-xs"
                >
                  <SquarePlus className="w-3.5 h-3.5 mr-2" />
                  New Tab
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onOpenInIntegratedTerminal(worktree, 'split')}
                  className="text-xs"
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5 mr-2" />
                  Split
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* External terminals */}
            {terminals.length > 0 && <DropdownMenuSeparator />}
            {terminals.map((terminal) => {
              const TerminalIcon = getTerminalIcon(terminal.id);
              const isDefault = terminal.id === effectiveDefaultTerminal?.id;
              return (
                <DropdownMenuItem
                  key={terminal.id}
                  onClick={() => onOpenInExternalTerminal(worktree, terminal.id)}
                  className="text-xs"
                >
                  <TerminalIcon className="w-3.5 h-3.5 mr-2" />
                  {terminal.name}
                  {isDefault && (
                    <span className="ml-auto text-[10px] text-muted-foreground">(default)</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {!worktree.isMain && hasInitScript && (
          <DropdownMenuItem onClick={() => onRunInitScript(worktree)} className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Re-run Init Script
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />

        {worktree.hasChanges && (
          <DropdownMenuItem onClick={() => onViewChanges(worktree)} className="text-xs">
            <Eye className="w-3.5 h-3.5 mr-2" />
            View Changes
          </DropdownMenuItem>
        )}
        {worktree.hasChanges && (
          <TooltipWrapper
            showTooltip={!gitRepoStatus.isGitRepo}
            tooltipContent="Not a git repository"
          >
            <DropdownMenuItem
              onClick={() => gitRepoStatus.isGitRepo && onCommit(worktree)}
              disabled={!gitRepoStatus.isGitRepo}
              className={cn('text-xs', !gitRepoStatus.isGitRepo && 'opacity-50 cursor-not-allowed')}
            >
              <GitCommit className="w-3.5 h-3.5 mr-2" />
              Commit Changes
              {!gitRepoStatus.isGitRepo && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {/* Show PR option for non-primary worktrees, or primary worktree with changes */}
        {(!worktree.isMain || worktree.hasChanges) && !hasPR && (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => canPerformGitOps && onCreatePR(worktree)}
              disabled={!canPerformGitOps}
              className={cn('text-xs', !canPerformGitOps && 'opacity-50 cursor-not-allowed')}
            >
              <GitPullRequest className="w-3.5 h-3.5 mr-2" />
              Create Pull Request
              {!canPerformGitOps && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {/* Show PR info and Address Comments button if PR exists */}
        {hasPR && worktree.pr && (
          <>
            <DropdownMenuItem
              onClick={() => {
                window.open(worktree.pr!.url, '_blank', 'noopener,noreferrer');
              }}
              className="text-xs"
            >
              <GitPullRequest className="w-3 h-3 mr-2" />
              PR #{worktree.pr.number}
              <span className="ml-auto text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded uppercase">
                {worktree.pr.state}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // Convert stored PR info to the full PRInfo format for the handler
                // The handler will fetch full comments from GitHub
                const prInfo: PRInfo = {
                  number: worktree.pr!.number,
                  title: worktree.pr!.title,
                  url: worktree.pr!.url,
                  state: worktree.pr!.state,
                  author: '', // Will be fetched
                  body: '', // Will be fetched
                  comments: [],
                  reviewComments: [],
                };
                onAddressPRComments(worktree, prInfo);
              }}
              className="text-xs text-blue-500 focus:text-blue-600"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-2" />
              Address PR Comments
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {worktree.hasChanges && (
          <TooltipWrapper
            showTooltip={!gitRepoStatus.isGitRepo}
            tooltipContent="Not a git repository"
          >
            <DropdownMenuItem
              onClick={() => gitRepoStatus.isGitRepo && onDiscardChanges(worktree)}
              disabled={!gitRepoStatus.isGitRepo}
              className={cn(
                'text-xs text-destructive focus:text-destructive',
                !gitRepoStatus.isGitRepo && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Undo2 className="w-3.5 h-3.5 mr-2" />
              Discard Changes
              {!gitRepoStatus.isGitRepo && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {!worktree.isMain && (
          <>
            <TooltipWrapper
              showTooltip={!!gitOpsDisabledReason}
              tooltipContent={gitOpsDisabledReason}
            >
              <DropdownMenuItem
                onClick={() => canPerformGitOps && onMerge(worktree)}
                disabled={!canPerformGitOps}
                className={cn(
                  'text-xs text-green-600 focus:text-green-700',
                  !canPerformGitOps && 'opacity-50 cursor-not-allowed'
                )}
              >
                <GitMerge className="w-3.5 h-3.5 mr-2" />
                Merge Branch
                {!canPerformGitOps && (
                  <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                )}
              </DropdownMenuItem>
            </TooltipWrapper>
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
  );
}
