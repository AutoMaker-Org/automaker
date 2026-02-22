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

/**
 * A parsed task extracted from a spec/plan
 * Used for spec and full planning modes to track individual task progress
 */
export interface ParsedTask {
  /** Task ID, e.g., "T001" */
  id: string;
  /** Task description, e.g., "Create user model" */
  description: string;
  /** Optional file path for the task, e.g., "src/models/user.ts" */
  filePath?: string;
  /** Optional phase name for full mode, e.g., "Phase 1: Foundation" */
  phase?: string;
  /** Task execution status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Plan specification status for feature planning modes
 * Tracks the plan generation and approval workflow
 */
export interface PlanSpec {
  /** Current status of the plan */
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  /** The actual spec/plan markdown content */
  content?: string;
  /** Version number for tracking plan revisions */
  version: number;
  /** ISO timestamp when the spec was generated */
  generatedAt?: string;
  /** ISO timestamp when the spec was approved */
  approvedAt?: string;
  /** True if user has reviewed the spec */
  reviewedByUser: boolean;
  /** Number of completed tasks */
  tasksCompleted?: number;
  /** Total number of tasks in the spec */
  tasksTotal?: number;
  /** ID of the task currently being worked on */
  currentTaskId?: string;
  /** Parsed tasks from the spec content */
  tasks?: ParsedTask[];
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
  branchName?: string | null; // Name of the feature branch (undefined/null = use current worktree)
  skipTests?: boolean;
  excludedPipelineSteps?: string[]; // Array of pipeline step IDs to skip for this feature
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: PlanSpec;
  error?: string;
  summary?: string;
  startedAt?: string;
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';

/**
 * Export format for a feature, used when exporting features to share or backup
 */
export interface FeatureExport {
  /** Export format version for compatibility checking */
  version: string;
  /** The feature data being exported */
  feature: Feature;
  /** ISO date string when the export was created */
  exportedAt: string;
  /** Optional identifier of who/what performed the export */
  exportedBy?: string;
  /** Additional metadata about the export context */
  metadata?: {
    projectName?: string;
    projectPath?: string;
    branch?: string;
    [key: string]: unknown;
  };
}

/**
 * Options for importing a feature
 */
export interface FeatureImport {
  /** The feature data to import (can be raw Feature or wrapped FeatureExport) */
  data: Feature | FeatureExport;
  /** Whether to overwrite an existing feature with the same ID */
  overwrite?: boolean;
  /** Whether to preserve the original branchName or ignore it */
  preserveBranchInfo?: boolean;
  /** Optional new ID to assign (if not provided, uses the feature's existing ID) */
  newId?: string;
  /** Optional new category to assign */
  targetCategory?: string;
}

/**
 * Result of a feature import operation
 */
export interface FeatureImportResult {
  /** Whether the import was successful */
  success: boolean;
  /** The ID of the imported feature */
  featureId?: string;
  /** ISO date string when the import was completed */
  importedAt: string;
  /** Non-fatal warnings encountered during import */
  warnings?: string[];
  /** Errors that caused import failure */
  errors?: string[];
  /** Whether an existing feature was overwritten */
  wasOverwritten?: boolean;
}
