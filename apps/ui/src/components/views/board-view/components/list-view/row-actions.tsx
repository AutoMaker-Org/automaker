import { memo, useCallback, useState } from 'react';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  PlayCircle,
  RotateCcw,
  StopCircle,
  CheckCircle2,
  FileText,
  Eye,
  Wand2,
  Archive,
  GitBranch,
  GitFork,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Feature } from '@/store/app-store';

/**
 * Action handler types for row actions
 */
export interface RowActionHandlers {
  onEdit: () => void;
  onDelete: () => void;
  onViewOutput?: () => void;
  onVerify?: () => void;
  onResume?: () => void;
  onForceStop?: () => void;
  onManualVerify?: () => void;
  onFollowUp?: () => void;
  onImplement?: () => void;
  onComplete?: () => void;
  onViewPlan?: () => void;
  onApprovePlan?: () => void;
  onSpawnTask?: () => void;
  onDuplicate?: () => void;
  onDuplicateAsChild?: () => void;
}

export interface RowActionsProps {
  /** The feature for this row */
  feature: Feature;
  /** Action handlers */
  handlers: RowActionHandlers;
  /** Whether this feature is the current auto task (agent is running) */
  isCurrentAutoTask?: boolean;
  /** Whether the dropdown menu is open */
  isOpen?: boolean;
  /** Callback when the dropdown open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Additional className for custom styling */
  className?: string;
}

/**
 * MenuItem is a helper component for dropdown menu items with consistent styling
 */
const MenuItem = memo(function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'primary' | 'success' | 'warning';
  disabled?: boolean;
}) {
  const variantClasses = {
    default: '',
    destructive: 'text-destructive focus:text-destructive focus:bg-destructive/10',
    primary: 'text-primary focus:text-primary focus:bg-primary/10',
    success:
      'text-[var(--status-success)] focus:text-[var(--status-success)] focus:bg-[var(--status-success)]/10',
    warning:
      'text-[var(--status-waiting)] focus:text-[var(--status-waiting)] focus:bg-[var(--status-waiting)]/10',
  };

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn('gap-2', variantClasses[variant])}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
});

/**
 * Get the primary action for quick access button based on feature status
 */
function getPrimaryAction(
  feature: Feature,
  handlers: RowActionHandlers,
  isCurrentAutoTask: boolean
): {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'primary' | 'success' | 'warning';
} | null {
  // Running task - force stop is primary
  if (isCurrentAutoTask) {
    if (handlers.onForceStop) {
      return {
        icon: StopCircle,
        label: 'Stop',
        onClick: handlers.onForceStop,
        variant: 'destructive',
      };
    }
    return null;
  }

  // Backlog - implement is primary
  if (feature.status === 'backlog' && handlers.onImplement) {
    return {
      icon: PlayCircle,
      label: 'Make',
      onClick: handlers.onImplement,
      variant: 'primary',
    };
  }

  // In progress with plan approval pending
  if (
    feature.status === 'in_progress' &&
    feature.planSpec?.status === 'generated' &&
    handlers.onApprovePlan
  ) {
    return {
      icon: FileText,
      label: 'Approve',
      onClick: handlers.onApprovePlan,
      variant: 'warning',
    };
  }

  // In progress - resume is primary
  if (feature.status === 'in_progress' && handlers.onResume) {
    return {
      icon: RotateCcw,
      label: 'Resume',
      onClick: handlers.onResume,
      variant: 'success',
    };
  }

  // Waiting approval - verify is primary
  if (feature.status === 'waiting_approval' && handlers.onManualVerify) {
    return {
      icon: CheckCircle2,
      label: 'Verify',
      onClick: handlers.onManualVerify,
      variant: 'success',
    };
  }

  // Verified - complete is primary
  if (feature.status === 'verified' && handlers.onComplete) {
    return {
      icon: Archive,
      label: 'Complete',
      onClick: handlers.onComplete,
      variant: 'primary',
    };
  }

  return null;
}

/**
 * Get secondary actions for inline display based on feature status
 */
function getSecondaryActions(
  feature: Feature,
  handlers: RowActionHandlers
): Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}> {
  const actions = [];

  // Refine action for waiting_approval status
  if (feature.status === 'waiting_approval' && handlers.onFollowUp) {
    actions.push({
      icon: Wand2,
      label: 'Refine',
      onClick: handlers.onFollowUp,
    });
  }

  return actions;
}

/**
 * RowActions provides an inline action menu for list view rows.
 *
 * Features:
 * - Quick access button for primary action (Make, Resume, Verify, etc.)
 * - Dropdown menu with all available actions
 * - Context-aware actions based on feature status
 * - Support for running task actions (view logs, force stop)
 * - Keyboard accessible (focus, Enter/Space to open)
 *
 * Actions by status:
 * - Backlog: Edit, Delete, Make (implement), View Plan, Spawn Sub-Task
 * - In Progress: View Logs, Resume, Approve Plan, Manual Verify, Edit, Spawn Sub-Task, Delete
 * - Waiting Approval: Refine (inline secondary), Verify, View Logs, View PR, Edit, Spawn Sub-Task, Delete
 * - Verified: View Logs, View PR, View Branch, Complete, Edit, Spawn Sub-Task, Delete
 * - Running (auto task): View Logs, Approve Plan, Edit, Spawn Sub-Task, Force Stop
 * - Pipeline statuses: View Logs, Edit, Spawn Sub-Task, Delete
 *
 * @example
 * ```tsx
 * <RowActions
 *   feature={feature}
 *   handlers={{
 *     onEdit: () => handleEdit(feature.id),
 *     onDelete: () => handleDelete(feature.id),
 *     onImplement: () => handleImplement(feature.id),
 *     // ... other handlers
 *   }}
 * />
 * ```
 */
export const RowActions = memo(function RowActions({
  feature,
  handlers,
  isCurrentAutoTask = false,
  isOpen,
  onOpenChange,
  className,
}: RowActionsProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or uncontrolled state
  const open = isOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
    },
    [setOpen]
  );

  const primaryAction = getPrimaryAction(feature, handlers, isCurrentAutoTask);
  const secondaryActions = getSecondaryActions(feature, handlers);

  // Helper to close menu after action
  const withClose = useCallback(
    (handler: () => void) => () => {
      setOpen(false);
      handler();
    },
    [setOpen]
  );

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      onClick={(e) => e.stopPropagation()}
      data-testid={`row-actions-${feature.id}`}
    >
      {/* Primary action quick button */}
      {primaryAction && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            'h-7 w-7',
            primaryAction.variant === 'destructive' &&
              'hover:bg-destructive/10 hover:text-destructive',
            primaryAction.variant === 'primary' && 'hover:bg-primary/10 hover:text-primary',
            primaryAction.variant === 'success' &&
              'hover:bg-[var(--status-success)]/10 hover:text-[var(--status-success)]',
            primaryAction.variant === 'warning' &&
              'hover:bg-[var(--status-waiting)]/10 hover:text-[var(--status-waiting)]'
          )}
          onClick={(e) => {
            e.stopPropagation();
            primaryAction.onClick();
          }}
          title={primaryAction.label}
          data-testid={`row-action-primary-${feature.id}`}
        >
          <primaryAction.icon className="w-4 h-4" />
        </Button>
      )}

      {/* Secondary action buttons */}
      {secondaryActions.map((action, index) => (
        <Button
          key={`secondary-action-${index}`}
          variant="ghost"
          size="icon-sm"
          className={cn('h-7 w-7', 'text-muted-foreground', 'hover:bg-muted hover:text-foreground')}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          title={action.label}
          data-testid={`row-action-secondary-${feature.id}-${action.label.toLowerCase()}`}
        >
          <action.icon className="w-4 h-4" />
        </Button>
      ))}

      {/* Dropdown menu */}
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            data-testid={`row-actions-trigger-${feature.id}`}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="sr-only">Open actions menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Running task actions */}
          {isCurrentAutoTask && (
            <>
              {handlers.onViewOutput && (
                <MenuItem
                  icon={FileText}
                  label="View Logs"
                  onClick={withClose(handlers.onViewOutput)}
                />
              )}
              {feature.planSpec?.status === 'generated' && handlers.onApprovePlan && (
                <MenuItem
                  icon={FileText}
                  label="Approve Plan"
                  onClick={withClose(handlers.onApprovePlan)}
                  variant="warning"
                />
              )}
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onForceStop && (
                <>
                  <DropdownMenuSeparator />
                  <MenuItem
                    icon={StopCircle}
                    label="Force Stop"
                    onClick={withClose(handlers.onForceStop)}
                    variant="destructive"
                  />
                </>
              )}
            </>
          )}

          {/* Backlog actions */}
          {!isCurrentAutoTask && feature.status === 'backlog' && (
            <>
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {feature.planSpec?.content && handlers.onViewPlan && (
                <MenuItem icon={Eye} label="View Plan" onClick={withClose(handlers.onViewPlan)} />
              )}
              {handlers.onImplement && (
                <MenuItem
                  icon={PlayCircle}
                  label="Make"
                  onClick={withClose(handlers.onImplement)}
                  variant="primary"
                />
              )}
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onDuplicate && (
                <DropdownMenuSub>
                  <div className="flex items-center">
                    <DropdownMenuItem
                      onClick={withClose(handlers.onDuplicate)}
                      className="flex-1 pr-0 rounded-r-none"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    {handlers.onDuplicateAsChild && (
                      <DropdownMenuSubTrigger className="px-1 rounded-l-none border-l border-border/30 h-8" />
                    )}
                  </div>
                  {handlers.onDuplicateAsChild && (
                    <DropdownMenuSubContent>
                      <MenuItem
                        icon={GitFork}
                        label="Duplicate as Child"
                        onClick={withClose(handlers.onDuplicateAsChild)}
                      />
                    </DropdownMenuSubContent>
                  )}
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <MenuItem
                icon={Trash2}
                label="Delete"
                onClick={withClose(handlers.onDelete)}
                variant="destructive"
              />
            </>
          )}

          {/* In Progress actions */}
          {!isCurrentAutoTask && feature.status === 'in_progress' && (
            <>
              {handlers.onViewOutput && (
                <MenuItem
                  icon={FileText}
                  label="View Logs"
                  onClick={withClose(handlers.onViewOutput)}
                />
              )}
              {feature.planSpec?.status === 'generated' && handlers.onApprovePlan && (
                <MenuItem
                  icon={FileText}
                  label="Approve Plan"
                  onClick={withClose(handlers.onApprovePlan)}
                  variant="warning"
                />
              )}
              {feature.skipTests && handlers.onManualVerify ? (
                <MenuItem
                  icon={CheckCircle2}
                  label="Verify"
                  onClick={withClose(handlers.onManualVerify)}
                  variant="success"
                />
              ) : handlers.onResume ? (
                <MenuItem
                  icon={RotateCcw}
                  label="Resume"
                  onClick={withClose(handlers.onResume)}
                  variant="success"
                />
              ) : null}
              <DropdownMenuSeparator />
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onDuplicate && (
                <DropdownMenuSub>
                  <div className="flex items-center">
                    <DropdownMenuItem
                      onClick={withClose(handlers.onDuplicate)}
                      className="flex-1 pr-0 rounded-r-none"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    {handlers.onDuplicateAsChild && (
                      <DropdownMenuSubTrigger className="px-1 rounded-l-none border-l border-border/30 h-8" />
                    )}
                  </div>
                  {handlers.onDuplicateAsChild && (
                    <DropdownMenuSubContent>
                      <MenuItem
                        icon={GitFork}
                        label="Duplicate as Child"
                        onClick={withClose(handlers.onDuplicateAsChild)}
                      />
                    </DropdownMenuSubContent>
                  )}
                </DropdownMenuSub>
              )}
              <MenuItem
                icon={Trash2}
                label="Delete"
                onClick={withClose(handlers.onDelete)}
                variant="destructive"
              />
            </>
          )}

          {/* Waiting Approval actions */}
          {!isCurrentAutoTask && feature.status === 'waiting_approval' && (
            <>
              {handlers.onViewOutput && (
                <MenuItem
                  icon={FileText}
                  label="View Logs"
                  onClick={withClose(handlers.onViewOutput)}
                />
              )}
              {handlers.onFollowUp && (
                <MenuItem icon={Wand2} label="Refine" onClick={withClose(handlers.onFollowUp)} />
              )}
              {feature.prUrl && (
                <MenuItem
                  icon={ExternalLink}
                  label="View PR"
                  onClick={withClose(() => window.open(feature.prUrl, '_blank'))}
                />
              )}
              {handlers.onManualVerify && (
                <MenuItem
                  icon={CheckCircle2}
                  label={feature.prUrl ? 'Verify' : 'Mark as Verified'}
                  onClick={withClose(handlers.onManualVerify)}
                  variant="success"
                />
              )}
              <DropdownMenuSeparator />
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onDuplicate && (
                <DropdownMenuSub>
                  <div className="flex items-center">
                    <DropdownMenuItem
                      onClick={withClose(handlers.onDuplicate)}
                      className="flex-1 pr-0 rounded-r-none"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    {handlers.onDuplicateAsChild && (
                      <DropdownMenuSubTrigger className="px-1 rounded-l-none border-l border-border/30 h-8" />
                    )}
                  </div>
                  {handlers.onDuplicateAsChild && (
                    <DropdownMenuSubContent>
                      <MenuItem
                        icon={GitFork}
                        label="Duplicate as Child"
                        onClick={withClose(handlers.onDuplicateAsChild)}
                      />
                    </DropdownMenuSubContent>
                  )}
                </DropdownMenuSub>
              )}
              <MenuItem
                icon={Trash2}
                label="Delete"
                onClick={withClose(handlers.onDelete)}
                variant="destructive"
              />
            </>
          )}

          {/* Verified actions */}
          {!isCurrentAutoTask && feature.status === 'verified' && (
            <>
              {handlers.onViewOutput && (
                <MenuItem
                  icon={FileText}
                  label="View Logs"
                  onClick={withClose(handlers.onViewOutput)}
                />
              )}
              {feature.prUrl && (
                <MenuItem
                  icon={ExternalLink}
                  label="View PR"
                  onClick={withClose(() => window.open(feature.prUrl, '_blank'))}
                />
              )}
              {feature.worktree && (
                <MenuItem
                  icon={GitBranch}
                  label="View Branch"
                  onClick={withClose(() => {})}
                  disabled
                />
              )}
              {handlers.onComplete && (
                <MenuItem
                  icon={Archive}
                  label="Complete"
                  onClick={withClose(handlers.onComplete)}
                  variant="primary"
                />
              )}
              <DropdownMenuSeparator />
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onDuplicate && (
                <DropdownMenuSub>
                  <div className="flex items-center">
                    <DropdownMenuItem
                      onClick={withClose(handlers.onDuplicate)}
                      className="flex-1 pr-0 rounded-r-none"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    {handlers.onDuplicateAsChild && (
                      <DropdownMenuSubTrigger className="px-1 rounded-l-none border-l border-border/30 h-8" />
                    )}
                  </div>
                  {handlers.onDuplicateAsChild && (
                    <DropdownMenuSubContent>
                      <MenuItem
                        icon={GitFork}
                        label="Duplicate as Child"
                        onClick={withClose(handlers.onDuplicateAsChild)}
                      />
                    </DropdownMenuSubContent>
                  )}
                </DropdownMenuSub>
              )}
              <MenuItem
                icon={Trash2}
                label="Delete"
                onClick={withClose(handlers.onDelete)}
                variant="destructive"
              />
            </>
          )}

          {/* Pipeline status actions (generic fallback) */}
          {!isCurrentAutoTask && feature.status.startsWith('pipeline_') && (
            <>
              {handlers.onViewOutput && (
                <MenuItem
                  icon={FileText}
                  label="View Logs"
                  onClick={withClose(handlers.onViewOutput)}
                />
              )}
              <MenuItem icon={Edit} label="Edit" onClick={withClose(handlers.onEdit)} />
              {handlers.onSpawnTask && (
                <MenuItem
                  icon={GitFork}
                  label="Spawn Sub-Task"
                  onClick={withClose(handlers.onSpawnTask)}
                />
              )}
              {handlers.onDuplicate && (
                <DropdownMenuSub>
                  <div className="flex items-center">
                    <DropdownMenuItem
                      onClick={withClose(handlers.onDuplicate)}
                      className="flex-1 pr-0 rounded-r-none"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    {handlers.onDuplicateAsChild && (
                      <DropdownMenuSubTrigger className="px-1 rounded-l-none border-l border-border/30 h-8" />
                    )}
                  </div>
                  {handlers.onDuplicateAsChild && (
                    <DropdownMenuSubContent>
                      <MenuItem
                        icon={GitFork}
                        label="Duplicate as Child"
                        onClick={withClose(handlers.onDuplicateAsChild)}
                      />
                    </DropdownMenuSubContent>
                  )}
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <MenuItem
                icon={Trash2}
                label="Delete"
                onClick={withClose(handlers.onDelete)}
                variant="destructive"
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

/**
 * Helper function to create action handlers from common patterns
 */
export function createRowActionHandlers(
  featureId: string,
  actions: {
    editFeature?: (id: string) => void;
    deleteFeature?: (id: string) => void;
    viewOutput?: (id: string) => void;
    verifyFeature?: (id: string) => void;
    resumeFeature?: (id: string) => void;
    forceStop?: (id: string) => void;
    manualVerify?: (id: string) => void;
    followUp?: (id: string) => void;
    implement?: (id: string) => void;
    complete?: (id: string) => void;
    viewPlan?: (id: string) => void;
    approvePlan?: (id: string) => void;
    spawnTask?: (id: string) => void;
    duplicate?: (id: string) => void;
    duplicateAsChild?: (id: string) => void;
  }
): RowActionHandlers {
  return {
    onEdit: () => actions.editFeature?.(featureId),
    onDelete: () => actions.deleteFeature?.(featureId),
    onViewOutput: actions.viewOutput ? () => actions.viewOutput!(featureId) : undefined,
    onVerify: actions.verifyFeature ? () => actions.verifyFeature!(featureId) : undefined,
    onResume: actions.resumeFeature ? () => actions.resumeFeature!(featureId) : undefined,
    onForceStop: actions.forceStop ? () => actions.forceStop!(featureId) : undefined,
    onManualVerify: actions.manualVerify ? () => actions.manualVerify!(featureId) : undefined,
    onFollowUp: actions.followUp ? () => actions.followUp!(featureId) : undefined,
    onImplement: actions.implement ? () => actions.implement!(featureId) : undefined,
    onComplete: actions.complete ? () => actions.complete!(featureId) : undefined,
    onViewPlan: actions.viewPlan ? () => actions.viewPlan!(featureId) : undefined,
    onApprovePlan: actions.approvePlan ? () => actions.approvePlan!(featureId) : undefined,
    onSpawnTask: actions.spawnTask ? () => actions.spawnTask!(featureId) : undefined,
    onDuplicate: actions.duplicate ? () => actions.duplicate!(featureId) : undefined,
    onDuplicateAsChild: actions.duplicateAsChild
      ? () => actions.duplicateAsChild!(featureId)
      : undefined,
  };
}
