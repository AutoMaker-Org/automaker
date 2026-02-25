import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { List, FileText, GitBranch, ClipboardList } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { LogViewer } from '@/components/ui/log-viewer';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';
import { TaskProgressPanel } from '@/components/ui/task-progress-panel';
import { Markdown } from '@/components/ui/markdown';
import { useAppStore } from '@/store/app-store';
import { extractSummary } from '@/lib/log-parser';
import { useAgentOutputWebSocket } from '@/hooks/use-agent-output-websocket';
import { MODAL_CONSTANTS } from '@/components/views/board-view/dialogs/agent-output-modal.constants';
import type { AutoModeEvent } from '@/types/electron';
import type { BacklogPlanEvent } from '@automaker/types';

interface AgentOutputModalProps {
  open: boolean;
  onClose: () => void;
  featureDescription: string;
  featureId: string;
  /** The status of the feature - used to determine if spinner should be shown */
  featureStatus?: string;
  /** Called when a number key (0-9) is pressed while the modal is open */
  onNumberKeyPress?: (key: string) => void;
  /** Project path - if not provided, falls back to window.__currentProject for backward compatibility */
  projectPath?: string;
  /** Branch name for the feature worktree - used when viewing changes */
  branchName?: string;
}

type ViewMode = typeof MODAL_CONSTANTS.VIEW_MODES[keyof typeof MODAL_CONSTANTS.VIEW_MODES];

export function AgentOutputModal({
  open,
  onClose,
  featureDescription,
  featureId,
  featureStatus,
  onNumberKeyPress,
  projectPath: projectPathProp,
  branchName,
}: AgentOutputModalProps) {
  const isBacklogPlan = featureId.startsWith('backlog-plan:');

  // Resolve project path - prefer prop, fallback to window.__currentProject
  const resolvedProjectPath = projectPathProp || window.__currentProject?.path || undefined;

  // Track view mode state
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  // Use custom hook for WebSocket event handling and output management
  const { output, isLoading, streamedContent } = useAgentOutputWebSocket({
    open,
    featureId,
    isBacklogPlan,
    projectPath: resolvedProjectPath || '',
    onFeatureComplete: (passes: boolean) => {
      if (passes) {
        onClose();
      }
    },
  });

  // Extract summary from output
  const summary = useMemo(() => extractSummary(output), [output]);

  // Determine the effective view mode - default to summary if available, otherwise parsed
  const effectiveViewMode = viewMode ?? (summary ? MODAL_CONSTANTS.VIEW_MODES.SUMMARY : MODAL_CONSTANTS.VIEW_MODES.PARSED);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const useWorktrees = useAppStore((state) => state.useWorktrees);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  
  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < MODAL_CONSTANTS.AUTOSCROLL_THRESHOLD;
    autoScrollRef.current = isAtBottom;
  };

  // Handle number key presses while modal is open
  useEffect(() => {
    if (!open || !onNumberKeyPress) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if a number key (0-9) was pressed without modifiers
      if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onNumberKeyPress(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onNumberKeyPress]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-full max-h-[85dvh] max-w-[calc(100%-2rem)] sm:w-[60vw] sm:max-w-[60vw] sm:max-h-[80vh] md:w-[90vw] md:max-w-[1200px] md:max-h-[85vh] rounded-xl flex flex-col"
        data-testid="agent-output-modal"
      >
        <DialogHeader className="shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-10">
            <DialogTitle className="flex items-center gap-2">
              {featureStatus !== 'verified' && featureStatus !== 'waiting_approval' && (
                <Spinner size="md" />
              )}
              Agent Output
            </DialogTitle>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
              {summary && (
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    effectiveViewMode === 'summary'
                      ? 'bg-primary/20 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  data-testid="view-mode-summary"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Summary
                </button>
              )}
              <button
                onClick={() => setViewMode('parsed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'parsed'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-parsed"
              >
                <List className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={() => setViewMode('changes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'changes'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-changes"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Changes
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'raw'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-raw"
              >
                <FileText className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
          <DialogDescription
            className="mt-1 max-h-24 overflow-y-auto wrap-break-word"
            data-testid="agent-output-description"
          >
            {featureDescription}
          </DialogDescription>
        </DialogHeader>

        {/* Task Progress Panel - shows when tasks are being executed */}
        {!isBacklogPlan && (
          <TaskProgressPanel
            featureId={featureId}
            projectPath={resolvedProjectPath}
            className="shrink-0 mx-3 my-2"
          />
        )}

        {effectiveViewMode === 'changes' ? (
          <div className={`flex-1 min-h-0 ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MIN} ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MAX} overflow-y-auto scrollbar-visible`}>
            {resolvedProjectPath ? (
              <GitDiffPanel
                projectPath={resolvedProjectPath}
                featureId={branchName || featureId}
                compact={false}
                useWorktrees={useWorktrees}
                className="border-0 rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Spinner size="lg" className="mr-2" />
                Loading...
              </div>
            )}
          </div>
        ) : effectiveViewMode === 'summary' && summary ? (
          <div className={`flex-1 min-h-0 ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MIN} ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MAX} overflow-y-auto bg-card border border-border/50 rounded-lg p-4 scrollbar-visible`}>
            <Markdown>{summary}</Markdown>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className={`flex-1 min-h-0 ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MIN} ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MAX} overflow-y-auto bg-popover border border-border/50 rounded-lg p-4 font-mono text-xs scrollbar-visible`}
            >
              {isLoading && !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Spinner size="lg" className="mr-2" />
                  Loading output...
                </div>
              ) : !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No output yet. The agent will stream output here as it works.
                </div>
              ) : effectiveViewMode === 'parsed' ? (
                <LogViewer output={output} />
              ) : (
                <div className="whitespace-pre-wrap wrap-break-word text-foreground/80">
                  {output}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center shrink-0">
              {autoScrollRef.current
                ? 'Auto-scrolling enabled'
                : 'Scroll to bottom to enable auto-scroll'}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
