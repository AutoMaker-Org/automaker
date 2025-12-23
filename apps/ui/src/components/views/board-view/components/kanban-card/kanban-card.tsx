import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
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
  hasContext?: boolean;
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
  hasContext,
  isCurrentAutoTask,
  shortcutKey,
  contextContent,
  summary,
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

  const cardElement = (
    <GlassCard
      ref={setNodeRef}
      variant={isCurrentAutoTask ? 'active-blue' : 'default'}
      style={style}
      className={cn(
        'group relative min-h-[140px] flex flex-col',
        isDragging && 'scale-105 shadow-xl shadow-black/20 rotate-1',
        feature.error && 'border-brand-red border-2 shadow-glow-red',
        !isDraggable && 'cursor-default'
      )}
      data-testid={`kanban-card-${feature.id}`}
      onDoubleClick={onEdit}
      {...attributes}
      {...(isDraggable ? listeners : {})}
    >
      {/* Top Row: Empty space + Delete (on hover) */}
      <div className="flex justify-between items-start mb-2 h-5">
        <div className="flex flex-wrap gap-1">
          <CardBadges feature={feature} />
        </div>
        {/* Delete/Actions on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-slate-600 hover:text-brand-red transition"
          >
            <i data-lucide="trash" className="w-3.5 h-3.5"></i>
            {/* Fallback to SVG if i tag fails */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-trash w-3.5 h-3.5"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="mb-4">
        <CardHeaderSection
          feature={feature}
          isDraggable={isDraggable}
          isCurrentAutoTask={!!isCurrentAutoTask}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewOutput={onViewOutput}
          hideActions={true} // We handle actions via hover/bottom bar
        />
      </div>

      {/* Middle Grid: Priority, etc */}
      <div className="flex items-center justify-between mb-4">
        <PriorityBadges feature={feature} />
        <div className="flex items-center gap-2">
          {/* Category / Model info */}
          <span className="text-[10px] text-brand-cyan font-mono">
            {feature.model || 'Opus 4.2'}
          </span>
        </div>
      </div>

      {/* Content & Agent Info */}
      <div className="mb-2">
        <CardContentSections feature={feature} useWorktrees={useWorktrees} />
        <AgentInfoPanel
          feature={feature}
          contextContent={contextContent}
          summary={summary}
          isCurrentAutoTask={isCurrentAutoTask}
        />
      </div>

      {/* Buttons Grid */}
      <div className="mt-auto pt-2">
        <CardActions
          feature={feature}
          isCurrentAutoTask={!!isCurrentAutoTask}
          hasContext={hasContext}
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
        />
      </div>
    </GlassCard>
  );

  return cardElement;
});
