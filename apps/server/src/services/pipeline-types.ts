/**
 * Pipeline Types - Type definitions for PipelineOrchestrator
 */

import type { Feature, PipelineStep, PipelineConfig } from '@automaker/types';

export interface PipelineContext {
  projectPath: string;
  featureId: string;
  feature: Feature;
  steps: PipelineStep[];
  workDir: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  autoLoadClaudeMd: boolean;
  testAttempts: number;
  maxTestAttempts: number;
}

export interface PipelineStatusInfo {
  isPipeline: boolean;
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
  step: PipelineStep | null;
  config: PipelineConfig | null;
}

export interface StepResult {
  success: boolean;
  testsPassed?: boolean;
  message?: string;
}

export interface MergeResult {
  success: boolean;
  hasConflicts?: boolean;
  needsAgentResolution?: boolean;
  error?: string;
}

export type UpdateFeatureStatusFn = (
  projectPath: string,
  featureId: string,
  status: string
) => Promise<void>;

export type BuildFeaturePromptFn = (
  feature: Feature,
  prompts: { implementationInstructions: string; playwrightVerificationInstructions: string }
) => string;

export type ExecuteFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  useScreenshots: boolean,
  model?: string,
  options?: { _calledInternally?: boolean }
) => Promise<void>;

export type RunAgentFn = (
  workDir: string,
  featureId: string,
  prompt: string,
  abortController: AbortController,
  projectPath: string,
  imagePaths?: string[],
  model?: string,
  options?: Record<string, unknown>
) => Promise<void>;
