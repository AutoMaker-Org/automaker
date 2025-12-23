import { Feature } from '@/store/app-store';
import type { PipelineConfig } from '@automaker/types';

// ColumnId is now a string to support both fixed status columns and dynamic pipeline step columns
export type ColumnId = string;

// Fixed status types for backward compatibility
export type FixedStatus = Feature['status'];

export interface BoardColumn {
  id: ColumnId;
  title: string;
  colorClass: string;
  description?: string;
  required?: boolean;
}

/**
 * Default base columns (always present)
 */
export const BASE_COLUMNS: BoardColumn[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
  },
];

/**
 * Default end columns (always present)
 */
export const END_COLUMNS: BoardColumn[] = [
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

/**
 * Legacy static columns (for backward compatibility)
 * @deprecated Use generateColumns instead
 */
export const COLUMNS: BoardColumn[] = [...BASE_COLUMNS, ...END_COLUMNS];

/**
 * Get the color class for a pipeline step based on its type
 */
function getStepColorClass(stepType: string): string {
  const colorClassMap: Record<string, string> = {
    review: 'bg-[var(--status-review)]',
    security: 'bg-[var(--status-security)]',
    performance: 'bg-[var(--status-performance)]',
    test: 'bg-[var(--status-test)]',
    custom: 'bg-[var(--status-custom)]',
  };

  return colorClassMap[stepType] || 'bg-[var(--status-pipeline-step)]';
}

/**
 * Generate dynamic columns based on pipeline configuration
 */
export function generateColumns(pipelineConfig?: PipelineConfig | null): BoardColumn[] {
  if (!pipelineConfig?.enabled) {
    return COLUMNS;
  }

  const pipelineColumns: BoardColumn[] = pipelineConfig.steps.map((step) => ({
    id: step.id,
    title: step.name,
    colorClass: getStepColorClass(step.type),
    description: step.description,
    required: step.required,
  }));

  return [...BASE_COLUMNS, ...pipelineColumns, ...END_COLUMNS];
}

/**
 * Get CSS variable for a step type
 */
export function getStepColorVariable(stepType: string): string {
  const colorMap: Record<string, string> = {
    review: 'var(--status-review)',
    security: 'var(--status-security)',
    performance: 'var(--status-performance)',
    test: 'var(--status-test)',
    custom: 'var(--status-custom)',
  };

  return colorMap[stepType] || 'var(--status-pipeline-step)';
}

/**
 * Check if a column is a pipeline step
 */
export function isPipelineStep(
  columnId: ColumnId,
  pipelineConfig?: PipelineConfig | null
): boolean {
  if (!pipelineConfig?.enabled) {
    return false;
  }

  return pipelineConfig.steps.some((step) => step.id === columnId);
}

/**
 * Get step config for a column
 */
export function getStepConfig(columnId: ColumnId, pipelineConfig?: PipelineConfig | null) {
  if (!pipelineConfig?.enabled) {
    return null;
  }

  return pipelineConfig.steps.find((step) => step.id === columnId) || null;
}
