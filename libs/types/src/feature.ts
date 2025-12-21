/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode } from './settings.js';

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  steps?: string[];
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  thinkingLevel?: string;
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
  summary?: string;
  startedAt?: string;
  [key: string]: unknown;  // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';
