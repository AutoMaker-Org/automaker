// @ts-nocheck
import React, { memo, useLayoutEffect, useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Feature, useAppStore } from '@/store/app-store';
import { CardBadges, PriorityBadges } from './card-badges';
import { CardHeaderSection } from './card-header';
import { CardContentSections } from './card-content-sections';
import { AgentInfoPanel } from './agent-info-panel';
import { CardActions } from './card-actions';
import { ImagePreviewThumbnail } from './image-preview-thumbnail';
import { ImagePreviewModal } from './image-preview-modal';

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
  if (isDraggable) return 'cursor-grab active:cursor-grabbing';
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
  // Selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
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
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: KanbanCardProps) {
  const { useWorktrees } = useAppStore();
  const [isLifted, setIsLifted] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalIndex, setImageModalIndex] = useState(0);

  // Get image paths from feature
  const imagePaths = feature.imagePaths ?? [];
  const hasImages = imagePaths.length > 0;

  const handleImageClick = useCallback((index: number) => {
    setImageModalIndex(index);
    setImageModalOpen(true);
  }, []);

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
      feature.status === 'waiting_approval' ||
      feature.status === 'verified' ||
      (feature.status === 'in_progress' && !isCurrentAutoTask));
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.id,
    disabled: !isDraggable || isOverlay || isSelectionMode,
  });

  const dndStyle = {
    opacity: isDragging ? 0.5 : undefined,
  };

  const cardStyle = getCardBorderStyle(cardBorderEnabled, cardBorderOpacity);

  // Only allow selection for backlog features
  const isSelectable = isSelectionMode && feature.status === 'backlog';

  const wrapperClasses = cn(
    'relative select-none outline-none touch-none transition-transform duration-200 ease-out',
    getCursorClass(isOverlay, isDraggable, isSelectable),
    isOverlay && isLifted && 'scale-105 rotate-1 z-50'
  );

  const isInteractive = !isDragging && !isOverlay;
  const hasError = feature.error && !isCurrentAutoTask;

  const innerCardClasses = cn(
    'kanban-card-content h-full relative shadow-sm',
    'transition-all duration-200 ease-out',
    isInteractive && 'hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 bg-transparent',
    !glassmorphism && 'backdrop-blur-[0px]!',
    !isCurrentAutoTask &&
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
      style={isCurrentAutoTask ? undefined : cardStyle}
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
        {isSelectionMode && !isOverlay && feature.status === 'backlog' && (
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
      <PriorityBadges feature={feature} />

      {/* Card Header */}
      <CardHeaderSection
        feature={feature}
        isDraggable={isDraggable}
        isCurrentAutoTask={!!isCurrentAutoTask}
        isSelectionMode={isSelectionMode}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewOutput={onViewOutput}
        onSpawnTask={onSpawnTask}
      />

      <CardContent className="px-3 pt-0 pb-0">
        {/* Content Sections */}
        <CardContentSections feature={feature} useWorktrees={useWorktrees} />

        {/* Image Preview Thumbnail */}
        {hasImages && !isOverlay && (
          <div className="mb-2">
            <ImagePreviewThumbnail
              imagePaths={imagePaths}
              featureId={feature.id}
              onImageClick={handleImageClick}
            />
          </div>
        )}

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
    <>
      <div
        ref={setNodeRef}
        style={dndStyle}
        {...attributes}
        {...(isDraggable ? listeners : {})}
        className={wrapperClasses}
        data-testid={`kanban-card-${feature.id}`}
      >
        {isCurrentAutoTask ? (
          <div className="animated-border-wrapper">{renderCardContent()}</div>
        ) : (
          renderCardContent()
        )}
      </div>

      {/* Image Preview Modal */}
      {hasImages && (
        <ImagePreviewModal
          open={imageModalOpen}
          onOpenChange={setImageModalOpen}
          imagePaths={imagePaths}
          initialIndex={imageModalIndex}
          featureTitle={feature.title}
        />
      )}
    </>
  );
});
