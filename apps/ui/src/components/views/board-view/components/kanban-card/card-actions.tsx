import { Feature } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Edit,
  PlayCircle,
  RotateCcw,
  StopCircle,
  CheckCircle2,
  FileText,
  Eye,
  Wand2,
  Archive,
  GitMerge,
} from 'lucide-react';

interface CardActionsProps {
  feature: Feature;
  isCurrentAutoTask: boolean;
  hasContext?: boolean;
  hasWorktree?: boolean;
  shortcutKey?: string;
  onEdit: () => void;
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
  onStageChanges?: () => void;
}

export function CardActions({
  feature,
  isCurrentAutoTask,
  hasContext,
  hasWorktree,
  shortcutKey,
  onEdit,
  onViewOutput,
  onVerify,
  onResume,
  onForceStop,
  onManualVerify,
  onFollowUp,
  onImplement,
  onComplete,
  onViewPlan,
  onApprovePlan,
  onStageChanges,
}: CardActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 -mx-3 -mb-3 px-3 pb-3">
      {isCurrentAutoTask && (
        <>
          {/* Approve Plan button - PRIORITY: shows even when agent is "running" (paused for approval) */}
          {feature.planSpec?.status === 'generated' && onApprovePlan && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 min-w-0 h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white animate-pulse"
              onClick={(e) => {
                e.stopPropagation();
                onApprovePlan();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`approve-plan-running-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Approve Plan</span>
            </Button>
          )}
          {onViewOutput && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onViewOutput();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-output-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Logs</span>
              {shortcutKey && (
                <span
                  className="ml-1.5 px-1 py-0.5 text-[9px] font-mono rounded bg-foreground/10"
                  data-testid={`shortcut-key-${feature.id}`}
                >
                  {shortcutKey}
                </span>
              )}
            </Button>
          )}
          {onForceStop && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-[11px] px-2 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onForceStop();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`force-stop-${feature.id}`}
            >
              <StopCircle className="w-3 h-3" />
            </Button>
          )}
        </>
      )}
      {!isCurrentAutoTask && feature.status === 'in_progress' && (
        <>
          {/* Approve Plan button - shows when plan is generated and waiting for approval */}
          {feature.planSpec?.status === 'generated' && onApprovePlan && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white animate-pulse"
              onClick={(e) => {
                e.stopPropagation();
                onApprovePlan();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`approve-plan-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1" />
              Approve Plan
            </Button>
          )}
          {feature.skipTests && onManualVerify ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onManualVerify();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`manual-verify-${feature.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Verify
            </Button>
          ) : hasContext && onResume ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90"
              onClick={(e) => {
                e.stopPropagation();
                onResume();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`resume-feature-${feature.id}`}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Resume
            </Button>
          ) : onVerify ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90"
              onClick={(e) => {
                e.stopPropagation();
                onVerify();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`verify-feature-${feature.id}`}
            >
              <PlayCircle className="w-3 h-3 mr-1" />
              Resume
            </Button>
          ) : null}
          {onViewOutput && !feature.skipTests && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={(e) => {
                e.stopPropagation();
                onViewOutput();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-output-inprogress-${feature.id}`}
            >
              <FileText className="w-3 h-3" />
            </Button>
          )}
        </>
      )}
      {!isCurrentAutoTask && feature.status === 'verified' && (
        <>
          {/* Logs button */}
          {onViewOutput && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-xs min-w-0"
              onClick={(e) => {
                e.stopPropagation();
                onViewOutput();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-output-verified-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Logs</span>
            </Button>
          )}
          {/* Complete button */}
          {onComplete && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-xs min-w-0 bg-brand-500 hover:bg-brand-600"
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`complete-${feature.id}`}
            >
              <Archive className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Complete</span>
            </Button>
          )}
        </>
      )}
      {!isCurrentAutoTask && feature.status === 'waiting_approval' && (
        <>
          {/* Refine prompt button */}
          {onFollowUp && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-[11px] min-w-0"
              onClick={(e) => {
                e.stopPropagation();
                onFollowUp();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`follow-up-${feature.id}`}
            >
              <Wand2 className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Refine</span>
            </Button>
          )}
          {/* Stage Changes button - show for features with worktrees */}
          {hasWorktree && onStageChanges && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[11px] min-w-0 border-purple-500/50 hover:bg-purple-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onStageChanges();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`stage-changes-${feature.id}`}
            >
              <GitMerge className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Stage Changes</span>
            </Button>
          )}
          {/* Show Verify button if PR was created (changes are committed), otherwise show Mark as Verified button */}
          {feature.prUrl && onManualVerify ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onManualVerify();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`verify-${feature.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Verify
            </Button>
          ) : onManualVerify ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onManualVerify();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`mark-as-verified-${feature.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Mark as Verified
            </Button>
          ) : null}
        </>
      )}
      {!isCurrentAutoTask && feature.status === 'backlog' && (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`edit-backlog-${feature.id}`}
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          {feature.planSpec?.content && onViewPlan && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={(e) => {
                e.stopPropagation();
                onViewPlan();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-plan-${feature.id}`}
              title="View Plan"
            >
              <Eye className="w-3 h-3" />
            </Button>
          )}
          {onImplement && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onImplement();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`make-${feature.id}`}
            >
              <PlayCircle className="w-3 h-3 mr-1" />
              Make
            </Button>
          )}
        </>
      )}
    </div>
  );
}
