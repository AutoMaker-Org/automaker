"use client";

import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { safeJoin } from "@/lib/path-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  hasContext?: boolean;
  isCurrentAutoTask?: boolean;
  shortcutKey?: string;
  /** Context content for extracting progress info */
  contextContent?: string;
  /** Feature summary from agent completion */
  summary?: string;
}

export function KanbanCard({
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
  hasContext,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
}: KanbanCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentTaskInfo | null>(null);
  const { kanbanCardDetailLevel } = useAppStore();

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
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentProject = (window as any).__currentProject;
        if (!currentProject?.path) return;

        const contextPath = safeJoin(currentProject.path, '.automaker', 'agents-context', `${feature.id}.md`);
        const result = await api.readFile(contextPath);

        if (result.success && result.content) {
          const info = parseAgentContext(result.content);
          setAgentInfo(info);
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
  // - Non-skipTests (TDD) items in progress or verified cannot be dragged
  const isDraggable =
    feature.status === "backlog" || (feature.skipTests && !isCurrentAutoTask);
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
        "cursor-grab active:cursor-grabbing transition-all backdrop-blur-sm border-border relative",
        isDragging && "opacity-50 scale-105 shadow-lg",
        isCurrentAutoTask &&
          "border-running-indicator border-2 shadow-running-indicator/50 shadow-lg animate-pulse",
        feature.error &&
          !isCurrentAutoTask &&
          "border-red-500 border-2 shadow-red-500/30 shadow-lg"
      )}
      data-testid={`kanban-card-${feature.id}`}
      {...attributes}
    >
      {/* Shortcut key badge for in-progress cards */}
      {shortcutKey && (
        <div
          className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted border border-border text-muted-foreground z-10"
          data-testid={`shortcut-key-${feature.id}`}
        >
          {shortcutKey}
        </div>
      )}
      {/* Skip Tests indicator badge */}
      {feature.skipTests && !feature.error && (
        <div
          className={cn(
            "absolute px-1.5 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 z-10",
            shortcutKey ? "top-2 left-10" : "top-2 left-2",
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
            shortcutKey ? "top-2 left-10" : "top-2 left-2",
            "bg-red-500/20 border border-red-500/50 text-red-400"
          )}
          data-testid={`error-badge-${feature.id}`}
          title={feature.error}
        >
          <AlertCircle className="w-3 h-3" />
          <span>Errored</span>
        </div>
      )}
      <CardHeader className="p-3 pb-2">
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
                {onViewOutput && (
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
              {...listeners}
              className="mt-0.5 touch-none cursor-grab"
              data-testid={`drag-handle-${feature.id}`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm leading-tight">
              {feature.description}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
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
                <span className="truncate">{step}</span>
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
          <div className="mb-3 space-y-2">
            {/* Model & Phase */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 text-cyan-400">
                <Cpu className="w-3 h-3" />
                <span className="font-medium">
                  {formatModelName(DEFAULT_MODEL)}
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
                        <Circle className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate",
                          todo.status === "completed" &&
                            "text-zinc-500 line-through",
                          todo.status === "in_progress" && "text-amber-400",
                          todo.status === "pending" && "text-zinc-400"
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
                  <div className="space-y-1 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10px] text-green-400">
                        <Sparkles className="w-3 h-3" />
                        <span>Summary</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSummaryDialogOpen(true);
                        }}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors text-zinc-500 hover:text-zinc-300"
                        title="View full summary"
                        data-testid={`expand-summary-${feature.id}`}
                      >
                        <Expand className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 line-clamp-3">
                      {feature.summary || summary || agentInfo.summary}
                    </p>
                  </div>
                )}
                {/* Show tool count even without summary */}
                {!feature.summary &&
                  !summary &&
                  !agentInfo.summary &&
                  agentInfo.toolCallCount > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-white/5">
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
                  data-testid={`view-output-${feature.id}`}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Logs
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
              {/* Follow-up prompt button */}
              {onFollowUp && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFollowUp();
                  }}
                  data-testid={`follow-up-${feature.id}`}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Follow-up
                </Button>
              )}
              {/* Commit and verify button */}
              {onCommit && (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommit();
                  }}
                  data-testid={`commit-${feature.id}`}
                >
                  <GitCommit className="w-3 h-3 mr-1" />
                  Commit
                </Button>
              )}
            </>
          )}
          {!isCurrentAutoTask && feature.status === "backlog" && (
            <>
              {onViewOutput && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput();
                  }}
                  data-testid={`view-logs-backlog-${feature.id}`}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Logs
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
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleCancelDelete}
              data-testid="cancel-delete-button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="confirm-delete-button"
            >
              Delete
            </Button>
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
          <div className="flex-1 overflow-y-auto p-4 bg-zinc-900/50 rounded-lg border border-white/10">
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
    </Card>
  );
}
