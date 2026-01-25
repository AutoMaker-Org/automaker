import { useEffect, useRef, useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Terminal,
  ArrowDown,
  ExternalLink,
  Square,
  RefreshCw,
  AlertCircle,
  Clock,
  GitBranch,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { XtermLogViewer, type XtermLogViewerRef } from '@/components/ui/xterm-log-viewer';
import { useDevServerLogs } from '../hooks/use-dev-server-logs';
import type { WorktreeInfo } from '../types';

interface DevServerLogsPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback when the panel is closed */
  onClose: () => void;
  /** The worktree to show logs for */
  worktree: WorktreeInfo | null;
  /** Callback to stop the dev server */
  onStopDevServer?: (worktree: WorktreeInfo) => void;
  /** Callback to open the dev server URL in browser */
  onOpenDevServerUrl?: (worktree: WorktreeInfo) => void;
}

/**
 * Panel component for displaying dev server logs with ANSI color rendering
 * and auto-scroll functionality.
 *
 * Features:
 * - Real-time log streaming via WebSocket
 * - Full ANSI color code rendering via xterm.js
 * - Auto-scroll to bottom (can be paused by scrolling up)
 * - Server status indicators
 * - Quick actions (stop server, open in browser)
 */
export function DevServerLogsPanel({
  open,
  onClose,
  worktree,
  onStopDevServer,
  onOpenDevServerUrl,
}: DevServerLogsPanelProps) {
  const xtermRef = useRef<XtermLogViewerRef>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastLogsLengthRef = useRef(0);
  const lastWorktreePathRef = useRef<string | null>(null);

  const {
    logs,
    isRunning,
    isLoading,
    error,
    port,
    url,
    startedAt,
    exitCode,
    serverError,
    fetchLogs,
  } = useDevServerLogs({
    worktreePath: open ? (worktree?.path ?? null) : null,
    autoSubscribe: open,
  });

  // Write logs to xterm when they change
  useEffect(() => {
    if (!xtermRef.current || !logs) return;

    // If worktree changed, reset the terminal and write all content
    if (lastWorktreePathRef.current !== worktree?.path) {
      lastWorktreePathRef.current = worktree?.path ?? null;
      lastLogsLengthRef.current = 0;
      xtermRef.current.write(logs);
      lastLogsLengthRef.current = logs.length;
      return;
    }

    // If logs got shorter (e.g., cleared), rewrite all
    if (logs.length < lastLogsLengthRef.current) {
      xtermRef.current.write(logs);
      lastLogsLengthRef.current = logs.length;
      return;
    }

    // Append only the new content
    if (logs.length > lastLogsLengthRef.current) {
      const newContent = logs.slice(lastLogsLengthRef.current);
      xtermRef.current.append(newContent);
      lastLogsLengthRef.current = logs.length;
    }
  }, [logs, worktree?.path]);

  // Reset when panel opens with a new worktree
  useEffect(() => {
    if (open) {
      setAutoScrollEnabled(true);
      if (worktree?.path !== lastWorktreePathRef.current) {
        lastLogsLengthRef.current = 0;
      }
    }
  }, [open, worktree?.path]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    xtermRef.current?.scrollToBottom();
    setAutoScrollEnabled(true);
  }, []);

  // Format the started time
  const formatStartedAt = useCallback((timestamp: string | null) => {
    if (!timestamp) return null;
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return null;
    }
  }, []);

  if (!worktree) return null;

  const formattedStartTime = formatStartedAt(startedAt);
  const lineCount = logs ? logs.split('\n').length : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="w-full h-full max-w-full max-h-full sm:w-[70vw] sm:max-w-[900px] sm:max-h-[85vh] sm:h-auto sm:rounded-xl rounded-none flex flex-col gap-0 p-0 overflow-hidden"
        data-testid="dev-server-logs-panel"
        compact
      >
        {/* Compact Header */}
        <DialogHeader className="shrink-0 px-4 py-3 border-b border-border/50 pr-12">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Terminal className="w-4 h-4 text-primary" />
              <span>Dev Server</span>
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Running
                </span>
              ) : exitCode !== null ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium">
                  <AlertCircle className="w-3 h-3" />
                  Stopped ({exitCode})
                </span>
              ) : null}
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              {isRunning && url && onOpenDevServerUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => onOpenDevServerUrl(worktree)}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open
                </Button>
              )}
              {isRunning && onStopDevServer && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onStopDevServer(worktree)}
                >
                  <Square className="w-3 h-3 mr-1.5 fill-current" />
                  Stop
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => fetchLogs()}
                title="Refresh logs"
              >
                {isLoading ? <Spinner size="xs" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {/* Info bar - more compact */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="w-3 h-3" />
              <span className="font-medium text-foreground/80">{worktree.branch}</span>
            </span>
            {port && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/60">Port</span>
                <span className="font-mono text-primary">{port}</span>
              </span>
            )}
            {formattedStartTime && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {formattedStartTime}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Error displays - inline */}
        {(error || serverError) && (
          <div className="shrink-0 px-4 py-2 bg-destructive/5 border-b border-destructive/20">
            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {serverError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Server error: {serverError}</span>
              </div>
            )}
          </div>
        )}

        {/* Log content area - fills remaining space */}
        <div
          className="flex-1 min-h-0 overflow-hidden bg-zinc-950"
          data-testid="dev-server-logs-content"
        >
          {isLoading && !logs ? (
            <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
              <Spinner size="md" className="mr-2" />
              <span className="text-sm">Loading logs...</span>
            </div>
          ) : !logs && !isRunning ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8">
              <Terminal className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No dev server running</p>
              <p className="text-xs mt-1 opacity-60">Start a dev server to see logs here</p>
            </div>
          ) : !logs ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8">
              <Spinner size="xl" className="mb-3" />
              <p className="text-sm">Waiting for output...</p>
              <p className="text-xs mt-1 opacity-60">
                Logs will appear as the server generates output
              </p>
            </div>
          ) : (
            <XtermLogViewer
              ref={xtermRef}
              className="h-full"
              minHeight={280}
              autoScroll={autoScrollEnabled}
              onScrollAwayFromBottom={() => setAutoScrollEnabled(false)}
              onScrollToBottom={() => setAutoScrollEnabled(true)}
            />
          )}
        </div>

        {/* Footer status bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border/50 text-xs text-muted-foreground">
          <span className="font-mono">{lineCount > 0 ? `${lineCount} lines` : 'No output'}</span>
          {!autoScrollEnabled && logs && (
            <button
              onClick={scrollToBottom}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors text-primary"
            >
              <ArrowDown className="w-3 h-3" />
              Scroll to bottom
            </button>
          )}
          {autoScrollEnabled && logs && (
            <span className="inline-flex items-center gap-1.5 opacity-60">
              <ArrowDown className="w-3 h-3" />
              Auto-scroll
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
