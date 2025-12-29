import type { Feature } from '@/store/app-store';
import type { PipelineConfig, FeatureStatusWithPipeline } from '@automaker/types';

export type ColumnId = Feature['status'];

export interface Column {
  id: FeatureStatusWithPipeline;
  title: string;
  colorClass: string;
  isPipelineStep?: boolean;
  pipelineStepId?: string;
}

// Base columns (start)
const BASE_COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
  },
];

// End columns (after pipeline)
const END_COLUMNS: Column[] = [
  {
    id: 'waiting_approval',
    title: 'Waiting Approval',
    colorClass: 'bg-[var(--status-waiting)]',
  },
  {
    id: 'verified',
    title: 'Verified',
    colorClass: 'bg-[var(--status-success)]',
  },
];

// Static COLUMNS for backwards compatibility (no pipeline)
export const COLUMNS: Column[] = [...BASE_COLUMNS, ...END_COLUMNS];

/**
 * Generate columns including pipeline steps
 */
export function getColumnsWithPipeline(pipelineConfig: PipelineConfig | null): Column[] {
  const pipelineSteps = pipelineConfig?.steps || [];

  if (pipelineSteps.length === 0) {
    return COLUMNS;
  }

  // Sort steps by order
  const sortedSteps = [...pipelineSteps].sort((a, b) => a.order - b.order);

  // Convert pipeline steps to columns (filter out invalid steps)
  const pipelineColumns: Column[] = sortedSteps
    .filter((step) => step && step.id) // Only include valid steps with an id
    .map((step) => ({
      id: `pipeline_${step.id}` as FeatureStatusWithPipeline,
      title: step.name || 'Pipeline Step',
      colorClass: step.colorClass || 'bg-[var(--status-in-progress)]',
      isPipelineStep: true,
      pipelineStepId: step.id,
    }));

  return [...BASE_COLUMNS, ...pipelineColumns, ...END_COLUMNS];
}

/**
 * Get the index where pipeline columns should be inserted
 * (after in_progress, before waiting_approval)
 */
export function getPipelineInsertIndex(): number {
  return BASE_COLUMNS.length;
}

/**
 * Check if a status is a pipeline status
 */
export function isPipelineStatus(status: string): boolean {
  return status.startsWith('pipeline_');
}

/**
 * Extract step ID from a pipeline status
 */
export function getStepIdFromStatus(status: string): string | null {
  if (!isPipelineStatus(status)) {
    return null;
  }
  return status.replace('pipeline_', '');
}
