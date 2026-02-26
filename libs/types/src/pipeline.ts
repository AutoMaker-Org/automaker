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

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'merge_conflict'
  | 'ready'
  | 'in_progress'
  | 'interrupted'
  | 'waiting_approval'
  | 'verified'
  | 'completed'
  | PipelineStatus;
