/**
 * Facade Types - Type definitions for AutoModeServiceFacade
 *
 * Contains:
 * - FacadeOptions interface for factory configuration
 * - Re-exports of types from extracted services that routes might need
 * - Additional types for facade method signatures
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, ModelProvider } from '@automaker/types';
import type { SettingsService } from '../settings-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { ConcurrencyManager } from '../concurrency-manager.js';
import type { AutoLoopCoordinator } from '../auto-loop-coordinator.js';
import type { WorktreeResolver } from '../worktree-resolver.js';
import type { TypedEventBus } from '../typed-event-bus.js';
import type { ClaudeUsageService } from '../claude-usage-service.js';

// Re-export types from extracted services for route consumption
export type { AutoModeConfig, ProjectAutoLoopState } from '../auto-loop-coordinator.js';

export type { RunningFeature, AcquireParams } from '../concurrency-manager.js';

export type { WorktreeInfo } from '../worktree-resolver.js';

export type { PipelineContext, PipelineStatusInfo } from '../pipeline-orchestrator.js';

export type { PlanApprovalResult, ResolveApprovalResult } from '../plan-approval-service.js';

export type { ExecutionState } from '../recovery-service.js';

/**
 * Shared services that can be passed to facades to enable state sharing
 */
export interface SharedServices {
  /** TypedEventBus for typed event emission */
  eventBus: TypedEventBus;
  /** ConcurrencyManager for tracking running features across all projects */
  concurrencyManager: ConcurrencyManager;
  /** AutoLoopCoordinator for managing auto loop state across all projects */
  autoLoopCoordinator: AutoLoopCoordinator;
  /** WorktreeResolver for git worktree operations */
  worktreeResolver: WorktreeResolver;
}

/**
 * Options for creating an AutoModeServiceFacade instance
 */
export interface FacadeOptions {
  /** EventEmitter for broadcasting events to clients */
  events: EventEmitter;
  /** SettingsService for reading project/global settings (optional) */
  settingsService?: SettingsService | null;
  /** FeatureLoader for loading feature data (optional, defaults to new FeatureLoader()) */
  featureLoader?: FeatureLoader;
  /** Shared services for state sharing across facades (optional) */
  sharedServices?: SharedServices;
  /** ClaudeUsageService for checking usage limits before picking up features (optional) */
  claudeUsageService?: ClaudeUsageService | null;
}

/**
 * Status returned by getStatus()
 */
export interface AutoModeStatus {
  isRunning: boolean;
  runningFeatures: string[];
  runningCount: number;
}

/**
 * Status returned by getStatusForProject()
 */
export interface ProjectAutoModeStatus {
  isAutoLoopRunning: boolean;
  runningFeatures: string[];
  runningCount: number;
  maxConcurrency: number;
  branchName: string | null;
}

/**
 * Capacity info returned by checkWorktreeCapacity()
 */
export interface WorktreeCapacityInfo {
  hasCapacity: boolean;
  currentAgents: number;
  maxAgents: number;
  branchName: string | null;
}

/**
 * Running agent info returned by getRunningAgents()
 */
export interface RunningAgentInfo {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  model?: string;
  provider?: ModelProvider;
  title?: string;
  description?: string;
  branchName?: string;
}

/**
 * Orphaned feature info returned by detectOrphanedFeatures()
 */
export interface OrphanedFeatureInfo {
  feature: Feature;
  missingBranch: string;
}

/**
 * Structured error object returned/emitted by facade methods.
 * Provides consistent error information for callers and UI consumers.
 */
export interface FacadeError {
  /** The facade method where the error originated */
  method: string;
  /** Classified error type from the error handler */
  errorType: import('@automaker/types').ErrorType;
  /** Human-readable error message */
  message: string;
  /** Feature ID if the error is associated with a specific feature */
  featureId?: string;
  /** Project path where the error occurred */
  projectPath: string;
}

/**
 * Interface describing global auto-mode operations (not project-specific).
 * Used by routes that need global state access.
 */
export interface GlobalAutoModeOperations {
  /** Get global status (all projects combined) */
  getStatus(): AutoModeStatus;
  /** Get all active auto loop projects (unique project paths) */
  getActiveAutoLoopProjects(): string[];
  /** Get all active auto loop worktrees */
  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }>;
  /** Get detailed info about all running agents */
  getRunningAgents(): Promise<RunningAgentInfo[]>;
  /** Mark all running features as interrupted (for graceful shutdown) */
  markAllRunningFeaturesInterrupted(reason?: string): Promise<void>;
}
