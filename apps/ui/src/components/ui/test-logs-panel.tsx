'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Terminal,
  ArrowDown,
  Square,
  RefreshCw,
  AlertCircle,
  Clock,
  GitBranch,
  CheckCircle2,
  XCircle,
  FlaskConical,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { XtermLogViewer, type XtermLogViewerRef } from '@/components/ui/xterm-log-viewer';
import { useTestLogs } from '@/hooks/use-test-logs';
import { useIsMobile } from '@/hooks/use-media-query';
import type { TestRunStatus } from '@/types/electron';

// ============================================================================
// Types
// ============================================================================

export interface TestLogsPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback when the panel is closed */
  onClose: () => void;
  /** Path to the worktree to show test logs for */
  worktreePath: string | null;
  /** Branch name for display */
  branch?: string;
  /** Specific session ID to fetch logs for (optional) */
  sessionId?: string;
  /** Callback to stop the running tests */
  onStopTests?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get status indicator based on test run status
 */
function getStatusIndicator(status: TestRunStatus | null): {
  text: string;
  className: string;
  icon?: React.ReactNode;
} {
  switch (status) {
    case 'running':
      return {
        text: 'Running',
        className: 'bg-blue-500/10 text-blue-500',
        icon: <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />,
      };
    case 'pending':
      return {
        text: 'Pending',
        className: 'bg-amber-500/10 text-amber-500',
        icon: <Clock className="w-3 h-3" />,
      };
    case 'passed':
      return {
        text: 'Passed',
        className: 'bg-green-500/10 text-green-500',
        icon: <CheckCircle2 className="w-3 h-3" />,
      };
    case 'failed':
      return {
        text: 'Failed',
        className: 'bg-red-500/10 text-red-500',
        icon: <XCircle className="w-3 h-3" />,
      };
    case 'cancelled':
      return {
        text: 'Cancelled',
        className: 'bg-yellow-500/10 text-yellow-500',
        icon: <AlertCircle className="w-3 h-3" />,
      };
    case 'error':
      return {
        text: 'Error',
        className: 'bg-red-500/10 text-red-500',
        icon: <AlertCircle className="w-3 h-3" />,
      };
    default:
      return {
        text: 'Idle',
        className: 'bg-muted text-muted-foreground',
      };
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format timestamp to localized time string
 */
function formatTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  } catch {
    return null;
  }
}

// ============================================================================
// Inner Content Component
// ============================================================================

interface TestLogsPanelContentProps {
  worktreePath: string | null;
  branch?: string;
  sessionId?: string;
  onStopTests?: () => void;
}

function TestLogsPanelContent({
  worktreePath,
  branch,
  sessionId,
  onStopTests,
}: TestLogsPanelContentProps) {
  const xtermRef = useRef<XtermLogViewerRef>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastLogsLengthRef = useRef(0);
  const lastSessionIdRef = useRef<string | null>(null);

  const {
    logs,
    isLoading,
    error,
    status,
    sessionId: currentSessionId,
    command,
    testFile,
    startedAt,
    exitCode,
    duration,
    isRunning,
    fetchLogs,
  } = useTestLogs({
    worktreePath,
    sessionId,
    autoSubscribe: true,
  });

  // Write logs to xterm when they change
  useEffect(() => {
    if (!xtermRef.current || !logs) return;

    // If session changed, reset the terminal and write all content
    if (lastSessionIdRef.current !== currentSessionId) {
      lastSessionIdRef.current = currentSessionId;
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
  }, [logs, currentSessionId]);

  // Reset auto-scroll when session changes
  useEffect(() => {
    if (currentSessionId !== lastSessionIdRef.current) {
      setAutoScrollEnabled(true);
      lastLogsLengthRef.current = 0;
    }
  }, [currentSessionId]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    xtermRef.current?.scrollToBottom();
    setAutoScrollEnabled(true);
  }, []);

  const statusIndicator = getStatusIndicator(status);
  const formattedStartTime = formatTime(startedAt);
  const formattedDuration = formatDuration(duration);
  const lineCount = logs ? logs.split('\n').length : 0;

  return (
    <>
      {/* Header */}
      <DialogHeader className="shrink-0 px-4 py-3 border-b border-border/50 pr-12 dialog-compact-header-mobile">
        <div className="flex items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span>Test Runner</span>
            {status && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                  statusIndicator.className
                )}
              >
                {statusIndicator.icon}
                {statusIndicator.text}
              </span>
            )}
            {formattedDuration && !isRunning && (
              <span className="text-xs text-muted-foreground font-mono">{formattedDuration}</span>
            )}
          </DialogTitle>
          <div className="flex items-center gap-1.5">
            {isRunning && onStopTests && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onStopTests}
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

        {/* Info bar */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {branch && (
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="w-3 h-3" />
              <span className="font-medium text-foreground/80">{branch}</span>
            </span>
          )}
          {command && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground/60">Command</span>
              <span className="font-mono text-primary truncate max-w-[200px]">{command}</span>
            </span>
          )}
          {testFile && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground/60">File</span>
              <span className="font-mono truncate max-w-[150px]">{testFile}</span>
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

      {/* Error displays */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/5 border-b border-destructive/20">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Log content area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950" data-testid="test-logs-content">
        {isLoading && !logs ? (
          <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
            <Spinner size="md" className="mr-2" />
            <span className="text-sm">Loading logs...</span>
          </div>
        ) : !logs && !isRunning && !status ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8">
            <Terminal className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">No test run active</p>
            <p className="text-xs mt-1 opacity-60">Start a test run to see logs here</p>
          </div>
        ) : isRunning && !logs ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8">
            <Spinner size="xl" className="mb-3" />
            <p className="text-sm">Waiting for output...</p>
            <p className="text-xs mt-1 opacity-60">Logs will appear as tests generate output</p>
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
        <div className="flex items-center gap-3">
          <span className="font-mono">{lineCount > 0 ? `${lineCount} lines` : 'No output'}</span>
          {exitCode !== null && (
            <span className={cn('font-mono', exitCode === 0 ? 'text-green-500' : 'text-red-500')}>
              Exit: {exitCode}
            </span>
          )}
        </div>
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
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Panel component for displaying test runner logs with ANSI color rendering
 * and real-time streaming support.
 *
 * Features:
 * - Real-time log streaming via WebSocket
 * - Full ANSI color code rendering via xterm.js
 * - Auto-scroll to bottom (can be paused by scrolling up)
 * - Test status indicators (pending, running, passed, failed, etc.)
 * - Dialog on desktop, Sheet on mobile
 * - Quick actions (stop tests, refresh logs)
 */
export function TestLogsPanel({
  open,
  onClose,
  worktreePath,
  branch,
  sessionId,
  onStopTests,
}: TestLogsPanelProps) {
  const isMobile = useIsMobile();

  if (!worktreePath) return null;

  // Mobile: use Sheet (bottom drawer)
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Test Logs</SheetTitle>
          </SheetHeader>
          <TestLogsPanelContent
            worktreePath={worktreePath}
            branch={branch}
            sessionId={sessionId}
            onStopTests={onStopTests}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: use Dialog
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="w-full h-full max-w-full max-h-full sm:w-[70vw] sm:max-w-[900px] sm:max-h-[85vh] sm:h-auto sm:rounded-xl rounded-none flex flex-col gap-0 p-0 overflow-hidden dialog-fullscreen-mobile"
        data-testid="test-logs-panel"
        compact
      >
        <TestLogsPanelContent
          worktreePath={worktreePath}
          branch={branch}
          sessionId={sessionId}
          onStopTests={onStopTests}
        />
      </DialogContent>
    </Dialog>
  );
}
