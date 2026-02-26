/**
 * Pipeline types for AutoMaker custom workflow steps
 */

export interface PipelineStep {
  id: string;
  name: string;
  order: number;
  instructions: string;
  colorClass: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
}

export type PipelineStatus = `pipeline_${string}`;

/**
 * Type guard to check if a status string represents a valid pipeline stage.
 * Requires the 'pipeline_' prefix followed by at least one character.
 */
export function isPipelineStatus(status: string | null | undefined): status is PipelineStatus {
  if (typeof status !== 'string') return false;
  // Require 'pipeline_' prefix with at least one character after it
  const prefix = 'pipeline_';
  return status.startsWith(prefix) && status.length > prefix.length;
}

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'interrupted'
  | 'waiting_approval'
  | 'verified'
  | 'completed'
  | PipelineStatus;

export const PIPELINE_SUMMARY_SEPARATOR = '\n\n---\n\n';
export const PIPELINE_SUMMARY_HEADER_PREFIX = '### ';
