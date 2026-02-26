import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { List, FileText, GitBranch, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { LogViewer } from '@/components/ui/log-viewer';
import { GitDiffPanel } from '@/components/ui/git-diff-panel';
import { TaskProgressPanel } from '@/components/ui/task-progress-panel';
import { Markdown } from '@/components/ui/markdown';
import { useAppStore } from '@/store/app-store';
import {
  extractSummary,
  parseAllPhaseSummaries,
  isAccumulatedSummary,
  type PhaseSummaryEntry,
} from '@/lib/log-parser';
import { getFirstNonEmptySummary } from '@/lib/summary-selection';
import { useAgentOutputWebSocket } from '@/hooks/use-agent-output-websocket';
import { useFeature } from '@/hooks/queries';
import { MODAL_CONSTANTS } from '@/components/views/board-view/dialogs/agent-output-modal.constants';
import { cn } from '@/lib/utils';

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

type ViewMode = (typeof MODAL_CONSTANTS.VIEW_MODES)[keyof typeof MODAL_CONSTANTS.VIEW_MODES];

/**
 * Renders a single phase entry card with header and content.
 */
function PhaseEntryCard({
  entry,
  index,
  totalPhases,
  hasMultiplePhases,
  isActive,
  onClick,
}: {
  entry: PhaseSummaryEntry;
  index: number;
  totalPhases: number;
  hasMultiplePhases: boolean;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={cn(
        'p-4 bg-card rounded-lg border border-border/50 transition-all',
        isActive && 'ring-2 ring-primary/50 border-primary/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
        <span className="text-sm font-semibold text-primary">{entry.phaseName}</span>
        {hasMultiplePhases && (
          <span className="text-xs text-muted-foreground">
            Step {index + 1} of {totalPhases}
          </span>
        )}
      </div>
      <Markdown>{entry.content || 'No summary available'}</Markdown>
    </div>
  );
}

/**
 * Step navigator component for multi-phase summaries
 */
function StepNavigator({
  phaseEntries,
  activeIndex,
  onIndexChange,
}: {
  phaseEntries: PhaseSummaryEntry[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
}) {
  if (phaseEntries.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
        disabled={activeIndex === 0}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-1 overflow-x-auto">
        {phaseEntries.map((entry, index) => (
          <button
            key={`step-nav-${index}`}
            onClick={() => onIndexChange(index)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap',
              index === activeIndex
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {entry.phaseName}
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onIndexChange(Math.min(phaseEntries.length - 1, activeIndex + 1))}
        disabled={activeIndex === phaseEntries.length - 1}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

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
  const { output, isLoading } = useAgentOutputWebSocket({
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

  // Fetch feature data to access the server-side accumulated summary
  const { data: feature, refetch: refetchFeature } = useFeature(resolvedProjectPath, featureId, {
    enabled: open && !!resolvedProjectPath && !isBacklogPlan,
  });

  // Extract summary from output (client-side fallback)
  const extractedSummary = useMemo(() => extractSummary(output), [output]);

  // Prefer server-side accumulated summary (handles pipeline step accumulation),
  // fall back to client-side extraction from raw output.
  const summary = getFirstNonEmptySummary(feature?.summary, extractedSummary);

  // Normalize null to undefined for parser helpers that expect string | undefined
  const normalizedSummary = summary ?? undefined;

  // Parse summary into phases for multi-step navigation
  const phaseEntries = useMemo(
    () => parseAllPhaseSummaries(normalizedSummary),
    [normalizedSummary]
  );
  const hasMultiplePhases = useMemo(
    () => isAccumulatedSummary(normalizedSummary),
    [normalizedSummary]
  );
  const [activePhaseIndex, setActivePhaseIndex] = useState(0);

  // Reset active phase index when summary changes
  useEffect(() => {
    setActivePhaseIndex(0);
  }, [normalizedSummary]);

  // Determine the effective view mode - default to summary if available, otherwise parsed
  const effectiveViewMode =
    viewMode ?? (summary ? MODAL_CONSTANTS.VIEW_MODES.SUMMARY : MODAL_CONSTANTS.VIEW_MODES.PARSED);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const useWorktrees = useAppStore((state) => state.useWorktrees);

  // Force a fresh fetch when opening to avoid showing stale cached summaries.
  useEffect(() => {
    if (!open || !resolvedProjectPath || !featureId) return;
    if (!isBacklogPlan) {
      void refetchFeature();
    }
  }, [open, resolvedProjectPath, featureId, isBacklogPlan, refetchFeature]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Auto-scroll to bottom when summary changes (for pipeline step accumulation)
  const summaryScrollRef = useRef<HTMLDivElement>(null);
  const [summaryAutoScroll, setSummaryAutoScroll] = useState(true);

  // Auto-scroll summary panel to bottom when summary is updated
  useEffect(() => {
    if (summaryAutoScroll && summaryScrollRef.current && normalizedSummary) {
      summaryScrollRef.current.scrollTop = summaryScrollRef.current.scrollHeight;
    }
  }, [normalizedSummary, summaryAutoScroll]);

  // Handle scroll to detect if user scrolled up in summary panel
  const handleSummaryScroll = () => {
    if (!summaryScrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = summaryScrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setSummaryAutoScroll(isAtBottom);
  };

  // Scroll to active phase when it changes or when summary changes
  useEffect(() => {
    if (summaryScrollRef.current && hasMultiplePhases) {
      const phaseCards = summaryScrollRef.current.querySelectorAll('[data-phase-index]');
      // Ensure index is within bounds
      const safeIndex = Math.min(activePhaseIndex, phaseCards.length - 1);
      const targetCard = phaseCards[safeIndex];
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activePhaseIndex, hasMultiplePhases, normalizedSummary]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom =
      scrollHeight - scrollTop - clientHeight < MODAL_CONSTANTS.AUTOSCROLL_THRESHOLD;
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
          <div
            className={`flex-1 min-h-0 ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MIN} ${MODAL_CONSTANTS.COMPONENT_HEIGHTS.SMALL_MAX} overflow-y-auto scrollbar-visible`}
          >
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
          <>
            {/* Step navigator for multi-phase summaries */}
            {hasMultiplePhases && (
              <StepNavigator
                phaseEntries={phaseEntries}
                activeIndex={activePhaseIndex}
                onIndexChange={setActivePhaseIndex}
              />
            )}

            <div
              ref={summaryScrollRef}
              onScroll={handleSummaryScroll}
              className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible space-y-4 p-1"
            >
              {hasMultiplePhases ? (
                // Multi-phase: render individual phase cards
                phaseEntries.map((entry, index) => (
                  <div key={`phase-${index}-${entry.phaseName}`} data-phase-index={index}>
                    <PhaseEntryCard
                      entry={entry}
                      index={index}
                      totalPhases={phaseEntries.length}
                      hasMultiplePhases={hasMultiplePhases}
                      isActive={index === activePhaseIndex}
                      onClick={() => setActivePhaseIndex(index)}
                    />
                  </div>
                ))
              ) : (
                // Single phase: render as markdown
                <div className="bg-card border border-border/50 rounded-lg p-4">
                  <Markdown>{summary}</Markdown>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center shrink-0">
              {summaryAutoScroll
                ? 'Auto-scrolling enabled'
                : 'Scroll to bottom to enable auto-scroll'}
            </div>
          </>
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
