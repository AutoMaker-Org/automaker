/**
 * Execution Types - Type definitions for ExecutionService and related services
 *
 * Contains callback types used by ExecutionService for dependency injection,
 * allowing the service to delegate to other services without circular dependencies.
 */

import type { Feature, PlanningMode, ThinkingLevel } from '@automaker/types';
import type { loadContextFiles } from '@automaker/utils';
import type { PipelineContext } from './pipeline-orchestrator.js';

// =============================================================================
// ExecutionService Callback Types
// =============================================================================

/**
 * Function to run the agent with a prompt
 */
export type RunAgentFn = (
  workDir: string,
  featureId: string,
  prompt: string,
  abortController: AbortController,
  projectPath: string,
  imagePaths?: string[],
  model?: string,
  options?: {
    projectPath?: string;
    planningMode?: PlanningMode;
    requirePlanApproval?: boolean;
    previousContent?: string;
    systemPrompt?: string;
    autoLoadClaudeMd?: boolean;
    thinkingLevel?: ThinkingLevel;
    branchName?: string | null;
  }
) => Promise<void>;

/**
 * Function to execute pipeline steps
 */
export type ExecutePipelineFn = (context: PipelineContext) => Promise<void>;

/**
 * Function to update feature status
 */
export type UpdateFeatureStatusFn = (
  projectPath: string,
  featureId: string,
  status: string
) => Promise<void>;

/**
 * Function to load a feature by ID
 */
export type LoadFeatureFn = (projectPath: string, featureId: string) => Promise<Feature | null>;

/**
 * Function to get the planning prompt prefix based on feature's planning mode
 */
export type GetPlanningPromptPrefixFn = (feature: Feature) => Promise<string>;

/**
 * Function to save a feature summary
 */
export type SaveFeatureSummaryFn = (
  projectPath: string,
  featureId: string,
  summary: string
) => Promise<void>;

/**
 * Function to record learnings from a completed feature
 */
export type RecordLearningsFn = (
  projectPath: string,
  feature: Feature,
  agentOutput: string
) => Promise<void>;

/**
 * Function to check if context exists for a feature
 */
export type ContextExistsFn = (projectPath: string, featureId: string) => Promise<boolean>;

/**
 * Function to resume a feature (continues from saved context or starts fresh)
 */
export type ResumeFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  _calledInternally: boolean
) => Promise<void>;

/**
 * Function to track failure and check if pause threshold is reached
 * Returns true if auto-mode should pause
 */
export type TrackFailureFn = (errorInfo: { type: string; message: string }) => boolean;

/**
 * Function to signal that auto-mode should pause due to failures
 */
export type SignalPauseFn = (errorInfo: { type: string; message: string }) => void;

/**
 * Function to record a successful execution (resets failure tracking)
 */
export type RecordSuccessFn = () => void;

/**
 * Function to save execution state
 */
export type SaveExecutionStateFn = (projectPath: string) => Promise<void>;

/**
 * Type alias for loadContextFiles function
 */
export type LoadContextFilesFn = typeof loadContextFiles;

// =============================================================================
// PipelineOrchestrator Callback Types
// =============================================================================

/**
 * Function to build feature prompt
 */
export type BuildFeaturePromptFn = (
  feature: Feature,
  prompts: { implementationInstructions: string; playwrightVerificationInstructions: string }
) => string;

/**
 * Function to execute a feature
 */
export type ExecuteFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  isAutoMode: boolean,
  providedWorktreePath?: string,
  options?: { continuationPrompt?: string; _calledInternally?: boolean }
) => Promise<void>;

/**
 * Function to run agent (for PipelineOrchestrator)
 */
export type PipelineRunAgentFn = (
  workDir: string,
  featureId: string,
  prompt: string,
  abortController: AbortController,
  projectPath: string,
  imagePaths?: string[],
  model?: string,
  options?: Record<string, unknown>
) => Promise<void>;

// =============================================================================
// AutoLoopCoordinator Callback Types
// =============================================================================

/**
 * Function to execute a feature in auto-loop
 */
export type AutoLoopExecuteFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  isAutoMode: boolean
) => Promise<void>;

/**
 * Function to load pending features for a worktree
 */
export type LoadPendingFeaturesFn = (
  projectPath: string,
  branchName: string | null
) => Promise<Feature[]>;

/**
 * Function to save execution state for auto-loop
 */
export type AutoLoopSaveExecutionStateFn = (
  projectPath: string,
  branchName: string | null,
  maxConcurrency: number
) => Promise<void>;

/**
 * Function to clear execution state
 */
export type ClearExecutionStateFn = (
  projectPath: string,
  branchName: string | null
) => Promise<void>;

/**
 * Function to reset stuck features
 */
export type ResetStuckFeaturesFn = (projectPath: string) => Promise<void>;

/**
 * Function to check if a feature is finished
 */
export type IsFeatureFinishedFn = (feature: Feature) => boolean;

/**
 * Function to check if a feature is running
 */
export type IsFeatureRunningFn = (featureId: string) => boolean;
