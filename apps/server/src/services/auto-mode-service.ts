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
import { simpleQuery } from '../providers/simple-query-service.js';
import type {
  ExecuteOptions,
  Feature,
  ModelProvider,
  PipelineStep,
  FeatureStatusWithPipeline,
  PipelineConfig,
  ThinkingLevel,
  PlanningMode,
  ClarificationQuestion,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS, isClaudeModel, stripProviderPrefix } from '@automaker/types';
import {
  buildPromptWithImages,
  classifyError,
  loadContextFiles,
  appendLearning,
  recordMemoryUsage,
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@automaker/utils';

const logger = createLogger('AutoMode');
import { resolveModelString, resolvePhaseModel, DEFAULT_MODELS } from '@automaker/model-resolver';
import { resolveDependencies, areDependenciesSatisfied } from '@automaker/dependency-resolver';
import {
  getFeatureDir,
  getAutomakerDir,
  getFeaturesDir,
  getExecutionStatePath,
  ensureAutomakerDir,
} from '@automaker/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
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
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getPromptCustomization,
} from '../lib/settings-helpers.js';
import { getNotificationService } from './notification-service.js';

const execAsync = promisify(exec);

// PlanningMode type is imported from @automaker/types

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
  model?: string;
  provider?: ModelProvider;
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

interface PendingClarification {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
  requestId: string;
  toolUseId: string;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
}

/**
 * Execution state for recovery after server restart
 * Tracks which features were running and auto-loop configuration
 */
interface ExecutionState {
  version: 1;
  autoLoopWasRunning: boolean;
  maxConcurrency: number;
  projectPath: string;
  runningFeatureIds: string[];
  savedAt: string;
}

// Default empty execution state
const DEFAULT_EXECUTION_STATE: ExecutionState = {
  version: 1,
  autoLoopWasRunning: false,
  maxConcurrency: 3,
  projectPath: '',
  runningFeatureIds: [],
  savedAt: '',
};

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
  private pendingClarifications = new Map<string, PendingClarification>();
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
    logger.info(
      `Pausing auto loop after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
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

    // Save execution state for recovery after restart
    await this.saveExecutionState(projectPath);

    // Note: Memory folder initialization is now handled by loadContextFiles

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      logger.error('Loop error:', error);
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
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
            logger.error(`Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        logger.error('Loop iteration error:', error);
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
    const projectPath = this.config?.projectPath;
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Clear execution state when auto-loop is explicitly stopped
    if (projectPath) {
      await this.clearExecutionState(projectPath);
    }

    // Emit stop event immediately when user explicitly stops
    if (wasRunning) {
      this.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath,
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

    // Save execution state when feature starts
    if (isAutoMode) {
      await this.saveExecutionState(projectPath);
    }

    try {
      // Validate that project path is allowed using centralized validation
      validateWorkingDirectory(projectPath);

      // Check if feature has existing context - if so, resume instead of starting fresh
      // Skip this check if we're already being called with a continuation prompt (from resumeFeature)
      if (!options?.continuationPrompt) {
        const hasExistingContext = await this.contextExists(projectPath, featureId);
        if (hasExistingContext) {
          logger.info(
            `Feature ${featureId} has existing context, resuming instead of starting fresh`
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
          logger.info(`Using worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          // Worktree doesn't exist - log warning and continue with project path
          logger.warn(`Worktree for branch "${branchName}" not found, using project path`);
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

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

      // Build the prompt - use continuation prompt if provided (for recovery after plan approval)
      let prompt: string;
      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) and memory files
      // Context loader uses task context to select relevant memory files
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: feature.title ?? '',
          description: feature.description ?? '',
        },
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      // Note: contextResult.formattedPrompt now includes both context AND memory
      const combinedSystemPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        // Continuation prompt is used when recovering from a plan approval
        // The plan was already approved, so skip the planning phase
        prompt = options.continuationPrompt;
        logger.info(`Using continuation prompt for feature ${featureId}`);
      } else {
        // Normal flow: build prompt with planning phase
        const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);
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

      // Get model from feature and determine provider
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      const provider = ProviderFactory.getProviderNameForModel(model);
      logger.info(
        `Executing feature ${featureId} with model: ${model}, provider: ${provider} in ${workDir}`
      );

      // Store model and provider in running feature for tracking
      tempRunningFeature.model = model;
      tempRunningFeature.provider = provider;

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
          systemPrompt: combinedSystemPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
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

      // Record learnings and memory usage after successful feature completion
      try {
        const featureDir = getFeatureDir(projectPath, featureId);
        const outputPath = path.join(featureDir, 'agent-output.md');
        let agentOutput = '';
        try {
          const outputContent = await secureFs.readFile(outputPath, 'utf-8');
          agentOutput =
            typeof outputContent === 'string' ? outputContent : outputContent.toString();
        } catch {
          // Agent output might not exist yet
        }

        // Record memory usage if we loaded any memory files
        if (contextResult.memoryFiles.length > 0 && agentOutput) {
          await recordMemoryUsage(
            projectPath,
            contextResult.memoryFiles,
            agentOutput,
            true, // success
            secureFs as Parameters<typeof recordMemoryUsage>[4]
          );
        }

        // Extract and record learnings from the agent output
        await this.recordLearningsFromFeature(projectPath, feature, agentOutput);
      } catch (learningError) {
        console.warn('[AutoMode] Failed to record learnings:', learningError);
      }

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round(
          (Date.now() - tempRunningFeature.startTime) / 1000
        )}s${finalStatus === 'verified' ? ' - auto-verified' : ''}`,
        projectPath,
        model: tempRunningFeature.model,
        provider: tempRunningFeature.provider,
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
        logger.error(`Feature ${featureId} failed:`, error);
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
      logger.info(`Feature ${featureId} execution ended, cleaning up runningFeatures`);
      logger.info(
        `Pending approvals at cleanup: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
      );
      this.runningFeatures.delete(featureId);

      // Update execution state after feature completes
      if (this.autoLoopRunning && projectPath) {
        await this.saveExecutionState(projectPath);
      }
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
    logger.info(`Executing ${steps.length} pipeline step(s) for feature ${featureId}`);

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Load context files once with feature context for smart memory selection
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: {
        title: feature.title ?? '',
        description: feature.description ?? '',
      },
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
      const prompt = this.buildPipelineStepPrompt(
        step,
        feature,
        previousContext,
        prompts.taskExecution
      );

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
          thinkingLevel: feature.thinkingLevel,
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

      logger.info(
        `Pipeline step ${i + 1}/${steps.length} (${step.name}) completed for feature ${featureId}`
      );
    }

    logger.info(`All pipeline steps completed for feature ${featureId}`);
  }

  /**
   * Build the prompt for a pipeline step
   */
  private buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
    let prompt = `## Pipeline Step: ${step.name}

This is an automated pipeline step following the initial feature implementation.

### Feature Context
${this.buildFeaturePrompt(feature, taskExecutionPrompts)}

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

    // Cancel any pending clarification for this feature
    this.cancelClarification(featureId);

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
        logger.info(`Follow-up using worktree for branch "${branchName}": ${workDir}`);
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

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: {
        title: feature?.title ?? prompt.substring(0, 200),
        description: feature?.description ?? prompt,
      },
    });

    // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
    // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature, prompts.taskExecution) : `**Feature ID:** ${featureId}`}
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

    // Get model from feature and determine provider early for tracking
    const model = resolveModelString(feature?.model, DEFAULT_MODELS.claude);
    const provider = ProviderFactory.getProviderNameForModel(model);
    logger.info(`Follow-up for feature ${featureId} using model: ${model}, provider: ${provider}`);

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
      model,
      provider,
    });

    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId,
      projectPath,
      feature: feature || {
        id: featureId,
        title: 'Follow-up',
        description: prompt.substring(0, 100),
      },
      model,
      provider,
    });

    try {
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
            logger.error(`Failed to copy follow-up image ${imagePath}:`, error);
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

      // Save updated feature.json with new images (atomic write with backup)
      if (copiedImagePaths.length > 0 && feature) {
        const featureDirForSave = getFeatureDir(projectPath, featureId);
        const featurePath = path.join(featureDirForSave, 'feature.json');

        try {
          await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
        } catch (error) {
          logger.error(`Failed to save feature.json:`, error);
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
          thinkingLevel: feature?.thinkingLevel,
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
        model,
        provider,
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
      projectPath,
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
        logger.info(`Committing in provided worktree: ${workDir}`);
      } catch {
        logger.info(
          `Provided worktree path doesn't exist: ${providedWorktreePath}, using project path`
        );
      }
    } else {
      // Fallback: try to find worktree at legacy location
      const legacyWorktreePath = path.join(projectPath, '.worktrees', featureId);
      try {
        await secureFs.access(legacyWorktreePath);
        workDir = legacyWorktreePath;
        logger.info(`Committing in legacy worktree: ${workDir}`);
      } catch {
        logger.info(`No worktree found, committing in project path: ${workDir}`);
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
        projectPath,
      });

      return hash.trim();
    } catch (error) {
      logger.error(`Commit failed for ${featureId}:`, error);
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
      // Get model from phase settings
      const settings = await this.settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.projectAnalysisModel || DEFAULT_PHASE_MODELS.projectAnalysisModel;
      const { model: analysisModel, thinkingLevel: analysisThinkingLevel } =
        resolvePhaseModel(phaseModelEntry);
      logger.info('Using model for project analysis:', analysisModel);

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
        thinkingLevel: analysisThinkingLevel,
      });

      const options: ExecuteOptions = {
        prompt,
        model: sdkOptions.model ?? analysisModel,
        cwd: sdkOptions.cwd ?? projectPath,
        maxTurns: sdkOptions.maxTurns,
        allowedTools: sdkOptions.allowedTools as string[],
        abortController,
        settingSources: sdkOptions.settingSources,
        thinkingLevel: analysisThinkingLevel, // Pass thinking level
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
      model?: string;
      provider?: ModelProvider;
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
          model: rf.model,
          provider: rf.provider,
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
   * Times out after 30 minutes to prevent indefinite memory retention.
   */
  waitForPlanApproval(
    featureId: string,
    projectPath: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }> {
    const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    logger.info(`Registering pending approval for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    return new Promise((resolve, reject) => {
      // Set up timeout to prevent indefinite waiting and memory leaks
      const timeoutId = setTimeout(() => {
        const pending = this.pendingApprovals.get(featureId);
        if (pending) {
          logger.warn(`Plan approval for feature ${featureId} timed out after 30 minutes`);
          this.pendingApprovals.delete(featureId);
          reject(
            new Error('Plan approval timed out after 30 minutes - feature execution cancelled')
          );
        }
      }, APPROVAL_TIMEOUT_MS);

      // Wrap resolve/reject to clear timeout when approval is resolved
      const wrappedResolve = (result: {
        approved: boolean;
        editedPlan?: string;
        feedback?: string;
      }) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      this.pendingApprovals.set(featureId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        featureId,
        projectPath,
      });
      logger.info(`Pending approval registered for feature ${featureId} (timeout: 30 minutes)`);
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
    logger.info(`resolvePlanApproval called for feature ${featureId}, approved=${approved}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);

    if (!pending) {
      logger.info(`No pending approval in Map for feature ${featureId}`);

      // RECOVERY: If no pending approval but we have projectPath from client,
      // check if feature's planSpec.status is 'generated' and handle recovery
      if (projectPathFromClient) {
        logger.info(`Attempting recovery with projectPath: ${projectPathFromClient}`);
        const feature = await this.loadFeature(projectPathFromClient, featureId);

        if (feature?.planSpec?.status === 'generated') {
          logger.info(`Feature ${featureId} has planSpec.status='generated', performing recovery`);

          if (approved) {
            // Update planSpec to approved
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'approved',
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
              content: editedPlan || feature.planSpec.content,
            });

            // Get customized prompts from settings
            const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

            // Build continuation prompt using centralized template
            const planContent = editedPlan || feature.planSpec.content || '';
            let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
            continuationPrompt = continuationPrompt.replace(
              /\{\{userFeedback\}\}/g,
              feedback || ''
            );
            continuationPrompt = continuationPrompt.replace(/\{\{approvedPlan\}\}/g, planContent);

            logger.info(`Starting recovery execution for feature ${featureId}`);

            // Start feature execution with the continuation prompt (async, don't await)
            // Pass undefined for providedWorktreePath, use options for continuation prompt
            this.executeFeature(projectPathFromClient, featureId, true, false, undefined, {
              continuationPrompt,
            }).catch((error) => {
              logger.error(`Recovery execution failed for feature ${featureId}:`, error);
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

      logger.info(
        `ERROR: No pending approval found for feature ${featureId} and recovery not possible`
      );
      return {
        success: false,
        error: `No pending approval for feature ${featureId}`,
      };
    }
    logger.info(`Found pending approval for feature ${featureId}, proceeding...`);

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
    logger.info(`cancelPlanApproval called for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);
    if (pending) {
      logger.info(`Found and cancelling pending approval for feature ${featureId}`);
      pending.reject(new Error('Plan approval cancelled - feature was stopped'));
      this.pendingApprovals.delete(featureId);
    } else {
      logger.info(`No pending approval to cancel for feature ${featureId}`);
    }
  }

  /**
   * Check if a feature has a pending plan approval.
   */
  hasPendingApproval(featureId: string): boolean {
    return this.pendingApprovals.has(featureId);
  }

  /**
   * Wait for user to answer clarification questions.
   * Returns a promise that resolves with the user's answers.
   */
  waitForClarificationAnswers(
    featureId: string,
    projectPath: string,
    requestId: string,
    toolUseId: string
  ): Promise<Record<string, string>> {
    const CLARIFICATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    logger.info(
      `Registering pending clarification for feature ${featureId}, requestId=${requestId}`
    );
    logger.info(
      `Current pending clarifications: ${Array.from(this.pendingClarifications.keys()).join(', ') || 'none'}`
    );

    return new Promise((resolve, reject) => {
      // Set up timeout to prevent indefinite waiting
      const timeoutId = setTimeout(() => {
        const pending = this.pendingClarifications.get(featureId);
        if (pending) {
          logger.warn(`Clarification for feature ${featureId} timed out after 10 minutes`);
          this.pendingClarifications.delete(featureId);
          reject(
            new Error('Clarification timed out after 10 minutes - feature execution cancelled')
          );
        }
      }, CLARIFICATION_TIMEOUT_MS);

      // Wrap resolve/reject to clear timeout
      const wrappedResolve = (answers: Record<string, string>) => {
        clearTimeout(timeoutId);
        resolve(answers);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      this.pendingClarifications.set(featureId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        featureId,
        projectPath,
        requestId,
        toolUseId,
      });

      logger.info(`Pending clarification registered for feature ${featureId}`);
    });
  }

  /**
   * Resolve a pending clarification with user's answers.
   */
  async resolveClarification(
    featureId: string,
    requestId: string,
    answers: Record<string, string>,
    projectPathFromClient?: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.info(`resolveClarification called for feature ${featureId}, requestId=${requestId}`);
    logger.info(
      `Current pending clarifications: ${Array.from(this.pendingClarifications.keys()).join(', ') || 'none'}`
    );

    const pending = this.pendingClarifications.get(featureId);

    if (!pending) {
      logger.info(`No pending clarification in Map for feature ${featureId}`);
      return {
        success: false,
        error: `No pending clarification found for feature ${featureId}`,
      };
    }

    // Verify request ID matches
    if (pending.requestId !== requestId) {
      logger.warn(
        `Request ID mismatch for feature ${featureId}: expected ${pending.requestId}, got ${requestId}`
      );
      return {
        success: false,
        error: `Request ID mismatch - expected ${pending.requestId}`,
      };
    }

    // Resolve the promise with answers
    pending.resolve(answers);
    this.pendingClarifications.delete(featureId);

    // Emit event for tracking
    this.emitAutoModeEvent('clarification:questions-answered' as any, {
      featureId,
      projectPath: projectPathFromClient || pending.projectPath,
      requestId,
      answersCount: Object.keys(answers).length,
    });

    return { success: true };
  }

  /**
   * Cancel a pending clarification (e.g., when feature is stopped).
   */
  cancelClarification(featureId: string): void {
    logger.info(`cancelClarification called for feature ${featureId}`);
    logger.info(
      `Current pending clarifications: ${Array.from(this.pendingClarifications.keys()).join(', ') || 'none'}`
    );

    const pending = this.pendingClarifications.get(featureId);
    if (pending) {
      logger.info(`Found and cancelling pending clarification for feature ${featureId}`);
      pending.reject(new Error('Clarification cancelled - feature was stopped'));
      this.pendingClarifications.delete(featureId);
    } else {
      logger.info(`No pending clarification to cancel for feature ${featureId}`);
    }
  }

  /**
   * Check if a feature has a pending clarification.
   */
  hasPendingClarification(featureId: string): boolean {
    return this.pendingClarifications.has(featureId);
  }

  /**
   * Get the pending clarification for a feature.
   */
  getPendingClarification(featureId: string): PendingClarification | undefined {
    return this.pendingClarifications.get(featureId);
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
      // Use recovery-enabled read for corrupted file handling
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

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

      // Use atomic write with backup support
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Create notifications for important status changes
      const notificationService = getNotificationService();
      if (status === 'waiting_approval') {
        await notificationService.createNotification({
          type: 'feature_waiting_approval',
          title: 'Feature Ready for Review',
          message: `"${feature.name || featureId}" is ready for your review and approval.`,
          featureId,
          projectPath,
        });
      } else if (status === 'verified') {
        await notificationService.createNotification({
          type: 'feature_verified',
          title: 'Feature Verified',
          message: `"${feature.name || featureId}" has been verified and is complete.`,
          featureId,
          projectPath,
        });
      }

      // Sync completed/verified features to app_spec.txt
      if (status === 'verified' || status === 'completed') {
        try {
          await this.featureLoader.syncFeatureToAppSpec(projectPath, feature);
        } catch (syncError) {
          // Log but don't fail the status update if sync fails
          logger.warn(`Failed to sync feature ${featureId} to app_spec.txt:`, syncError);
        }
      }
    } catch (error) {
      logger.error(`Failed to update feature status for ${featureId}:`, error);
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
    // Use getFeatureDir helper for consistent path resolution
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      // Use recovery-enabled read for corrupted file handling
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

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

      // Use atomic write with backup support
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
    } catch (error) {
      logger.error(`Failed to update planSpec for ${featureId}:`, error);
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

      // Load all features (for dependency checking) with recovery support
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          // Use recovery-enabled read for corrupted file handling
          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            // Skip features that couldn't be loaded or recovered
            continue;
          }

          allFeatures.push(feature);

          // Track pending features separately
          if (
            feature.status === 'pending' ||
            feature.status === 'ready' ||
            feature.status === 'backlog'
          ) {
            pendingFeatures.push(feature);
          }
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures } = resolveDependencies(pendingFeatures);

      // Get skipVerificationInAutoMode setting
      const settings = await this.settingsService?.getGlobalSettings();
      const skipVerification = settings?.skipVerificationInAutoMode ?? false;

      // Filter to only features with satisfied dependencies
      const readyFeatures = orderedFeatures.filter((feature: Feature) =>
        areDependenciesSatisfied(feature, allFeatures, { skipVerification })
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

    // Conditionally prepend clarification instructions for Claude provider
    // when requirePlanApproval is enabled and instructions are configured
    let finalPrompt = planningPrompt;
    const clarificationInstructions = prompts.autoMode.clarificationInstructions;
    if (
      feature.requirePlanApproval === true &&
      isClaudeModel(feature.model) &&
      clarificationInstructions
    ) {
      finalPrompt = clarificationInstructions + '\n\n' + planningPrompt;
    }

    return finalPrompt + '\n\n---\n\n## Feature Request\n\n';
  }

  private buildFeaturePrompt(
    feature: Feature,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
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
      prompt += `\n${taskExecutionPrompts.implementationInstructions}`;
    } else {
      // Automated testing - implement and verify with Playwright
      prompt += `\n${taskExecutionPrompts.implementationInstructions}\n\n${taskExecutionPrompts.playwrightVerificationInstructions}`;
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
      thinkingLevel?: ThinkingLevel;
    }
  ): Promise<void> {
    const finalProjectPath = options?.projectPath || projectPath;
    const planningMode = options?.planningMode || 'skip';
    const previousContent = options?.previousContent;

    // Validate vision support before processing images
    const effectiveModel = model || 'claude-sonnet-4-20250514';
    if (imagePaths && imagePaths.length > 0) {
      const supportsVision = ProviderFactory.modelSupportsVision(effectiveModel);
      if (!supportsVision) {
        throw new Error(
          `This model (${effectiveModel}) does not support image input. ` +
            `Please switch to a model that supports vision (like Claude models), or remove the images and try again.`
        );
      }
    }

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
      logger.info(`MOCK MODE: Skipping real agent execution for feature ${featureId}`);

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

      logger.info(`MOCK MODE: Completed mock execution for feature ${featureId}`);
      return;
    }

    // Load autoLoadClaudeMd setting (project setting takes precedence over global)
    // Use provided value if available, otherwise load from settings
    const autoLoadClaudeMd =
      options?.autoLoadClaudeMd !== undefined
        ? options.autoLoadClaudeMd
        : await getAutoLoadClaudeMdSetting(finalProjectPath, this.settingsService, '[AutoMode]');

    // Load MCP servers from settings (global setting only)
    const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AutoMode]');

    // Load MCP permission settings (global setting only)

    // Build SDK options using centralized configuration for feature implementation
    // Enable clarification questions when plan approval is required (interactive planning mode)
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
      autoLoadClaudeMd,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      thinkingLevel: options?.thinkingLevel,
      enableClarificationQuestions: requiresApproval,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    logger.info(
      `runAgent called for feature ${featureId} with model: ${finalModel}, planningMode: ${planningMode}, requiresApproval: ${requiresApproval}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    // Strip provider prefix - providers should receive bare model IDs
    const bareModel = stripProviderPrefix(finalModel);

    logger.info(
      `Using provider "${provider.getName()}" for model "${finalModel}" (bare: ${bareModel})`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    // Debug: Log if system prompt is provided
    if (options?.systemPrompt) {
      logger.info(
        `System prompt provided (${options.systemPrompt.length} chars), first 200 chars:\n${options.systemPrompt.substring(0, 200)}...`
      );
    }

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: bareModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
      systemPrompt: sdkOptions.systemPrompt,
      settingSources: sdkOptions.settingSources,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
      thinkingLevel: options?.thinkingLevel, // Pass thinking level for extended thinking
    };

    // Execute via provider
    logger.info(`Starting stream for feature ${featureId}...`);
    const stream = provider.executeQuery(executeOptions);
    logger.info(`Stream created, starting to iterate...`);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = false;

    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');
    const rawOutputPath = path.join(featureDirForOutput, 'raw-output.jsonl');

    // Raw output logging is configurable via environment variable
    // Set AUTOMAKER_DEBUG_RAW_OUTPUT=true to enable raw stream event logging
    const enableRawOutput =
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === 'true' ||
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === '1';

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms

    // Raw output accumulator for debugging (NDJSON format)
    let rawOutputLines: string[] = [];
    let rawWriteTimeout: ReturnType<typeof setTimeout> | null = null;

    // Helper to append raw stream event for debugging (only when enabled)
    const appendRawEvent = (event: unknown): void => {
      if (!enableRawOutput) return;

      try {
        const timestamp = new Date().toISOString();
        const rawLine = JSON.stringify({ timestamp, event }, null, 4); // Pretty print for readability
        rawOutputLines.push(rawLine);

        // Debounced write of raw output
        if (rawWriteTimeout) {
          clearTimeout(rawWriteTimeout);
        }
        rawWriteTimeout = setTimeout(async () => {
          try {
            await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
            await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
            rawOutputLines = []; // Clear after writing
          } catch (error) {
            logger.error(`Failed to write raw output for ${featureId}:`, error);
          }
        }, WRITE_DEBOUNCE_MS);
      } catch {
        // Ignore serialization errors
      }
    };

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        logger.error(`Failed to write agent output for ${featureId}:`, error);
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

    // Heartbeat logging so "silent" model calls are visible.
    // Some runs can take a while before the first streamed message arrives.
    const streamStartTime = Date.now();
    let receivedAnyStreamMessage = false;
    const STREAM_HEARTBEAT_MS = 15_000;
    const streamHeartbeat = setInterval(() => {
      if (receivedAnyStreamMessage) return;
      const elapsedSeconds = Math.round((Date.now() - streamStartTime) / 1000);
      logger.info(
        `Waiting for first model response for feature ${featureId} (${elapsedSeconds}s elapsed)...`
      );
    }, STREAM_HEARTBEAT_MS);

    // Wrap stream processing in try/finally to ensure timeout cleanup on any error/abort
    try {
      streamLoop: for await (const msg of stream) {
        receivedAnyStreamMessage = true;
        // Log raw stream event for debugging
        appendRawEvent(msg);

        logger.info(`Stream message received:`, msg.type, msg.subtype || '');
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              const newText = block.text || '';

              // Skip empty text
              if (!newText) continue;

              // Note: Cursor-specific dedup (duplicate blocks, accumulated text) is now
              // handled in CursorProvider.deduplicateTextBlocks() for cleaner separation

              // Only add separator when we're at a natural paragraph break:
              // - Previous text ends with sentence terminator AND new text starts a new thought
              // - Don't add separators mid-word or mid-sentence (for streaming providers like Cursor)
              if (responseText.length > 0 && newText.length > 0) {
                const lastChar = responseText.slice(-1);
                const endsWithSentence = /[.!?:]\s*$/.test(responseText);
                const endsWithNewline = /\n\s*$/.test(responseText);
                const startsNewParagraph = /^[\n#\-*>]/.test(newText);

                // Add paragraph break only at natural boundaries
                if (
                  !endsWithNewline &&
                  (endsWithSentence || startsNewParagraph) &&
                  !/[a-zA-Z0-9]/.test(lastChar) // Not mid-word
                ) {
                  responseText += '\n\n';
                }
              }
              responseText += newText;

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

                logger.info(`Parsed ${tasksTotal} tasks from spec for feature ${featureId}`);
                if (parsedTasks.length > 0) {
                  logger.info(`Tasks: ${parsedTasks.map((t) => t.id).join(', ')}`);
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
                    logger.info(
                      `Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
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
                        logger.info(`Plan v${planVersion} approved for feature ${featureId}`);
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
                          logger.info(
                            `Plan rejected without feedback for feature ${featureId}, cancelling`
                          );
                          throw new Error('Plan cancelled by user');
                        }

                        // User wants revisions - regenerate the plan
                        logger.info(
                          `Plan v${planVersion} rejected with feedback for feature ${featureId}, regenerating...`
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
                          model: bareModel,
                          maxTurns: maxTurns || 100,
                          cwd: workDir,
                          allowedTools: allowedTools,
                          abortController,
                          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
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
                        logger.info(`Revised plan has ${revisedTasks.length} tasks`);

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
                  logger.info(
                    `Spec generated for feature ${featureId}, auto-approving (requirePlanApproval=false)`
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
                logger.info(
                  `Making continuation call after plan approval for feature ${featureId}`
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
                  logger.info(
                    `Starting multi-agent execution: ${parsedTasks.length} tasks for feature ${featureId}`
                  );

                  // Get customized prompts for task execution
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );

                  // Execute each task with a separate agent
                  for (let taskIndex = 0; taskIndex < parsedTasks.length; taskIndex++) {
                    const task = parsedTasks[taskIndex];

                    // Check for abort
                    if (abortController.signal.aborted) {
                      throw new Error('Feature execution aborted');
                    }

                    // Emit task started
                    logger.info(`Starting task ${task.id}: ${task.description}`);
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
                      taskPrompts.taskExecution.taskPromptTemplate,
                      userFeedback
                    );

                    // Execute task with dedicated agent
                    const taskStream = provider.executeQuery({
                      prompt: taskPrompt,
                      model: bareModel,
                      maxTurns: Math.min(maxTurns || 100, 50), // Limit turns per task
                      cwd: workDir,
                      allowedTools: allowedTools,
                      abortController,
                      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
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
                    logger.info(`Task ${task.id} completed for feature ${featureId}`);
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

                  logger.info(`All ${parsedTasks.length} tasks completed for feature ${featureId}`);
                } else {
                  // No parsed tasks - fall back to single-agent execution
                  logger.info(
                    `No parsed tasks, using single-agent execution for feature ${featureId}`
                  );

                  // Get customized prompts for continuation
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );
                  let continuationPrompt =
                    taskPrompts.taskExecution.continuationAfterApprovalTemplate;
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{userFeedback\}\}/g,
                    userFeedback || ''
                  );
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{approvedPlan\}\}/g,
                    approvedPlanContent
                  );

                  const continuationStream = provider.executeQuery({
                    prompt: continuationPrompt,
                    model: bareModel,
                    maxTurns: maxTurns,
                    cwd: workDir,
                    allowedTools: allowedTools,
                    abortController,
                    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
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

                logger.info(`Implementation completed for feature ${featureId}`);
                // Exit the original stream loop since continuation is done
                break streamLoop;
              }

              // Only emit progress for non-marker text (marker was already handled above)
              if (!specDetected) {
                logger.info(
                  `Emitting progress event for ${featureId}, content length: ${block.text?.length || 0}`
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

              // Handle AskUserQuestion tool calls for interactive planning mode
              // Cast input to get proper typing for the AskUserQuestion tool schema
              const blockInput = block.input as Record<string, unknown> | undefined;
              const blockId = (block as { id?: string }).id;
              if (
                block.name === 'AskUserQuestion' &&
                requiresApproval &&
                blockInput?.questions &&
                Array.isArray(blockInput.questions)
              ) {
                logger.info(`AskUserQuestion tool detected for feature ${featureId}`);

                const requestId = randomUUID();
                const toolUseId = blockId || randomUUID();

                // Extract questions from tool input
                const questions: ClarificationQuestion[] = (blockInput.questions as any[]).map(
                  (q: any) => ({
                    question: q.question,
                    header: q.header,
                    options: q.options || [],
                    multiSelect: q.multiSelect || false,
                  })
                );

                // Emit WebSocket event for UI
                this.emitAutoModeEvent('clarification:questions-required' as any, {
                  featureId,
                  projectPath: finalProjectPath,
                  questions,
                  requestId,
                  toolUseId,
                  timestamp: new Date().toISOString(),
                });

                // Create notification
                try {
                  const notificationService = getNotificationService();
                  await notificationService.createNotification({
                    type: 'clarification_questions_required',
                    title: 'Clarification needed',
                    message: `AI has ${questions.length} question${questions.length === 1 ? '' : 's'} during planning`,
                    featureId,
                    projectPath: finalProjectPath,
                  });
                } catch (notifError) {
                  logger.error(`Failed to create clarification notification:`, notifError);
                }

                // Wait for user response
                logger.info(`Waiting for clarification answers for feature ${featureId}`);
                try {
                  const answers = await this.waitForClarificationAnswers(
                    featureId,
                    finalProjectPath,
                    requestId,
                    toolUseId
                  );
                  logger.info(
                    `Clarification answers received for feature ${featureId}: ${Object.keys(answers).length} answers`
                  );

                  // Add answers to response text for context
                  responseText += `\n\n### User Clarification Answers\n`;
                  for (const [header, answer] of Object.entries(answers)) {
                    responseText += `- **${header}**: ${answer}\n`;
                  }
                  scheduleWrite();
                } catch (clarificationError) {
                  // Clarification was cancelled or timed out
                  logger.warn(
                    `Clarification failed for feature ${featureId}: ${(clarificationError as Error).message}`
                  );
                  throw clarificationError;
                }
              }

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

      // Final write - ensure all accumulated content is saved (on success path)
      await writeToFile();

      // Flush remaining raw output (only if enabled, on success path)
      if (enableRawOutput && rawOutputLines.length > 0) {
        try {
          await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
          await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
        } catch (error) {
          logger.error(`Failed to write final raw output for ${featureId}:`, error);
        }
      }
    } finally {
      clearInterval(streamHeartbeat);
      // ALWAYS clear pending timeouts to prevent memory leaks
      // This runs on success, error, or abort
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      if (rawWriteTimeout) {
        clearTimeout(rawWriteTimeout);
        rawWriteTimeout = null;
      }
    }
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

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build the feature prompt
    const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);

    // Use the resume feature template with variable substitution
    let prompt = prompts.taskExecution.resumeFeatureTemplate;
    prompt = prompt.replace(/\{\{featurePrompt\}\}/g, featurePrompt);
    prompt = prompt.replace(/\{\{previousContext\}\}/g, context);

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
    taskPromptTemplate: string,
    userFeedback?: string
  ): string {
    const completedTasks = allTasks.slice(0, taskIndex);
    const remainingTasks = allTasks.slice(taskIndex + 1);

    // Build completed tasks string
    const completedTasksStr =
      completedTasks.length > 0
        ? `### Already Completed (${completedTasks.length} tasks)\n${completedTasks.map((t) => `- [x] ${t.id}: ${t.description}`).join('\n')}\n`
        : '';

    // Build remaining tasks string
    const remainingTasksStr =
      remainingTasks.length > 0
        ? `### Coming Up Next (${remainingTasks.length} tasks remaining)\n${remainingTasks
            .slice(0, 3)
            .map((t) => `- [ ] ${t.id}: ${t.description}`)
            .join(
              '\n'
            )}${remainingTasks.length > 3 ? `\n... and ${remainingTasks.length - 3} more tasks` : ''}\n`
        : '';

    // Build user feedback string
    const userFeedbackStr = userFeedback ? `### User Feedback\n${userFeedback}\n` : '';

    // Use centralized template with variable substitution
    let prompt = taskPromptTemplate;
    prompt = prompt.replace(/\{\{taskId\}\}/g, task.id);
    prompt = prompt.replace(/\{\{taskDescription\}\}/g, task.description);
    prompt = prompt.replace(/\{\{taskFilePath\}\}/g, task.filePath || '');
    prompt = prompt.replace(/\{\{taskPhase\}\}/g, task.phase || '');
    prompt = prompt.replace(/\{\{completedTasks\}\}/g, completedTasksStr);
    prompt = prompt.replace(/\{\{remainingTasks\}\}/g, remainingTasksStr);
    prompt = prompt.replace(/\{\{userFeedback\}\}/g, userFeedbackStr);
    prompt = prompt.replace(/\{\{planContent\}\}/g, planContent);

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

  // ============================================================================
  // Execution State Persistence - For recovery after server restart
  // ============================================================================

  /**
   * Save execution state to disk for recovery after server restart
   */
  private async saveExecutionState(projectPath: string): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const statePath = getExecutionStatePath(projectPath);
      const state: ExecutionState = {
        version: 1,
        autoLoopWasRunning: this.autoLoopRunning,
        maxConcurrency: this.config?.maxConcurrency ?? 3,
        projectPath,
        runningFeatureIds: Array.from(this.runningFeatures.keys()),
        savedAt: new Date().toISOString(),
      };
      await secureFs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
      logger.info(`Saved execution state: ${state.runningFeatureIds.length} running features`);
    } catch (error) {
      logger.error('Failed to save execution state:', error);
    }
  }

  /**
   * Load execution state from disk
   */
  private async loadExecutionState(projectPath: string): Promise<ExecutionState> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      const content = (await secureFs.readFile(statePath, 'utf-8')) as string;
      const state = JSON.parse(content) as ExecutionState;
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load execution state:', error);
      }
      return DEFAULT_EXECUTION_STATE;
    }
  }

  /**
   * Clear execution state (called on successful shutdown or when auto-loop stops)
   */
  private async clearExecutionState(projectPath: string): Promise<void> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      await secureFs.unlink(statePath);
      logger.info('Cleared execution state');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to clear execution state:', error);
      }
    }
  }

  /**
   * Check for and resume interrupted features after server restart
   * This should be called during server initialization
   */
  async resumeInterruptedFeatures(projectPath: string): Promise<void> {
    logger.info('Checking for interrupted features to resume...');

    // Load all features and find those that were interrupted
    const featuresDir = getFeaturesDir(projectPath);

    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });
      const interruptedFeatures: Feature[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          // Use recovery-enabled read for corrupted file handling
          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            // Skip features that couldn't be loaded or recovered
            continue;
          }

          // Check if feature was interrupted (in_progress or pipeline_*)
          if (
            feature.status === 'in_progress' ||
            (feature.status && feature.status.startsWith('pipeline_'))
          ) {
            // Verify it has existing context (agent-output.md)
            const featureDir = getFeatureDir(projectPath, feature.id);
            const contextPath = path.join(featureDir, 'agent-output.md');
            try {
              await secureFs.access(contextPath);
              interruptedFeatures.push(feature);
              logger.info(
                `Found interrupted feature: ${feature.id} (${feature.title}) - status: ${feature.status}`
              );
            } catch {
              // No context file, skip this feature - it will be restarted fresh
              logger.info(`Interrupted feature ${feature.id} has no context, will restart fresh`);
            }
          }
        }
      }

      if (interruptedFeatures.length === 0) {
        logger.info('No interrupted features found');
        return;
      }

      logger.info(`Found ${interruptedFeatures.length} interrupted feature(s) to resume`);

      // Emit event to notify UI
      this.emitAutoModeEvent('auto_mode_resuming_features', {
        message: `Resuming ${interruptedFeatures.length} interrupted feature(s) after server restart`,
        projectPath,
        featureIds: interruptedFeatures.map((f) => f.id),
        features: interruptedFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
        })),
      });

      // Resume each interrupted feature
      for (const feature of interruptedFeatures) {
        try {
          logger.info(`Resuming feature: ${feature.id} (${feature.title})`);
          // Use resumeFeature which will detect the existing context and continue
          await this.resumeFeature(projectPath, feature.id, true);
        } catch (error) {
          logger.error(`Failed to resume feature ${feature.id}:`, error);
          // Continue with other features
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No features directory found, nothing to resume');
      } else {
        logger.error('Error checking for interrupted features:', error);
      }
    }
  }

  /**
   * Extract and record learnings from a completed feature
   * Uses a quick Claude call to identify important decisions and patterns
   */
  private async recordLearningsFromFeature(
    projectPath: string,
    feature: Feature,
    agentOutput: string
  ): Promise<void> {
    if (!agentOutput || agentOutput.length < 100) {
      // Not enough output to extract learnings from
      console.log(
        `[AutoMode] Skipping learning extraction - output too short (${agentOutput?.length || 0} chars)`
      );
      return;
    }

    console.log(
      `[AutoMode] Extracting learnings from feature "${feature.title}" (${agentOutput.length} chars)`
    );

    // Limit output to avoid token limits
    const truncatedOutput = agentOutput.length > 10000 ? agentOutput.slice(-10000) : agentOutput;

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build user prompt using centralized template with variable substitution
    let userPrompt = prompts.taskExecution.learningExtractionUserPromptTemplate;
    userPrompt = userPrompt.replace(/\{\{featureTitle\}\}/g, feature.title || '');
    userPrompt = userPrompt.replace(/\{\{implementationLog\}\}/g, truncatedOutput);

    try {
      // Get model from phase settings
      const settings = await this.settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.memoryExtractionModel || DEFAULT_PHASE_MODELS.memoryExtractionModel;
      const { model } = resolvePhaseModel(phaseModelEntry);
      const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY);
      let resolvedModel = model;

      if (isClaudeModel(model) && !hasClaudeKey) {
        const fallbackModel = feature.model
          ? resolveModelString(feature.model, DEFAULT_MODELS.claude)
          : null;
        if (fallbackModel && !isClaudeModel(fallbackModel)) {
          console.log(
            `[AutoMode] Claude not configured for memory extraction; using feature model "${fallbackModel}".`
          );
          resolvedModel = fallbackModel;
        } else {
          console.log(
            '[AutoMode] Claude not configured for memory extraction; skipping learning extraction.'
          );
          return;
        }
      }

      const result = await simpleQuery({
        prompt: userPrompt,
        model: resolvedModel,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: prompts.taskExecution.learningExtractionSystemPrompt,
      });

      const responseText = result.text;

      console.log(`[AutoMode] Learning extraction response: ${responseText.length} chars`);
      console.log(`[AutoMode] Response preview: ${responseText.substring(0, 300)}`);

      // Parse the response - handle JSON in markdown code blocks or raw
      let jsonStr: string | null = null;

      // First try to find JSON in markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        console.log('[AutoMode] Found JSON in code block');
        jsonStr = codeBlockMatch[1];
      } else {
        // Fall back to finding balanced braces containing "learnings"
        // Use a more precise approach: find the opening brace before "learnings"
        const learningsIndex = responseText.indexOf('"learnings"');
        if (learningsIndex !== -1) {
          // Find the opening brace before "learnings"
          let braceStart = responseText.lastIndexOf('{', learningsIndex);
          if (braceStart !== -1) {
            // Find matching closing brace
            let braceCount = 0;
            let braceEnd = -1;
            for (let i = braceStart; i < responseText.length; i++) {
              if (responseText[i] === '{') braceCount++;
              if (responseText[i] === '}') braceCount--;
              if (braceCount === 0) {
                braceEnd = i;
                break;
              }
            }
            if (braceEnd !== -1) {
              jsonStr = responseText.substring(braceStart, braceEnd + 1);
            }
          }
        }
      }

      if (!jsonStr) {
        console.log('[AutoMode] Could not extract JSON from response');
        return;
      }

      console.log(`[AutoMode] Extracted JSON: ${jsonStr.substring(0, 200)}`);

      let parsed: { learnings?: unknown[] };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        console.warn('[AutoMode] Failed to parse learnings JSON:', jsonStr.substring(0, 200));
        return;
      }

      if (!parsed.learnings || !Array.isArray(parsed.learnings)) {
        console.log('[AutoMode] No learnings array in parsed response');
        return;
      }

      console.log(`[AutoMode] Found ${parsed.learnings.length} potential learnings`);

      // Valid learning types
      const validTypes = new Set(['decision', 'learning', 'pattern', 'gotcha']);

      // Record each learning
      for (const item of parsed.learnings) {
        // Validate required fields with proper type narrowing
        if (!item || typeof item !== 'object') continue;

        const learning = item as Record<string, unknown>;
        if (
          !learning.category ||
          typeof learning.category !== 'string' ||
          !learning.content ||
          typeof learning.content !== 'string' ||
          !learning.content.trim()
        ) {
          continue;
        }

        // Validate and normalize type
        const typeStr = typeof learning.type === 'string' ? learning.type : 'learning';
        const learningType = validTypes.has(typeStr)
          ? (typeStr as 'decision' | 'learning' | 'pattern' | 'gotcha')
          : 'learning';

        console.log(
          `[AutoMode] Appending learning: category=${learning.category}, type=${learningType}`
        );
        await appendLearning(
          projectPath,
          {
            category: learning.category,
            type: learningType,
            content: learning.content.trim(),
            context: typeof learning.context === 'string' ? learning.context : undefined,
            why: typeof learning.why === 'string' ? learning.why : undefined,
            rejected: typeof learning.rejected === 'string' ? learning.rejected : undefined,
            tradeoffs: typeof learning.tradeoffs === 'string' ? learning.tradeoffs : undefined,
            breaking: typeof learning.breaking === 'string' ? learning.breaking : undefined,
          },
          secureFs as Parameters<typeof appendLearning>[2]
        );
      }

      const validLearnings = parsed.learnings.filter(
        (l) => l && typeof l === 'object' && (l as Record<string, unknown>).content
      );
      if (validLearnings.length > 0) {
        console.log(
          `[AutoMode] Recorded ${parsed.learnings.length} learning(s) from feature ${feature.id}`
        );
      }
    } catch (error) {
      console.warn(`[AutoMode] Failed to extract learnings from feature ${feature.id}:`, error);
    }
  }
}
