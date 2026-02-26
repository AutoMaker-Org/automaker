import { useMemo, useState, useRef, useEffect } from 'react';
import type { Feature } from '@/store/app-store';
import type { AgentTaskInfo } from '@/lib/agent-context-parser';
import {
  parseAllPhaseSummaries,
  isAccumulatedSummary,
  type PhaseSummaryEntry,
} from '@/lib/log-parser';
import { getFirstNonEmptySummary } from '@/lib/summary-selection';
import { useAgentOutput } from '@/hooks/queries';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { LogViewer } from '@/components/ui/log-viewer';
import { Sparkles, Layers, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface SummaryDialogProps {
  feature: Feature;
  agentInfo: AgentTaskInfo | null;
  summary?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath?: string;
}

type ViewMode = 'summary' | 'output';

/**
 * Renders a single phase entry card with header and content.
 * Extracted for better separation of concerns and readability.
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
      {/* Phase header - styled to stand out */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
        <span className="text-sm font-semibold text-primary">{entry.phaseName}</span>
        {hasMultiplePhases && (
          <span className="text-xs text-muted-foreground">
            Step {index + 1} of {totalPhases}
          </span>
        )}
      </div>
      {/* Phase content */}
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

export function SummaryDialog({
  feature,
  agentInfo,
  summary,
  isOpen,
  onOpenChange,
  projectPath,
}: SummaryDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [activePhaseIndex, setActivePhaseIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Prefer explicitly provided summary (can come from fresh per-feature query),
  // then fall back to feature/agent-info summaries.
  const rawSummary = getFirstNonEmptySummary(summary, feature.summary, agentInfo?.summary);

  // Normalize null to undefined for parser helpers that expect string | undefined
  const normalizedSummary = rawSummary ?? undefined;

  // Memoize the parsed phases to avoid re-parsing on every render
  const phaseEntries = useMemo(
    () => parseAllPhaseSummaries(normalizedSummary),
    [normalizedSummary]
  );

  // Memoize the multi-phase check
  const hasMultiplePhases = useMemo(
    () => isAccumulatedSummary(normalizedSummary),
    [normalizedSummary]
  );

  // Fetch agent output
  const { data: agentOutput = '', isLoading: isLoadingOutput } = useAgentOutput(
    projectPath || '',
    feature.id,
    {
      enabled: isOpen && !!projectPath && viewMode === 'output',
    }
  );

  // Reset active phase index when summary changes
  useEffect(() => {
    setActivePhaseIndex(0);
  }, [normalizedSummary]);

  // Scroll to active phase when it changes or when normalizedSummary changes
  useEffect(() => {
    if (contentRef.current && hasMultiplePhases) {
      const phaseCards = contentRef.current.querySelectorAll('[data-phase-index]');
      // Ensure index is within bounds
      const safeIndex = Math.min(activePhaseIndex, phaseCards.length - 1);
      const targetCard = phaseCards[safeIndex];
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activePhaseIndex, hasMultiplePhases, normalizedSummary]);

  // Determine the dialog title based on number of phases
  const dialogTitle = hasMultiplePhases
    ? `Pipeline Summary (${phaseEntries.length} steps)`
    : 'Implementation Summary';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col select-text"
        data-testid={`summary-dialog-${feature.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-10">
            <DialogTitle className="flex items-center gap-2">
              {hasMultiplePhases ? (
                <Layers className="w-5 h-5 text-[var(--status-success)]" />
              ) : (
                <Sparkles className="w-5 h-5 text-[var(--status-success)]" />
              )}
              {dialogTitle}
            </DialogTitle>

            {/* View mode tabs */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setViewMode('summary')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  viewMode === 'summary'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Summary
              </button>
              <button
                onClick={() => setViewMode('output')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  viewMode === 'output'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                Output
              </button>
            </div>
          </div>
          <DialogDescription
            className="text-sm"
            title={feature.description || feature.summary || ''}
          >
            {(() => {
              const displayText = feature.description || feature.summary || 'No description';
              return displayText.length > 100 ? `${displayText.slice(0, 100)}...` : displayText;
            })()}
          </DialogDescription>
        </DialogHeader>

        {/* Step navigator for multi-phase summaries */}
        {viewMode === 'summary' && hasMultiplePhases && (
          <StepNavigator
            phaseEntries={phaseEntries}
            activeIndex={activePhaseIndex}
            onIndexChange={setActivePhaseIndex}
          />
        )}

        {/* Content area */}
        {viewMode === 'summary' ? (
          <div ref={contentRef} className="flex-1 overflow-y-auto space-y-4">
            {phaseEntries.length > 0 ? (
              phaseEntries.map((entry, index) => (
                <div key={`phase-${index}-${entry.phaseName}`} data-phase-index={index}>
                  <PhaseEntryCard
                    entry={entry}
                    index={index}
                    totalPhases={phaseEntries.length}
                    hasMultiplePhases={hasMultiplePhases}
                    isActive={hasMultiplePhases && index === activePhaseIndex}
                    onClick={hasMultiplePhases ? () => setActivePhaseIndex(index) : undefined}
                  />
                </div>
              ))
            ) : (
              <div className="p-4 bg-card rounded-lg border border-border/50">
                <Markdown>No summary available</Markdown>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto bg-popover border border-border/50 rounded-lg p-4 font-mono text-xs">
            {isLoadingOutput ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Spinner size="lg" className="mr-2" />
                Loading output...
              </div>
            ) : !agentOutput ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No agent output available.
              </div>
            ) : (
              <LogViewer output={agentOutput} />
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="close-summary-button"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
