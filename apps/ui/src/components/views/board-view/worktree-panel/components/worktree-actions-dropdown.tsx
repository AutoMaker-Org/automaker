import { useMemo } from 'react';
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
  CloudOff,
  Terminal,
  SquarePlus,
  SplitSquareHorizontal,
  Undo2,
  Zap,
  FlaskConical,
  History,
  Archive,
  Cherry,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import type { WorktreeInfo, DevServerInfo, PRInfo, GitRepoStatus, TestSessionInfo } from '../types';
import { TooltipWrapper } from './tooltip-wrapper';
import { useAvailableEditors, useEffectiveDefaultEditor } from '../hooks/use-available-editors';
import {
  useAvailableTerminals,
  useEffectiveDefaultTerminal,
} from '../hooks/use-available-terminals';
import { getEditorIcon } from '@/components/icons/editor-icons';
import { getTerminalIcon } from '@/components/icons/terminal-icons';
import { useAppStore } from '@/store/app-store';
import type { TerminalScript } from '@/components/views/project-settings-view/terminal-scripts-constants';

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
  /** When true, git repo status is still being loaded */
  isLoadingGitStatus?: boolean;
  /** When true, renders as a standalone button (not attached to another element) */
  standalone?: boolean;
  /** Whether auto mode is running for this worktree */
  isAutoModeRunning?: boolean;
  /** Whether a test command is configured in project settings */
  hasTestCommand?: boolean;
  /** Whether tests are being started for this worktree */
  isStartingTests?: boolean;
  /** Whether tests are currently running for this worktree */
  isTestRunning?: boolean;
  /** Active test session info for this worktree */
  testSessionInfo?: TestSessionInfo;
  /** List of available remotes for this worktree (used to show remote submenu) */
  remotes?: Array<{ name: string; url: string }>;
  /** The name of the remote that the current branch is tracking (e.g. "origin"), if any */
  trackingRemote?: string;
  onOpenChange: (open: boolean) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onPushNewBranch: (worktree: WorktreeInfo) => void;
  /** Pull from a specific remote, bypassing the remote selection dialog */
  onPullWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  /** Push to a specific remote, bypassing the remote selection dialog */
  onPushWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  onOpenInEditor: (worktree: WorktreeInfo, editorCommand?: string) => void;
  onOpenInIntegratedTerminal: (worktree: WorktreeInfo, mode?: 'tab' | 'split') => void;
  onOpenInExternalTerminal: (worktree: WorktreeInfo, terminalId?: string) => void;
  onViewChanges: (worktree: WorktreeInfo) => void;
  onViewCommits: (worktree: WorktreeInfo) => void;
  onDiscardChanges: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onAutoAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
  onViewDevServerLogs: (worktree: WorktreeInfo) => void;
  onRunInitScript: (worktree: WorktreeInfo) => void;
  onToggleAutoMode?: (worktree: WorktreeInfo) => void;
  onMerge: (worktree: WorktreeInfo) => void;
  /** Start running tests for this worktree */
  onStartTests?: (worktree: WorktreeInfo) => void;
  /** Stop running tests for this worktree */
  onStopTests?: (worktree: WorktreeInfo) => void;
  /** View test logs for this worktree */
  onViewTestLogs?: (worktree: WorktreeInfo) => void;
  /** Stash changes for this worktree */
  onStashChanges?: (worktree: WorktreeInfo) => void;
  /** View stashes for this worktree */
  onViewStashes?: (worktree: WorktreeInfo) => void;
  /** Cherry-pick commits from another branch */
  onCherryPick?: (worktree: WorktreeInfo) => void;
  /** Abort an in-progress merge/rebase/cherry-pick */
  onAbortOperation?: (worktree: WorktreeInfo) => void;
  /** Continue an in-progress merge/rebase/cherry-pick after resolving conflicts */
  onContinueOperation?: (worktree: WorktreeInfo) => void;
  hasInitScript: boolean;
  /** Terminal quick scripts configured for the project */
  terminalScripts?: TerminalScript[];
  /** Callback to run a terminal quick script in a new terminal session */
  onRunTerminalScript?: (worktree: WorktreeInfo, command: string) => void;
  /** Callback to open the script editor UI */
  onEditScripts?: () => void;
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
  isLoadingGitStatus = false,
  standalone = false,
  isAutoModeRunning = false,
  hasTestCommand = false,
  isStartingTests = false,
  isTestRunning = false,
  testSessionInfo,
  remotes,
  trackingRemote,
  onOpenChange,
  onPull,
  onPush,
  onPushNewBranch,
  onPullWithRemote,
  onPushWithRemote,
  onOpenInEditor,
  onOpenInIntegratedTerminal,
  onOpenInExternalTerminal,
  onViewChanges,
  onViewCommits,
  onDiscardChanges,
  onCommit,
  onCreatePR,
  onAddressPRComments,
  onAutoAddressPRComments,
  onResolveConflicts,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
  onViewDevServerLogs,
  onRunInitScript,
  onToggleAutoMode,
  onMerge,
  onStartTests,
  onStopTests,
  onViewTestLogs,
  onStashChanges,
  onViewStashes,
  onCherryPick,
  onAbortOperation,
  onContinueOperation,
  hasInitScript,
  terminalScripts,
  onRunTerminalScript,
  onEditScripts,
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
  const { terminals } = useAvailableTerminals();

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
  // While git status is loading, treat git ops as unavailable to avoid stale state enabling actions
  const isGitOpsAvailable = !isLoadingGitStatus && canPerformGitOps;
  const gitOpsDisabledReason = isLoadingGitStatus
    ? 'Checking git status...'
    : !gitRepoStatus.isGitRepo
      ? 'Not a git repository'
      : !gitRepoStatus.hasCommits
        ? 'Repository has no commits yet'
        : null;

  // Determine if the changes/PR section has any visible items
  // Show Create PR when no existing PR is linked
  const showCreatePR = !hasPR;
  const showPRInfo = hasPR && !!worktree.pr;
  const hasChangesSectionContent =
    worktree.hasChanges || showCreatePR || showPRInfo || !!(onStashChanges || onViewStashes);

  // Determine if the destructive/bottom section has any visible items
  const hasDestructiveSectionContent = worktree.hasChanges || !worktree.isMain;

  // Pre-compute PR info for the PR submenu (avoids an IIFE in JSX)
  const prInfo = useMemo<PRInfo | null>(() => {
    if (!showPRInfo || !worktree.pr) return null;
    return {
      number: worktree.pr.number,
      title: worktree.pr.title,
      url: worktree.pr.url,
      state: worktree.pr.state,
      author: '',
      body: '',
      comments: [],
      reviewComments: [],
    };
  }, [showPRInfo, worktree.pr]);

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
        {/* Conflict indicator and actions when merge/rebase/cherry-pick is in progress */}
        {worktree.hasConflicts && (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {worktree.conflictType === 'merge'
                ? 'Merge'
                : worktree.conflictType === 'rebase'
                  ? 'Rebase'
                  : worktree.conflictType === 'cherry-pick'
                    ? 'Cherry-pick'
                    : 'Operation'}{' '}
              Conflicts
              {worktree.conflictFiles && worktree.conflictFiles.length > 0 && (
                <span className="ml-auto text-[10px] bg-red-500/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                  {worktree.conflictFiles.length} file
                  {worktree.conflictFiles.length !== 1 ? 's' : ''}
                </span>
              )}
            </DropdownMenuLabel>
            {onAbortOperation && (
              <DropdownMenuItem
                onClick={() => onAbortOperation(worktree)}
                className="text-xs text-destructive focus:text-destructive"
              >
                <XCircle className="w-3.5 h-3.5 mr-2" />
                Abort{' '}
                {worktree.conflictType === 'merge'
                  ? 'Merge'
                  : worktree.conflictType === 'rebase'
                    ? 'Rebase'
                    : worktree.conflictType === 'cherry-pick'
                      ? 'Cherry-pick'
                      : 'Operation'}
              </DropdownMenuItem>
            )}
            {onContinueOperation && (
              <DropdownMenuItem
                onClick={() => onContinueOperation(worktree)}
                className="text-xs text-green-600 focus:text-green-700"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                Continue{' '}
                {worktree.conflictType === 'merge'
                  ? 'Merge'
                  : worktree.conflictType === 'rebase'
                    ? 'Rebase'
                    : worktree.conflictType === 'cherry-pick'
                      ? 'Cherry-pick'
                      : 'Operation'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        {/* Loading indicator while git status is being determined */}
        {isLoadingGitStatus && (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2 text-muted-foreground">
              <Spinner size="xs" variant="muted" />
              Checking git status...
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {/* Warning label when git operations are not available (only show once loaded) */}
        {!isLoadingGitStatus && !isGitOpsAvailable && (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {gitOpsDisabledReason}
            </DropdownMenuLabel>
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
                  <span className="ml-1.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </span>
                Stop Auto Mode
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onToggleAutoMode(worktree)} className="text-xs">
                <Zap className="w-3.5 h-3.5 mr-2" />
                Start Auto Mode
              </DropdownMenuItem>
            )}
          </>
        )}
        {isDevServerRunning ? (
          <>
            <DropdownMenuLabel className="text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {devServerInfo?.urlDetected === false
                ? 'Dev Server Starting...'
                : `Dev Server Running (:${devServerInfo?.port})`}
            </DropdownMenuLabel>
            {devServerInfo != null &&
              devServerInfo.port != null &&
              devServerInfo.urlDetected !== false && (
                <DropdownMenuItem
                  onClick={() => onOpenDevServerUrl(worktree)}
                  className="text-xs"
                  aria-label={`Open dev server on port ${devServerInfo.port} in browser`}
                >
                  <Globe className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  Open in Browser
                </DropdownMenuItem>
              )}
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
        {/* Test Runner section - only show when test command is configured */}
        {hasTestCommand && onStartTests && (
          <>
            {isTestRunning ? (
              <>
                <DropdownMenuLabel className="text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Tests Running
                </DropdownMenuLabel>
                {onViewTestLogs && (
                  <DropdownMenuItem onClick={() => onViewTestLogs(worktree)} className="text-xs">
                    <ScrollText className="w-3.5 h-3.5 mr-2" />
                    View Test Logs
                  </DropdownMenuItem>
                )}
                {onStopTests && (
                  <DropdownMenuItem
                    onClick={() => onStopTests(worktree)}
                    className="text-xs text-destructive focus:text-destructive"
                  >
                    <Square className="w-3.5 h-3.5 mr-2" />
                    Stop Tests
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => onStartTests(worktree)}
                  disabled={isStartingTests}
                  className="text-xs"
                >
                  <FlaskConical
                    className={cn('w-3.5 h-3.5 mr-2', isStartingTests && 'animate-pulse')}
                  />
                  {isStartingTests ? 'Starting Tests...' : 'Run Tests'}
                </DropdownMenuItem>
                {onViewTestLogs && testSessionInfo && (
                  <DropdownMenuItem onClick={() => onViewTestLogs(worktree)} className="text-xs">
                    <ScrollText className="w-3.5 h-3.5 mr-2" />
                    View Last Test Results
                    {testSessionInfo.status === 'passed' && (
                      <span className="ml-auto text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded">
                        passed
                      </span>
                    )}
                    {testSessionInfo.status === 'failed' && (
                      <span className="ml-auto text-[10px] bg-red-500/20 text-red-600 px-1.5 py-0.5 rounded">
                        failed
                      </span>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
          </>
        )}
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
        {/* Scripts submenu - consolidates init script and terminal quick scripts */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <ScrollText className="w-3.5 h-3.5 mr-2" />
            Scripts
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {/* Re-run Init Script - always shown for non-main worktrees, disabled when no init script configured or no handler */}
            {!worktree.isMain && (
              <>
                <DropdownMenuItem
                  onClick={() => onRunInitScript(worktree)}
                  className="text-xs"
                  disabled={!hasInitScript}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />
                  Re-run Init Script
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Terminal quick scripts */}
            {terminalScripts && terminalScripts.length > 0 ? (
              terminalScripts.map((script) => (
                <DropdownMenuItem
                  key={script.id}
                  onClick={() => onRunTerminalScript?.(worktree, script.command)}
                  className="text-xs"
                  disabled={!onRunTerminalScript}
                >
                  <Play className="w-3.5 h-3.5 mr-2 shrink-0" />
                  <span className="truncate">{script.name}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No scripts configured
              </DropdownMenuItem>
            )}
            {/* Divider before Edit Commands & Scripts */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onEditScripts?.()}
              className="text-xs"
              disabled={!onEditScripts}
            >
              <Settings2 className="w-3.5 h-3.5 mr-2" />
              Edit Commands & Scripts
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          {remotes && remotes.length > 1 && onPullWithRemote ? (
            // Multiple remotes - show split button: click main area to pull (default behavior),
            // chevron opens submenu showing individual remotes to pull from
            <DropdownMenuSub>
              <div className="flex items-center">
                <DropdownMenuItem
                  onClick={() => isGitOpsAvailable && onPull(worktree)}
                  disabled={isPulling || !isGitOpsAvailable}
                  className={cn(
                    'text-xs flex-1 pr-0 rounded-r-none',
                    !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Download className={cn('w-3.5 h-3.5 mr-2', isPulling && 'animate-pulse')} />
                  {isPulling ? 'Pulling...' : 'Pull'}
                  {!isGitOpsAvailable && (
                    <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                  )}
                  {isGitOpsAvailable && behindCount > 0 && (
                    <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      {behindCount} behind
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSubTrigger
                  className={cn(
                    'text-xs px-1 rounded-l-none border-l border-border/30 h-8',
                    (!isGitOpsAvailable || isPulling) && 'opacity-50 cursor-not-allowed'
                  )}
                  disabled={!isGitOpsAvailable || isPulling}
                />
              </div>
              <DropdownMenuSubContent>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Pull from remote
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {remotes.map((remote) => (
                  <DropdownMenuItem
                    key={remote.name}
                    onClick={() => isGitOpsAvailable && onPullWithRemote(worktree, remote.name)}
                    disabled={isPulling || !isGitOpsAvailable}
                    className="text-xs"
                  >
                    <Download className="w-3.5 h-3.5 mr-2" />
                    {remote.name}
                    <span className="ml-auto text-[10px] text-muted-foreground max-w-[100px] truncate">
                      {remote.url}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            // Single remote or no remotes - show simple menu item
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onPull(worktree)}
              disabled={isPulling || !isGitOpsAvailable}
              className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
            >
              <Download className={cn('w-3.5 h-3.5 mr-2', isPulling && 'animate-pulse')} />
              {isPulling ? 'Pulling...' : 'Pull'}
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
              {isGitOpsAvailable && behindCount > 0 && (
                <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {behindCount} behind
                </span>
              )}
            </DropdownMenuItem>
          )}
        </TooltipWrapper>
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          {remotes && remotes.length > 1 && onPushWithRemote ? (
            // Multiple remotes - show split button: click main area for default push behavior,
            // chevron opens submenu showing individual remotes to push to
            <DropdownMenuSub>
              <div className="flex items-center">
                <DropdownMenuItem
                  onClick={() => {
                    if (!isGitOpsAvailable) return;
                    if (!hasRemoteBranch) {
                      onPushNewBranch(worktree);
                    } else {
                      onPush(worktree);
                    }
                  }}
                  disabled={
                    isPushing || (hasRemoteBranch && aheadCount === 0) || !isGitOpsAvailable
                  }
                  className={cn(
                    'text-xs flex-1 pr-0 rounded-r-none',
                    !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Upload className={cn('w-3.5 h-3.5 mr-2', isPushing && 'animate-pulse')} />
                  {isPushing ? 'Pushing...' : 'Push'}
                  {!isGitOpsAvailable && (
                    <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                  )}
                  {isGitOpsAvailable && !hasRemoteBranch && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                      <CloudOff className="w-2.5 h-2.5" />
                      local only
                    </span>
                  )}
                  {isGitOpsAvailable && hasRemoteBranch && aheadCount > 0 && (
                    <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                      {aheadCount} ahead
                    </span>
                  )}
                  {isGitOpsAvailable && hasRemoteBranch && trackingRemote && (
                    <span
                      className={cn(
                        'text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded',
                        aheadCount > 0 ? 'ml-1' : 'ml-auto'
                      )}
                    >
                      {trackingRemote}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSubTrigger
                  className={cn(
                    'text-xs px-1 rounded-l-none border-l border-border/30 h-8',
                    (!isGitOpsAvailable || isPushing) && 'opacity-50 cursor-not-allowed'
                  )}
                  disabled={!isGitOpsAvailable || isPushing}
                />
              </div>
              <DropdownMenuSubContent>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Push to remote
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {remotes.map((remote) => (
                  <DropdownMenuItem
                    key={remote.name}
                    onClick={() => isGitOpsAvailable && onPushWithRemote(worktree, remote.name)}
                    disabled={isPushing || !isGitOpsAvailable}
                    className="text-xs"
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" />
                    {remote.name}
                    <span className="ml-auto text-[10px] text-muted-foreground max-w-[100px] truncate">
                      {remote.url}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            // Single remote or no remotes - show simple menu item
            <DropdownMenuItem
              onClick={() => {
                if (!isGitOpsAvailable) return;
                if (!hasRemoteBranch) {
                  onPushNewBranch(worktree);
                } else {
                  onPush(worktree);
                }
              }}
              disabled={isPushing || (hasRemoteBranch && aheadCount === 0) || !isGitOpsAvailable}
              className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
            >
              <Upload className={cn('w-3.5 h-3.5 mr-2', isPushing && 'animate-pulse')} />
              {isPushing ? 'Pushing...' : 'Push'}
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
              {isGitOpsAvailable && !hasRemoteBranch && (
                <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                  <CloudOff className="w-2.5 h-2.5" />
                  local only
                </span>
              )}
              {isGitOpsAvailable && hasRemoteBranch && aheadCount > 0 && (
                <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                  {aheadCount} ahead
                </span>
              )}
              {isGitOpsAvailable && hasRemoteBranch && trackingRemote && (
                <span
                  className={cn(
                    'text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded',
                    aheadCount > 0 ? 'ml-1' : 'ml-auto'
                  )}
                >
                  {trackingRemote}
                </span>
              )}
            </DropdownMenuItem>
          )}
        </TooltipWrapper>
        <TooltipWrapper showTooltip={!!gitOpsDisabledReason} tooltipContent={gitOpsDisabledReason}>
          <DropdownMenuItem
            onClick={() => isGitOpsAvailable && onResolveConflicts(worktree)}
            disabled={!isGitOpsAvailable}
            className={cn(
              'text-xs text-purple-500 focus:text-purple-600',
              !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
            )}
          >
            <GitMerge className="w-3.5 h-3.5 mr-2" />
            Merge & Rebase
            {!isGitOpsAvailable && (
              <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
            )}
          </DropdownMenuItem>
        </TooltipWrapper>
        {!worktree.isMain && (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onMerge(worktree)}
              disabled={!isGitOpsAvailable}
              className={cn(
                'text-xs text-green-600 focus:text-green-700',
                !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
              )}
            >
              <GitMerge className="w-3.5 h-3.5 mr-2" />
              Integrate Branch
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {/* View Commits - split button when Cherry Pick is available:
            click main area to view commits directly, chevron opens sub-menu with Cherry Pick */}
        {onCherryPick ? (
          <DropdownMenuSub>
            <TooltipWrapper
              showTooltip={!!gitOpsDisabledReason}
              tooltipContent={gitOpsDisabledReason}
            >
              <div className="flex items-center">
                {/* Main clickable area - opens commit history directly */}
                <DropdownMenuItem
                  onClick={() => isGitOpsAvailable && onViewCommits(worktree)}
                  disabled={!isGitOpsAvailable}
                  className={cn(
                    'text-xs flex-1 pr-0 rounded-r-none',
                    !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <History className="w-3.5 h-3.5 mr-2" />
                  View Commits
                  {!isGitOpsAvailable && (
                    <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                {/* Chevron trigger for sub-menu containing Cherry Pick */}
                <DropdownMenuSubTrigger
                  disabled={!isGitOpsAvailable}
                  className={cn(
                    'text-xs px-1 rounded-l-none border-l border-border/30 h-8',
                    !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
                  )}
                />
              </div>
            </TooltipWrapper>
            <DropdownMenuSubContent>
              {/* Cherry-pick commits from another branch */}
              <DropdownMenuItem
                onClick={() => isGitOpsAvailable && onCherryPick(worktree)}
                disabled={!isGitOpsAvailable}
                className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
              >
                <Cherry className="w-3.5 h-3.5 mr-2" />
                Cherry Pick
                {!isGitOpsAvailable && (
                  <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onViewCommits(worktree)}
              disabled={!isGitOpsAvailable}
              className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
            >
              <History className="w-3.5 h-3.5 mr-2" />
              View Commits
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {(hasChangesSectionContent || hasDestructiveSectionContent) && <DropdownMenuSeparator />}

        {/* View Changes split button - main action views changes directly, chevron reveals stash options.
            Only render when at least one action is meaningful:
            - worktree.hasChanges: View Changes action is available
            - (worktree.hasChanges && onStashChanges): Create Stash action is possible
            - onViewStashes: viewing existing stashes is possible */}
        {/* View Changes split button - show submenu only when there are non-duplicate sub-actions */}
        {worktree.hasChanges && (onStashChanges || onViewStashes) ? (
          <DropdownMenuSub>
            <div className="flex items-center">
              {/* Main clickable area - view changes (primary action) */}
              <DropdownMenuItem
                onClick={() => onViewChanges(worktree)}
                className="text-xs flex-1 pr-0 rounded-r-none"
              >
                <Eye className="w-3.5 h-3.5 mr-2" />
                View Changes
              </DropdownMenuItem>
              {/* Chevron trigger for submenu with stash options */}
              <DropdownMenuSubTrigger className="text-xs px-1 rounded-l-none border-l border-border/30 h-8" />
            </div>
            <DropdownMenuSubContent>
              {onStashChanges && (
                <TooltipWrapper
                  showTooltip={!isGitOpsAvailable}
                  tooltipContent={gitOpsDisabledReason}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      if (!isGitOpsAvailable) return;
                      onStashChanges(worktree);
                    }}
                    disabled={!isGitOpsAvailable}
                    className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
                  >
                    <Archive className="w-3.5 h-3.5 mr-2" />
                    Create Stash
                    {!isGitOpsAvailable && (
                      <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                </TooltipWrapper>
              )}
              {onViewStashes && (
                <DropdownMenuItem onClick={() => onViewStashes(worktree)} className="text-xs">
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  View Stashes
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : worktree.hasChanges ? (
          <DropdownMenuItem onClick={() => onViewChanges(worktree)} className="text-xs">
            <Eye className="w-3.5 h-3.5 mr-2" />
            View Changes
          </DropdownMenuItem>
        ) : onViewStashes ? (
          <DropdownMenuItem onClick={() => onViewStashes(worktree)} className="text-xs">
            <Eye className="w-3.5 h-3.5 mr-2" />
            View Stashes
          </DropdownMenuItem>
        ) : null}
        {worktree.hasChanges && (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onCommit(worktree)}
              disabled={!isGitOpsAvailable}
              className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
            >
              <GitCommit className="w-3.5 h-3.5 mr-2" />
              Commit Changes
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {/* Show PR option when there is no existing PR (showCreatePR === !hasPR) */}
        {showCreatePR && (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onCreatePR(worktree)}
              disabled={!isGitOpsAvailable}
              className={cn('text-xs', !isGitOpsAvailable && 'opacity-50 cursor-not-allowed')}
            >
              <GitPullRequest className="w-3.5 h-3.5 mr-2" />
              Create Pull Request
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {/* Show PR info with Address Comments in sub-menu if PR exists */}
        {prInfo && worktree.pr && (
          <DropdownMenuSub>
            <div className="flex items-center">
              {/* Main clickable area - opens PR in browser */}
              <DropdownMenuItem
                onClick={() => {
                  window.open(worktree.pr!.url, '_blank', 'noopener,noreferrer');
                }}
                className="text-xs flex-1 pr-0 rounded-r-none"
              >
                <GitPullRequest className="w-3 h-3 mr-2" />
                PR #{worktree.pr.number}
                <span
                  className={cn(
                    'ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded uppercase',
                    worktree.pr.state === 'MERGED'
                      ? 'bg-purple-500/20 text-purple-600'
                      : worktree.pr.state === 'CLOSED'
                        ? 'bg-gray-500/20 text-gray-500'
                        : 'bg-green-500/20 text-green-600'
                  )}
                >
                  {worktree.pr.state}
                </span>
              </DropdownMenuItem>
              {/* Chevron trigger for submenu with PR actions */}
              <DropdownMenuSubTrigger className="text-xs px-1 rounded-l-none border-l border-border/30 h-8" />
            </div>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onAddressPRComments(worktree, prInfo)}
                className="text-xs text-blue-500 focus:text-blue-600"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-2" />
                Manage PR Comments
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAutoAddressPRComments(worktree, prInfo)}
                className="text-xs text-blue-500 focus:text-blue-600"
              >
                <Zap className="w-3.5 h-3.5 mr-2" />
                Address PR Comments
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {hasChangesSectionContent && hasDestructiveSectionContent && <DropdownMenuSeparator />}
        {worktree.hasChanges && (
          <TooltipWrapper
            showTooltip={!!gitOpsDisabledReason}
            tooltipContent={gitOpsDisabledReason}
          >
            <DropdownMenuItem
              onClick={() => isGitOpsAvailable && onDiscardChanges(worktree)}
              disabled={!isGitOpsAvailable}
              className={cn(
                'text-xs text-destructive focus:text-destructive',
                !isGitOpsAvailable && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Undo2 className="w-3.5 h-3.5 mr-2" />
              Discard Changes
              {!isGitOpsAvailable && (
                <AlertCircle className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </DropdownMenuItem>
          </TooltipWrapper>
        )}
        {!worktree.isMain && (
          <DropdownMenuItem
            onClick={() => onDeleteWorktree(worktree)}
            className="text-xs text-destructive focus:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete Worktree
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
