import { useState } from 'react';
import { Feature } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical,
  Edit,
  Loader2,
  Trash2,
  FileText,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Cpu,
  GitFork,
} from 'lucide-react';
import { CountUpTimer } from '@/components/ui/count-up-timer';
import { formatModelName, DEFAULT_MODEL } from '@/lib/agent-context-parser';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';

interface CardHeaderProps {
  feature: Feature;
  isDraggable: boolean;
  isCurrentAutoTask: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewOutput?: () => void;
  onSpawnTask?: () => void;
}

export function CardHeaderSection({
  feature,
  isDraggable,
  isCurrentAutoTask,
  onEdit,
  onDelete,
  onViewOutput,
  onSpawnTask,
}: CardHeaderProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    onDelete();
  };

  return (
    <CardHeader className="p-3 pb-2 block">
      {/* Running task header */}
      {isCurrentAutoTask && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <div className="flex items-center justify-center gap-2 bg-[var(--status-in-progress)]/15 border border-[var(--status-in-progress)]/50 rounded-md px-2 py-0.5">
            <Loader2 className="w-3.5 h-3.5 text-[var(--status-in-progress)] animate-spin" />
            {feature.startedAt && (
              <CountUpTimer
                startedAt={feature.startedAt}
                className="text-[var(--status-in-progress)] text-[10px]"
              />
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted/80 rounded-md"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`menu-running-${feature.id}`}
              >
                <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                data-testid={`edit-running-${feature.id}`}
                className="text-xs"
              >
                <Edit className="w-3 h-3 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSpawnTask?.();
                }}
                data-testid={`spawn-running-${feature.id}`}
                className="text-xs"
              >
                <GitFork className="w-3 h-3 mr-2" />
                Spawn Sub-Task
              </DropdownMenuItem>
              {/* Model info in dropdown */}
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t mt-1 pt-1.5">
                <div className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  <span>{formatModelName(feature.model ?? DEFAULT_MODEL)}</span>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Backlog header */}
      {!isCurrentAutoTask && feature.status === 'backlog' && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSpawnTask?.();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`spawn-backlog-${feature.id}`}
            title="Spawn Sub-Task"
          >
            <GitFork className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-destructive"
            onClick={handleDeleteClick}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`delete-backlog-${feature.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Waiting approval / Verified header */}
      {!isCurrentAutoTask &&
        (feature.status === 'waiting_approval' || feature.status === 'verified') && (
          <>
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`edit-${
                  feature.status === 'waiting_approval' ? 'waiting' : 'verified'
                }-${feature.id}`}
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpawnTask?.();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`spawn-${
                  feature.status === 'waiting_approval' ? 'waiting' : 'verified'
                }-${feature.id}`}
                title="Spawn Sub-Task"
              >
                <GitFork className="w-4 h-4" />
              </Button>
              {onViewOutput && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`logs-${
                    feature.status === 'waiting_approval' ? 'waiting' : 'verified'
                  }-${feature.id}`}
                  title="Logs"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-destructive"
                onClick={handleDeleteClick}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`delete-${
                  feature.status === 'waiting_approval' ? 'waiting' : 'verified'
                }-${feature.id}`}
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

      {/* In progress header */}
      {!isCurrentAutoTask && feature.status === 'in_progress' && (
        <>
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-white/10 text-muted-foreground hover:text-destructive"
              onClick={handleDeleteClick}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`delete-feature-${feature.id}`}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted/80 rounded-md"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`menu-${feature.id}`}
                >
                  <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  data-testid={`edit-feature-${feature.id}`}
                  className="text-xs"
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
                    className="text-xs"
                  >
                    <FileText className="w-3 h-3 mr-2" />
                    View Logs
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpawnTask?.();
                  }}
                  data-testid={`spawn-feature-${feature.id}`}
                  className="text-xs"
                >
                  <GitFork className="w-3 h-3 mr-2" />
                  Spawn Sub-Task
                </DropdownMenuItem>
                {/* Model info in dropdown */}
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t mt-1 pt-1.5">
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    <span>{formatModelName(feature.model ?? DEFAULT_MODEL)}</span>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      {/* Title and description */}
      <div className="flex items-start gap-2">
        {isDraggable && (
          <div
            className="-ml-2 -mt-1 p-2 touch-none opacity-40 hover:opacity-70 transition-opacity"
            data-testid={`drag-handle-${feature.id}`}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          {feature.titleGenerating ? (
            <div className="flex items-center gap-1.5 mb-1">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground italic">Generating title...</span>
            </div>
          ) : feature.title ? (
            <CardTitle className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
              {feature.title}
            </CardTitle>
          ) : null}
          <CardDescription
            className={cn(
              'text-xs leading-snug break-words hyphens-auto overflow-hidden text-muted-foreground',
              !isDescriptionExpanded && 'line-clamp-3'
            )}
          >
            {feature.description || feature.summary || feature.id}
          </CardDescription>
          {(feature.description || feature.summary || '').length > 100 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDescriptionExpanded(!isDescriptionExpanded);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70 hover:text-muted-foreground mt-1.5 transition-colors"
              data-testid={`toggle-description-${feature.id}`}
            >
              {isDescriptionExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>Less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>More</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Feature"
        description="Are you sure you want to delete this feature? This action cannot be undone."
        testId="delete-confirmation-dialog"
        confirmTestId="confirm-delete-button"
      />
    </CardHeader>
  );
}
