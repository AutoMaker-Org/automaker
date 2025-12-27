/**
 * Backlog Plan types for AI-assisted backlog modification
 */

import type { Feature } from './feature.js';

/**
 * A single proposed change to the backlog
 */
export interface BacklogChange {
  type: 'add' | 'update' | 'delete';
  featureId?: string; // For update/delete operations
  feature?: Partial<Feature>; // For add/update (includes title, description, category, dependencies, priority)
  reason: string; // AI explanation of why this change is proposed
}

/**
 * Dependency updates that need to happen as a result of the plan
 */
export interface DependencyUpdate {
  featureId: string;
  removedDependencies: string[]; // Dependencies removed due to deleted features
  addedDependencies: string[]; // New dependencies based on AI analysis
}

/**
 * Result from the AI when generating a backlog plan
 */
export interface BacklogPlanResult {
  changes: BacklogChange[];
  summary: string; // Overview of proposed changes
  dependencyUpdates: DependencyUpdate[];
}

/**
 * Events emitted during backlog plan generation
 */
export interface BacklogPlanEvent {
  type:
    | 'backlog_plan_progress'
    | 'backlog_plan_tool'
    | 'backlog_plan_complete'
    | 'backlog_plan_error';
  content?: string;
  tool?: string;
  input?: unknown;
  result?: BacklogPlanResult;
  error?: string;
}

/**
 * Request to generate a backlog plan
 */
export interface BacklogPlanRequest {
  projectPath: string;
  prompt: string;
  model?: string;
}

/**
 * Response from apply operation
 */
export interface BacklogPlanApplyResult {
  success: boolean;
  appliedChanges: string[]; // IDs of features affected
  error?: string;
}
