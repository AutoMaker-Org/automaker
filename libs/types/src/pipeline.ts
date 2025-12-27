/**
 * Pipeline types for AutoMaker configurable pipeline system
 */

import type { AgentModel } from './model.js';

// Re-export AgentModel for convenience
export type { AgentModel };

/**
 * Pipeline configuration for a project
 */
export interface PipelineConfig {
  version: string;
  enabled: boolean;
  parallel?: boolean; // Execute steps in parallel when possible
  timeout?: number; // Global timeout in seconds
  onFailure?: 'stop' | 'continue' | 'skip-optional';
  steps: PipelineStepConfig[];
}

/**
 * Configuration for a single pipeline step
 */
export interface PipelineStepConfig {
  id: string;
  type: StepType;
  name: string;
  description?: string;
  model: AgentModel | 'different' | 'same';
  required: boolean;
  autoTrigger: boolean;
  timeout?: number;
  retries?: number;
  maxLoops?: number; // Maximum loops for iterative steps
  loopUntilSuccess?: boolean; // Keep looping until no issues found
  memoryEnabled?: boolean; // Remember previous feedback to avoid repetition
  dependencies?: string[]; // Step IDs that must complete first
  config: StepTypeConfig;
}

/**
 * Available step types
 */
export type StepType =
  | 'review' // General code review
  | 'security' // Security-focused review
  | 'performance' // Performance analysis
  | 'test' // Test coverage/quality
  | 'custom'; // Custom prompt-based step

/**
 * Union of all step type configurations
 */
export type StepTypeConfig =
  | ReviewConfig
  | SecurityConfig
  | PerformanceConfig
  | TestConfig
  | CustomConfig;

/**
 * Review step configuration
 */
export interface ReviewConfig {
  focus?: Array<'quality' | 'standards' | 'bugs' | 'best-practices'>;
  excludePatterns?: string[];
  maxIssues?: number;
  includeTests?: boolean;
}

/**
 * Security step configuration
 */
export interface SecurityConfig {
  checklist?: Array<string>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  excludeTests?: boolean;
}

/**
 * Performance step configuration
 */
export interface PerformanceConfig {
  metrics?: Array<'complexity' | 'memory' | 'cpu' | 'network' | 'bundle-size'>;
  thresholds?: Record<string, number>;
  profile?: boolean;
}

/**
 * Test step configuration
 */
export interface TestConfig {
  coverageThreshold?: number;
  checkQuality?: boolean;
  checkAssertions?: boolean;
  includeIntegration?: boolean;
  excludePatterns?: string[];
}

/**
 * Custom step configuration
 */
export interface CustomConfig {
  prompt: string;
  successCriteria?: string;
  coderabbitEnabled?: boolean;
  coderabbitRules?: string[];
  coderabbitSeverity?: string;
  coderabbitCustomRules?: string[];
  fallbackToAI?: boolean;
  maxIssues?: number;
  includeTests?: boolean;
}

/**
 * Pipeline step execution status
 */
export interface PipelineStep {
  id: string;
  status: StepStatus;
  result?: PipelineStepResult;
  startedAt?: string;
  completedAt?: string;
  iterations?: number;
  error?: string;
}

/**
 * Step execution status
 */
export type StepStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Result of a pipeline step execution
 */
export interface PipelineStepResult {
  status: 'passed' | 'failed' | 'error';
  output: string;
  metadata?: Record<string, unknown>;
  artifacts?: PipelineArtifact[];
  issues?: Array<{
    hash: string;
    summary: string;
    location?: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  iterations?: number;
}

/**
 * Artifact produced by a pipeline step
 */
export interface PipelineArtifact {
  type: 'file' | 'url' | 'text';
  content: string;
  name: string;
  location?: string;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  version: '1.0',
  enabled: false,
  onFailure: 'stop',
  steps: [],
};

/**
 * JSON Schema for pipeline configuration validation
 */
export const PIPELINE_CONFIG_SCHEMA = {
  type: 'object',
  required: ['version', 'enabled', 'steps'],
  properties: {
    version: { type: 'string' },
    enabled: { type: 'boolean' },
    parallel: { type: 'boolean' },
    timeout: { type: 'number', minimum: 1 },
    onFailure: {
      type: 'string',
      enum: ['stop', 'continue', 'skip-optional'],
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'name', 'model', 'required', 'autoTrigger', 'config'],
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: ['review', 'security', 'performance', 'test', 'custom'],
          },
          name: { type: 'string' },
          description: { type: 'string' },
          model: {
            oneOf: [
              { type: 'string', enum: ['opus', 'sonnet', 'haiku'] },
              { type: 'string', enum: ['different', 'same'] },
            ],
          },
          required: { type: 'boolean' },
          autoTrigger: { type: 'boolean' },
          timeout: { type: 'number', minimum: 1 },
          retries: { type: 'number', minimum: 0 },
          maxLoops: { type: 'number', minimum: 1 },
          loopUntilSuccess: { type: 'boolean' },
          memoryEnabled: { type: 'boolean' },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
          },
          config: { type: 'object' },
        },
      },
    },
  },
};
