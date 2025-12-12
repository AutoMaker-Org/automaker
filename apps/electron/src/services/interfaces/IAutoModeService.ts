/**
 * Auto Mode Service Interface
 * Manages autonomous feature implementation
 */

import type { ServiceResult, Subscription, IService } from "../types";
import type { AutoModeEvent } from "../types/events";

export interface AutoModeStatus {
  isRunning: boolean;
  autoLoopRunning: boolean;
  currentFeatureId: string | null;
  runningFeatures: string[];
  runningProjects?: string[];
  runningCount: number;
}

export interface AutoModeStopResult {
  runningFeatures: number;
}

export interface AutoModeRunResult {
  passes: boolean;
}

export interface AutoModeContextResult {
  exists: boolean;
}

export interface AutoModeAnalyzeResult {
  message: string;
}

export interface IAutoModeService extends IService {
  /**
   * Start auto mode for a project
   */
  start(projectPath: string, maxConcurrency?: number): Promise<ServiceResult>;

  /**
   * Stop auto mode for a project
   */
  stop(projectPath: string): Promise<ServiceResult<AutoModeStopResult>>;

  /**
   * Stop a specific feature execution
   */
  stopFeature(featureId: string): Promise<ServiceResult>;

  /**
   * Get auto mode status
   */
  status(projectPath?: string): Promise<ServiceResult<AutoModeStatus>>;

  /**
   * Run a single feature
   */
  runFeature(
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean
  ): Promise<ServiceResult<AutoModeRunResult>>;

  /**
   * Verify a feature implementation
   */
  verifyFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>>;

  /**
   * Resume a feature with previous context
   */
  resumeFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>>;

  /**
   * Check if context exists for a feature
   */
  contextExists(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeContextResult>>;

  /**
   * Analyze a project's structure and tech stack
   */
  analyzeProject(
    projectPath: string
  ): Promise<ServiceResult<AutoModeAnalyzeResult>>;

  /**
   * Send a follow-up prompt for a feature
   */
  followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ): Promise<ServiceResult>;

  /**
   * Commit changes for a feature
   */
  commitFeature(projectPath: string, featureId: string): Promise<ServiceResult>;

  /**
   * Subscribe to auto mode events
   */
  onEvent(callback: (event: AutoModeEvent) => void): Subscription;
}

// Re-export AutoModeEvent for convenience
export type { AutoModeEvent } from "../types/events";
