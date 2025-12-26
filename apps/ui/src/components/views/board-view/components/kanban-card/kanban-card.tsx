import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Feature, useAppStore } from '@/store/app-store';
import { CardBadges, PriorityBadges } from './card-badges';
import { CardHeaderSection } from './card-header';
import { CardContentSections } from './card-content-sections';
import { AgentInfoPanel } from './agent-info-panel';
import { CardActions } from './card-actions';

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
  onStageChanges?: () => void;
  hasContext?: boolean;
  hasWorktree?: boolean;
  isCurrentAutoTask?: boolean;
  shortcutKey?: string;
  contextContent?: string;
  summary?: string;
  opacity?: number;
  glassmorphism?: boolean;
  cardBorderEnabled?: boolean;
  cardBorderOpacity?: number;
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
  onStageChanges,
  hasContext,
  hasWorktree,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
  opacity = 100,
  glassmorphism = true,
  cardBorderEnabled = true,
  cardBorderOpacity = 100,
}: KanbanCardProps) {
  const { useWorktrees } = useAppStore();

  const isDraggable =
    feature.status === 'backlog' ||
    feature.status === 'waiting_approval' ||
    feature.status === 'verified' ||
    (feature.status === 'in_progress' && !isCurrentAutoTask);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const borderStyle: React.CSSProperties = { ...style };
  if (!cardBorderEnabled) {
    (borderStyle as Record<string, string>).borderWidth = '0px';
    (borderStyle as Record<string, string>).borderColor = 'transparent';
  } else if (cardBorderOpacity !== 100) {
    (borderStyle as Record<string, string>).borderWidth = '1px';
    (borderStyle as Record<string, string>).borderColor =
      `color-mix(in oklch, var(--border) ${cardBorderOpacity}%, transparent)`;
  }

  const cardElement = (
    <Card
      ref={setNodeRef}
      style={isCurrentAutoTask ? style : borderStyle}
      className={cn(
        'cursor-grab active:cursor-grabbing relative kanban-card-content select-none',
        'transition-all duration-200 ease-out',
        // Premium shadow system
        'shadow-sm hover:shadow-md hover:shadow-black/10',
        // Subtle lift on hover
        'hover:-translate-y-0.5',
        !isCurrentAutoTask && cardBorderEnabled && cardBorderOpacity === 100 && 'border-border/50',
        !isCurrentAutoTask && cardBorderEnabled && cardBorderOpacity !== 100 && 'border',
        !isDragging && 'bg-transparent',
        !glassmorphism && 'backdrop-blur-[0px]!',
        isDragging && 'scale-105 shadow-xl shadow-black/20 rotate-1',
        // Error state - using CSS variable
        feature.error &&
          !isCurrentAutoTask &&
          'border-[var(--status-error)] border-2 shadow-[var(--status-error-bg)] shadow-lg',
        !isDraggable && 'cursor-default'
      )}
      data-testid={`kanban-card-${feature.id}`}
      onDoubleClick={onEdit}
      {...attributes}
      {...(isDraggable ? listeners : {})}
    >
      {/* Background overlay with opacity */}
      {!isDragging && (
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

      {/* Category row */}
      <div className="px-3 pt-4">
        <span className="text-[11px] text-muted-foreground/70 font-medium">{feature.category}</span>
      </div>

      {/* Priority and Manual Verification badges */}
      <PriorityBadges feature={feature} />

      {/* Card Header */}
      <CardHeaderSection
        feature={feature}
        isDraggable={isDraggable}
        isCurrentAutoTask={!!isCurrentAutoTask}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewOutput={onViewOutput}
        onSpawnTask={onSpawnTask}
      />

      <CardContent className="px-3 pt-0 pb-0">
        {/* Content Sections */}
        <CardContentSections feature={feature} useWorktrees={useWorktrees} />

        {/* Agent Info Panel */}
        <AgentInfoPanel
          feature={feature}
          contextContent={contextContent}
          summary={summary}
          isCurrentAutoTask={isCurrentAutoTask}
        />

        {/* Actions */}
        <CardActions
          feature={feature}
          isCurrentAutoTask={!!isCurrentAutoTask}
          hasContext={hasContext}
          hasWorktree={hasWorktree}
          shortcutKey={shortcutKey}
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
          onStageChanges={onStageChanges}
        />
      </CardContent>
    </Card>
  );

  // Wrap with animated border when in progress
  if (isCurrentAutoTask) {
    return <div className="animated-border-wrapper">{cardElement}</div>;
  }

  return cardElement;
});
