import { memo, useState } from 'react';
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Feature } from '@/store/app-store';
import { Trash2 } from 'lucide-react';

export interface DependencyEdgeData {
  sourceStatus: Feature['status'];
  targetStatus: Feature['status'];
  isHighlighted?: boolean;
  isDimmed?: boolean;
  onDeleteDependency?: (sourceId: string, targetId: string) => void;
}

const getEdgeColor = (sourceStatus?: Feature['status'], targetStatus?: Feature['status']) => {
  // If source is completed/verified, the dependency is satisfied
  if (sourceStatus === 'completed' || sourceStatus === 'verified') {
    return 'var(--status-success)';
  }
  // If target is in progress, show active color
  if (targetStatus === 'in_progress') {
    return 'var(--status-in-progress)';
  }
  // If target is blocked (in backlog with incomplete deps)
  if (targetStatus === 'backlog') {
    return 'var(--border)';
  }
  // Default
  return 'var(--border)';
};

export const DependencyEdge = memo(function DependencyEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    animated,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const edgeData = data as DependencyEdgeData | undefined;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const isHighlighted = edgeData?.isHighlighted ?? false;
  const isDimmed = edgeData?.isDimmed ?? false;

  const edgeColor = isHighlighted
    ? 'var(--brand-500)'
    : edgeData
      ? getEdgeColor(edgeData.sourceStatus, edgeData.targetStatus)
      : 'var(--border)';

  const isCompleted =
    edgeData?.sourceStatus === 'completed' || edgeData?.sourceStatus === 'verified';
  const isInProgress = edgeData?.targetStatus === 'in_progress';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    edgeData?.onDeleteDependency?.(source, target);
  };

  return (
    <>
      {/* Invisible wider path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      />

      {/* Background edge for better visibility */}
      <BaseEdge
        id={`${id}-bg`}
        path={edgePath}
        style={{
          strokeWidth: isHighlighted || isHovered ? 6 : 4,
          stroke: 'var(--background)',
          opacity: isDimmed ? 0.3 : 1,
        }}
      />

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          'transition-all duration-300',
          animated && 'animated-edge',
          isInProgress && 'edge-flowing',
          isHighlighted && 'graph-edge-highlighted',
          isDimmed && 'graph-edge-dimmed'
        )}
        style={{
          strokeWidth: isHighlighted ? 4 : isHovered || selected ? 3 : isDimmed ? 1 : 2,
          stroke: isHovered || selected ? 'var(--status-error)' : edgeColor,
          strokeDasharray: isCompleted ? 'none' : '5 5',
          filter: isHighlighted
            ? 'drop-shadow(0 0 6px var(--brand-500))'
            : isHovered || selected
              ? 'drop-shadow(0 0 4px var(--status-error))'
              : 'none',
          opacity: isDimmed ? 0.2 : 1,
        }}
      />

      {/* Delete button on hover or select */}
      {(isHovered || selected) && edgeData?.onDeleteDependency && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'auto',
              zIndex: 1000,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <button
              onClick={handleDelete}
              className={cn(
                'flex items-center justify-center',
                'w-6 h-6 rounded-full',
                'bg-[var(--status-error)] hover:bg-[var(--status-error)]/80',
                'text-white shadow-lg',
                'transition-all duration-150',
                'hover:scale-110'
              )}
              title="Delete dependency"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Animated particles for in-progress edges */}
      {animated && !isHovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="edge-particle"
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isInProgress
                  ? 'bg-[var(--status-in-progress)] animate-ping'
                  : 'bg-brand-500 animate-pulse'
              )}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
