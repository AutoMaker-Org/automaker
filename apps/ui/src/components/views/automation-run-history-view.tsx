import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  Download,
  Trash2,
  Calendar,
  Filter,
  Activity,
  X,
  Play,
  Clock4,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  getAutomationRequestHeaders as getRequestHeaders,
  automationApiRequest as apiRequest,
} from '@/lib/automation-utils';
import type {
  AutomationRun,
  AutomationRunStatus,
  AutomationStepRun,
  ScheduledRun,
  AutomationTriggerType,
} from '@automaker/types';

type RunStatusFilter = 'all' | AutomationRunStatus;
type TriggerTypeFilter = 'all' | AutomationTriggerType;

const RUNS_QUERY_KEY = ['automation-runs'] as const;
const SCHEDULED_QUERY_KEY = ['automation-scheduled'] as const;

// Polling intervals
const RUNS_REFETCH_INTERVAL_MS = 3000;
const SCHEDULED_REFETCH_INTERVAL_MS = 6000;

// Duration formatting thresholds (in milliseconds)
const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60000;
const ONE_HOUR_MS = 3600000;
const ONE_DAY_MS = 86400000;

interface AutomationRunsResponse {
  success: boolean;
  runs: AutomationRun[];
}

interface ScheduledRunsResponse {
  success: boolean;
  scheduledRuns: ScheduledRun[];
}

interface AutomationsNameMap {
  [automationId: string]: string;
}

function getStatusIcon(status: AutomationRunStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'cancelled':
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case 'pending':
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

/** Get status icon for step runs (includes 'skipped' status) */
function getStepStatusIcon(status: AutomationStepRun['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'skipped':
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case 'pending':
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function getStatusBadgeVariant(
  status: AutomationRunStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'default';
    case 'cancelled':
      return 'secondary';
    default:
      return 'outline';
  }
}

function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = end - start;

  if (diffMs < ONE_SECOND_MS) return `${diffMs}ms`;
  if (diffMs < ONE_MINUTE_MS) return `${(diffMs / ONE_SECOND_MS).toFixed(1)}s`;
  if (diffMs < ONE_HOUR_MS) return `${(diffMs / ONE_MINUTE_MS).toFixed(1)}m`;
  return `${(diffMs / ONE_HOUR_MS).toFixed(1)}h`;
}

function formatTriggerType(trigger: AutomationRun['trigger']): string {
  switch (trigger.type) {
    case 'manual':
      return 'Manual';
    case 'event':
      return `Event: ${trigger.event ?? 'n/a'}`;
    case 'schedule':
      return `Cron: ${trigger.cron ?? 'n/a'}`;
    case 'webhook':
      return 'Webhook';
    case 'date':
      return `Date: ${trigger.date ?? 'n/a'}`;
    default:
      return trigger.type;
  }
}

function formatScheduledFor(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs < 0) return 'Overdue';
  if (diffMs < ONE_MINUTE_MS) return 'In < 1 min';
  if (diffMs < ONE_HOUR_MS) return `In ${Math.ceil(diffMs / ONE_MINUTE_MS)} min`;
  if (diffMs < ONE_DAY_MS) return `In ${Math.ceil(diffMs / ONE_HOUR_MS)} hours`;
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/** Safely format unknown values as JSON string */
function formatJsonValue(value: unknown): React.ReactNode {
  return JSON.stringify(value, null, 2);
}

function downloadJson(content: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  // Cleanup: remove link and revoke URL after a short delay to ensure download starts
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

interface RunDetailStepProps {
  step: AutomationStepRun;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function RunDetailStep({ step, index, isExpanded, onToggle }: RunDetailStepProps) {
  const duration = step.endedAt
    ? formatDuration(step.startedAt, step.endedAt)
    : step.status === 'running'
      ? formatDuration(step.startedAt)
      : '-';

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex-shrink-0">{getStepStatusIcon(step.status)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {index + 1}. {step.stepType}
            </span>
            <Badge variant="outline" className="text-xs">
              {step.stepId}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {step.status} | {duration}
          </p>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/60 p-3 space-y-3 bg-muted/20">
          {step.input !== undefined && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-48">
                {formatJsonValue(step.input)}
              </pre>
            </div>
          )}
          {step.output !== undefined && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-48">
                {formatJsonValue(step.output)}
              </pre>
            </div>
          )}
          {step.error && (
            <div>
              <p className="text-xs font-medium text-red-500 mb-1">Error</p>
              <div className="text-xs bg-red-500/10 border border-red-500/20 p-2 rounded space-y-1">
                <p className="font-medium">
                  {step.error.code}: {step.error.message}
                </p>
                {step.error.details ? (
                  <pre className="overflow-x-auto text-red-400">
                    {formatJsonValue(step.error.details)}
                  </pre>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RunDetailPanelProps {
  run: AutomationRun;
  automationName: string;
  onClose: () => void;
}

function RunDetailPanel({ run, automationName, onClose }: RunDetailPanelProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const duration = formatDuration(run.startedAt, run.endedAt);
  const failedSteps = run.stepRuns.filter((s) => s.status === 'failed');

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-shrink-0 border-b border-border/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span className="flex-shrink-0">{getStatusIcon(run.status)}</span>
              <span className="truncate">Run: {automationName}</span>
            </CardTitle>
            <CardDescription className="truncate">
              {run.id} | {run.scope} scope
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="overflow-y-auto p-0">
        <div className="p-4 space-y-4">
          {/* Run Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <Badge variant={getStatusBadgeVariant(run.status)}>{run.status}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Duration</p>
              <p className="font-medium">{duration}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Started</p>
              <p className="font-medium">{new Date(run.startedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ended</p>
              <p className="font-medium">
                {run.endedAt ? new Date(run.endedAt).toLocaleString() : '-'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-xs">Trigger</p>
              <p className="font-medium break-all">{formatTriggerType(run.trigger)}</p>
            </div>
          </div>

          {/* Run Error */}
          {run.error && (
            <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-red-500 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Run Error
              </p>
              <p className="text-sm">
                {run.error.code}: {run.error.message}
              </p>
              {run.error.details ? (
                <pre className="text-xs bg-red-500/20 p-2 rounded overflow-x-auto">
                  {formatJsonValue(run.error.details)}
                </pre>
              ) : null}
            </div>
          )}

          {/* Failed Steps Summary */}
          {failedSteps.length > 0 && (
            <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-3">
              <p className="text-sm font-medium text-red-500 mb-2">
                {failedSteps.length} Failed Step{failedSteps.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {failedSteps.map((step) => (
                  <div key={step.stepId} className="text-xs">
                    <span className="font-medium">{step.stepId}</span>:
                    {step.error?.message ?? 'Unknown error'}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Steps ({run.stepRuns.length})</h4>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    const allIds = run.stepRuns.map((s) => s.stepId);
                    setExpandedSteps(new Set(allIds));
                  }}
                >
                  Expand All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setExpandedSteps(new Set())}
                >
                  Collapse All
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {run.stepRuns.map((step, index) => (
                <RunDetailStep
                  key={step.stepId}
                  step={step}
                  index={index}
                  isExpanded={expandedSteps.has(step.stepId)}
                  onToggle={() => toggleStep(step.stepId)}
                />
              ))}
            </div>
          </div>

          {/* Output */}
          {run.output !== undefined && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Run Output</h4>
                <pre className="text-xs bg-muted/50 p-3 rounded overflow-auto max-h-48">
                  {formatJsonValue(run.output)}
                </pre>
              </div>
            </>
          )}

          {/* Variables */}
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Variables</h4>
            <div className="space-y-2">
              {Object.entries(run.variables).map(([scope, vars]) => (
                <div key={scope}>
                  <p className="text-xs font-medium text-muted-foreground capitalize">{scope}</p>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-32">
                    {formatJsonValue(vars)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface UpcomingRunsPanelProps {
  scheduledRuns: ScheduledRun[];
  automationNames: AutomationsNameMap;
  isLoading: boolean;
}

function UpcomingRunsPanel({ scheduledRuns, automationNames, isLoading }: UpcomingRunsPanelProps) {
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async (scheduledRunId: string) => {
      return apiRequest<{ success: boolean }>(`/api/automation/scheduled/${scheduledRunId}`, {
        method: 'DELETE',
        headers: getRequestHeaders(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULED_QUERY_KEY });
      toast.success('Scheduled run cancelled');
    },
    onError: (error) => {
      toast.error('Failed to cancel scheduled run', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (scheduledRuns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No upcoming scheduled runs</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Upcoming Runs
        </CardTitle>
        <CardDescription>
          {scheduledRuns.length} scheduled run{scheduledRuns.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-48">
          <div className="divide-y divide-border/60">
            {scheduledRuns.slice(0, 10).map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {automationNames[run.automationId] ?? run.automationId}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock4 className="w-3 h-3" />
                    {formatScheduledFor(run.scheduledFor)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => cancelMutation.mutate(run.id)}
                  disabled={cancelMutation.isPending}
                  title="Cancel scheduled run"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface RunHistoryListProps {
  runs: AutomationRun[];
  automationNames: AutomationsNameMap;
  isLoading: boolean;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  statusFilter: RunStatusFilter;
  triggerFilter: TriggerTypeFilter;
  searchText: string;
  onStatusFilterChange: (status: RunStatusFilter) => void;
  onTriggerFilterChange: (trigger: TriggerTypeFilter) => void;
  onSearchChange: (search: string) => void;
  onExport: () => void;
  onClearRuns?: () => void;
}

function RunHistoryList({
  runs,
  automationNames,
  isLoading,
  selectedRunId,
  onSelectRun,
  statusFilter,
  triggerFilter,
  searchText,
  onStatusFilterChange,
  onTriggerFilterChange,
  onSearchChange,
  onExport,
  onClearRuns,
}: RunHistoryListProps) {
  const filteredRuns = useMemo(() => {
    const lowerSearch = searchText.trim().toLowerCase();

    return runs.filter((run) => {
      // Status filter
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;

      // Trigger filter
      if (triggerFilter !== 'all' && run.trigger.type !== triggerFilter) return false;

      // Search filter
      if (lowerSearch) {
        const automationName = automationNames[run.automationId] ?? '';
        const searchIn =
          `${run.id} ${automationName} ${run.automationId} ${run.status}`.toLowerCase();
        if (!searchIn.includes(lowerSearch)) return false;
      }

      return true;
    });
  }, [runs, statusFilter, triggerFilter, searchText, automationNames]);

  // Sort runs by startedAt descending
  const sortedRuns = useMemo(() => {
    return [...filteredRuns].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }, [filteredRuns]);

  // Group runs by status for summary
  const statusCounts = useMemo(() => {
    const counts: Record<AutomationRunStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const run of runs) {
      counts[run.status]++;
    }
    return counts;
  }, [runs]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-shrink-0 border-b border-border/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 flex-shrink-0" />
              Run History
            </CardTitle>
            <CardDescription>
              {runs.length} total run{runs.length !== 1 ? 's' : ''}
              {statusCounts.running > 0 && (
                <span className="text-blue-500 ml-2">({statusCounts.running} running)</span>
              )}
              {statusCounts.failed > 0 && (
                <span className="text-red-500 ml-2">({statusCounts.failed} failed)</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Export
            </Button>
            {onClearRuns && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearRuns}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search runs..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => onStatusFilterChange(v as RunStatusFilter)}
            >
              <SelectTrigger className="flex-1 sm:w-36">
                <Filter className="w-4 h-4 mr-1.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={triggerFilter}
              onValueChange={(v) => onTriggerFilterChange(v as TriggerTypeFilter)}
            >
              <SelectTrigger className="flex-1 sm:w-36">
                <Play className="w-4 h-4 mr-1.5" />
                <SelectValue placeholder="Trigger" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Triggers</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="schedule">Schedule</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="overflow-y-auto p-0 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedRuns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No runs found
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {sortedRuns.map((run) => {
              const isSelected = run.id === selectedRunId;
              const automationName = automationNames[run.automationId] ?? run.automationId;
              const duration = formatDuration(run.startedAt, run.endedAt);

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left ${
                    isSelected ? 'bg-brand-500/10 border-l-2 border-brand-500' : ''
                  }`}
                >
                  <div className="flex-shrink-0">{getStatusIcon(run.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{automationName}</p>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {run.scope}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>{formatTriggerType(run.trigger)}</span>
                      <span className="hidden sm:inline">|</span>
                      <span>{duration}</span>
                      <span className="hidden sm:inline">|</span>
                      <span>{new Date(run.startedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={getStatusBadgeVariant(run.status)} className="text-xs">
                      {run.status}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AutomationRunHistoryViewProps {
  /** Filter to a specific automation ID (optional - shows all runs when not provided) */
  automationId?: string;
  /** When true, hides the internal header (e.g. when used inside a dialog that already has a header) */
  hideHeader?: boolean;
}

export function AutomationRunHistoryView({
  automationId,
  hideHeader,
}: AutomationRunHistoryViewProps) {
  const queryClient = useQueryClient();

  // State
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatusFilter>('all');
  const [triggerFilter, setTriggerFilter] = useState<TriggerTypeFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Fetch runs
  const runsQuery = useQuery({
    queryKey: automationId ? [...RUNS_QUERY_KEY, 'automation', automationId] : RUNS_QUERY_KEY,
    queryFn: async (): Promise<AutomationRun[]> => {
      const search = automationId ? `?automationId=${encodeURIComponent(automationId)}` : '';
      const payload = await apiRequest<AutomationRunsResponse>(`/api/automation/runs${search}`);
      return payload.runs ?? [];
    },
    refetchInterval: RUNS_REFETCH_INTERVAL_MS,
  });

  // Fetch scheduled runs
  const scheduledQuery = useQuery({
    queryKey: automationId
      ? [...SCHEDULED_QUERY_KEY, 'automation', automationId]
      : SCHEDULED_QUERY_KEY,
    queryFn: async (): Promise<ScheduledRun[]> => {
      const search = automationId ? `?automationId=${encodeURIComponent(automationId)}` : '';
      const payload = await apiRequest<ScheduledRunsResponse>(
        `/api/automation/scheduled/upcoming${search}`
      );
      return payload.scheduledRuns ?? [];
    },
    refetchInterval: SCHEDULED_REFETCH_INTERVAL_MS,
  });

  // Fetch automation names for display
  const automationsQuery = useQuery({
    queryKey: ['automation-names'],
    queryFn: async (): Promise<AutomationsNameMap> => {
      // Fetch global automations to get names
      // Note: Project automations would require knowing project paths
      // For those, we fall back to using the automationId as the display name
      const globalPayload = await apiRequest<{
        success: boolean;
        automations: { id: string; name: string }[];
      }>('/api/automation/list?scope=global');

      const nameMap: AutomationsNameMap = {};
      for (const auto of globalPayload.automations ?? []) {
        nameMap[auto.id] = auto.name;
      }

      // Add names from runs themselves (as a fallback for project automations)
      const runs = runsQuery.data ?? [];
      for (const run of runs) {
        if (!nameMap[run.automationId]) {
          nameMap[run.automationId] = run.automationId;
        }
      }

      return nameMap;
    },
    enabled: runsQuery.data !== undefined,
  });

  // Build automation names map (combine API data with runs data)
  const automationNames = useMemo<AutomationsNameMap>(() => {
    const names = { ...automationsQuery.data };

    // Add from runs if not already present
    for (const run of runsQuery.data ?? []) {
      if (!names[run.automationId]) {
        names[run.automationId] = run.automationId;
      }
    }

    // Add from scheduled runs
    for (const scheduled of scheduledQuery.data ?? []) {
      if (!names[scheduled.automationId]) {
        names[scheduled.automationId] = scheduled.automationId;
      }
    }

    return names;
  }, [automationsQuery.data, runsQuery.data, scheduledQuery.data]);

  // Selected run
  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    return (runsQuery.data ?? []).find((run) => run.id === selectedRunId) ?? null;
  }, [runsQuery.data, selectedRunId]);

  // Mutations
  const clearRunsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ success: boolean }>('/api/automation/runs', {
        method: 'DELETE',
        headers: getRequestHeaders(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
      setSelectedRunId(null);
      toast.success('Run history cleared');
    },
    onError: (error) => {
      toast.error('Failed to clear runs', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Handlers
  const handleExport = () => {
    const runs = runsQuery.data ?? [];
    downloadJson(runs, `automation-runs-${new Date().toISOString().split('T')[0]}.json`);
    toast.success('Runs exported');
  };

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId === selectedRunId ? null : runId);
  };

  return (
    <div
      className={cn(
        'content-bg',
        hideHeader ? 'space-y-4' : 'flex-1 flex flex-col overflow-hidden'
      )}
      data-testid="automation-run-history-view"
    >
      {/* Header */}
      {!hideHeader && (
        <div className="border-b border-border/60 px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Activity className="w-6 h-6 text-brand-500 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold truncate">
                {automationId
                  ? `Run History: ${automationNames[automationId] ?? automationId}`
                  : 'Automation Activity'}
              </h1>
              <p className="text-sm text-muted-foreground">
                View run history, live monitoring, and upcoming scheduled runs
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        className={cn(
          'gap-4 flex flex-col',
          hideHeader ? '' : 'flex-1 p-4 sm:p-6 min-h-0 overflow-hidden'
        )}
      >
        {/* Upcoming Runs - Top Panel */}
        <div className="flex-shrink-0">
          <UpcomingRunsPanel
            scheduledRuns={scheduledQuery.data ?? []}
            automationNames={automationNames}
            isLoading={scheduledQuery.isLoading}
          />
        </div>

        {/* Run History + Detail Split View */}
        <div
          className={cn(
            'flex flex-col lg:flex-row gap-4',
            hideHeader ? '' : 'flex-1 min-h-0 overflow-hidden'
          )}
        >
          {/* Run History List — hidden on mobile when a run is selected */}
          <div
            className={cn(
              'min-w-0',
              hideHeader
                ? selectedRun
                  ? 'hidden lg:block'
                  : ''
                : selectedRun
                  ? 'hidden lg:flex lg:flex-1 lg:min-h-0 lg:flex-col'
                  : 'flex-1 flex flex-col min-h-0'
            )}
          >
            <RunHistoryList
              runs={runsQuery.data ?? []}
              automationNames={automationNames}
              isLoading={runsQuery.isLoading}
              selectedRunId={selectedRunId}
              onSelectRun={handleSelectRun}
              statusFilter={statusFilter}
              triggerFilter={triggerFilter}
              searchText={searchText}
              onStatusFilterChange={setStatusFilter}
              onTriggerFilterChange={setTriggerFilter}
              onSearchChange={setSearchText}
              onExport={handleExport}
              onClearRuns={automationId ? undefined : () => setShowClearConfirm(true)}
            />
          </div>

          {/* Run Detail Panel */}
          {selectedRun && (
            <div
              className={cn(
                'flex flex-col',
                hideHeader ? '' : 'flex-1 lg:flex-none lg:w-[480px] min-h-0'
              )}
            >
              <RunDetailPanel
                run={selectedRun}
                automationName={
                  automationNames[selectedRun.automationId] ?? selectedRun.automationId
                }
                onClose={() => setSelectedRunId(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Clear Confirmation Dialog - only show when viewing all automations */}
      {!automationId && (
        <ConfirmDialog
          open={showClearConfirm}
          onOpenChange={setShowClearConfirm}
          onConfirm={() => clearRunsMutation.mutate()}
          title="Clear Run History"
          description="Are you sure you want to clear the run history? Running automations will be preserved. This action cannot be undone."
          icon={Trash2}
          iconClassName="text-destructive"
          confirmText="Clear History"
          confirmVariant="destructive"
        />
      )}
    </div>
  );
}
