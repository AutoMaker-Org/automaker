/**
 * AgentExecutor Types - Type definitions for agent execution
 */

import type {
  PlanningMode,
  ThinkingLevel,
  ParsedTask,
  ClaudeCompatibleProvider,
  Credentials,
} from '@automaker/types';
import type { BaseProvider } from '../providers/base-provider.js';

export interface AgentExecutionOptions {
  workDir: string;
  featureId: string;
  prompt: string;
  projectPath: string;
  abortController: AbortController;
  imagePaths?: string[];
  model?: string;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  previousContent?: string;
  systemPrompt?: string;
  autoLoadClaudeMd?: boolean;
  thinkingLevel?: ThinkingLevel;
  branchName?: string | null;
  credentials?: Credentials;
  claudeCompatibleProvider?: ClaudeCompatibleProvider;
  mcpServers?: Record<string, unknown>;
  sdkOptions?: {
    maxTurns?: number;
    allowedTools?: string[];
    systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
    settingSources?: Array<'user' | 'project' | 'local'>;
  };
  provider: BaseProvider;
  effectiveBareModel: string;
  specAlreadyDetected?: boolean;
  existingApprovedPlanContent?: string;
  persistedTasks?: ParsedTask[];
}

export interface AgentExecutionResult {
  responseText: string;
  specDetected: boolean;
  tasksCompleted: number;
  aborted: boolean;
}

export type WaitForApprovalFn = (
  featureId: string,
  projectPath: string
) => Promise<{ approved: boolean; feedback?: string; editedPlan?: string }>;

export type SaveFeatureSummaryFn = (
  projectPath: string,
  featureId: string,
  summary: string
) => Promise<void>;

export type UpdateFeatureSummaryFn = (
  projectPath: string,
  featureId: string,
  summary: string
) => Promise<void>;

export type BuildTaskPromptFn = (
  task: ParsedTask,
  allTasks: ParsedTask[],
  taskIndex: number,
  planContent: string,
  taskPromptTemplate: string,
  userFeedback?: string
) => string;

export interface AgentExecutorCallbacks {
  waitForApproval: WaitForApprovalFn;
  saveFeatureSummary: SaveFeatureSummaryFn;
  updateFeatureSummary: UpdateFeatureSummaryFn;
  buildTaskPrompt: BuildTaskPromptFn;
}
