// @ts-nocheck - dnd-kit draggable/droppable ref combination type incompatibilities
import React, { memo, useLayoutEffect, useState, useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Feature, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { CardBadges, PriorityBadges } from './card-badges';
import { CardHeaderSection } from './card-header';
import { CardContentSections } from './card-content-sections';
import { AgentInfoPanel } from './agent-info-panel';
import { CardActions } from './card-actions';

function getCardBorderStyle(enabled: boolean, opacity: number): React.CSSProperties {
  if (!enabled) {
    return { borderWidth: '0px', borderColor: 'transparent' };
  }
  if (opacity !== 100) {
    return {
      borderWidth: '1px',
      borderColor: `color-mix(in oklch, var(--border) ${opacity}%, transparent)`,
    };
  }
  return {};
}

function getCursorClass(
  isOverlay: boolean | undefined,
  isDraggable: boolean,
  isSelectionMode: boolean
): string {
  if (isSelectionMode) return 'cursor-pointer';
  if (isOverlay) return 'cursor-grabbing';
  // Drag cursor is now only on the drag handle, not the full card
  return 'cursor-default';
}

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
  onImplement?: () => void;
  onComplete?: () => void;
  onViewPlan?: () => void;
  onApprovePlan?: () => void;
  onSpawnTask?: () => void;
  onDuplicate?: () => void;
  onDuplicateAsChild?: () => void;
  hasContext?: boolean;
  isCurrentAutoTask?: boolean;
  shortcutKey?: string;
  contextContent?: string;
  summary?: string;
  opacity?: number;
  glassmorphism?: boolean;
  cardBorderEnabled?: boolean;
  cardBorderOpacity?: number;
  isOverlay?: boolean;
  reduceEffects?: boolean;
  // Selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionTarget?: 'backlog' | 'waiting_approval' | null;
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
  onMoveBackToInProgress: _onMoveBackToInProgress,
  onFollowUp,
  onImplement,
  onComplete,
  onViewPlan,
  onApprovePlan,
  onSpawnTask,
  onDuplicate,
  onDuplicateAsChild,
  hasContext,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
  opacity = 100,
  glassmorphism = true,
  cardBorderEnabled = true,
  cardBorderOpacity = 100,
  isOverlay,
  reduceEffects = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  selectionTarget = null,
}: KanbanCardProps) {
  const { useWorktrees, currentProject } = useAppStore(
    useShallow((state) => ({
      useWorktrees: state.useWorktrees,
      currentProject: state.currentProject,
    }))
  );
  // A card in waiting_approval should not display as "actively running" even if
  // it's still in the runningAutoTasks list. The waiting_approval UI takes precedence.
  const isActivelyRunning = !!isCurrentAutoTask && feature.status !== 'waiting_approval';
  const [isLifted, setIsLifted] = useState(false);

  useLayoutEffect(() => {
    if (isOverlay) {
      requestAnimationFrame(() => {
        setIsLifted(true);
      });
    }
  }, [isOverlay]);

  const isDraggable =
    !isSelectionMode &&
    (feature.status === 'backlog' ||
      feature.status === 'interrupted' ||
      feature.status === 'ready' ||
      feature.status === 'waiting_approval' ||
      feature.status === 'verified' ||
      feature.status.startsWith('pipeline_') ||
      (feature.status === 'in_progress' && !isCurrentAutoTask));
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: feature.id,
    disabled: !isDraggable || isOverlay || isSelectionMode,
  });

  // Make the card a drop target for creating dependency links
  // All non-completed cards can be link targets to allow flexible dependency creation
  // (completed features are excluded as they're already done)
  const isDroppable = !isOverlay && feature.status !== 'completed' && !isSelectionMode;
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `card-drop-${feature.id}`,
    disabled: !isDroppable,
    data: {
      type: 'card',
      featureId: feature.id,
    },
  });

  // Combine refs for both draggable and droppable
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDraggableRef(node);
      setDroppableRef(node);
    },
    [setDraggableRef, setDroppableRef]
  );

  const dndStyle = {
    opacity: isDragging ? 0.5 : undefined,
  };

  const cardStyle = getCardBorderStyle(cardBorderEnabled, cardBorderOpacity);

  // Only allow selection for features matching the selection target
  const isSelectable = isSelectionMode && feature.status === selectionTarget;

  const wrapperClasses = cn(
    'relative select-none outline-none transition-transform duration-200 ease-out',
    getCursorClass(isOverlay, isDraggable, isSelectable),
    isOverlay && isLifted && 'scale-105 rotate-1 z-50',
    // Visual feedback when another card is being dragged over this one
    isOver && !isDragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
  );

  const isInteractive = !isDragging && !isOverlay;
  const hasError = feature.error && !isCurrentAutoTask;

  const innerCardClasses = cn(
    'kanban-card-content h-full relative',
    reduceEffects ? 'shadow-none' : 'shadow-sm',
    'transition-all duration-200 ease-out',
    // Disable hover translate for in-progress cards to prevent gap showing gradient
    isInteractive &&
      !reduceEffects &&
      !isActivelyRunning &&
      'hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 bg-transparent',
    !glassmorphism && 'backdrop-blur-[0px]!',
    !isActivelyRunning &&
      cardBorderEnabled &&
      (cardBorderOpacity === 100 ? 'border-border/50' : 'border'),
    hasError && 'border-[var(--status-error)] border-2 shadow-[var(--status-error-bg)] shadow-lg',
    isSelected && isSelectable && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-background'
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectable && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect();
    }
  };

  const renderCardContent = () => (
    <Card
      style={isActivelyRunning ? undefined : cardStyle}
      className={innerCardClasses}
      onDoubleClick={isSelectionMode ? undefined : onEdit}
      onClick={handleCardClick}
    >
      {/* Background overlay with opacity */}
      {(!isDragging || isOverlay) && (
        <div
          className={cn(
            'absolute inset-0 rounded-xl bg-card -z-10',
            glassmorphism && 'backdrop-blur-sm'
          )}
          style={{ opacity: opacity / 100 }}
        />
      )}

      {/* Status Badges Row */}
      <CardBadges feature={feature} />

      {/* Category row with selection checkbox */}
      <div className="px-3 pt-3 flex items-center gap-2">
        {isSelectable && !isOverlay && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.()}
            className="h-4 w-4 border-2 data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500 shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span className="text-[11px] text-muted-foreground/70 font-medium">{feature.category}</span>
      </div>

      {/* Priority and Manual Verification badges */}
      <PriorityBadges feature={feature} projectPath={currentProject?.path} />

      {/* Card Header */}
      <CardHeaderSection
        feature={feature}
        isDraggable={isDraggable}
        isCurrentAutoTask={isActivelyRunning}
        isSelectionMode={isSelectionMode}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewOutput={onViewOutput}
        onSpawnTask={onSpawnTask}
        onDuplicate={onDuplicate}
        onDuplicateAsChild={onDuplicateAsChild}
        dragHandleListeners={isDraggable ? listeners : undefined}
        dragHandleAttributes={isDraggable ? attributes : undefined}
      />

      <CardContent className="px-3 pt-0 pb-0">
        {/* Content Sections */}
        <CardContentSections feature={feature} useWorktrees={useWorktrees} />

        {/* Agent Info Panel */}
        <AgentInfoPanel
          feature={feature}
          projectPath={currentProject?.path ?? ''}
          contextContent={contextContent}
          summary={summary}
          isCurrentAutoTask={isCurrentAutoTask}
        />

        {/* Actions */}
        <CardActions
          feature={feature}
          isCurrentAutoTask={isActivelyRunning}
          hasContext={hasContext}
          shortcutKey={shortcutKey}
          isSelectionMode={isSelectionMode}
          onEdit={onEdit}
          onViewOutput={onViewOutput}
          onVerify={onVerify}
          onResume={onResume}
          onForceStop={onForceStop}
          onManualVerify={onManualVerify}
          onFollowUp={onFollowUp}
          onImplement={onImplement}
          onComplete={onComplete}
          onViewPlan={onViewPlan}
          onApprovePlan={onApprovePlan}
        />
      </CardContent>
    </Card>
  );

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={wrapperClasses}
      data-testid={`kanban-card-${feature.id}`}
    >
      {isActivelyRunning ? (
        <div className="animated-border-wrapper">{renderCardContent()}</div>
      ) : (
        renderCardContent()
      )}
    </div>
  );
});
