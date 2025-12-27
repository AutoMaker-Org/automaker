import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  Lock,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Pause,
  Eye,
  MoreVertical,
  GitBranch,
  Terminal,
  RotateCcw,
  GitFork,
  Trash2,
} from 'lucide-react';
import { TaskNodeData } from '../hooks/use-graph-nodes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type TaskNodeProps = NodeProps & {
  data: TaskNodeData;
};

const statusConfig = {
  backlog: {
    icon: Clock,
    label: 'Backlog',
    colorClass: 'text-muted-foreground',
    borderClass: 'border-border',
    bgClass: 'bg-card',
  },
  in_progress: {
    icon: Play,
    label: 'In Progress',
    colorClass: 'text-[var(--status-in-progress)]',
    borderClass: 'border-[var(--status-in-progress)]',
    bgClass: 'bg-[var(--status-in-progress-bg)]',
  },
  waiting_approval: {
    icon: Pause,
    label: 'Waiting Approval',
    colorClass: 'text-[var(--status-waiting)]',
    borderClass: 'border-[var(--status-waiting)]',
    bgClass: 'bg-[var(--status-warning-bg)]',
  },
  verified: {
    icon: CheckCircle2,
    label: 'Verified',
    colorClass: 'text-[var(--status-success)]',
    borderClass: 'border-[var(--status-success)]',
    bgClass: 'bg-[var(--status-success-bg)]',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    colorClass: 'text-[var(--status-success)]',
    borderClass: 'border-[var(--status-success)]/50',
    bgClass: 'bg-[var(--status-success-bg)]/50',
  },
};

const priorityConfig = {
  1: { label: 'High', colorClass: 'bg-[var(--status-error)] text-white' },
  2: { label: 'Medium', colorClass: 'bg-[var(--status-warning)] text-black' },
  3: { label: 'Low', colorClass: 'bg-[var(--status-info)] text-white' },
};

export const TaskNode = memo(function TaskNode({ data, selected }: TaskNodeProps) {
  const config = statusConfig[data.status] || statusConfig.backlog;
  const StatusIcon = config.icon;
  const priorityConf = data.priority ? priorityConfig[data.priority as 1 | 2 | 3] : null;

  // Filter highlight states
  const isMatched = data.isMatched ?? false;
  const isHighlighted = data.isHighlighted ?? false;
  const isDimmed = data.isDimmed ?? false;

  // Task is stopped if it's in_progress but not actively running
  const isStopped = data.status === 'in_progress' && !data.isRunning;

  return (
    <>
      {/* Target handle (left side - receives dependencies) */}
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        isConnectable={true}
        className={cn(
          'w-3 h-3 !bg-border border-2 border-background',
          'transition-colors duration-200',
          'hover:!bg-brand-500',
          isDimmed && 'opacity-30'
        )}
      />

      <div
        className={cn(
          'min-w-[240px] max-w-[280px] rounded-xl border-2 bg-card shadow-md',
          'transition-all duration-300',
          config.borderClass,
          selected && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-background',
          data.isRunning && 'animate-pulse-subtle',
          data.error && 'border-[var(--status-error)]',
          // Filter highlight states
          isMatched && 'graph-node-matched',
          isHighlighted && !isMatched && 'graph-node-highlighted',
          isDimmed && 'graph-node-dimmed'
        )}
      >
        {/* Header with status and actions */}
        <div
          className={cn(
            'flex items-center justify-between px-3 py-2 rounded-t-[10px]',
            config.bgClass
          )}
        >
          <div className="flex items-center gap-2">
            <StatusIcon className={cn('w-4 h-4', config.colorClass)} />
            <span className={cn('text-xs font-medium', config.colorClass)}>{config.label}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Priority badge */}
            {priorityConf && (
              <span
                className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded',
                  priorityConf.colorClass
                )}
              >
                {data.priority === 1 ? 'H' : data.priority === 2 ? 'M' : 'L'}
              </span>
            )}

            {/* Blocked indicator */}
            {data.isBlocked && !data.error && data.status === 'backlog' && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-1 rounded bg-orange-500/20">
                      <Lock className="w-3 h-3 text-orange-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    <p>Blocked by {data.blockingDependencies.length} dependencies</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Error indicator */}
            {data.error && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-1 rounded bg-[var(--status-error-bg)]">
                      <AlertCircle className="w-3 h-3 text-[var(--status-error)]" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[250px]">
                    <p>{data.error}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Stopped indicator - task is in_progress but not actively running */}
            {isStopped && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-1 rounded bg-[var(--status-warning-bg)]">
                      <Pause className="w-3 h-3 text-[var(--status-warning)]" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    <p>Task paused - click menu to resume</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0 rounded-md',
                    'bg-background/60 hover:bg-background',
                    'border border-border/50 hover:border-border',
                    'shadow-sm',
                    'transition-all duration-150'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-4 h-4 text-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  className="text-xs cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onViewLogs?.();
                  }}
                >
                  <Terminal className="w-3 h-3 mr-2" />
                  View Agent Logs
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onViewDetails?.();
                  }}
                >
                  <Eye className="w-3 h-3 mr-2" />
                  View Details
                </DropdownMenuItem>
                {data.status === 'backlog' && !data.isBlocked && (
                  <DropdownMenuItem
                    className="text-xs cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onStartTask?.();
                    }}
                  >
                    <Play className="w-3 h-3 mr-2" />
                    Start Task
                  </DropdownMenuItem>
                )}
                {data.isRunning && (
                  <DropdownMenuItem
                    className="text-xs text-[var(--status-error)] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onStopTask?.();
                    }}
                  >
                    <Pause className="w-3 h-3 mr-2" />
                    Stop Task
                  </DropdownMenuItem>
                )}
                {isStopped && (
                  <DropdownMenuItem
                    className="text-xs text-[var(--status-success)] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onResumeTask?.();
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-2" />
                    Resume Task
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-xs cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onSpawnTask?.();
                  }}
                >
                  <GitFork className="w-3 h-3 mr-2" />
                  Spawn Sub-Task
                </DropdownMenuItem>
                {!data.isRunning && (
                  <DropdownMenuItem
                    className="text-xs text-[var(--status-error)] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onDeleteTask?.();
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-2" />
                    Delete Task
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 py-2">
          {/* Category */}
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            {data.category}
          </span>

          {/* Title */}
          {data.title && (
            <h3 className="text-sm font-medium mt-1 line-clamp-1 text-foreground">{data.title}</h3>
          )}

          {/* Description */}
          <p
            className={cn(
              'text-xs text-muted-foreground line-clamp-2',
              data.title ? 'mt-1' : 'mt-1 font-medium text-foreground text-sm'
            )}
          >
            {data.description}
          </p>

          {/* Progress indicator for in-progress tasks */}
          {data.isRunning && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-[var(--status-in-progress)] rounded-full animate-progress-indeterminate" />
              </div>
              <span className="text-[10px] text-muted-foreground">Running...</span>
            </div>
          )}

          {/* Paused indicator for stopped tasks */}
          {isStopped && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-[var(--status-warning)] rounded-full" />
              </div>
              <span className="text-[10px] text-[var(--status-warning)] font-medium">Paused</span>
            </div>
          )}

          {/* Branch name if assigned */}
          {data.branchName && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              <span className="truncate">{data.branchName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Source handle (right side - provides to dependents) */}
      <Handle
        id="source"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className={cn(
          'w-3 h-3 !bg-border border-2 border-background',
          'transition-colors duration-200',
          'hover:!bg-brand-500',
          data.status === 'completed' || data.status === 'verified'
            ? '!bg-[var(--status-success)]'
            : '',
          isDimmed && 'opacity-30'
        )}
      />
    </>
  );
});
