import { memo, useEffect, useState, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Feature, ThinkingLevel, ReasoningEffort, ParsedTask } from '@/store/app-store';
import { getProviderFromModel } from '@/lib/utils';
import { parseAgentContext, formatModelName, DEFAULT_MODEL } from '@/lib/agent-context-parser';
import { cn } from '@/lib/utils';
import type { AutoModeEvent } from '@/types/electron';
import { Brain, ListTodo, Sparkles, Expand, CheckCircle2, Circle, Wrench } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { SummaryDialog } from './summary-dialog';
import { getProviderIconForModel } from '@/components/ui/provider-icon';
import { useFeature, useAgentOutput } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';
import { getFirstNonEmptySummary } from '@/lib/summary-selection';
import { useAppStore } from '@/store/app-store';
import { isMobileDevice } from '@/lib/mobile-detect';

// Global concurrency control for mobile mount staggering.
// When many AgentInfoPanel instances mount simultaneously (e.g., worktree switch
// with 50+ cards), we spread queries over a wider window and cap how many
// panels can be querying concurrently to prevent mobile Safari crashes.
//
// The mechanism works in two layers:
// 1. Random delay (0-6s) - spreads mount times so not all panels try to query at once
// 2. Concurrency slots (max 4) - even after the delay, only N panels can query simultaneously
//
// Instance tracking ensures the queue resets if all panels unmount (e.g., navigation).
const MOBILE_MAX_CONCURRENT_QUERIES = 4;
const MOBILE_STAGGER_WINDOW_MS = 6000; // 6s window (vs previous 2s)
let activeMobileQueryCount = 0;
let pendingMobileQueue: Array<() => void> = [];
let mountedPanelCount = 0;

function acquireMobileQuerySlot(): Promise<void> {
  if (!isMobileDevice) return Promise.resolve();
  if (activeMobileQueryCount < MOBILE_MAX_CONCURRENT_QUERIES) {
    activeMobileQueryCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    pendingMobileQueue.push(() => {
      activeMobileQueryCount++;
      resolve();
    });
  });
}

function releaseMobileQuerySlot(): void {
  if (!isMobileDevice) return;
  activeMobileQueryCount = Math.max(0, activeMobileQueryCount - 1);
  const next = pendingMobileQueue.shift();
  if (next) next();
}

function trackPanelMount(): void {
  if (!isMobileDevice) return;
  mountedPanelCount++;
}

function trackPanelUnmount(): void {
  if (!isMobileDevice) return;
  mountedPanelCount = Math.max(0, mountedPanelCount - 1);
  // If all panels unmounted (e.g., navigated away from board or worktree switch),
  // reset the queue to prevent stale state from blocking future mounts.
  if (mountedPanelCount === 0) {
    activeMobileQueryCount = 0;
    // Drain any pending callbacks so their Promises resolve (components already unmounted)
    const pending = pendingMobileQueue;
    pendingMobileQueue = [];
    for (const cb of pending) cb();
  }
}

/**
 * Formats thinking level for compact display
 */
function formatThinkingLevel(level: ThinkingLevel | undefined): string {
  if (!level || level === 'none') return '';
  const labels: Record<ThinkingLevel, string> = {
    none: '',
    low: 'Low',
    medium: 'Med',
    high: 'High',
    ultrathink: 'Ultra',
    adaptive: 'Adaptive',
  };
  return labels[level];
}

/**
 * Formats reasoning effort for compact display
 */
function formatReasoningEffort(effort: ReasoningEffort | undefined): string {
  if (!effort || effort === 'none') return '';
  const labels: Record<ReasoningEffort, string> = {
    none: '',
    minimal: 'Min',
    low: 'Low',
    medium: 'Med',
    high: 'High',
    xhigh: 'XHigh',
  };
  return labels[effort];
}

interface AgentInfoPanelProps {
  feature: Feature;
  projectPath: string;
  contextContent?: string;
  summary?: string;
  isActivelyRunning?: boolean;
}

export const AgentInfoPanel = memo(function AgentInfoPanel({
  feature,
  projectPath,
  contextContent,
  summary,
  isActivelyRunning,
}: AgentInfoPanelProps) {
  const queryClient = useQueryClient();
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [isTodosExpanded, setIsTodosExpanded] = useState(false);

  // Track mounted panel count for global queue reset on full unmount
  useEffect(() => {
    trackPanelMount();
    return () => trackPanelUnmount();
  }, []);

  // Get providers from store for provider-aware model name display
  // This allows formatModelName to show provider-specific model names (e.g., "GLM 4.7" instead of "Sonnet 4.5")
  // when a feature was executed using a Claude-compatible provider
  const claudeCompatibleProviders = useAppStore((state) => state.claudeCompatibleProviders);

  // Memoize the format options to avoid recreating the object on every render
  const modelFormatOptions = useMemo(
    () => ({
      providerId: feature.providerId,
      claudeCompatibleProviders,
    }),
    [feature.providerId, claudeCompatibleProviders]
  );

  // Track real-time task status updates from WebSocket events
  const [taskStatusMap, setTaskStatusMap] = useState<
    Map<string, 'pending' | 'in_progress' | 'completed'>
  >(new Map());
  // Track real-time task summary updates from WebSocket events
  const [taskSummaryMap, setTaskSummaryMap] = useState<Map<string, string | null>>(new Map());
  // Track last WebSocket event timestamp to know if we're receiving real-time updates
  const [lastWsEventTimestamp, setLastWsEventTimestamp] = useState<number | null>(null);

  // Determine if we should poll for updates
  const shouldFetchData = feature.status !== 'backlog' && feature.status !== 'merge_conflict';

  // On mobile, stagger initial per-card queries to prevent a mount storm.
  // When a worktree loads with many cards, all AgentInfoPanel instances mount
  // simultaneously. Without staggering, each card fires useFeature + useAgentOutput
  // queries at the same time, creating 60-100+ concurrent API calls that crash
  // mobile Safari. Actively running cards fetch immediately (priority data);
  // other cards defer by a random delay AND wait for a concurrency slot.
  // The stagger window is 6s (vs previous 2s) to spread load for worktrees
  // with 50+ features. The concurrency limiter caps active queries to 4 at a time,
  // preventing the burst that overwhelms mobile Safari's connection handling.
  const [mountReady, setMountReady] = useState(!isMobileDevice || !!isActivelyRunning);
  useEffect(() => {
    if (mountReady) return;
    let cancelled = false;
    const delay = Math.random() * MOBILE_STAGGER_WINDOW_MS;
    const timer = setTimeout(() => {
      // After the random delay, also wait for a concurrency slot
      acquireMobileQuerySlot().then(() => {
        if (!cancelled) {
          setMountReady(true);
          // Release the slot after a brief window to let the initial queries fire
          // and return, preventing all slots from being held indefinitely
          setTimeout(releaseMobileQuerySlot, 3000);
        } else {
          releaseMobileQuerySlot();
        }
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mountReady]);

  const queryEnabled = shouldFetchData && mountReady;

  // Track whether we're receiving WebSocket events (within threshold)
  // Use a state to trigger re-renders when the WebSocket connection becomes stale
  const [isReceivingWsEvents, setIsReceivingWsEvents] = useState(false);
  const wsEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket activity threshold in ms - if no events within this time, consider WS inactive
  const WS_ACTIVITY_THRESHOLD = 10000;

  // Update isReceivingWsEvents when we get new WebSocket events
  useEffect(() => {
    if (lastWsEventTimestamp !== null) {
      // We just received an event, mark as active
      setIsReceivingWsEvents(true);

      // Clear any existing timeout
      if (wsEventTimeoutRef.current) {
        clearTimeout(wsEventTimeoutRef.current);
      }

      // Set a timeout to mark as inactive if no new events
      wsEventTimeoutRef.current = setTimeout(() => {
        setIsReceivingWsEvents(false);
      }, WS_ACTIVITY_THRESHOLD);
    }

    return () => {
      if (wsEventTimeoutRef.current) {
        clearTimeout(wsEventTimeoutRef.current);
      }
    };
  }, [lastWsEventTimestamp]);

  // Polling interval logic:
  // - If receiving WebSocket events: use longer interval (10s) as a fallback
  // - If not receiving WebSocket events but in_progress: use normal interval (3s)
  // - Otherwise: no polling
  const pollingInterval = useMemo((): number | false => {
    if (!(isActivelyRunning || feature.status === 'in_progress')) {
      return false;
    }
    // If receiving WebSocket events, use longer polling interval as fallback
    if (isReceivingWsEvents) {
      return WS_ACTIVITY_THRESHOLD;
    }
    // Default polling interval
    return 3000;
  }, [isActivelyRunning, feature.status, isReceivingWsEvents]);

  // Fetch fresh feature data for planSpec (store data can be stale for task progress)
  const { data: freshFeature } = useFeature(projectPath, feature.id, {
    enabled: queryEnabled && !contextContent,
    pollingInterval,
  });

  // Fetch agent output for parsing
  const { data: agentOutputContent } = useAgentOutput(projectPath, feature.id, {
    enabled: queryEnabled && !contextContent,
    pollingInterval,
  });

  // On mount, ensure feature and agent output queries are fresh.
  // This handles the worktree switch scenario where cards unmount when filtered out
  // and remount when the user switches back. Without this, the React Query cache
  // may serve stale data for the individual feature query, causing the todo list
  // to appear empty until the next polling cycle.
  //
  // IMPORTANT: Only invalidate if the cached data EXISTS and is STALE.
  // During worktree switches, ALL cards in the new worktree remount simultaneously.
  // If every card fires invalidateQueries(), it creates a query storm (40-100+
  // concurrent invalidations) that overwhelms React's rendering pipeline on mobile
  // Safari/PWA, causing crashes. The key insight: if a query has NEVER been fetched
  // (no dataUpdatedAt), there's nothing stale to invalidate — the useFeature/
  // useAgentOutput hooks will fetch fresh data when their `enabled` flag is true.
  // We only need to invalidate when cached data exists but is outdated.
  //
  // On mobile, skip mount-time invalidation entirely. The staggered useFeature/
  // useAgentOutput queries already fetch fresh data — invalidation is redundant
  // and creates the exact query storm we're trying to prevent. The stale threshold
  // is also higher on mobile (30s vs 10s) to further reduce unnecessary refetches
  // during the settling period after a worktree switch.
  useEffect(() => {
    if (queryEnabled && projectPath && feature.id && !contextContent) {
      // On mobile, skip mount-time invalidation — the useFeature/useAgentOutput
      // hooks will handle the initial fetch after the stagger delay.
      if (isMobileDevice) return;

      const MOUNT_STALE_THRESHOLD = 10_000; // 10s — skip invalidation if data is fresh
      const now = Date.now();

      const featureQuery = queryClient.getQueryState(
        queryKeys.features.single(projectPath, feature.id)
      );
      const agentOutputQuery = queryClient.getQueryState(
        queryKeys.features.agentOutput(projectPath, feature.id)
      );

      // Only invalidate queries that have cached data AND are stale.
      // Skip if the query has never been fetched (dataUpdatedAt is undefined) —
      // the useFeature/useAgentOutput hooks will handle the initial fetch.
      if (featureQuery?.dataUpdatedAt && now - featureQuery.dataUpdatedAt > MOUNT_STALE_THRESHOLD) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.single(projectPath, feature.id),
        });
      }
      if (
        agentOutputQuery?.dataUpdatedAt &&
        now - agentOutputQuery.dataUpdatedAt > MOUNT_STALE_THRESHOLD
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.agentOutput(projectPath, feature.id),
        });
      }
    }
    // Runs when mount staggering completes (queryEnabled becomes true) or on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryEnabled, feature.id, projectPath]);

  // Parse agent output into agentInfo
  const agentInfo = useMemo(() => {
    if (contextContent) {
      return parseAgentContext(contextContent);
    }
    if (agentOutputContent) {
      return parseAgentContext(agentOutputContent);
    }
    return null;
  }, [contextContent, agentOutputContent]);

  // Prefer freshly fetched feature summary over potentially stale list data.
  const effectiveSummary =
    getFirstNonEmptySummary(freshFeature?.summary, feature.summary, summary, agentInfo?.summary) ??
    undefined;

  // Fresh planSpec data from API (more accurate than store data for task progress)
  const freshPlanSpec = useMemo(() => {
    if (!freshFeature?.planSpec) return null;
    return {
      tasks: freshFeature.planSpec.tasks,
      tasksCompleted: freshFeature.planSpec.tasksCompleted || 0,
      currentTaskId: freshFeature.planSpec.currentTaskId,
    };
  }, [freshFeature?.planSpec]);

  // Derive effective todos from planSpec.tasks when available, fallback to agentInfo.todos
  // Uses freshPlanSpec (from API) for accurate progress, with taskStatusMap for real-time updates
  const isFeatureFinished = feature.status === 'waiting_approval' || feature.status === 'verified';
  const effectiveTodos = useMemo((): {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    summary?: string | null;
  }[] => {
    // Use freshPlanSpec if available (fetched from API), fallback to store's feature.planSpec
    const planSpec = freshPlanSpec?.tasks?.length ? freshPlanSpec : feature.planSpec;

    // First priority: use planSpec.tasks if available (modern approach)
    if (planSpec?.tasks && planSpec.tasks.length > 0) {
      const completedCount = planSpec.tasksCompleted || 0;
      const currentTaskId = planSpec.currentTaskId;

      return planSpec.tasks.map((task: ParsedTask, index: number) => {
        // When feature is finished (waiting_approval/verified), finalize task display:
        // - in_progress tasks → completed (agent was working on them when it finished)
        // - pending tasks stay pending (they were never started)
        // - completed tasks stay completed
        // This matches server-side behavior in feature-state-manager.ts
        if (isFeatureFinished) {
          const finalStatus =
            task.status === 'in_progress' || task.status === 'failed' ? 'completed' : task.status;
          return {
            content: task.description,
            status: (finalStatus || 'completed') as 'pending' | 'in_progress' | 'completed',
            summary: task.summary,
          };
        }

        // Use real-time status from WebSocket events if available
        const realtimeStatus = taskStatusMap.get(task.id);
        const realtimeSummary = taskSummaryMap.get(task.id);

        // Calculate status: WebSocket status > index-based status > task.status
        let effectiveStatus: 'pending' | 'in_progress' | 'completed';
        if (realtimeStatus) {
          effectiveStatus = realtimeStatus;
        } else if (index < completedCount) {
          effectiveStatus = 'completed';
        } else if (task.id === currentTaskId) {
          effectiveStatus = 'in_progress';
        } else {
          // Fallback to task.status if available, otherwise pending
          effectiveStatus =
            task.status === 'completed'
              ? 'completed'
              : task.status === 'in_progress'
                ? 'in_progress'
                : 'pending';
        }

        return {
          content: task.description,
          status: effectiveStatus,
          summary: taskSummaryMap.has(task.id) ? realtimeSummary : task.summary,
        };
      });
    }
    // Fallback: use parsed agentInfo.todos from agent-output.md
    return agentInfo?.todos || [];
  }, [
    freshPlanSpec,
    feature.planSpec,
    agentInfo?.todos,
    taskStatusMap,
    taskSummaryMap,
    isFeatureFinished,
  ]);

  // Listen to WebSocket events for real-time task status updates
  // This ensures the Kanban card shows the same progress as the Agent Output modal
  // Listen for ANY in-progress feature with planSpec tasks, not just isCurrentAutoTask
  const hasPlanSpecTasks =
    (freshPlanSpec?.tasks?.length ?? 0) > 0 || (feature.planSpec?.tasks?.length ?? 0) > 0;
  const shouldListenToEvents = feature.status === 'in_progress' && hasPlanSpecTasks;

  useEffect(() => {
    if (!shouldListenToEvents) return;

    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      // Only handle events for this feature
      if (!('featureId' in event) || event.featureId !== feature.id) return;

      // Update timestamp for any event related to this feature
      setLastWsEventTimestamp(Date.now());

      switch (event.type) {
        case 'auto_mode_task_started':
          if ('taskId' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            setTaskStatusMap((prev) => {
              const newMap = new Map(prev);
              // Mark current task as in_progress
              newMap.set(taskEvent.taskId, 'in_progress');
              return newMap;
            });
          }
          break;

        case 'auto_mode_task_complete':
          if ('taskId' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            setTaskStatusMap((prev) => {
              const newMap = new Map(prev);
              newMap.set(taskEvent.taskId, 'completed');
              return newMap;
            });

            if ('summary' in event) {
              setTaskSummaryMap((prev) => {
                const newMap = new Map(prev);
                // Allow empty string (reset) or non-empty string to be set
                const summary =
                  typeof event.summary === 'string' && event.summary.trim().length > 0
                    ? event.summary
                    : null;
                newMap.set(taskEvent.taskId, summary);
                return newMap;
              });
            }
          }
          break;
      }
    });

    return unsubscribe;
  }, [feature.id, shouldListenToEvents]);

  // Model/Preset Info for Backlog Cards
  if (feature.status === 'backlog' || feature.status === 'merge_conflict') {
    const provider = getProviderFromModel(feature.model);
    const isCodex = provider === 'codex';
    const isClaude = provider === 'claude';

    return (
      <div className="mb-3 space-y-2 overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <div className="flex items-center gap-1 text-[var(--status-info)]">
            {(() => {
              const ProviderIcon = getProviderIconForModel(feature.model);
              return <ProviderIcon className="w-3 h-3" />;
            })()}
            <span className="font-medium">
              {formatModelName(feature.model ?? DEFAULT_MODEL, modelFormatOptions)}
            </span>
          </div>
          {isClaude && feature.thinkingLevel && feature.thinkingLevel !== 'none' ? (
            <div className="flex items-center gap-1 text-purple-400">
              <Brain className="w-3 h-3" />
              <span className="font-medium">
                {formatThinkingLevel(feature.thinkingLevel as ThinkingLevel)}
              </span>
            </div>
          ) : null}
          {isCodex && feature.reasoningEffort && feature.reasoningEffort !== 'none' ? (
            <div className="flex items-center gap-1 text-purple-400">
              <Brain className="w-3 h-3" />
              <span className="font-medium">
                {formatReasoningEffort(feature.reasoningEffort as ReasoningEffort)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Agent Info Panel for non-backlog cards
  // Show panel if we have agentInfo OR planSpec.tasks (for spec/full mode)
  // OR if the feature has effective todos from any source (handles initial mount after worktree switch)
  // OR if the feature is actively running (ensures panel stays visible during execution)
  // Note: hasPlanSpecTasks is already defined above and includes freshPlanSpec
  // (The backlog case was already handled above and returned early)
  if (
    agentInfo ||
    hasPlanSpecTasks ||
    effectiveTodos.length > 0 ||
    isActivelyRunning ||
    effectiveSummary
  ) {
    return (
      <>
        <div className="mb-3 space-y-2 overflow-hidden">
          {/* Model & Phase */}
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <div className="flex items-center gap-1 text-[var(--status-info)]">
              {(() => {
                const ProviderIcon = getProviderIconForModel(feature.model);
                return <ProviderIcon className="w-3 h-3" />;
              })()}
              <span className="font-medium">
                {formatModelName(feature.model ?? DEFAULT_MODEL, modelFormatOptions)}
              </span>
            </div>
            {agentInfo?.currentPhase && (
              <div
                className={cn(
                  'px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                  agentInfo.currentPhase === 'planning' &&
                    'bg-[var(--status-info-bg)] text-[var(--status-info)]',
                  agentInfo.currentPhase === 'action' &&
                    'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
                  agentInfo.currentPhase === 'verification' &&
                    'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                )}
              >
                {agentInfo.currentPhase}
              </div>
            )}
          </div>

          {/* Task List Progress */}
          {effectiveTodos.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <ListTodo className="w-3 h-3" />
                <span>
                  {effectiveTodos.filter((t) => t.status === 'completed').length}/
                  {effectiveTodos.length} tasks
                </span>
              </div>
              <div
                className={cn(
                  'space-y-0.5 overflow-y-auto',
                  isTodosExpanded ? 'max-h-40' : 'max-h-16'
                )}
              >
                {(isTodosExpanded ? effectiveTodos : effectiveTodos.slice(0, 3)).map(
                  (todo, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        {todo.status === 'completed' ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-[var(--status-success)] shrink-0" />
                        ) : todo.status === 'in_progress' ? (
                          <Spinner size="xs" className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <Circle className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                        )}
                        <span
                          className={cn(
                            'break-words hyphens-auto line-clamp-2 leading-relaxed',
                            todo.status === 'completed' && 'text-muted-foreground/60 line-through',
                            todo.status === 'in_progress' && 'text-[var(--status-warning)]',
                            todo.status === 'pending' && 'text-muted-foreground/80'
                          )}
                        >
                          {todo.content}
                        </span>
                      </div>
                      {todo.summary && isTodosExpanded && (
                        <div className="pl-4 text-[9px] text-muted-foreground/50 italic break-words line-clamp-2">
                          {todo.summary}
                        </div>
                      )}
                    </div>
                  )
                )}
                {effectiveTodos.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTodosExpanded(!isTodosExpanded);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-[10px] text-muted-foreground/60 pl-4 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    {isTodosExpanded ? 'Show less' : `+${effectiveTodos.length - 3} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Summary for waiting_approval, verified, and pipeline steps */}
          {(feature.status === 'waiting_approval' ||
            feature.status === 'verified' ||
            (typeof feature.status === 'string' && feature.status.startsWith('pipeline_'))) && (
            <div className="space-y-1.5">
              {effectiveSummary && (
                <div className="space-y-1.5 pt-2 border-t border-border/30 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSummaryDialogOpen(true);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-[var(--status-success)] min-w-0 hover:opacity-80 transition-opacity cursor-pointer"
                      title="View full summary"
                    >
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium">Summary</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSummaryDialogOpen(true);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="p-0.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground/60 hover:text-muted-foreground shrink-0"
                      title="View full summary"
                      data-testid={`expand-summary-${feature.id}`}
                    >
                      <Expand className="w-3 h-3" />
                    </button>
                  </div>
                  <p
                    className="text-[10px] text-muted-foreground/70 line-clamp-3 break-words hyphens-auto leading-relaxed overflow-hidden select-text cursor-text"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {effectiveSummary}
                  </p>
                </div>
              )}
              {!effectiveSummary && (agentInfo?.toolCallCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 pt-2 border-t border-border/30">
                  <span className="flex items-center gap-1">
                    <Wrench className="w-2.5 h-2.5" />
                    {agentInfo?.toolCallCount ?? 0} tool calls
                  </span>
                  {effectiveTodos.length > 0 && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-[var(--status-success)]" />
                      {effectiveTodos.filter((t) => t.status === 'completed').length} tasks done
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {/* SummaryDialog must be rendered alongside the expand button */}
        <SummaryDialog
          feature={feature}
          agentInfo={agentInfo}
          summary={effectiveSummary}
          isOpen={isSummaryDialogOpen}
          onOpenChange={setIsSummaryDialogOpen}
          projectPath={projectPath}
        />
      </>
    );
  }

  // Always render SummaryDialog (even if no agentInfo yet)
  // This ensures the dialog can be opened from the expand button
  return (
    <SummaryDialog
      feature={feature}
      agentInfo={agentInfo}
      summary={effectiveSummary}
      isOpen={isSummaryDialogOpen}
      onOpenChange={setIsSummaryDialogOpen}
      projectPath={projectPath}
    />
  );
});
