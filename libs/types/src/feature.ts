/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel } from './settings.js';
import type { ReasoningEffort } from './provider.js';

/**
 * A single entry in the description history
 */
export interface DescriptionHistoryEntry {
  description: string;
  timestamp: string; // ISO date string
  source: 'initial' | 'enhance' | 'edit'; // What triggered this version
  enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer'; // Only for 'enhance' source
}

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

export interface UsageEntry {
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  numTurns: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  numTurns: number;
  entries: UsageEntry[];
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  error?: string;
  retryState?: {
    attemptNumber: number;
    originalModel?: string;
    history: Array<{
      attempt: number;
      model: string;
      error: string;
      errorType: string;
      timestamp: string;
    }>;
  };
  summary?: string;
  tokenUsage?: TokenUsage;
  startedAt?: string;
  mergedToMain?: boolean; // Whether verified feature branch has been merged back to main
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'verified'
  | 'backlog'
  | 'ready'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'waiting_approval'
  | 'done';
