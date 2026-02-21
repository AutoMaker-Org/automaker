/**
 * AutoModeServiceFacade - Clean interface for auto-mode functionality
 *
 * This facade provides a thin delegation layer over the extracted services,
 * exposing all 23 public methods that routes currently call on AutoModeService.
 *
 * Key design decisions:
 * - Per-project factory pattern (projectPath is implicit in method calls)
 * - Clean method names (e.g., startAutoLoop instead of startAutoLoopForProject)
 * - Thin delegation to underlying services - no new business logic
 * - Maintains backward compatibility during transition period
 */

import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Feature, PlanningMode, ThinkingLevel } from '@automaker/types';
import { DEFAULT_MAX_CONCURRENCY, DEFAULT_MODELS, stripProviderPrefix } from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';
import { createLogger, loadContextFiles, classifyError } from '@automaker/utils';
import { getFeatureDir } from '@automaker/platform';
import * as secureFs from '../../lib/secure-fs.js';
import { validateWorkingDirectory, createAutoModeOptions } from '../../lib/sdk-options.js';
import {
  getPromptCustomization,
  getProviderByModelId,
  getMCPServersFromSettings,
  getDefaultMaxTurnsSetting,
} from '../../lib/settings-helpers.js';
import { execGitCommand } from '@automaker/git-utils';
import { TypedEventBus } from '../typed-event-bus.js';
import { ConcurrencyManager } from '../concurrency-manager.js';
import { WorktreeResolver } from '../worktree-resolver.js';
import { FeatureStateManager } from '../feature-state-manager.js';
import { PlanApprovalService } from '../plan-approval-service.js';
import { AutoLoopCoordinator, type AutoModeConfig } from '../auto-loop-coordinator.js';
import { ExecutionService } from '../execution-service.js';
import { RecoveryService } from '../recovery-service.js';
import { PipelineOrchestrator } from '../pipeline-orchestrator.js';
import { AgentExecutor } from '../agent-executor.js';
import { TestRunnerService } from '../test-runner-service.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { FeatureLoader } from '../feature-loader.js';
import type { SettingsService } from '../settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type {
  FacadeOptions,
  FacadeError,
  AutoModeStatus,
  ProjectAutoModeStatus,
  WorktreeCapacityInfo,
  RunningAgentInfo,
  OrphanedFeatureInfo,
} from './types.js';

const execAsync = promisify(exec);
const logger = createLogger('AutoModeServiceFacade');

/**
 * AutoModeServiceFacade provides a clean interface for auto-mode functionality.
 *
 * Created via factory pattern with a specific projectPath, allowing methods
 * to use clean names without requiring projectPath as a parameter.
 */
export class AutoModeServiceFacade {
  private constructor(
    private readonly projectPath: string,
    private readonly events: EventEmitter,
    private readonly eventBus: TypedEventBus,
    private readonly concurrencyManager: ConcurrencyManager,
    private readonly worktreeResolver: WorktreeResolver,
    private readonly featureStateManager: FeatureStateManager,
    private readonly featureLoader: FeatureLoader,
    private readonly planApprovalService: PlanApprovalService,
    private readonly autoLoopCoordinator: AutoLoopCoordinator,
    private readonly executionService: ExecutionService,
    private readonly recoveryService: RecoveryService,
    private readonly pipelineOrchestrator: PipelineOrchestrator,
    private readonly settingsService: SettingsService | null
  ) {}

  /**
   * Classify and log an error at the facade boundary.
   * Emits an error event to the UI so failures are surfaced to the user.
   *
   * @param error - The caught error
   * @param method - The facade method name where the error occurred
   * @param featureId - Optional feature ID for context
   * @returns The classified FacadeError for structured consumption
   */
  private handleFacadeError(error: unknown, method: string, featureId?: string): FacadeError {
    const errorInfo = classifyError(error);

    // Log at the facade boundary for debugging
    logger.error(
      `[${method}] ${featureId ? `Feature ${featureId}: ` : ''}${errorInfo.message}`,
      error
    );

    // Emit error event to UI unless it's an abort/cancellation
    if (!errorInfo.isAbort && !errorInfo.isCancellation) {
      this.eventBus.emitAutoModeEvent('auto_mode_error', {
        featureId: featureId ?? null,
        featureName: undefined,
        branchName: null,
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath: this.projectPath,
      });
    }

    return {
      method,
      errorType: errorInfo.type,
      message: errorInfo.message,
      featureId,
      projectPath: this.projectPath,
    };
  }

  /**
   * Create a new AutoModeServiceFacade instance for a specific project.
   *
   * @param projectPath - The project path this facade operates on
   * @param options - Configuration options including events, settingsService, featureLoader
   */
  static create(projectPath: string, options: FacadeOptions): AutoModeServiceFacade {
    const {
      events,
      settingsService = null,
      featureLoader = new FeatureLoader(),
      sharedServices,
    } = options;

    // Use shared services if provided, otherwise create new ones
    // Shared services allow multiple facades to share state (e.g., running features, auto loops)
    const eventBus = sharedServices?.eventBus ?? new TypedEventBus(events);
    const worktreeResolver = sharedServices?.worktreeResolver ?? new WorktreeResolver();
    const concurrencyManager =
      sharedServices?.concurrencyManager ??
      new ConcurrencyManager((p) => worktreeResolver.getCurrentBranch(p));
    const featureStateManager = new FeatureStateManager(events, featureLoader);
    const planApprovalService = new PlanApprovalService(
      eventBus,
      featureStateManager,
      settingsService
    );
    const agentExecutor = new AgentExecutor(
      eventBus,
      featureStateManager,
      planApprovalService,
      settingsService
    );
    const testRunnerService = new TestRunnerService();

    // Helper for building feature prompts (used by pipeline orchestrator)
    const buildFeaturePrompt = (
      feature: Feature,
      prompts: { implementationInstructions: string; playwrightVerificationInstructions: string }
    ): string => {
      const title =
        feature.title || feature.description?.split('\n')[0]?.substring(0, 60) || 'Untitled';
      let prompt = `## Feature Implementation Task\n\n**Feature ID:** ${feature.id}\n**Title:** ${title}\n**Description:** ${feature.description}\n`;
      if (feature.spec) {
        prompt += `\n**Specification:**\n${feature.spec}\n`;
      }
      if (!feature.skipTests) {
        prompt += `\n${prompts.implementationInstructions}\n\n${prompts.playwrightVerificationInstructions}`;
      } else {
        prompt += `\n${prompts.implementationInstructions}`;
      }
      return prompt;
    };

    // Create placeholder callbacks - will be bound to facade methods after creation.
    // These use closures to capture the facade instance once created.
    // INVARIANT: All callbacks passed to PipelineOrchestrator, AutoLoopCoordinator,
    // and ExecutionService are invoked asynchronously (never during construction),
    // so facadeInstance is guaranteed to be assigned before any callback runs.
    let facadeInstance: AutoModeServiceFacade | null = null;
    const getFacade = (): AutoModeServiceFacade => {
      if (!facadeInstance) {
        throw new Error(
          'AutoModeServiceFacade not yet initialized — callback invoked during construction'
        );
      }
      return facadeInstance;
    };

    /**
     * Shared agent-run helper used by both PipelineOrchestrator and ExecutionService.
     *
     * Resolves the model string, looks up the custom provider/credentials via
     * getProviderByModelId, then delegates to agentExecutor.execute with the
     * full payload.  The opts parameter uses an index-signature union so it
     * accepts both the typed ExecutionService opts object and the looser
     * Record<string, unknown> used by PipelineOrchestrator without requiring
     * type casts at the call sites.
     */
    const createRunAgentFn =
      () =>
      async (
        workDir: string,
        featureId: string,
        prompt: string,
        abortController: AbortController,
        pPath: string,
        imagePaths?: string[],
        model?: string,
        opts?: {
          planningMode?: PlanningMode;
          requirePlanApproval?: boolean;
          previousContent?: string;
          systemPrompt?: string;
          autoLoadClaudeMd?: boolean;
          thinkingLevel?: ThinkingLevel;
          branchName?: string | null;
          [key: string]: unknown;
        }
      ): Promise<void> => {
        const resolvedModel = resolveModelString(model, DEFAULT_MODELS.claude);
        const provider = ProviderFactory.getProviderForModel(resolvedModel);
        const effectiveBareModel = stripProviderPrefix(resolvedModel);

        // Resolve custom provider (GLM, MiniMax, etc.) for baseUrl and credentials
        let claudeCompatibleProvider:
          | import('@automaker/types').ClaudeCompatibleProvider
          | undefined;
        let credentials: import('@automaker/types').Credentials | undefined;
        if (settingsService) {
          const providerResult = await getProviderByModelId(
            resolvedModel,
            settingsService,
            '[AutoModeFacade]'
          );
          if (providerResult.provider) {
            claudeCompatibleProvider = providerResult.provider;
            credentials = providerResult.credentials;
          }
        }

        // Build sdkOptions with proper maxTurns and allowedTools for auto-mode.
        // Without this, maxTurns would be undefined, causing providers to use their
        // internal defaults which may be much lower than intended (e.g., Codex CLI's
        // default turn limit can cause feature runs to stop prematurely).
        const autoLoadClaudeMd = opts?.autoLoadClaudeMd ?? false;
        let mcpServers: Record<string, unknown> | undefined;
        try {
          if (settingsService) {
            const servers = await getMCPServersFromSettings(settingsService, '[AutoModeFacade]');
            if (Object.keys(servers).length > 0) {
              mcpServers = servers;
            }
          }
        } catch {
          // MCP servers are optional - continue without them
        }

        // Read user-configured max turns from settings
        const userMaxTurns = await getDefaultMaxTurnsSetting(settingsService, '[AutoModeFacade]');

        const sdkOpts = createAutoModeOptions({
          cwd: workDir,
          model: resolvedModel,
          systemPrompt: opts?.systemPrompt,
          abortController,
          autoLoadClaudeMd,
          thinkingLevel: opts?.thinkingLevel,
          maxTurns: userMaxTurns,
          mcpServers: mcpServers as
            | Record<string, import('@automaker/types').McpServerConfig>
            | undefined,
        });

        logger.info(
          `[createRunAgentFn] Feature ${featureId}: model=${resolvedModel}, ` +
            `maxTurns=${sdkOpts.maxTurns}, allowedTools=${(sdkOpts.allowedTools as string[])?.length ?? 'default'}, ` +
            `provider=${provider.getName()}`
        );

        await agentExecutor.execute(
          {
            workDir,
            featureId,
            prompt,
            projectPath: pPath,
            abortController,
            imagePaths,
            model: resolvedModel,
            planningMode: opts?.planningMode as PlanningMode | undefined,
            requirePlanApproval: opts?.requirePlanApproval as boolean | undefined,
            previousContent: opts?.previousContent as string | undefined,
            systemPrompt: opts?.systemPrompt as string | undefined,
            autoLoadClaudeMd: opts?.autoLoadClaudeMd as boolean | undefined,
            thinkingLevel: opts?.thinkingLevel as ThinkingLevel | undefined,
            branchName: opts?.branchName as string | null | undefined,
            provider,
            effectiveBareModel,
            credentials,
            claudeCompatibleProvider,
            mcpServers,
            sdkOptions: {
              maxTurns: sdkOpts.maxTurns,
              allowedTools: sdkOpts.allowedTools as string[] | undefined,
              systemPrompt: sdkOpts.systemPrompt,
              settingSources: sdkOpts.settingSources as
                | Array<'user' | 'project' | 'local'>
                | undefined,
            },
          },
          {
            waitForApproval: (fId, projPath) => planApprovalService.waitForApproval(fId, projPath),
            saveFeatureSummary: (projPath, fId, summary) =>
              featureStateManager.saveFeatureSummary(projPath, fId, summary),
            updateFeatureSummary: (projPath, fId, summary) =>
              featureStateManager.saveFeatureSummary(projPath, fId, summary),
            buildTaskPrompt: (task, allTasks, taskIndex, _planContent, template, feedback) => {
              let taskPrompt = template
                .replace(/\{\{taskName\}\}/g, task.description || `Task ${task.id}`)
                .replace(/\{\{taskIndex\}\}/g, String(taskIndex + 1))
                .replace(/\{\{totalTasks\}\}/g, String(allTasks.length))
                .replace(/\{\{taskDescription\}\}/g, task.description || `Task ${task.id}`);
              if (feedback) {
                taskPrompt = taskPrompt.replace(/\{\{userFeedback\}\}/g, feedback);
              }
              return taskPrompt;
            },
          }
        );
      };

    // PipelineOrchestrator - runAgentFn delegates to AgentExecutor via shared helper
    const pipelineOrchestrator = new PipelineOrchestrator(
      eventBus,
      featureStateManager,
      agentExecutor,
      testRunnerService,
      worktreeResolver,
      concurrencyManager,
      settingsService,
      // Callbacks
      (pPath, featureId, status) =>
        featureStateManager.updateFeatureStatus(pPath, featureId, status),
      loadContextFiles,
      buildFeaturePrompt,
      (pPath, featureId, useWorktrees, _isAutoMode, _model, opts) =>
        getFacade().executeFeature(featureId, useWorktrees, false, undefined, opts),
      createRunAgentFn()
    );

    // AutoLoopCoordinator - ALWAYS create new with proper execution callbacks
    // NOTE: We don't use sharedServices.autoLoopCoordinator because it doesn't have
    // execution callbacks. Each facade needs its own coordinator to execute features.
    // The shared coordinator in GlobalAutoModeService is for monitoring only.
    const autoLoopCoordinator = new AutoLoopCoordinator(
      eventBus,
      concurrencyManager,
      settingsService,
      // Callbacks
      (pPath, featureId, useWorktrees, isAutoMode) =>
        getFacade().executeFeature(featureId, useWorktrees, isAutoMode),
      async (pPath, branchName) => {
        const features = await featureLoader.getAll(pPath);
        // For main worktree (branchName === null), resolve the actual primary branch name
        // so features with branchName matching the primary branch are included
        let primaryBranch: string | null = null;
        if (branchName === null) {
          primaryBranch = await worktreeResolver.getCurrentBranch(pPath);
        }
        return features.filter(
          (f) =>
            (f.status === 'backlog' || f.status === 'ready') &&
            (branchName === null
              ? !f.branchName || (primaryBranch && f.branchName === primaryBranch)
              : f.branchName === branchName)
        );
      },
      (pPath, branchName, maxConcurrency) =>
        getFacade().saveExecutionStateForProject(branchName, maxConcurrency),
      (pPath, branchName) => getFacade().clearExecutionState(branchName),
      (pPath) => featureStateManager.resetStuckFeatures(pPath),
      (feature) =>
        feature.status === 'completed' ||
        feature.status === 'verified' ||
        feature.status === 'waiting_approval',
      (featureId) => concurrencyManager.isRunning(featureId),
      async (pPath) => featureLoader.getAll(pPath)
    );

    /**
     * Iterate all active worktrees for this project, falling back to the
     * main worktree (null) when none are active.
     */
    const forEachProjectWorktree = (fn: (branchName: string | null) => void): void => {
      const projectWorktrees = autoLoopCoordinator
        .getActiveWorktrees()
        .filter((w) => w.projectPath === projectPath);
      if (projectWorktrees.length === 0) {
        fn(null);
      } else {
        for (const w of projectWorktrees) {
          fn(w.branchName);
        }
      }
    };

    // ExecutionService - runAgentFn delegates to AgentExecutor via shared helper
    const executionService = new ExecutionService(
      eventBus,
      concurrencyManager,
      worktreeResolver,
      settingsService,
      createRunAgentFn(),
      (context) => pipelineOrchestrator.executePipeline(context),
      (pPath, featureId, status) =>
        featureStateManager.updateFeatureStatus(pPath, featureId, status),
      (pPath, featureId) => featureStateManager.loadFeature(pPath, featureId),
      async (_feature) => {
        // getPlanningPromptPrefixFn - planning prompts handled by AutoModeService
        return '';
      },
      (pPath, featureId, summary) =>
        featureStateManager.saveFeatureSummary(pPath, featureId, summary),
      async () => {
        /* recordLearnings - stub */
      },
      (pPath, featureId) => getFacade().contextExists(featureId),
      (pPath, featureId, useWorktrees, _calledInternally) =>
        getFacade().resumeFeature(featureId, useWorktrees, _calledInternally),
      (errorInfo) => {
        // Track failure against ALL active worktrees for this project.
        // The ExecutionService callbacks don't receive branchName, so we
        // iterate all active worktrees. Uses a for-of loop (not .some()) to
        // ensure every worktree's failure counter is incremented.
        let shouldPause = false;
        forEachProjectWorktree((branchName) => {
          if (
            autoLoopCoordinator.trackFailureAndCheckPauseForProject(
              projectPath,
              branchName,
              errorInfo
            )
          ) {
            shouldPause = true;
          }
        });
        return shouldPause;
      },
      (errorInfo) => {
        forEachProjectWorktree((branchName) =>
          autoLoopCoordinator.signalShouldPauseForProject(projectPath, branchName, errorInfo)
        );
      },
      () => {
        // Record success to clear failure tracking. This prevents failures
        // from accumulating over time and incorrectly pausing auto mode.
        forEachProjectWorktree((branchName) =>
          autoLoopCoordinator.recordSuccessForProject(projectPath, branchName)
        );
      },
      (_pPath) => getFacade().saveExecutionState(),
      loadContextFiles
    );

    // RecoveryService
    const recoveryService = new RecoveryService(
      eventBus,
      concurrencyManager,
      settingsService,
      // Callbacks
      (pPath, featureId, useWorktrees, isAutoMode, providedWorktreePath, opts) =>
        getFacade().executeFeature(featureId, useWorktrees, isAutoMode, providedWorktreePath, opts),
      (pPath, featureId) => featureStateManager.loadFeature(pPath, featureId),
      (pPath, featureId, status) =>
        pipelineOrchestrator.detectPipelineStatus(pPath, featureId, status),
      (pPath, feature, useWorktrees, pipelineInfo) =>
        pipelineOrchestrator.resumePipeline(pPath, feature, useWorktrees, pipelineInfo),
      (featureId) => concurrencyManager.isRunning(featureId),
      (opts) => concurrencyManager.acquire(opts),
      (featureId) => concurrencyManager.release(featureId)
    );

    // Create the facade instance
    facadeInstance = new AutoModeServiceFacade(
      projectPath,
      events,
      eventBus,
      concurrencyManager,
      worktreeResolver,
      featureStateManager,
      featureLoader,
      planApprovalService,
      autoLoopCoordinator,
      executionService,
      recoveryService,
      pipelineOrchestrator,
      settingsService
    );

    return facadeInstance;
  }

  // ===========================================================================
  // AUTO LOOP CONTROL (4 methods)
  // ===========================================================================

  /**
   * Start the auto mode loop for this project/worktree
   * @param branchName - The branch name for worktree scoping, null for main worktree
   * @param maxConcurrency - Maximum concurrent features
   */
  async startAutoLoop(branchName: string | null = null, maxConcurrency?: number): Promise<number> {
    try {
      return await this.autoLoopCoordinator.startAutoLoopForProject(
        this.projectPath,
        branchName,
        maxConcurrency
      );
    } catch (error) {
      this.handleFacadeError(error, 'startAutoLoop');
      throw error;
    }
  }

  /**
   * Stop the auto mode loop for this project/worktree
   * @param branchName - The branch name, or null for main worktree
   */
  async stopAutoLoop(branchName: string | null = null): Promise<number> {
    try {
      return await this.autoLoopCoordinator.stopAutoLoopForProject(this.projectPath, branchName);
    } catch (error) {
      this.handleFacadeError(error, 'stopAutoLoop');
      throw error;
    }
  }

  /**
   * Check if auto mode is running for this project/worktree
   * @param branchName - The branch name, or null for main worktree
   */
  isAutoLoopRunning(branchName: string | null = null): boolean {
    return this.autoLoopCoordinator.isAutoLoopRunningForProject(this.projectPath, branchName);
  }

  /**
   * Get auto loop config for this project/worktree
   * @param branchName - The branch name, or null for main worktree
   */
  getAutoLoopConfig(branchName: string | null = null): AutoModeConfig | null {
    return this.autoLoopCoordinator.getAutoLoopConfigForProject(this.projectPath, branchName);
  }

  // ===========================================================================
  // FEATURE EXECUTION (6 methods)
  // ===========================================================================

  /**
   * Execute a single feature
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   * @param providedWorktreePath - Optional pre-resolved worktree path
   * @param options - Additional execution options
   */
  async executeFeature(
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: {
      continuationPrompt?: string;
      _calledInternally?: boolean;
    }
  ): Promise<void> {
    try {
      return await this.executionService.executeFeature(
        this.projectPath,
        featureId,
        useWorktrees,
        isAutoMode,
        providedWorktreePath,
        options
      );
    } catch (error) {
      this.handleFacadeError(error, 'executeFeature', featureId);
      throw error;
    }
  }

  /**
   * Stop a specific feature
   * @param featureId - ID of the feature to stop
   */
  async stopFeature(featureId: string): Promise<boolean> {
    try {
      // Cancel any pending plan approval for this feature
      this.cancelPlanApproval(featureId);
      return await this.executionService.stopFeature(featureId);
    } catch (error) {
      this.handleFacadeError(error, 'stopFeature', featureId);
      throw error;
    }
  }

  /**
   * Resume a feature (continues from saved context or starts fresh)
   * @param featureId - ID of the feature to resume
   * @param useWorktrees - Whether to use git worktrees
   * @param _calledInternally - Internal flag for nested calls
   */
  async resumeFeature(
    featureId: string,
    useWorktrees = false,
    _calledInternally = false
  ): Promise<void> {
    // Note: ExecutionService.executeFeature catches its own errors internally and
    // does NOT re-throw them (it emits auto_mode_error and returns normally).
    // Therefore, errors that reach this catch block are pre-execution failures
    // (e.g., feature not found, context read error) that ExecutionService never
    // handled — so calling handleFacadeError here does NOT produce duplicate events.
    try {
      return await this.recoveryService.resumeFeature(
        this.projectPath,
        featureId,
        useWorktrees,
        _calledInternally
      );
    } catch (error) {
      this.handleFacadeError(error, 'resumeFeature', featureId);
      throw error;
    }
  }

  /**
   * Follow up on a feature with additional instructions
   * @param featureId - The feature ID
   * @param prompt - Follow-up prompt
   * @param imagePaths - Optional image paths
   * @param useWorktrees - Whether to use worktrees
   */
  async followUpFeature(
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    validateWorkingDirectory(this.projectPath);

    try {
      // Load feature to build the prompt context
      const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
      if (!feature) throw new Error(`Feature ${featureId} not found`);

      // Read previous agent output as context
      const featureDir = getFeatureDir(this.projectPath, featureId);
      let previousContext = '';
      try {
        previousContext = (await secureFs.readFile(
          path.join(featureDir, 'agent-output.md'),
          'utf-8'
        )) as string;
      } catch {
        // No previous context available - that's OK
      }

      // Build the feature prompt section
      const featurePrompt = `## Feature Implementation Task\n\n**Feature ID:** ${feature.id}\n**Title:** ${feature.title || 'Untitled Feature'}\n**Description:** ${feature.description}\n`;

      // Get the follow-up prompt template and build the continuation prompt
      const prompts = await getPromptCustomization(this.settingsService, '[Facade]');
      let continuationPrompt = prompts.autoMode.followUpPromptTemplate;
      continuationPrompt = continuationPrompt
        .replace(/\{\{featurePrompt\}\}/g, featurePrompt)
        .replace(/\{\{previousContext\}\}/g, previousContext)
        .replace(/\{\{followUpInstructions\}\}/g, prompt);

      // Store image paths on the feature so executeFeature can pick them up
      if (imagePaths && imagePaths.length > 0) {
        feature.imagePaths = imagePaths.map((p) => ({
          path: p,
          filename: p.split('/').pop() || p,
          mimeType: 'image/*',
        }));
        await this.featureStateManager.updateFeatureStatus(
          this.projectPath,
          featureId,
          feature.status || 'in_progress'
        );
      }

      // Delegate to executeFeature with the built continuation prompt
      await this.executeFeature(featureId, useWorktrees, false, undefined, {
        continuationPrompt,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      if (!errorInfo.isAbort) {
        this.eventBus.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: undefined,
          branchName: null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath: this.projectPath,
        });
      }
      throw error;
    }
  }

  /**
   * Verify a feature's implementation
   * @param featureId - The feature ID to verify
   */
  async verifyFeature(featureId: string): Promise<boolean> {
    const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
    let workDir = this.projectPath;

    // Use worktreeResolver to find worktree path (consistent with commitFeature)
    const branchName = feature?.branchName;
    if (branchName) {
      const resolved = await this.worktreeResolver.findWorktreeForBranch(
        this.projectPath,
        branchName
      );
      if (resolved) {
        try {
          await secureFs.access(resolved);
          workDir = resolved;
        } catch {
          // Fall back to project path
        }
      }
    }

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
        const { stdout, stderr } = await execAsync(check.cmd, { cwd: workDir, timeout: 120000 });
        results.push({ check: check.name, passed: true, output: stdout || stderr });
      } catch (error) {
        allPassed = false;
        results.push({ check: check.name, passed: false, output: (error as Error).message });
        break;
      }
    }

    const runningEntryForVerify = this.concurrencyManager.getRunningFeature(featureId);
    if (runningEntryForVerify?.isAutoMode) {
      this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature?.title,
        branchName: feature?.branchName ?? null,
        passes: allPassed,
        message: allPassed
          ? 'All verification checks passed'
          : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,
        projectPath: this.projectPath,
      });
    }

    return allPassed;
  }

  /**
   * Commit feature changes
   * @param featureId - The feature ID to commit
   * @param providedWorktreePath - Optional worktree path
   */
  async commitFeature(featureId: string, providedWorktreePath?: string): Promise<string | null> {
    let workDir = this.projectPath;

    if (providedWorktreePath) {
      try {
        await secureFs.access(providedWorktreePath);
        workDir = providedWorktreePath;
      } catch {
        // Use project path
      }
    } else {
      // Use worktreeResolver instead of manual .worktrees lookup
      const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
      const branchName = feature?.branchName;
      if (branchName) {
        const resolved = await this.worktreeResolver.findWorktreeForBranch(
          this.projectPath,
          branchName
        );
        if (resolved) {
          workDir = resolved;
        }
      }
    }

    try {
      const status = await execGitCommand(['status', '--porcelain'], workDir);
      if (!status.trim()) {
        return null;
      }

      const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
      const title =
        feature?.description?.split('\n')[0]?.substring(0, 60) || `Feature ${featureId}`;
      const commitMessage = `feat: ${title}\n\nImplemented by Automaker auto-mode`;

      await execGitCommand(['add', '-A'], workDir);
      await execGitCommand(['commit', '-m', commitMessage], workDir);
      const hash = await execGitCommand(['rev-parse', 'HEAD'], workDir);

      const runningEntryForCommit = this.concurrencyManager.getRunningFeature(featureId);
      if (runningEntryForCommit?.isAutoMode) {
        this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature?.title,
          branchName: feature?.branchName ?? null,
          passes: true,
          message: `Changes committed: ${hash.trim().substring(0, 8)}`,
          projectPath: this.projectPath,
        });
      }

      return hash.trim();
    } catch (error) {
      logger.error(`Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  // ===========================================================================
  // STATUS AND QUERIES (7 methods)
  // ===========================================================================

  /**
   * Get current status (global across all projects)
   */
  getStatus(): AutoModeStatus {
    const allRunning = this.concurrencyManager.getAllRunning();
    return {
      isRunning: allRunning.length > 0,
      runningFeatures: allRunning.map((rf) => rf.featureId),
      runningCount: allRunning.length,
    };
  }

  /**
   * Get status for this project/worktree
   * @param branchName - The branch name, or null for main worktree
   */
  async getStatusForProject(branchName: string | null = null): Promise<ProjectAutoModeStatus> {
    const isAutoLoopRunning = this.autoLoopCoordinator.isAutoLoopRunningForProject(
      this.projectPath,
      branchName
    );
    const config = this.autoLoopCoordinator.getAutoLoopConfigForProject(
      this.projectPath,
      branchName
    );
    // Use branchName-normalized filter so features with branchName "main"
    // are correctly matched when querying for the main worktree (null)
    const runningFeatures = await this.concurrencyManager.getRunningFeaturesForWorktree(
      this.projectPath,
      branchName
    );

    return {
      isAutoLoopRunning,
      runningFeatures,
      runningCount: runningFeatures.length,
      maxConcurrency: config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      branchName,
    };
  }

  /**
   * Get all active auto loop projects (unique project paths)
   */
  getActiveAutoLoopProjects(): string[] {
    return this.autoLoopCoordinator.getActiveProjects();
  }

  /**
   * Get all active auto loop worktrees
   */
  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    return this.autoLoopCoordinator.getActiveWorktrees();
  }

  /**
   * Get detailed info about all running agents
   */
  async getRunningAgents(): Promise<RunningAgentInfo[]> {
    const agents = await Promise.all(
      this.concurrencyManager.getAllRunning().map(async (rf) => {
        let title: string | undefined;
        let description: string | undefined;
        let branchName: string | undefined;

        try {
          const feature = await this.featureLoader.get(rf.projectPath, rf.featureId);
          if (feature) {
            title = feature.title;
            description = feature.description;
            branchName = feature.branchName;
          }
        } catch {
          // Silently ignore
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
          branchName,
        };
      })
    );
    return agents;
  }

  /**
   * Check if there's capacity to start a feature on a worktree
   * @param featureId - The feature ID to check capacity for
   */
  async checkWorktreeCapacity(featureId: string): Promise<WorktreeCapacityInfo> {
    const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
    const rawBranchName = feature?.branchName ?? null;
    // Normalize primary branch to null (works for main, master, or any default branch)
    const primaryBranch = await this.worktreeResolver.getCurrentBranch(this.projectPath);
    const branchName = rawBranchName === primaryBranch ? null : rawBranchName;

    const maxAgents = await this.autoLoopCoordinator.resolveMaxConcurrency(
      this.projectPath,
      branchName
    );
    const currentAgents = await this.concurrencyManager.getRunningCountForWorktree(
      this.projectPath,
      branchName
    );

    return {
      hasCapacity: currentAgents < maxAgents,
      currentAgents,
      maxAgents,
      branchName,
    };
  }

  /**
   * Check if context exists for a feature
   * @param featureId - The feature ID
   */
  async contextExists(featureId: string): Promise<boolean> {
    return this.recoveryService.contextExists(this.projectPath, featureId);
  }

  // ===========================================================================
  // PLAN APPROVAL (4 methods)
  // ===========================================================================

  /**
   * Resolve a pending plan approval
   * @param featureId - The feature ID
   * @param approved - Whether the plan was approved
   * @param editedPlan - Optional edited plan content
   * @param feedback - Optional feedback
   */
  async resolvePlanApproval(
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.planApprovalService.resolveApproval(featureId, approved, {
      editedPlan,
      feedback,
      projectPath: this.projectPath,
    });

    // Handle recovery case
    if (result.success && result.needsRecovery) {
      const feature = await this.featureStateManager.loadFeature(this.projectPath, featureId);
      if (feature) {
        const prompts = await getPromptCustomization(this.settingsService, '[Facade]');
        const planContent = editedPlan || feature.planSpec?.content || '';
        let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
        continuationPrompt = continuationPrompt.replace(/\{\{userFeedback\}\}/g, feedback || '');
        continuationPrompt = continuationPrompt.replace(/\{\{approvedPlan\}\}/g, planContent);

        // Start execution async
        this.executeFeature(featureId, true, false, undefined, { continuationPrompt }).catch(
          (error) => {
            logger.error(`Recovery execution failed for feature ${featureId}:`, error);
          }
        );
      }
    }

    return { success: result.success, error: result.error };
  }

  /**
   * Wait for plan approval
   * @param featureId - The feature ID
   */
  waitForPlanApproval(
    featureId: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }> {
    return this.planApprovalService.waitForApproval(featureId, this.projectPath);
  }

  /**
   * Check if a feature has a pending plan approval
   * @param featureId - The feature ID
   */
  hasPendingApproval(featureId: string): boolean {
    return this.planApprovalService.hasPendingApproval(featureId, this.projectPath);
  }

  /**
   * Cancel a pending plan approval
   * @param featureId - The feature ID
   */
  cancelPlanApproval(featureId: string): void {
    this.planApprovalService.cancelApproval(featureId, this.projectPath);
  }

  // ===========================================================================
  // ANALYSIS AND RECOVERY (3 methods)
  // ===========================================================================

  /**
   * Analyze project to gather context
   *
   * NOTE: This method requires complex provider integration that is only available
   * in AutoModeService. The facade exposes the method signature for API compatibility,
   * but routes should use AutoModeService.analyzeProject() until migration is complete.
   */
  async analyzeProject(): Promise<void> {
    // analyzeProject requires provider.execute which is complex to wire up
    // For now, throw to indicate routes should use AutoModeService
    throw new Error(
      'analyzeProject not fully implemented in facade - use AutoModeService.analyzeProject instead'
    );
  }

  /**
   * Resume interrupted features after server restart
   */
  async resumeInterruptedFeatures(): Promise<void> {
    return this.recoveryService.resumeInterruptedFeatures(this.projectPath);
  }

  /**
   * Detect orphaned features (features with missing branches)
   */
  async detectOrphanedFeatures(): Promise<OrphanedFeatureInfo[]> {
    const orphanedFeatures: OrphanedFeatureInfo[] = [];

    try {
      const allFeatures = await this.featureLoader.getAll(this.projectPath);
      const featuresWithBranches = allFeatures.filter(
        (f) => f.branchName && f.branchName.trim() !== ''
      );

      if (featuresWithBranches.length === 0) {
        return orphanedFeatures;
      }

      // Get existing branches (using safe array-based command)
      const stdout = await execGitCommand(
        ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
        this.projectPath
      );
      const existingBranches = new Set(
        stdout
          .trim()
          .split('\n')
          .map((b) => b.trim())
          .filter(Boolean)
      );

      const primaryBranch = await this.worktreeResolver.getCurrentBranch(this.projectPath);

      for (const feature of featuresWithBranches) {
        const branchName = feature.branchName!;
        if (primaryBranch && branchName === primaryBranch) {
          continue;
        }
        if (!existingBranches.has(branchName)) {
          orphanedFeatures.push({ feature, missingBranch: branchName });
        }
      }

      return orphanedFeatures;
    } catch (error) {
      logger.error('[detectOrphanedFeatures] Error:', error);
      return orphanedFeatures;
    }
  }

  // ===========================================================================
  // LIFECYCLE (1 method)
  // ===========================================================================

  /**
   * Mark all running features as interrupted
   * @param reason - Optional reason for the interruption
   */
  async markAllRunningFeaturesInterrupted(reason?: string): Promise<void> {
    const allRunning = this.concurrencyManager.getAllRunning();

    for (const rf of allRunning) {
      await this.featureStateManager.markFeatureInterrupted(rf.projectPath, rf.featureId, reason);
    }

    if (allRunning.length > 0) {
      logger.info(
        `Marked ${allRunning.length} running feature(s) as interrupted: ${reason || 'no reason provided'}`
      );
    }
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /**
   * Save execution state for recovery
   */
  private async saveExecutionState(): Promise<void> {
    return this.saveExecutionStateForProject(null, DEFAULT_MAX_CONCURRENCY);
  }

  /**
   * Save execution state for a specific worktree
   */
  private async saveExecutionStateForProject(
    branchName: string | null,
    maxConcurrency: number
  ): Promise<void> {
    return this.recoveryService.saveExecutionStateForProject(
      this.projectPath,
      branchName,
      maxConcurrency
    );
  }

  /**
   * Clear execution state
   */
  private async clearExecutionState(branchName: string | null = null): Promise<void> {
    return this.recoveryService.clearExecutionState(this.projectPath, branchName);
  }
}
