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
  | 'ready'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'waiting_approval'
  | 'verified'
  | 'done'
  | 'completed'
  | PipelineStatus;
