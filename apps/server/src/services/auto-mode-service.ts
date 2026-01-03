/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import { ProviderFactory } from '../providers/provider-factory.js';
import type {
  ExecuteOptions,
  Feature,
  FeatureStatusWithPipeline,
  PipelineConfig,
  PipelineStep,
} from '@automaker/types';
import {
  buildPromptWithImages,
  isAbortError,
  classifyError,
  loadContextFiles,
} from '@automaker/utils';
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import { resolveDependencies, areDependenciesSatisfied } from '@automaker/dependency-resolver';
import { getFeatureDir, getAutomakerDir, getFeaturesDir } from '@automaker/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import {
  createAutoModeOptions,
  createCustomOptions,
  validateWorkingDirectory,
} from '../lib/sdk-options.js';
import { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { pipelineService, PipelineService } from './pipeline-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getEnableSandboxModeSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getMCPPermissionSettings,
  getPromptCustomization,
} from '../lib/settings-helpers.js';

const execAsync = promisify(exec);

// Planning mode types for spec-driven development
type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string;
  version: number;
  generatedAt?: string;
  approvedAt?: string;
  reviewedByUser: boolean;
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string;
  tasks?: ParsedTask[];
}

/**
 * Information about pipeline status when resuming a feature.
 * Used to determine how to handle features stuck in pipeline execution.
 *
 * @property {boolean} isPipeline - Whether the feature is in a pipeline step
 * @property {string | null} stepId - ID of the current pipeline step (e.g., 'step_123')
 * @property {number} stepIndex - Index of the step in the sorted pipeline steps (-1 if not found)
 * @property {number} totalSteps - Total number of steps in the pipeline
 * @property {PipelineStep | null} step - The pipeline step configuration, or null if step not found
 * @property {PipelineConfig | null} config - The full pipeline configuration, or null if no pipeline
 */
interface PipelineStatusInfo {
  isPipeline: boolean;
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
  step: PipelineStep | null;
  config: PipelineConfig | null;
}

/**
 * Parse tasks from generated spec content
 * Looks for the ```tasks code block and extracts task lines
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTasksFromSpec(specContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Extract content within ```tasks ... ``` block
  const tasksBlockMatch = specContent.match(/```tasks\s*([\s\S]*?)```/);
  if (!tasksBlockMatch) {
    // Try fallback: look for task lines anywhere in content
    const taskLines = specContent.match(/- \[ \] T\d{3}:.*$/gm);
    if (!taskLines) {
      return tasks;
    }
    // Parse fallback task lines
    let currentPhase: string | undefined;
    for (const line of taskLines) {
      const parsed = parseTaskLine(line, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
    return tasks;
  }

  const tasksContent = tasksBlockMatch[1];
  const lines = tasksContent.split('\n');

  let currentPhase: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for phase header (e.g., "## Phase 1: Foundation")
    const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Check for task line
    if (trimmedLine.startsWith('- [ ]')) {
      const parsed = parseTaskLine(trimmedLine, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
  }

  return tasks;
}

/**
 * Parse a single task line
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
  // Match pattern: - [ ] T###: Description | File: path
  const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
  if (!taskMatch) {
    // Try simpler pattern without file
    const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
    if (simpleMatch) {
      return {
        id: simpleMatch[1],
        description: simpleMatch[2].trim(),
        phase: currentPhase,
        status: 'pending',
      };
    }
    return null;
  }

  return {
    id: taskMatch[1],
    description: taskMatch[2].trim(),
    filePath: taskMatch[3]?.trim(),
    phase: currentPhase,
    status: 'pending',
  };
}

// Feature type is imported from feature-loader.js
// Extended type with planning fields for local use
interface FeatureWithPlanning extends Feature {
  planningMode?: PlanningMode;
  planSpec?: PlanSpec;
  requirePlanApproval?: boolean;
}

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
}

interface AutoLoopState {
  projectPath: string;
  maxConcurrency: number;
  abortController: AbortController;
  isRunning: boolean;
}

interface PendingApproval {
  resolve: (result: { approved: boolean; editedPlan?: string; feedback?: string }) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
}

// Constants for consecutive failure tracking
const CONSECUTIVE_FAILURE_THRESHOLD = 3; // Pause after 3 consecutive failures
const FAILURE_WINDOW_MS = 60000; // Failures within 1 minute count as consecutive

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoop: AutoLoopState | null = null;
  private featureLoader = new FeatureLoader();
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  private settingsService: SettingsService | null = null;
  // Track consecutive failures to detect quota/API issues
  private consecutiveFailures: { timestamp: number; error: string }[] = [];
  private pausedDueToFailures = false;

  constructor(events: EventEmitter, settingsService?: SettingsService) {
    this.events = events;
    this.settingsService = settingsService ?? null;
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures.
   * This handles cases where the SDK doesn't return useful error messages.
   */
  private trackFailureAndCheckPause(errorInfo: { type: string; message: string }): boolean {
    const now = Date.now();

    // Add this failure
    this.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    this.consecutiveFailures = this.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (this.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      return true; // Should pause
    }

    // Also immediately pause for known quota/rate limit errors
    if (errorInfo.type === 'quota_exhausted' || errorInfo.type === 'rate_limit') {
      return true;
    }

    return false;
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion.
   * This will pause the auto loop to prevent repeated failures.
   */
  private signalShouldPause(errorInfo: { type: string; message: string }): void {
    if (this.pausedDueToFailures) {
      return; // Already paused
    }

    this.pausedDueToFailures = true;
    const failureCount = this.consecutiveFailures.length;
    console.log(
      `[AutoMode] Pausing auto loop after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    this.emitAutoModeEvent('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. This may indicate a quota limit or API issue. Please check your usage and try again.`
          : 'Auto Mode paused: Usage limit or API error detected. Please wait for your quota to reset or check your API configuration.',
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath: this.config?.projectPath,
    });

    // Stop the auto loop
    this.stopAutoLoop();
  }

  /**
   * Reset failure tracking (called when user manually restarts auto mode)
   */
  private resetFailureTracking(): void {
    this.consecutiveFailures = [];
    this.pausedDueToFailures = false;
  }

  /**
   * Record a successful feature completion to reset consecutive failure count
   */
  private recordSuccess(): void {
    this.consecutiveFailures = [];
  }

  /**
   * Start the auto mode loop - continuously picks and executes pending features
   */
  async startAutoLoop(projectPath: string, maxConcurrency = 3): Promise<void> {
    if (this.autoLoopRunning) {
      throw new Error('Auto mode is already running');
    }

    // Reset failure tracking when user manually starts auto mode
    this.resetFailureTracking();

    this.autoLoopRunning = true;
    this.autoLoopAbortController = new AbortController();
    this.config = {
      maxConcurrency,
      useWorktrees: true,
      projectPath,
    };

    this.emitAutoModeEvent('auto_mode_started', {
      message: `Auto mode started with max ${maxConcurrency} concurrent features`,
      projectPath,
    });

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      console.error('[AutoMode] Loop error:', error);
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        error: errorInfo.message,
        errorType: errorInfo.type,
      });
    });
  }

  private async runAutoLoop(): Promise<void> {
    while (
      this.autoLoopRunning &&
      this.autoLoopAbortController &&
      !this.autoLoopAbortController.signal.aborted
    ) {
      try {
        // Check if we have capacity
        if (this.runningFeatures.size >= (this.config?.maxConcurrency || 3)) {
          await this.sleep(5000);
          continue;
        }

        // Load pending features
        const pendingFeatures = await this.loadPendingFeatures(this.config!.projectPath);

        if (pendingFeatures.length === 0) {
          this.emitAutoModeEvent('auto_mode_idle', {
            message: 'No pending features - auto mode idle',
            projectPath: this.config!.projectPath,
          });
          await this.sleep(10000);
          continue;
        }

        // Find a feature not currently running
        const nextFeature = pendingFeatures.find((f) => !this.runningFeatures.has(f.id));

        if (nextFeature) {
          // Start feature execution in background
          this.executeFeature(
            this.config!.projectPath,
            nextFeature.id,
            this.config!.useWorktrees,
            true
          ).catch((error) => {
            console.error(`[AutoMode] Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        console.error('[AutoMode] Loop iteration error:', error);
        await this.sleep(5000);
      }
    }

    this.autoLoopRunning = false;
  }

  /**
   * Stop the auto mode loop
   */
  async stopAutoLoop(): Promise<number> {
    const wasRunning = this.autoLoopRunning;
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Emit stop event immediately when user explicitly stops
    if (wasRunning) {
      this.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath: this.config?.projectPath,
      });
    }

    return this.runningFeatures.size;
  }

  /**
   * Execute a single feature
   * @param projectPath - The main project path
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: {
      continuationPrompt?: string;
    }
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error('already running');
    }

    // Add to running features immediately to prevent race conditions
    const abortController = new AbortController();
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null,
      abortController,
      isAutoMode,
      startTime: Date.now(),
    };
    this.runningFeatures.set(featureId, tempRunningFeature);

    try {
      // Validate that project path is allowed using centralized validation
      validateWorkingDirectory(projectPath);

      // Check if feature has existing context - if so, resume instead of starting fresh
      // Skip this check if we're already being called with a continuation prompt (from resumeFeature)
      if (!options?.continuationPrompt) {
        const hasExistingContext = await this.contextExists(projectPath, featureId);
        if (hasExistingContext) {
          console.log(
            `[AutoMode] Feature ${featureId} has existing context, resuming instead of starting fresh`
          );
          // Remove from running features temporarily, resumeFeature will add it back
          this.runningFeatures.delete(featureId);
          return this.resumeFeature(projectPath, featureId, useWorktrees);
        }
      }

      // Emit feature start event early
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        feature: {
          id: featureId,
          title: 'Loading...',
          description: 'Feature is starting',
        },
      });
      // Load feature details FIRST to get branchName
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Derive workDir from feature.branchName
      // Worktrees should already be created when the feature is added/edited
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        // Try to find existing worktree for this branch
        // Worktree should already exist (created when feature was added/edited)
        worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

        if (worktreePath) {
          console.log(`[AutoMode] Using worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          // Worktree doesn't exist - log warning and continue with project path
          console.warn(
            `[AutoMode] Worktree for branch "${branchName}" not found, using project path`
          );
        }
      }

      // Ensure workDir is always an absolute path for cross-platform compatibility
      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // Validate that working directory is allowed using centralized validation
      validateWorkingDirectory(workDir);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;
      tempRunningFeature.branchName = branchName ?? null;

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Load autoLoadClaudeMd setting to determine context loading strategy
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Build the prompt - use continuation prompt if provided (for recovery after plan approval)
      let prompt: string;
      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        // Continuation prompt is used when recovering from a plan approval
        // The plan was already approved, so skip the planning phase
        prompt = options.continuationPrompt;
        console.log(`[AutoMode] Using continuation prompt for feature ${featureId}`);
      } else {
        // Normal flow: build prompt with planning phase
        const featurePrompt = this.buildFeaturePrompt(feature);
        const planningPrefix = await this.getPlanningPromptPrefix(feature);
        prompt = planningPrefix + featurePrompt;

        // Emit planning mode info
        if (feature.planningMode && feature.planningMode !== 'skip') {
          this.emitAutoModeEvent('planning_started', {
            featureId: feature.id,
            mode: feature.planningMode,
            message: `Starting ${feature.planningMode} planning phase`,
          });
        }
      }

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === 'string' ? img : img.path
      );

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      console.log(`[AutoMode] Executing feature ${featureId} with model: ${model} in ${workDir}`);

      // Run the agent with the feature's model and images
      // Context files are passed as system prompt for higher priority
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        model,
        {
          projectPath,
          planningMode: feature.planningMode,
          requirePlanApproval: feature.requirePlanApproval,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
        }
      );

      // Check for pipeline steps and execute them
      const pipelineConfig = await pipelineService.getPipelineConfig(projectPath);
      const sortedSteps = [...(pipelineConfig?.steps || [])].sort((a, b) => a.order - b.order);

      if (sortedSteps.length > 0) {
        // Execute pipeline steps sequentially
        await this.executePipelineSteps(
          projectPath,
          featureId,
          feature,
          sortedSteps,
          workDir,
          abortController,
          autoLoadClaudeMd
        );
      }

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): go directly to 'verified' (no manual verify needed)
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccess();

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round(
          (Date.now() - tempRunningFeature.startTime) / 1000
        )}s${finalStatus === 'verified' ? ' - auto-verified' : ''}`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          passes: false,
          message: 'Feature stopped by user',
          projectPath,
        });
      } else {
        console.error(`[AutoMode] Feature ${featureId} failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, 'backlog');
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });

        // Track this failure and check if we should pause auto mode
        // This handles both specific quota/rate limit errors AND generic failures
        // that may indicate quota exhaustion (SDK doesn't always return useful errors)
        const shouldPause = this.trackFailureAndCheckPause({
          type: errorInfo.type,
          message: errorInfo.message,
        });

        if (shouldPause) {
          this.signalShouldPause({
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      console.log(`[AutoMode] Feature ${featureId} execution ended, cleaning up runningFeatures`);
      console.log(
        `[AutoMode] Pending approvals at cleanup: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
      );
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Execute pipeline steps sequentially after initial feature implementation
   */
  private async executePipelineSteps(
    projectPath: string,
    featureId: string,
    feature: Feature,
    steps: PipelineStep[],
    workDir: string,
    abortController: AbortController,
    autoLoadClaudeMd: boolean
  ): Promise<void> {
    console.log(`[AutoMode] Executing ${steps.length} pipeline step(s) for feature ${featureId}`);

    // Load context files once
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
    });
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Load previous agent output for context continuity
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const pipelineStatus = `pipeline_${step.id}`;

      // Update feature status to current pipeline step
      await this.updateFeatureStatus(projectPath, featureId, pipelineStatus);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: `Starting pipeline step ${i + 1}/${steps.length}: ${step.name}`,
        projectPath,
      });

      this.emitAutoModeEvent('pipeline_step_started', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      // Build prompt for this pipeline step
      const prompt = this.buildPipelineStepPrompt(step, feature, previousContext);

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);

      // Run the agent for this pipeline step
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        undefined, // no images for pipeline steps
        model,
        {
          projectPath,
          planningMode: 'skip', // Pipeline steps don't need planning
          requirePlanApproval: false,
          previousContent: previousContext,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
        }
      );

      // Load updated context for next step
      try {
        previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      } catch {
        // No context update
      }

      this.emitAutoModeEvent('pipeline_step_complete', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      console.log(
        `[AutoMode] Pipeline step ${i + 1}/${steps.length} (${step.name}) completed for feature ${featureId}`
      );
    }

    console.log(`[AutoMode] All pipeline steps completed for feature ${featureId}`);
  }

  /**
   * Build the prompt for a pipeline step
   */
  private buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string
  ): string {
    let prompt = `## Pipeline Step: ${step.name}

This is an automated pipeline step following the initial feature implementation.

### Feature Context
${this.buildFeaturePrompt(feature)}

`;

    if (previousContext) {
      prompt += `### Previous Work
The following is the output from the previous work on this feature:

${previousContext}

`;
    }

    prompt += `### Pipeline Step Instructions
${step.instructions}

### Task
Complete the pipeline step instructions above. Review the previous work and apply the required changes or actions.`;

    return prompt;
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    // Cancel any pending plan approval for this feature
    this.cancelPlanApproval(featureId);

    running.abortController.abort();

    // Remove from running features immediately to allow resume
    // The abort signal will still propagate to stop any ongoing execution
    this.runningFeatures.delete(featureId);

    return true;
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(projectPath: string, featureId: string, useWorktrees = false): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error('already running');
    }

    // Load feature to check status
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Check if feature is stuck in a pipeline step
    const pipelineInfo = await this.detectPipelineStatus(
      projectPath,
      featureId,
      (feature.status || '') as FeatureStatusWithPipeline
    );

    if (pipelineInfo.isPipeline) {
      // Feature stuck in pipeline - use pipeline resume
      return this.resumePipelineFeature(projectPath, feature, useWorktrees, pipelineInfo);
    }

    // Normal resume flow for non-pipeline features
    // Check if context exists in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      return this.executeFeatureWithContext(projectPath, featureId, context, useWorktrees);
    }

    // No context, start fresh - executeFeature will handle adding to runningFeatures
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Resume a feature that crashed during pipeline execution.
   * Handles multiple edge cases to ensure robust recovery:
   * - No context file: Restart entire pipeline from beginning
   * - Step deleted from config: Complete feature without remaining pipeline steps
   * - Valid step exists: Resume from the crashed step and continue
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {Feature} feature - The feature object (already loaded to avoid redundant reads)
   * @param {boolean} useWorktrees - Whether to use git worktrees for isolation
   * @param {PipelineStatusInfo} pipelineInfo - Information about the pipeline status from detectPipelineStatus()
   * @returns {Promise<void>} Resolves when resume operation completes or throws on error
   * @throws {Error} If pipeline config is null but stepIndex is valid (should never happen)
   * @private
   */
  private async resumePipelineFeature(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    pipelineInfo: PipelineStatusInfo
  ): Promise<void> {
    const featureId = feature.id;
    console.log(
      `[AutoMode] Resuming feature ${featureId} from pipeline step ${pipelineInfo.stepId}`
    );

    // Check for context file
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    // Edge Case 1: No context file - restart entire pipeline from beginning
    if (!hasContext) {
      console.warn(
        `[AutoMode] No context found for pipeline feature ${featureId}, restarting from beginning`
      );

      // Reset status to in_progress and start fresh
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      return this.executeFeature(projectPath, featureId, useWorktrees, false);
    }

    // Edge Case 2: Step no longer exists in pipeline config
    if (pipelineInfo.stepIndex === -1) {
      console.warn(
        `[AutoMode] Step ${pipelineInfo.stepId} no longer exists in pipeline, completing feature without pipeline`
      );

      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message:
          'Pipeline step no longer exists - feature completed without remaining pipeline steps',
        projectPath,
      });

      return;
    }

    // Normal case: Valid pipeline step exists, has context
    // Resume from the stuck step (re-execute the step that crashed)
    if (!pipelineInfo.config) {
      throw new Error('Pipeline config is null but stepIndex is valid - this should not happen');
    }

    return this.resumeFromPipelineStep(
      projectPath,
      feature,
      useWorktrees,
      pipelineInfo.stepIndex,
      pipelineInfo.config
    );
  }

  /**
   * Resume pipeline execution from a specific step index.
   * Re-executes the step that crashed (to handle partial completion),
   * then continues executing all remaining pipeline steps in order.
   *
   * This method handles the complete pipeline resume workflow:
   * - Validates feature and step index
   * - Locates or creates git worktree if needed
   * - Executes remaining steps starting from the crashed step
   * - Updates feature status to verified/waiting_approval when complete
   * - Emits progress events throughout execution
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {Feature} feature - The feature object (already loaded to avoid redundant reads)
   * @param {boolean} useWorktrees - Whether to use git worktrees for isolation
   * @param {number} startFromStepIndex - Zero-based index of the step to resume from
   * @param {PipelineConfig} pipelineConfig - Pipeline config passed from detectPipelineStatus to avoid re-reading
   * @returns {Promise<void>} Resolves when pipeline execution completes successfully
   * @throws {Error} If feature not found, step index invalid, or pipeline execution fails
   * @private
   */
  private async resumeFromPipelineStep(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    startFromStepIndex: number,
    pipelineConfig: PipelineConfig
  ): Promise<void> {
    const featureId = feature.id;

    const sortedSteps = [...pipelineConfig.steps].sort((a, b) => a.order - b.order);

    // Validate step index
    if (startFromStepIndex < 0 || startFromStepIndex >= sortedSteps.length) {
      throw new Error(`Invalid step index: ${startFromStepIndex}`);
    }

    // Get steps to execute (from startFromStepIndex onwards)
    const stepsToExecute = sortedSteps.slice(startFromStepIndex);

    console.log(
      `[AutoMode] Resuming pipeline for feature ${featureId} from step ${startFromStepIndex + 1}/${sortedSteps.length}`
    );

    // Add to running features immediately
    const abortController = new AbortController();
    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath: null, // Will be set below
      branchName: feature.branchName ?? null,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    });

    try {
      // Validate project path
      validateWorkingDirectory(projectPath);

      // Derive workDir from feature.branchName
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);
        if (worktreePath) {
          console.log(`[AutoMode] Using worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          console.warn(
            `[AutoMode] Worktree for branch "${branchName}" not found, using project path`
          );
        }
      }

      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);
      validateWorkingDirectory(workDir);

      // Update running feature with worktree info
      const runningFeature = this.runningFeatures.get(featureId);
      if (runningFeature) {
        runningFeature.worktreePath = worktreePath;
        runningFeature.branchName = branchName ?? null;
      }

      // Emit resume event
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        feature: {
          id: featureId,
          title: feature.title || 'Resuming Pipeline',
          description: feature.description,
        },
      });

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: `Resuming from pipeline step ${startFromStepIndex + 1}/${sortedSteps.length}`,
        projectPath,
      });

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Execute remaining pipeline steps (starting from crashed step)
      await this.executePipelineSteps(
        projectPath,
        featureId,
        feature,
        stepsToExecute,
        workDir,
        abortController,
        autoLoadClaudeMd
      );

      // Determine final status
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      console.log('[AutoMode] Pipeline resume completed successfully');

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: 'Pipeline resumed and completed successfully',
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          passes: false,
          message: 'Pipeline resume stopped by user',
          projectPath,
        });
      } else {
        console.error(`[AutoMode] Pipeline resume failed for feature ${featureId}:`, error);
        await this.updateFeatureStatus(projectPath, featureId, 'backlog');
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    // Validate project path early for fast failure
    validateWorkingDirectory(projectPath);

    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Load feature info for context FIRST to get branchName
    const feature = await this.loadFeature(projectPath, featureId);

    // Derive workDir from feature.branchName
    // If no branchName, derive from feature ID: feature/{featureId}
    let workDir = path.resolve(projectPath);
    let worktreePath: string | null = null;
    const branchName = feature?.branchName || `feature/${featureId}`;

    if (useWorktrees && branchName) {
      // Try to find existing worktree for this branch
      worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

      if (worktreePath) {
        workDir = worktreePath;
        console.log(`[AutoMode] Follow-up using worktree for branch "${branchName}": ${workDir}`);
      }
    }

    // Load previous agent output if it exists
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    // Load autoLoadClaudeMd setting to determine context loading strategy
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      this.settingsService,
      '[AutoMode]'
    );

    // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
    });

    // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
    // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    });

    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId,
      projectPath,
      feature: feature || {
        id: featureId,
        title: 'Follow-up',
        description: prompt.substring(0, 100),
      },
    });

    try {
      // Get model from feature (already loaded above)
      const model = resolveModelString(feature?.model, DEFAULT_MODELS.claude);
      console.log(`[AutoMode] Follow-up for feature ${featureId} using model: ${model}`);

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Copy follow-up images to feature folder
      const copiedImagePaths: string[] = [];
      if (imagePaths && imagePaths.length > 0) {
        const featureDirForImages = getFeatureDir(projectPath, featureId);
        const featureImagesDir = path.join(featureDirForImages, 'images');

        await secureFs.mkdir(featureImagesDir, { recursive: true });

        for (const imagePath of imagePaths) {
          try {
            // Get the filename from the path
            const filename = path.basename(imagePath);
            const destPath = path.join(featureImagesDir, filename);

            // Copy the image
            await secureFs.copyFile(imagePath, destPath);

            // Store the absolute path (external storage uses absolute paths)
            copiedImagePaths.push(destPath);
          } catch (error) {
            console.error(`[AutoMode] Failed to copy follow-up image ${imagePath}:`, error);
          }
        }
      }

      // Update feature object with new follow-up images BEFORE building prompt
      if (copiedImagePaths.length > 0 && feature) {
        const currentImagePaths = feature.imagePaths || [];
        const newImagePaths = copiedImagePaths.map((p) => ({
          path: p,
          filename: path.basename(p),
          mimeType: 'image/png', // Default, could be improved
        }));

        feature.imagePaths = [...currentImagePaths, ...newImagePaths];
      }

      // Combine original feature images with new follow-up images
      const allImagePaths: string[] = [];

      // Add all images from feature (now includes both original and new)
      if (feature?.imagePaths) {
        const allPaths = feature.imagePaths.map((img) =>
          typeof img === 'string' ? img : img.path
        );
        allImagePaths.push(...allPaths);
      }

      // Save updated feature.json with new images
      if (copiedImagePaths.length > 0 && feature) {
        const featureDirForSave = getFeatureDir(projectPath, featureId);
        const featurePath = path.join(featureDirForSave, 'feature.json');

        try {
          await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
        } catch (error) {
          console.error(`[AutoMode] Failed to save feature.json:`, error);
        }
      }

      // Use fullPrompt (already built above) with model and all images
      // Note: Follow-ups skip planning mode - they continue from previous work
      // Pass previousContext so the history is preserved in the output file
      // Context files are passed as system prompt for higher priority
      await this.runAgent(
        workDir,
        featureId,
        fullPrompt,
        abortController,
        projectPath,
        allImagePaths.length > 0 ? allImagePaths : imagePaths,
        model,
        {
          projectPath,
          planningMode: 'skip', // Follow-ups don't require approval
          previousContent: previousContext || undefined,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
        }
      );

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): go directly to 'verified' (no manual verify needed)
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      const finalStatus = feature?.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccess();

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Follow-up completed successfully${finalStatus === 'verified' ? ' - auto-verified' : ''}`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      if (!errorInfo.isCancellation) {
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });

        // Track this failure and check if we should pause auto mode
        const shouldPause = this.trackFailureAndCheckPause({
          type: errorInfo.type,
          message: errorInfo.message,
        });

        if (shouldPause) {
          this.signalShouldPause({
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {
    // Worktrees are in project dir
    const worktreePath = path.join(projectPath, '.worktrees', featureId);
    let workDir = projectPath;

    try {
      await secureFs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: 'npm run lint', name: 'Lint' },
      { cmd: 'npm run typecheck', name: 'Type check' },
      { cmd: 'npm test', name: 'Tests' },
      { cmd: 'npm run build', name: 'Build' },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> = [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({
          check: check.name,
          passed: true,
          output: stdout || stderr,
        });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent('auto_mode_feature_complete', {
      featureId,
      passes: allPassed,
      message: allPassed
        ? 'All verification checks passed'
        : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   * @param projectPath - The main project path
   * @param featureId - The feature ID to commit
   * @param providedWorktreePath - Optional: the worktree path where the feature's changes are located
   */
  async commitFeature(
    projectPath: string,
    featureId: string,
    providedWorktreePath?: string
  ): Promise<string | null> {
    let workDir = projectPath;

    // Use the provided worktree path if given
    if (providedWorktreePath) {
      try {
        await secureFs.access(providedWorktreePath);
        workDir = providedWorktreePath;
        console.log(`[AutoMode] Committing in provided worktree: ${workDir}`);
      } catch {
        console.log(
          `[AutoMode] Provided worktree path doesn't exist: ${providedWorktreePath}, using project path`
        );
      }
    } else {
      // Fallback: try to find worktree at legacy location
      const legacyWorktreePath = path.join(projectPath, '.worktrees', featureId);
      try {
        await secureFs.access(legacyWorktreePath);
        workDir = legacyWorktreePath;
        console.log(`[AutoMode] Committing in legacy worktree: ${workDir}`);
      } catch {
        console.log(`[AutoMode] No worktree found, committing in project path: ${workDir}`);
      }
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
      });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${this.extractTitleFromDescription(
            feature.description
          )}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync('git add -A', { cwd: workDir });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', {
        cwd: workDir,
      });

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
      });

      return hash.trim();
    } catch (error) {
      console.error(`[AutoMode] Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature
   */
  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    // Context is stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    try {
      await secureFs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId: analysisFeatureId,
      projectPath,
      feature: {
        id: analysisFeatureId,
        title: 'Project Analysis',
        description: 'Analyzing project structure',
      },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      // Use default Claude model for analysis (can be overridden in the future)
      const analysisModel = resolveModelString(undefined, DEFAULT_MODELS.claude);
      const provider = ProviderFactory.getProviderForModel(analysisModel);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Use createCustomOptions for centralized SDK configuration with CLAUDE.md support
      const sdkOptions = createCustomOptions({
        cwd: projectPath,
        model: analysisModel,
        maxTurns: 5,
        allowedTools: ['Read', 'Glob', 'Grep'],
        abortController,
        autoLoadClaudeMd,
      });

      const options: ExecuteOptions = {
        prompt,
        model: sdkOptions.model ?? analysisModel,
        cwd: sdkOptions.cwd ?? projectPath,
        maxTurns: sdkOptions.maxTurns,
        allowedTools: sdkOptions.allowedTools as string[],
        abortController,
        settingSources: sdkOptions.settingSources,
        sandbox: sdkOptions.sandbox, // Pass sandbox configuration
      };

      const stream = provider.executeQuery(options);
      let analysisResult = '';

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              analysisResult = block.text || '';
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis to .automaker directory
      const automakerDir = getAutomakerDir(projectPath);
      const analysisPath = path.join(automakerDir, 'project-analysis.md');
      await secureFs.mkdir(automakerDir, { recursive: true });
      await secureFs.writeFile(analysisPath, analysisResult);

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId: analysisFeatureId,
        passes: true,
        message: 'Project analysis completed',
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        featureId: analysisFeatureId,
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.runningFeatures.size > 0,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get detailed info about all running agents
   */
  async getRunningAgents(): Promise<
    Array<{
      featureId: string;
      projectPath: string;
      projectName: string;
      isAutoMode: boolean;
      title?: string;
      description?: string;
    }>
  > {
    const agents = await Promise.all(
      Array.from(this.runningFeatures.values()).map(async (rf) => {
        // Try to fetch feature data to get title and description
        let title: string | undefined;
        let description: string | undefined;

        try {
          const feature = await this.featureLoader.get(rf.projectPath, rf.featureId);
          if (feature) {
            title = feature.title;
            description = feature.description;
          }
        } catch (error) {
          // Silently ignore errors - title/description are optional
        }

        return {
          featureId: rf.featureId,
          projectPath: rf.projectPath,
          projectName: path.basename(rf.projectPath),
          isAutoMode: rf.isAutoMode,
          title,
          description,
        };
      })
    );
    return agents;
  }

  /**
   * Wait for plan approval from the user.
   * Returns a promise that resolves when the user approves/rejects the plan.
   */
  waitForPlanApproval(
    featureId: string,
    projectPath: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }> {
    console.log(`[AutoMode] Registering pending approval for feature ${featureId}`);
    console.log(
      `[AutoMode] Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(featureId, {
        resolve,
        reject,
        featureId,
        projectPath,
      });
      console.log(`[AutoMode] Pending approval registered for feature ${featureId}`);
    });
  }

  /**
   * Resolve a pending plan approval.
   * Called when the user approves or rejects the plan via API.
   */
  async resolvePlanApproval(
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string,
    projectPathFromClient?: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log(
      `[AutoMode] resolvePlanApproval called for feature ${featureId}, approved=${approved}`
    );
    console.log(
      `[AutoMode] Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);

    if (!pending) {
      console.log(`[AutoMode] No pending approval in Map for feature ${featureId}`);

      // RECOVERY: If no pending approval but we have projectPath from client,
      // check if feature's planSpec.status is 'generated' and handle recovery
      if (projectPathFromClient) {
        console.log(`[AutoMode] Attempting recovery with projectPath: ${projectPathFromClient}`);
        const feature = await this.loadFeature(projectPathFromClient, featureId);

        if (feature?.planSpec?.status === 'generated') {
          console.log(
            `[AutoMode] Feature ${featureId} has planSpec.status='generated', performing recovery`
          );

          if (approved) {
            // Update planSpec to approved
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'approved',
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
              content: editedPlan || feature.planSpec.content,
            });

            // Build continuation prompt and re-run the feature
            const planContent = editedPlan || feature.planSpec.content || '';
            let continuationPrompt = `The plan/specification has been approved. `;
            if (feedback) {
              continuationPrompt += `\n\nUser feedback: ${feedback}\n\n`;
            }
            continuationPrompt += `Now proceed with the implementation as specified in the plan:\n\n${planContent}\n\nImplement the feature now.`;

            console.log(`[AutoMode] Starting recovery execution for feature ${featureId}`);

            // Start feature execution with the continuation prompt (async, don't await)
            // Pass undefined for providedWorktreePath, use options for continuation prompt
            this.executeFeature(projectPathFromClient, featureId, true, false, undefined, {
              continuationPrompt,
            }).catch((error) => {
              console.error(
                `[AutoMode] Recovery execution failed for feature ${featureId}:`,
                error
              );
            });

            return { success: true };
          } else {
            // Rejected - update status and emit event
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'rejected',
              reviewedByUser: true,
            });

            await this.updateFeatureStatus(projectPathFromClient, featureId, 'backlog');

            this.emitAutoModeEvent('plan_rejected', {
              featureId,
              projectPath: projectPathFromClient,
              feedback,
            });

            return { success: true };
          }
        }
      }

      console.log(
        `[AutoMode] ERROR: No pending approval found for feature ${featureId} and recovery not possible`
      );
      return {
        success: false,
        error: `No pending approval for feature ${featureId}`,
      };
    }
    console.log(`[AutoMode] Found pending approval for feature ${featureId}, proceeding...`);

    const { projectPath } = pending;

    // Update feature's planSpec status
    await this.updateFeaturePlanSpec(projectPath, featureId, {
      status: approved ? 'approved' : 'rejected',
      approvedAt: approved ? new Date().toISOString() : undefined,
      reviewedByUser: true,
      content: editedPlan, // Update content if user provided an edited version
    });

    // If rejected with feedback, we can store it for the user to see
    if (!approved && feedback) {
      // Emit event so client knows the rejection reason
      this.emitAutoModeEvent('plan_rejected', {
        featureId,
        projectPath,
        feedback,
      });
    }

    // Resolve the promise with all data including feedback
    pending.resolve({ approved, editedPlan, feedback });
    this.pendingApprovals.delete(featureId);

    return { success: true };
  }

  /**
   * Cancel a pending plan approval (e.g., when feature is stopped).
   */
  cancelPlanApproval(featureId: string): void {
    console.log(`[AutoMode] cancelPlanApproval called for feature ${featureId}`);
    console.log(
      `[AutoMode] Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);
    if (pending) {
      console.log(`[AutoMode] Found and cancelling pending approval for feature ${featureId}`);
      pending.reject(new Error('Plan approval cancelled - feature was stopped'));
      this.pendingApprovals.delete(featureId);
    } else {
      console.log(`[AutoMode] No pending approval to cancel for feature ${featureId}`);
    }
  }

  /**
   * Check if a feature has a pending plan approval.
   */
  hasPendingApproval(featureId: string): boolean {
    return this.pendingApprovals.has(featureId);
  }

  // Private helpers

  /**
   * Find an existing worktree for a given branch by checking git worktree list
   */
  private async findExistingWorktreeForBranch(
    projectPath: string,
    branchName: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '' && currentPath && currentBranch) {
          // End of a worktree entry
          if (currentBranch === branchName) {
            // Resolve to absolute path - git may return relative paths
            // On Windows, this is critical for cwd to work correctly
            // On all platforms, absolute paths ensure consistent behavior
            const resolvedPath = path.isAbsolute(currentPath)
              ? path.resolve(currentPath)
              : path.resolve(projectPath, currentPath);
            return resolvedPath;
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check the last entry (if file doesn't end with newline)
      if (currentPath && currentBranch && currentBranch === branchName) {
        // Resolve to absolute path for cross-platform compatibility
        const resolvedPath = path.isAbsolute(currentPath)
          ? path.resolve(currentPath)
          : path.resolve(projectPath, currentPath);
        return resolvedPath;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch {
      // Feature file may not exist
    }
  }

  /**
   * Update the planSpec of a feature
   */
  private async updateFeaturePlanSpec(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanSpec>
  ): Promise<void> {
    const featurePath = path.join(projectPath, '.automaker', 'features', featureId, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      const feature = JSON.parse(data);

      // Initialize planSpec if it doesn't exist
      if (!feature.planSpec) {
        feature.planSpec = {
          status: 'pending',
          version: 1,
          reviewedByUser: false,
        };
      }

      // Apply updates
      Object.assign(feature.planSpec, updates);

      // If content is being updated and it's a new version, increment version
      if (updates.content && updates.content !== feature.planSpec.content) {
        feature.planSpec.version = (feature.planSpec.version || 0) + 1;
      }

      feature.updatedAt = new Date().toISOString();
      await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch (error) {
      console.error(`[AutoMode] Failed to update planSpec for ${featureId}:`, error);
    }
  }

  private async loadPendingFeatures(projectPath: string): Promise<Feature[]> {
    // Features are stored in .automaker directory
    const featuresDir = getFeaturesDir(projectPath);

    try {
      const entries = await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      });
      const allFeatures: Feature[] = [];
      const pendingFeatures: Feature[] = [];

      // Load all features (for dependency checking)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');
          try {
            const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
            const feature = JSON.parse(data);
            allFeatures.push(feature);

            // Track pending features separately
            if (
              feature.status === 'pending' ||
              feature.status === 'ready' ||
              feature.status === 'backlog'
            ) {
              pendingFeatures.push(feature);
            }
          } catch {
            // Skip invalid features
          }
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures } = resolveDependencies(pendingFeatures);

      // Filter to only features with satisfied dependencies
      const readyFeatures = orderedFeatures.filter((feature: Feature) =>
        areDependenciesSatisfied(feature, allFeatures)
      );

      return readyFeatures;
    } catch {
      return [];
    }
  }

  /**
   * Extract a title from feature description (first line or truncated)
   */
  private extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return 'Untitled Feature';
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split('\n')[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + '...';
  }

  /**
   * Get the planning prompt prefix based on feature's planning mode
   */
  private async getPlanningPromptPrefix(feature: Feature): Promise<string> {
    const mode = feature.planningMode || 'skip';

    if (mode === 'skip') {
      return ''; // No planning phase
    }

    // Load prompts from settings (no caching - allows hot reload of custom prompts)
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const planningPrompts: Record<string, string> = {
      lite: prompts.autoMode.planningLite,
      lite_with_approval: prompts.autoMode.planningLiteWithApproval,
      spec: prompts.autoMode.planningSpec,
      full: prompts.autoMode.planningFull,
    };

    // For lite mode, use the approval variant if requirePlanApproval is true
    let promptKey: string = mode;
    if (mode === 'lite' && feature.requirePlanApproval === true) {
      promptKey = 'lite_with_approval';
    }

    const planningPrompt = planningPrompts[promptKey];
    if (!planningPrompt) {
      return '';
    }

    return planningPrompt + '\n\n---\n\n## Feature Request\n\n';
  }

  private buildFeaturePrompt(feature: Feature): string {
    const title = this.extractTitleFromDescription(feature.description);

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Add images note (like old implementation)
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const path = typeof img === 'string' ? img : img.path;
          const filename =
            typeof img === 'string' ? path.split('/').pop() : img.filename || path.split('/').pop();
          const mimeType = typeof img === 'string' ? 'image/*' : img.mimeType || 'image/*';
          return `   ${idx + 1}. ${filename} (${mimeType})\n      Path: ${path}`;
        })
        .join('\n');

      prompt += `
**📎 Context Images Attached:**
The user has attached ${feature.imagePaths.length} image(s) for context. These images are provided both visually (in the initial message) and as files you can read:

${imagesList}

You can use the Read tool to view these images at any time during implementation. Review them carefully before implementing.
`;
    }

    // Add verification instructions based on testing mode
    if (feature.skipTests) {
      // Manual verification - just implement the feature
      prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Ensure the code follows existing patterns and conventions

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;
    } else {
      // Automated testing - implement and verify with Playwright
      prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Ensure the code follows existing patterns and conventions

## Verification with Playwright (REQUIRED)

After implementing the feature, you MUST verify it works correctly using Playwright:

1. **Create a temporary Playwright test** to verify the feature works as expected
2. **Run the test** to confirm the feature is working
3. **Delete the test file** after verification - this is a temporary verification test, not a permanent test suite addition

Example verification workflow:
\`\`\`bash
# Create a simple verification test
npx playwright test my-verification-test.spec.ts

# After successful verification, delete the test
rm my-verification-test.spec.ts
\`\`\`

The test should verify the core functionality of the feature. If the test fails, fix the implementation and re-test.

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Verification Status
- [Describe how the feature was verified with Playwright]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;
    }

    return prompt;
  }

  private async runAgent(
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
    }
  ): Promise<void> {
    const finalProjectPath = options?.projectPath || projectPath;
    const planningMode = options?.planningMode || 'skip';
    const previousContent = options?.previousContent;

    // Check if this planning mode can generate a spec/plan that needs approval
    // - spec and full always generate specs
    // - lite only generates approval-ready content when requirePlanApproval is true
    const planningModeRequiresApproval =
      planningMode === 'spec' ||
      planningMode === 'full' ||
      (planningMode === 'lite' && options?.requirePlanApproval === true);
    const requiresApproval = planningModeRequiresApproval && options?.requirePlanApproval === true;

    // CI/CD Mock Mode: Return early with mock response when AUTOMAKER_MOCK_AGENT is set
    // This prevents actual API calls during automated testing
    if (process.env.AUTOMAKER_MOCK_AGENT === 'true') {
      console.log(`[AutoMode] MOCK MODE: Skipping real agent execution for feature ${featureId}`);

      // Simulate some work being done
      await this.sleep(500);

      // Emit mock progress events to simulate agent activity
      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Analyzing the codebase...',
      });

      await this.sleep(300);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Implementing the feature...',
      });

      await this.sleep(300);

      // Create a mock file with "yellow" content as requested in the test
      const mockFilePath = path.join(workDir, 'yellow.txt');
      await secureFs.writeFile(mockFilePath, 'yellow');

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: "Mock agent: Created yellow.txt file with content 'yellow'",
      });

      await this.sleep(200);

      // Save mock agent output
      const featureDirForOutput = getFeatureDir(projectPath, featureId);
      const outputPath = path.join(featureDirForOutput, 'agent-output.md');

      const mockOutput = `# Mock Agent Output

## Summary
This is a mock agent response for CI/CD testing.

## Changes Made
- Created \`yellow.txt\` with content "yellow"

## Notes
This mock response was generated because AUTOMAKER_MOCK_AGENT=true was set.
`;

      await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
      await secureFs.writeFile(outputPath, mockOutput);

      console.log(`[AutoMode] MOCK MODE: Completed mock execution for feature ${featureId}`);
      return;
    }

    // Load autoLoadClaudeMd setting (project setting takes precedence over global)
    // Use provided value if available, otherwise load from settings
    const autoLoadClaudeMd =
      options?.autoLoadClaudeMd !== undefined
        ? options.autoLoadClaudeMd
        : await getAutoLoadClaudeMdSetting(finalProjectPath, this.settingsService, '[AutoMode]');

    // Load enableSandboxMode setting (global setting only)
    const enableSandboxMode = await getEnableSandboxModeSetting(this.settingsService, '[AutoMode]');

    // Load MCP servers from settings (global setting only)
    const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AutoMode]');

    // Load MCP permission settings (global setting only)
    const mcpPermissions = await getMCPPermissionSettings(this.settingsService, '[AutoMode]');

    // Build SDK options using centralized configuration for feature implementation
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
      autoLoadClaudeMd,
      enableSandboxMode,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools,
      mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    console.log(
      `[AutoMode] runAgent called for feature ${featureId} with model: ${finalModel}, planningMode: ${planningMode}, requiresApproval: ${requiresApproval}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    console.log(`[AutoMode] Using provider "${provider.getName()}" for model "${finalModel}"`);

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    // Debug: Log if system prompt is provided
    if (options?.systemPrompt) {
      console.log(
        `[AutoMode] System prompt provided (${options.systemPrompt.length} chars), first 200 chars:\n${options.systemPrompt.substring(0, 200)}...`
      );
    }

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: finalModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
      systemPrompt: sdkOptions.systemPrompt,
      settingSources: sdkOptions.settingSources,
      sandbox: sdkOptions.sandbox, // Pass sandbox configuration
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
      mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools, // Pass MCP auto-approve setting
      mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools, // Pass MCP unrestricted tools setting
    };

    // Execute via provider
    console.log(`[AutoMode] Starting stream for feature ${featureId}...`);
    const stream = provider.executeQuery(executeOptions);
    console.log(`[AutoMode] Stream created, starting to iterate...`);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = false;

    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        console.error(`[AutoMode] Failed to write agent output for ${featureId}:`, error);
      }
    };

    // Debounced write - schedules a write after WRITE_DEBOUNCE_MS
    const scheduleWrite = (): void => {
      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }
      writeTimeout = setTimeout(() => {
        writeToFile();
      }, WRITE_DEBOUNCE_MS);
    };

    streamLoop: for await (const msg of stream) {
      console.log(`[AutoMode] Stream message received:`, msg.type, msg.subtype || '');
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            // Add separator before new text if we already have content and it doesn't end with newlines
            if (responseText.length > 0 && !responseText.endsWith('\n\n')) {
              if (responseText.endsWith('\n')) {
                responseText += '\n';
              } else {
                responseText += '\n\n';
              }
            }
            responseText += block.text || '';

            // Check for authentication errors in the response
            if (
              block.text &&
              (block.text.includes('Invalid API key') ||
                block.text.includes('authentication_failed') ||
                block.text.includes('Fix external API key'))
            ) {
              throw new Error(
                'Authentication failed: Invalid or expired API key. ' +
                  "Please check your ANTHROPIC_API_KEY, or run 'claude login' to re-authenticate."
              );
            }

            // Schedule incremental file write (debounced)
            scheduleWrite();

            // Check for [SPEC_GENERATED] marker in planning modes (spec or full)
            if (
              planningModeRequiresApproval &&
              !specDetected &&
              responseText.includes('[SPEC_GENERATED]')
            ) {
              specDetected = true;

              // Extract plan content (everything before the marker)
              const markerIndex = responseText.indexOf('[SPEC_GENERATED]');
              const planContent = responseText.substring(0, markerIndex).trim();

              // Parse tasks from the generated spec (for spec and full modes)
              // Use let since we may need to update this after plan revision
              let parsedTasks = parseTasksFromSpec(planContent);
              const tasksTotal = parsedTasks.length;

              console.log(
                `[AutoMode] Parsed ${tasksTotal} tasks from spec for feature ${featureId}`
              );
              if (parsedTasks.length > 0) {
                console.log(`[AutoMode] Tasks: ${parsedTasks.map((t) => t.id).join(', ')}`);
              }

              // Update planSpec status to 'generated' and save content with parsed tasks
              await this.updateFeaturePlanSpec(projectPath, featureId, {
                status: 'generated',
                content: planContent,
                version: 1,
                generatedAt: new Date().toISOString(),
                reviewedByUser: false,
                tasks: parsedTasks,
                tasksTotal,
                tasksCompleted: 0,
              });

              let approvedPlanContent = planContent;
              let userFeedback: string | undefined;
              let currentPlanContent = planContent;
              let planVersion = 1;

              // Only pause for approval if requirePlanApproval is true
              if (requiresApproval) {
                // ========================================
                // PLAN REVISION LOOP
                // Keep regenerating plan until user approves
                // ========================================
                let planApproved = false;

                while (!planApproved) {
                  console.log(
                    `[AutoMode] Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
                  );

                  // CRITICAL: Register pending approval BEFORE emitting event
                  const approvalPromise = this.waitForPlanApproval(featureId, projectPath);

                  // Emit plan_approval_required event
                  this.emitAutoModeEvent('plan_approval_required', {
                    featureId,
                    projectPath,
                    planContent: currentPlanContent,
                    planningMode,
                    planVersion,
                  });

                  // Wait for user response
                  try {
                    const approvalResult = await approvalPromise;

                    if (approvalResult.approved) {
                      // User approved the plan
                      console.log(
                        `[AutoMode] Plan v${planVersion} approved for feature ${featureId}`
                      );
                      planApproved = true;

                      // If user provided edits, use the edited version
                      if (approvalResult.editedPlan) {
                        approvedPlanContent = approvalResult.editedPlan;
                        await this.updateFeaturePlanSpec(projectPath, featureId, {
                          content: approvalResult.editedPlan,
                        });
                      } else {
                        approvedPlanContent = currentPlanContent;
                      }

                      // Capture any additional feedback for implementation
                      userFeedback = approvalResult.feedback;

                      // Emit approval event
                      this.emitAutoModeEvent('plan_approved', {
                        featureId,
                        projectPath,
                        hasEdits: !!approvalResult.editedPlan,
                        planVersion,
                      });
                    } else {
                      // User rejected - check if they provided feedback for revision
                      const hasFeedback =
                        approvalResult.feedback && approvalResult.feedback.trim().length > 0;
                      const hasEdits =
                        approvalResult.editedPlan && approvalResult.editedPlan.trim().length > 0;

                      if (!hasFeedback && !hasEdits) {
                        // No feedback or edits = explicit cancel
                        console.log(
                          `[AutoMode] Plan rejected without feedback for feature ${featureId}, cancelling`
                        );
                        throw new Error('Plan cancelled by user');
                      }

                      // User wants revisions - regenerate the plan
                      console.log(
                        `[AutoMode] Plan v${planVersion} rejected with feedback for feature ${featureId}, regenerating...`
                      );
                      planVersion++;

                      // Emit revision event
                      this.emitAutoModeEvent('plan_revision_requested', {
                        featureId,
                        projectPath,
                        feedback: approvalResult.feedback,
                        hasEdits: !!hasEdits,
                        planVersion,
                      });

                      // Build revision prompt
                      let revisionPrompt = `The user has requested revisions to the plan/specification.

## Previous Plan (v${planVersion - 1})
${hasEdits ? approvalResult.editedPlan : currentPlanContent}

## User Feedback
${approvalResult.feedback || 'Please revise the plan based on the edits above.'}

## Instructions
Please regenerate the specification incorporating the user's feedback.
Keep the same format with the \`\`\`tasks block for task definitions.
After generating the revised spec, output:
"[SPEC_GENERATED] Please review the revised specification above."
`;

                      // Update status to regenerating
                      await this.updateFeaturePlanSpec(projectPath, featureId, {
                        status: 'generating',
                        version: planVersion,
                      });

                      // Make revision call
                      const revisionStream = provider.executeQuery({
                        prompt: revisionPrompt,
                        model: finalModel,
                        maxTurns: maxTurns || 100,
                        cwd: workDir,
                        allowedTools: allowedTools,
                        abortController,
                        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                        mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools,
                        mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools,
                      });

                      let revisionText = '';
                      for await (const msg of revisionStream) {
                        if (msg.type === 'assistant' && msg.message?.content) {
                          for (const block of msg.message.content) {
                            if (block.type === 'text') {
                              revisionText += block.text || '';
                              this.emitAutoModeEvent('auto_mode_progress', {
                                featureId,
                                content: block.text,
                              });
                            }
                          }
                        } else if (msg.type === 'error') {
                          throw new Error(msg.error || 'Error during plan revision');
                        } else if (msg.type === 'result' && msg.subtype === 'success') {
                          revisionText += msg.result || '';
                        }
                      }

                      // Extract new plan content
                      const markerIndex = revisionText.indexOf('[SPEC_GENERATED]');
                      if (markerIndex > 0) {
                        currentPlanContent = revisionText.substring(0, markerIndex).trim();
                      } else {
                        currentPlanContent = revisionText.trim();
                      }

                      // Re-parse tasks from revised plan
                      const revisedTasks = parseTasksFromSpec(currentPlanContent);
                      console.log(`[AutoMode] Revised plan has ${revisedTasks.length} tasks`);

                      // Update planSpec with revised content
                      await this.updateFeaturePlanSpec(projectPath, featureId, {
                        status: 'generated',
                        content: currentPlanContent,
                        version: planVersion,
                        tasks: revisedTasks,
                        tasksTotal: revisedTasks.length,
                        tasksCompleted: 0,
                      });

                      // Update parsedTasks for implementation
                      parsedTasks = revisedTasks;

                      responseText += revisionText;
                    }
                  } catch (error) {
                    if ((error as Error).message.includes('cancelled')) {
                      throw error;
                    }
                    throw new Error(`Plan approval failed: ${(error as Error).message}`);
                  }
                }
              } else {
                // Auto-approve: requirePlanApproval is false, just continue without pausing
                console.log(
                  `[AutoMode] Spec generated for feature ${featureId}, auto-approving (requirePlanApproval=false)`
                );

                // Emit info event for frontend
                this.emitAutoModeEvent('plan_auto_approved', {
                  featureId,
                  projectPath,
                  planContent,
                  planningMode,
                });

                approvedPlanContent = planContent;
              }

              // CRITICAL: After approval, we need to make a second call to continue implementation
              // The agent is waiting for "approved" - we need to send it and continue
              console.log(
                `[AutoMode] Making continuation call after plan approval for feature ${featureId}`
              );

              // Update planSpec status to approved (handles both manual and auto-approval paths)
              await this.updateFeaturePlanSpec(projectPath, featureId, {
                status: 'approved',
                approvedAt: new Date().toISOString(),
                reviewedByUser: requiresApproval,
              });

              // ========================================
              // MULTI-AGENT TASK EXECUTION
              // Each task gets its own focused agent call
              // ========================================

              if (parsedTasks.length > 0) {
                console.log(
                  `[AutoMode] Starting multi-agent execution: ${parsedTasks.length} tasks for feature ${featureId}`
                );

                // Execute each task with a separate agent
                for (let taskIndex = 0; taskIndex < parsedTasks.length; taskIndex++) {
                  const task = parsedTasks[taskIndex];

                  // Check for abort
                  if (abortController.signal.aborted) {
                    throw new Error('Feature execution aborted');
                  }

                  // Emit task started
                  console.log(`[AutoMode] Starting task ${task.id}: ${task.description}`);
                  this.emitAutoModeEvent('auto_mode_task_started', {
                    featureId,
                    projectPath,
                    taskId: task.id,
                    taskDescription: task.description,
                    taskIndex,
                    tasksTotal: parsedTasks.length,
                  });

                  // Update planSpec with current task
                  await this.updateFeaturePlanSpec(projectPath, featureId, {
                    currentTaskId: task.id,
                  });

                  // Build focused prompt for this specific task
                  const taskPrompt = this.buildTaskPrompt(
                    task,
                    parsedTasks,
                    taskIndex,
                    approvedPlanContent,
                    userFeedback
                  );

                  // Execute task with dedicated agent
                  const taskStream = provider.executeQuery({
                    prompt: taskPrompt,
                    model: finalModel,
                    maxTurns: Math.min(maxTurns || 100, 50), // Limit turns per task
                    cwd: workDir,
                    allowedTools: allowedTools,
                    abortController,
                    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                    mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools,
                    mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools,
                  });

                  let taskOutput = '';

                  // Process task stream
                  for await (const msg of taskStream) {
                    if (msg.type === 'assistant' && msg.message?.content) {
                      for (const block of msg.message.content) {
                        if (block.type === 'text') {
                          taskOutput += block.text || '';
                          responseText += block.text || '';
                          this.emitAutoModeEvent('auto_mode_progress', {
                            featureId,
                            content: block.text,
                          });
                        } else if (block.type === 'tool_use') {
                          this.emitAutoModeEvent('auto_mode_tool', {
                            featureId,
                            tool: block.name,
                            input: block.input,
                          });
                        }
                      }
                    } else if (msg.type === 'error') {
                      throw new Error(msg.error || `Error during task ${task.id}`);
                    } else if (msg.type === 'result' && msg.subtype === 'success') {
                      taskOutput += msg.result || '';
                      responseText += msg.result || '';
                    }
                  }

                  // Emit task completed
                  console.log(`[AutoMode] Task ${task.id} completed for feature ${featureId}`);
                  this.emitAutoModeEvent('auto_mode_task_complete', {
                    featureId,
                    projectPath,
                    taskId: task.id,
                    tasksCompleted: taskIndex + 1,
                    tasksTotal: parsedTasks.length,
                  });

                  // Update planSpec with progress
                  await this.updateFeaturePlanSpec(projectPath, featureId, {
                    tasksCompleted: taskIndex + 1,
                  });

                  // Check for phase completion (group tasks by phase)
                  if (task.phase) {
                    const nextTask = parsedTasks[taskIndex + 1];
                    if (!nextTask || nextTask.phase !== task.phase) {
                      // Phase changed, emit phase complete
                      const phaseMatch = task.phase.match(/Phase\s*(\d+)/i);
                      if (phaseMatch) {
                        this.emitAutoModeEvent('auto_mode_phase_complete', {
                          featureId,
                          projectPath,
                          phaseNumber: parseInt(phaseMatch[1], 10),
                        });
                      }
                    }
                  }
                }

                console.log(
                  `[AutoMode] All ${parsedTasks.length} tasks completed for feature ${featureId}`
                );
              } else {
                // No parsed tasks - fall back to single-agent execution
                console.log(
                  `[AutoMode] No parsed tasks, using single-agent execution for feature ${featureId}`
                );

                const continuationPrompt = `The plan/specification has been approved. Now implement it.
${userFeedback ? `\n## User Feedback\n${userFeedback}\n` : ''}
## Approved Plan

${approvedPlanContent}

## Instructions

Implement all the changes described in the plan above.`;

                const continuationStream = provider.executeQuery({
                  prompt: continuationPrompt,
                  model: finalModel,
                  maxTurns: maxTurns,
                  cwd: workDir,
                  allowedTools: allowedTools,
                  abortController,
                  mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                  mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools,
                  mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools,
                });

                for await (const msg of continuationStream) {
                  if (msg.type === 'assistant' && msg.message?.content) {
                    for (const block of msg.message.content) {
                      if (block.type === 'text') {
                        responseText += block.text || '';
                        this.emitAutoModeEvent('auto_mode_progress', {
                          featureId,
                          content: block.text,
                        });
                      } else if (block.type === 'tool_use') {
                        this.emitAutoModeEvent('auto_mode_tool', {
                          featureId,
                          tool: block.name,
                          input: block.input,
                        });
                      }
                    }
                  } else if (msg.type === 'error') {
                    throw new Error(msg.error || 'Unknown error during implementation');
                  } else if (msg.type === 'result' && msg.subtype === 'success') {
                    responseText += msg.result || '';
                  }
                }
              }

              console.log(`[AutoMode] Implementation completed for feature ${featureId}`);
              // Exit the original stream loop since continuation is done
              break streamLoop;
            }

            // Only emit progress for non-marker text (marker was already handled above)
            if (!specDetected) {
              console.log(
                `[AutoMode] Emitting progress event for ${featureId}, content length: ${block.text?.length || 0}`
              );
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                content: block.text,
              });
            }
          } else if (block.type === 'tool_use') {
            // Emit event for real-time UI
            this.emitAutoModeEvent('auto_mode_tool', {
              featureId,
              tool: block.name,
              input: block.input,
            });

            // Also add to file output for persistence
            if (responseText.length > 0 && !responseText.endsWith('\n')) {
              responseText += '\n';
            }
            responseText += `\n🔧 Tool: ${block.name}\n`;
            if (block.input) {
              responseText += `Input: ${JSON.stringify(block.input, null, 2)}\n`;
            }
            scheduleWrite();
          }
        }
      } else if (msg.type === 'error') {
        // Handle error messages
        throw new Error(msg.error || 'Unknown error');
      } else if (msg.type === 'result' && msg.subtype === 'success') {
        // Don't replace responseText - the accumulated content is the full history
        // The msg.result is just a summary which would lose all tool use details
        // Just ensure final write happens
        scheduleWrite();
      }
    }

    // Clear any pending timeout and do a final write to ensure all content is saved
    if (writeTimeout) {
      clearTimeout(writeTimeout);
    }
    // Final write - ensure all accumulated content is saved
    await writeToFile();
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const prompt = `## Continuing Feature Implementation

${this.buildFeaturePrompt(feature)}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

${context}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

    return this.executeFeature(projectPath, featureId, useWorktrees, false, undefined, {
      continuationPrompt: prompt,
    });
  }

  /**
   * Detect if a feature is stuck in a pipeline step and extract step information.
   * Parses the feature status to determine if it's a pipeline status (e.g., 'pipeline_step_xyz'),
   * loads the pipeline configuration, and validates that the step still exists.
   *
   * This method handles several scenarios:
   * - Non-pipeline status: Returns default PipelineStatusInfo with isPipeline=false
   * - Invalid pipeline status format: Returns isPipeline=true but null step info
   * - Step deleted from config: Returns stepIndex=-1 to signal missing step
   * - Valid pipeline step: Returns full step information and config
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {string} featureId - Unique identifier of the feature
   * @param {FeatureStatusWithPipeline} currentStatus - Current feature status (may include pipeline step info)
   * @returns {Promise<PipelineStatusInfo>} Information about the pipeline status and step
   * @private
   */
  private async detectPipelineStatus(
    projectPath: string,
    featureId: string,
    currentStatus: FeatureStatusWithPipeline
  ): Promise<PipelineStatusInfo> {
    // Check if status is pipeline format using PipelineService
    const isPipeline = pipelineService.isPipelineStatus(currentStatus);

    if (!isPipeline) {
      return {
        isPipeline: false,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Extract step ID using PipelineService
    const stepId = pipelineService.getStepIdFromStatus(currentStatus);

    if (!stepId) {
      console.warn(
        `[AutoMode] Feature ${featureId} has invalid pipeline status format: ${currentStatus}`
      );
      return {
        isPipeline: true,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Load pipeline config
    const config = await pipelineService.getPipelineConfig(projectPath);

    if (!config || config.steps.length === 0) {
      // Pipeline config doesn't exist or empty - feature stuck with invalid pipeline status
      console.warn(
        `[AutoMode] Feature ${featureId} has pipeline status but no pipeline config exists`
      );
      return {
        isPipeline: true,
        stepId,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Find the step directly from config (already loaded, avoid redundant file read)
    const sortedSteps = [...config.steps].sort((a, b) => a.order - b.order);
    const stepIndex = sortedSteps.findIndex((s) => s.id === stepId);
    const step = stepIndex === -1 ? null : sortedSteps[stepIndex];

    if (!step) {
      // Step not found in current config - step was deleted/changed
      console.warn(
        `[AutoMode] Feature ${featureId} stuck in step ${stepId} which no longer exists in pipeline config`
      );
      return {
        isPipeline: true,
        stepId,
        stepIndex: -1,
        totalSteps: sortedSteps.length,
        step: null,
        config,
      };
    }

    console.log(
      `[AutoMode] Detected pipeline status for feature ${featureId}: step ${stepIndex + 1}/${sortedSteps.length} (${step.name})`
    );

    return {
      isPipeline: true,
      stepId,
      stepIndex,
      totalSteps: sortedSteps.length,
      step,
      config,
    };
  }

  /**
   * Build a focused prompt for executing a single task.
   * Each task gets minimal context to keep the agent focused.
   */
  private buildTaskPrompt(
    task: ParsedTask,
    allTasks: ParsedTask[],
    taskIndex: number,
    planContent: string,
    userFeedback?: string
  ): string {
    const completedTasks = allTasks.slice(0, taskIndex);
    const remainingTasks = allTasks.slice(taskIndex + 1);

    let prompt = `# Task Execution: ${task.id}

You are executing a specific task as part of a larger feature implementation.

## Your Current Task

**Task ID:** ${task.id}
**Description:** ${task.description}
${task.filePath ? `**Primary File:** ${task.filePath}` : ''}
${task.phase ? `**Phase:** ${task.phase}` : ''}

## Context

`;

    // Show what's already done
    if (completedTasks.length > 0) {
      prompt += `### Already Completed (${completedTasks.length} tasks)
${completedTasks.map((t) => `- [x] ${t.id}: ${t.description}`).join('\n')}

`;
    }

    // Show remaining tasks
    if (remainingTasks.length > 0) {
      prompt += `### Coming Up Next (${remainingTasks.length} tasks remaining)
${remainingTasks
  .slice(0, 3)
  .map((t) => `- [ ] ${t.id}: ${t.description}`)
  .join('\n')}
${remainingTasks.length > 3 ? `... and ${remainingTasks.length - 3} more tasks` : ''}

`;
    }

    // Add user feedback if any
    if (userFeedback) {
      prompt += `### User Feedback
${userFeedback}

`;
    }

    // Add relevant excerpt from plan (just the task-related part to save context)
    prompt += `### Reference: Full Plan
<details>
${planContent}
</details>

## Instructions

1. Focus ONLY on completing task ${task.id}: "${task.description}"
2. Do not work on other tasks
3. Use the existing codebase patterns
4. When done, summarize what you implemented

Begin implementing task ${task.id} now.`;

    return prompt;
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   */
  private emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      // If signal is provided and already aborted, reject immediately
      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
        return;
      }

      // Listen for abort signal
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          },
          { once: true }
        );
      }
    });
  }
}
