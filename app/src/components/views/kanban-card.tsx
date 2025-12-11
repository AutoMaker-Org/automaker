"use client";

import { useState, useEffect, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Feature, useAppStore } from "@/store/app-store";
import {
  GripVertical,
  Edit,
  CheckCircle2,
  Circle,
  Loader2,
  Trash2,
  Eye,
  PlayCircle,
  RotateCcw,
  StopCircle,
  Hand,
  MessageSquare,
  GitCommit,
  Cpu,
  Wrench,
  ListTodo,
  Sparkles,
  Expand,
  FileText,
  MoreVertical,
  AlertCircle,
  GitBranch,
  Undo2,
  GitMerge,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import { CountUpTimer } from "@/components/ui/count-up-timer";
import { getElectronAPI } from "@/lib/electron";
import {
  parseAgentContext,
  AgentTaskInfo,
  formatModelName,
  DEFAULT_MODEL,
} from "@/lib/agent-context-parser";
import { Markdown } from "@/components/ui/markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KanbanCardProps {
  feature: Feature;
  onEdit: () => void;
  onDelete: () => void;
  onViewOutput?: () => void;
  onVerify?: () => void;
  onResume?: () => void;
  onForceStop?: () => void;
  onManualVerify?: () => void;
  onMoveBackToInProgress?: () => void;
  onFollowUp?: () => void;
  onCommit?: () => void;
  onRevert?: () => void;
  onMerge?: () => void;
  onCodeReview?: () => void;
  hasContext?: boolean;
  isCurrentAutoTask?: boolean;
  shortcutKey?: string;
  /** Context content for extracting progress info */
  contextContent?: string;
  /** Feature summary from agent completion */
  summary?: string;
}

export const KanbanCard = memo(function KanbanCard({
  feature,
  onEdit,
  onDelete,
  onViewOutput,
  onVerify,
  onResume,
  onForceStop,
  onManualVerify,
  onMoveBackToInProgress,
  onFollowUp,
  onCommit,
  onRevert,
  onMerge,
  onCodeReview,
  hasContext,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
}: KanbanCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentTaskInfo | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const { kanbanCardDetailLevel } = useAppStore();

  // Check if feature has worktree
  const hasWorktree = !!feature.branchName;

  // Helper functions to check what should be shown based on detail level
  const showSteps =
    kanbanCardDetailLevel === "standard" ||
    kanbanCardDetailLevel === "detailed";
  const showAgentInfo = kanbanCardDetailLevel === "detailed";

  // Load context file for in_progress, waiting_approval, and verified features
  useEffect(() => {
    const loadContext = async () => {
      // Use provided context or load from file
      if (contextContent) {
        const info = parseAgentContext(contextContent);
        setAgentInfo(info);
        return;
      }

      // Only load for non-backlog features
      if (feature.status === "backlog") {
        setAgentInfo(null);
        return;
      }

      try {
        const api = getElectronAPI();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentProject = (window as any).__currentProject;
        if (!currentProject?.path) return;

        // Use features API to get agent output
        if (api.features) {
          const result = await api.features.getAgentOutput(
            currentProject.path,
            feature.id
          );

          if (result.success && result.content) {
            const info = parseAgentContext(result.content);
            setAgentInfo(info);
          }
        } else {
          // Fallback to direct file read for backward compatibility
          const contextPath = `${currentProject.path}/.automaker/features/${feature.id}/agent-output.md`;
        const result = await api.readFile(contextPath);

        if (result.success && result.content) {
          const info = parseAgentContext(result.content);
          setAgentInfo(info);
          }
        }
      } catch {
        // Context file might not exist
        console.debug("[KanbanCard] No context file for feature:", feature.id);
      }
    };

    loadContext();

    // Reload context periodically while feature is running
    if (isCurrentAutoTask) {
      const interval = setInterval(loadContext, 3000);
      return () => clearInterval(interval);
    }
  }, [feature.id, feature.status, contextContent, isCurrentAutoTask]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    setIsDeleteDialogOpen(false);
    onDelete();
  };

  const handleCancelDelete = () => {
    setIsDeleteDialogOpen(false);
  };

  // Dragging logic:
  // - Backlog items can always be dragged
  // - skipTests items can be dragged even when in_progress or verified (unless currently running)
  // - waiting_approval items can always be dragged (to allow manual verification via drag)
  // - Non-skipTests (TDD) items in progress or verified cannot be dragged
  const isDraggable =
    feature.status === "backlog" ||
    feature.status === "waiting_approval" ||
    (feature.skipTests && !isCurrentAutoTask);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: feature.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all backdrop-blur-sm border-border relative kanban-card-content select-none",
        isDragging && "opacity-50 scale-105 shadow-lg",
        isCurrentAutoTask &&
          "border-running-indicator border-2 shadow-running-indicator/50 shadow-lg animate-pulse",
        feature.error &&
          !isCurrentAutoTask &&
          "border-red-500 border-2 shadow-red-500/30 shadow-lg",
        !isDraggable && "cursor-default"
      )}
      data-testid={`kanban-card-${feature.id}`}
      onDoubleClick={onEdit}
      {...attributes}
      {...(isDraggable ? listeners : {})}
    >
      {/* Skip Tests indicator badge */}
      {feature.skipTests && !feature.error && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            "top-2 left-2",
            "bg-orange-500/20 border border-orange-500/50 text-orange-400"
          )}
          data-testid={`skip-tests-badge-${feature.id}`}
          title="Manual verification required"
        >
          <Hand className="w-3 h-3" />
          <span>Manual</span>
        </div>
      )}
      {/* Error indicator badge */}
      {feature.error && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            "top-2 left-2",
            "bg-red-500/20 border border-red-500/50 text-red-400"
          )}
          data-testid={`error-badge-${feature.id}`}
          title={feature.error}
        >
          <AlertCircle className="w-3 h-3" />
          <span>Errored</span>
        </div>
      )}
      {/* Branch badge - show when feature has a worktree */}
      {hasWorktree && !isCurrentAutoTask && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10 cursor-default",
                  "bg-purple-500/20 border border-purple-500/50 text-purple-400",
                  // Position below error badge if present, otherwise use normal position
                  feature.error || feature.skipTests
                    ? "top-8 left-2"
                    : "top-2 left-2"
                )}
                data-testid={`branch-badge-${feature.id}`}
              >
                <GitBranch className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[80px]">{feature.branchName?.replace("feature/", "")}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[300px]">
              <p className="font-mono text-xs break-all">{feature.branchName}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {/* Review Status Badge - show when review has passed or failed */}
      {feature.reviewStatus === "passed" && !isCurrentAutoTask && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            "top-2 right-10",
            "bg-green-500/20 border border-green-500/50 text-green-400"
          )}
          data-testid={`review-passed-badge-${feature.id}`}
          title="Code review passed"
        >
          <Shield className="w-3 h-3" />
          <span>Reviewed</span>
        </div>
      )}
      {feature.reviewStatus === "failed" && !isCurrentAutoTask && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            "top-2 right-10",
            "bg-red-500/20 border border-red-500/50 text-red-400"
          )}
          data-testid={`review-failed-badge-${feature.id}`}
          title="Code review failed - click to view issues"
        >
          <AlertCircle className="w-3 h-3" />
          <span>Issues</span>
        </div>
      )}
      {feature.reviewStatus === "in_progress" && !isCurrentAutoTask && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            "top-2 right-10",
            "bg-blue-500/20 border border-blue-500/50 text-blue-400"
          )}
          data-testid={`review-inprogress-badge-${feature.id}`}
          title="Code review in progress"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Reviewing</span>
        </div>
      )}
      <CardHeader
        className={cn(
          "p-3 pb-2 block", // Reset grid layout to block for custom kanban card layout
          // Add extra top padding when badges are present to prevent text overlap
          (feature.skipTests || feature.error) && "pt-10",
          // Add even more top padding when both badges and branch are shown
          hasWorktree && (feature.skipTests || feature.error) && "pt-14"
        )}
      >
        {isCurrentAutoTask && (
          <div className="absolute top-2 right-2 flex items-center justify-center gap-2 bg-running-indicator/20 border border-running-indicator rounded px-2 py-0.5">
            <Loader2 className="w-4 h-4 text-running-indicator animate-spin" />
            {feature.startedAt && (
              <CountUpTimer
                startedAt={feature.startedAt}
                className="text-running-indicator"
              />
            )}
          </div>
        )}
        {!isCurrentAutoTask && (
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-white/10"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`menu-${feature.id}`}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  data-testid={`edit-feature-${feature.id}`}
                >
                  <Edit className="w-3 h-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                {onViewOutput && feature.status !== "backlog" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewOutput();
                    }}
                    data-testid={`view-logs-${feature.id}`}
                  >
                    <FileText className="w-3 h-3 mr-2" />
                    Logs
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(e as unknown as React.MouseEvent);
                  }}
                  data-testid={`delete-feature-${feature.id}`}
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="flex items-start gap-2">
          {isDraggable && (
            <div
              className="-ml-2 -mt-1 p-2 touch-none"
              data-testid={`drag-handle-${feature.id}`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle
              className={cn(
                "text-sm leading-tight break-words hyphens-auto overflow-hidden",
                !isDescriptionExpanded && "line-clamp-3"
              )}
            >
              {feature.description}
            </CardTitle>
            {/* Show More/Less toggle - only show when description is likely truncated */}
            {feature.description.length > 100 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDescriptionExpanded(!isDescriptionExpanded);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
                data-testid={`toggle-description-${feature.id}`}
              >
                {isDescriptionExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    <span>Show Less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>Show More</span>
                  </>
                )}
              </button>
            )}
            <CardDescription className="text-xs mt-1 truncate">
              {feature.category}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {/* Steps Preview - Show in Standard and Detailed modes */}
        {showSteps && feature.steps.length > 0 && (
          <div className="mb-3 space-y-1">
            {feature.steps.slice(0, 3).map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                {feature.status === "verified" ? (
                  <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-3 h-3 mt-0.5 shrink-0" />
                )}
                <span className="break-words hyphens-auto line-clamp-2 leading-relaxed">{step}</span>
              </div>
            ))}
            {feature.steps.length > 3 && (
              <p className="text-xs text-muted-foreground pl-5">
                +{feature.steps.length - 3} more steps
              </p>
            )}
          </div>
        )}

        {/* Agent Info Panel - shows for in_progress, waiting_approval, verified */}
        {/* Detailed mode: Show all agent info */}
        {showAgentInfo && feature.status !== "backlog" && agentInfo && (
          <div className="mb-3 space-y-2 overflow-hidden">
            {/* Model & Phase */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1 text-cyan-400">
                <Cpu className="w-3 h-3" />
                <span className="font-medium">
                  {formatModelName(feature.model ?? DEFAULT_MODEL)}
                </span>
              </div>
              {agentInfo.currentPhase && (
                <div
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    agentInfo.currentPhase === "planning" &&
                      "bg-blue-500/20 text-blue-400",
                    agentInfo.currentPhase === "action" &&
                      "bg-amber-500/20 text-amber-400",
                    agentInfo.currentPhase === "verification" &&
                      "bg-green-500/20 text-green-400"
                  )}
                >
                  {agentInfo.currentPhase}
                </div>
              )}
            </div>

            {/* Task List Progress (if todos found) */}
            {agentInfo.todos.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ListTodo className="w-3 h-3" />
                  <span>
                    {
                      agentInfo.todos.filter((t) => t.status === "completed")
                        .length
                    }
                    /{agentInfo.todos.length} tasks
                  </span>
                </div>
                <div className="space-y-0.5 max-h-16 overflow-y-auto">
                  {agentInfo.todos.slice(0, 3).map((todo, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 text-[10px]"
                    >
                      {todo.status === "completed" ? (
                        <CheckCircle2 className="w-2.5 h-2.5 text-green-500 shrink-0" />
                      ) : todo.status === "in_progress" ? (
                        <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin shrink-0" />
                      ) : (
                        <Circle className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={cn(
                          "break-words hyphens-auto line-clamp-2 leading-relaxed",
                          todo.status === "completed" &&
                            "text-muted-foreground line-through",
                          todo.status === "in_progress" && "text-amber-400",
                          todo.status === "pending" && "text-foreground-secondary"
                        )}
                      >
                        {todo.content}
                      </span>
                    </div>
                  ))}
                  {agentInfo.todos.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-4">
                      +{agentInfo.todos.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Summary for waiting_approval and verified - prioritize feature.summary from UpdateFeatureStatus */}
            {(feature.status === "waiting_approval" ||
              feature.status === "verified") && (
              <>
                {(feature.summary || summary || agentInfo.summary) && (
                  <div className="space-y-1 pt-1 border-t border-border-glass overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[10px] text-green-400 min-w-0">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span className="truncate">Summary</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSummaryDialogOpen(true);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
                        title="View full summary"
                        data-testid={`expand-summary-${feature.id}`}
                      >
                        <Expand className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-foreground-secondary line-clamp-3 break-words hyphens-auto leading-relaxed overflow-hidden">
                      {feature.summary || summary || agentInfo.summary}
                    </p>
                  </div>
                )}
                {/* Show tool count even without summary */}
                {!feature.summary &&
                  !summary &&
                  !agentInfo.summary &&
                  agentInfo.toolCallCount > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border-glass">
                      <span className="flex items-center gap-1">
                        <Wrench className="w-2.5 h-2.5" />
                        {agentInfo.toolCallCount} tool calls
                      </span>
                      {agentInfo.todos.length > 0 && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                          {
                            agentInfo.todos.filter(
                              (t) => t.status === "completed"
                            ).length
                          }{" "}
                          tasks done
                        </span>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isCurrentAutoTask && (
            <>
              {onViewOutput && (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-action-view hover:bg-action-view-hover"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`view-output-${feature.id}`}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Logs
                  {shortcutKey && (
                    <span
                      className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-primary-foreground/10 border border-primary-foreground/20"
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
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onForceStop();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`force-stop-${feature.id}`}
                >
                  <StopCircle className="w-3 h-3 mr-1" />
                  Stop
                </Button>
              )}
            </>
          )}
          {!isCurrentAutoTask && feature.status === "in_progress" && (
            <>
              {/* skipTests features show manual verify button */}
              {feature.skipTests && onManualVerify ? (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-primary hover:bg-primary/90"
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
                  className="flex-1 h-7 text-xs bg-action-verify hover:bg-action-verify-hover"
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
                  className="flex-1 h-7 text-xs bg-action-verify hover:bg-action-verify-hover"
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
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`view-output-inprogress-${feature.id}`}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Logs
                </Button>
              )}
            </>
          )}
          {!isCurrentAutoTask && feature.status === "verified" && (
            <>
              {/* Logs button if context exists */}
              {hasContext && onViewOutput && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`view-output-verified-${feature.id}`}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Logs
                </Button>
              )}
            </>
          )}
          {!isCurrentAutoTask && feature.status === "waiting_approval" && (
            <>
              {/* Revert button - only show when worktree exists (icon only to save space) */}
              {hasWorktree && onRevert && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRevertDialogOpen(true);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        data-testid={`revert-${feature.id}`}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Revert changes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Code Review button */}
              {onCodeReview && (
                <Button
                  variant={feature.reviewStatus === "failed" ? "destructive" : "secondary"}
                  size="sm"
                  className="h-7 text-xs min-w-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCodeReview();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`code-review-${feature.id}`}
                  disabled={feature.reviewStatus === "in_progress"}
                >
                  {feature.reviewStatus === "in_progress" ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      <span className="truncate">Reviewing...</span>
                    </>
                  ) : feature.reviewStatus === "passed" ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                      <span className="truncate">Passed</span>
                    </>
                  ) : feature.reviewStatus === "failed" ? (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      <span className="truncate">Issues</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3 mr-1" />
                      <span className="truncate">Review</span>
                    </>
                  )}
                </Button>
              )}
              {/* Follow-up prompt button */}
              {onFollowUp && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 h-7 text-xs min-w-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFollowUp();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`follow-up-${feature.id}`}
                >
                  <MessageSquare className="w-3 h-3 mr-1 shrink-0" />
                  <span className="truncate">Follow-up</span>
                </Button>
              )}
              {/* Merge button - only show when worktree exists */}
              {hasWorktree && onMerge && (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-purple-600 hover:bg-purple-700 min-w-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMerge();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`merge-${feature.id}`}
                  title="Merge changes into main branch"
                >
                  <GitMerge className="w-3 h-3 mr-1 shrink-0" />
                  <span className="truncate">Merge</span>
                </Button>
              )}
              {/* Commit and verify button - show when no worktree */}
              {!hasWorktree && onCommit && (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommit();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`commit-${feature.id}`}
                >
                  <GitCommit className="w-3 h-3 mr-1" />
                  Commit
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="delete-confirmation-dialog">
          <DialogHeader>
            <DialogTitle>Delete Feature</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this feature? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              variant="ghost"
              onClick={handleCancelDelete}
              data-testid="cancel-delete-button"
            >
              Cancel
            </Button>
            <HotkeyButton
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="confirm-delete-button"
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={isDeleteDialogOpen}
            >
              Delete
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary Modal */}
      <Dialog open={isSummaryDialogOpen} onOpenChange={setIsSummaryDialogOpen}>
        <DialogContent
          className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
          data-testid={`summary-dialog-${feature.id}`}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-400" />
              Implementation Summary
            </DialogTitle>
            <DialogDescription className="text-sm" title={feature.description}>
              {feature.description.length > 100
                ? `${feature.description.slice(0, 100)}...`
                : feature.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 bg-card rounded-lg border border-border">
            <Markdown>
              {feature.summary ||
                summary ||
                agentInfo?.summary ||
                "No summary available"}
            </Markdown>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsSummaryDialogOpen(false)}
              data-testid="close-summary-button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Confirmation Dialog */}
      <Dialog open={isRevertDialogOpen} onOpenChange={setIsRevertDialogOpen}>
        <DialogContent data-testid="revert-confirmation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Undo2 className="w-5 h-5" />
              Revert Changes
            </DialogTitle>
            <DialogDescription>
              This will discard all changes made by the agent and move the feature back to the backlog.
              {feature.branchName && (
                <span className="block mt-2 font-medium">
                  Branch <code className="bg-muted px-1 py-0.5 rounded">{feature.branchName}</code> will be deleted.
                </span>
              )}
              <span className="block mt-2 text-red-400 font-medium">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsRevertDialogOpen(false)}
              data-testid="cancel-revert-button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setIsRevertDialogOpen(false);
                onRevert?.();
              }}
              data-testid="confirm-revert-button"
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Revert Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
});
