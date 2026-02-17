/**
 * PipelineOrchestrator - Pipeline step execution and coordination
 */

import path from 'path';
import type {
  Feature,
  PipelineStep,
  PipelineConfig,
  FeatureStatusWithPipeline,
} from '@automaker/types';
import { createLogger, loadContextFiles, classifyError } from '@automaker/utils';
import { getFeatureDir } from '@automaker/platform';
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import * as secureFs from '../lib/secure-fs.js';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
} from '../lib/settings-helpers.js';
import { validateWorkingDirectory } from '../lib/sdk-options.js';
import type { TypedEventBus } from './typed-event-bus.js';
import type { FeatureStateManager } from './feature-state-manager.js';
import type { AgentExecutor } from './agent-executor.js';
import type { WorktreeResolver } from './worktree-resolver.js';
import type { SettingsService } from './settings-service.js';
import type { ConcurrencyManager } from './concurrency-manager.js';
import { pipelineService } from './pipeline-service.js';
import type { TestRunnerService, TestRunStatus } from './test-runner-service.js';
import { performMerge } from './merge-service.js';
import type {
  PipelineContext,
  PipelineStatusInfo,
  StepResult,
  MergeResult,
  UpdateFeatureStatusFn,
  BuildFeaturePromptFn,
  ExecuteFeatureFn,
  RunAgentFn,
} from './pipeline-types.js';

// Re-export types for backward compatibility
export type {
  PipelineContext,
  PipelineStatusInfo,
  StepResult,
  MergeResult,
  UpdateFeatureStatusFn,
  BuildFeaturePromptFn,
  ExecuteFeatureFn,
  RunAgentFn,
} from './pipeline-types.js';

const logger = createLogger('PipelineOrchestrator');

export class PipelineOrchestrator {
  constructor(
    private eventBus: TypedEventBus,
    private featureStateManager: FeatureStateManager,
    private agentExecutor: AgentExecutor,
    private testRunnerService: TestRunnerService,
    private worktreeResolver: WorktreeResolver,
    private concurrencyManager: ConcurrencyManager,
    private settingsService: SettingsService | null,
    private updateFeatureStatusFn: UpdateFeatureStatusFn,
    private loadContextFilesFn: typeof loadContextFiles,
    private buildFeaturePromptFn: BuildFeaturePromptFn,
    private executeFeatureFn: ExecuteFeatureFn,
    private runAgentFn: RunAgentFn
  ) {}

  async executePipeline(ctx: PipelineContext): Promise<void> {
    const { projectPath, featureId, feature, steps, workDir, abortController, autoLoadClaudeMd } =
      ctx;
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const contextResult = await this.loadContextFilesFn({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: { title: feature.title ?? '', description: feature.description ?? '' },
    });
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);
    const contextPath = path.join(getFeatureDir(projectPath, featureId), 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      /* */
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (abortController.signal.aborted) throw new Error('Pipeline execution aborted');
      await this.updateFeatureStatusFn(projectPath, featureId, `pipeline_${step.id}`);
      this.eventBus.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        branchName: feature.branchName ?? null,
        content: `Starting pipeline step ${i + 1}/${steps.length}: ${step.name}`,
        projectPath,
      });
      this.eventBus.emitAutoModeEvent('pipeline_step_started', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      await this.runAgentFn(
        workDir,
        featureId,
        this.buildPipelineStepPrompt(step, feature, previousContext, prompts.taskExecution),
        abortController,
        projectPath,
        undefined,
        model,
        {
          projectPath,
          planningMode: 'skip',
          requirePlanApproval: false,
          previousContent: previousContext,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
        }
      );
      try {
        previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      } catch {
        /* */
      }
      this.eventBus.emitAutoModeEvent('pipeline_step_complete', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });
    }
    if (ctx.branchName) {
      const mergeResult = await this.attemptMerge(ctx);
      if (!mergeResult.success && mergeResult.hasConflicts) return;
    }
  }

  buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string,
    taskPrompts: { implementationInstructions: string; playwrightVerificationInstructions: string }
  ): string {
    let prompt = `## Pipeline Step: ${step.name}\n\nThis is an automated pipeline step.\n\n### Feature Context\n${this.buildFeaturePromptFn(feature, taskPrompts)}\n\n`;
    if (previousContext) prompt += `### Previous Work\n${previousContext}\n\n`;
    return (
      prompt +
      `### Pipeline Step Instructions\n${step.instructions}\n\n### Task\nComplete the pipeline step instructions above.`
    );
  }

  async detectPipelineStatus(
    projectPath: string,
    featureId: string,
    currentStatus: FeatureStatusWithPipeline
  ): Promise<PipelineStatusInfo> {
    const isPipeline = pipelineService.isPipelineStatus(currentStatus);
    if (!isPipeline)
      return {
        isPipeline: false,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    const stepId = pipelineService.getStepIdFromStatus(currentStatus);
    if (!stepId)
      return {
        isPipeline: true,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    const config = await pipelineService.getPipelineConfig(projectPath);
    if (!config || config.steps.length === 0)
      return { isPipeline: true, stepId, stepIndex: -1, totalSteps: 0, step: null, config: null };
    const sortedSteps = [...config.steps].sort((a, b) => a.order - b.order);
    const stepIndex = sortedSteps.findIndex((s) => s.id === stepId);
    return {
      isPipeline: true,
      stepId,
      stepIndex,
      totalSteps: sortedSteps.length,
      step: stepIndex === -1 ? null : sortedSteps[stepIndex],
      config,
    };
  }

  async resumePipeline(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    pipelineInfo: PipelineStatusInfo
  ): Promise<void> {
    const featureId = feature.id;
    const contextPath = path.join(getFeatureDir(projectPath, featureId), 'agent-output.md');
    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      /* No context */
    }

    if (!hasContext) {
      logger.warn(`No context for feature ${featureId}, restarting pipeline`);
      await this.updateFeatureStatusFn(projectPath, featureId, 'in_progress');
      return this.executeFeatureFn(projectPath, featureId, useWorktrees, false, undefined, {
        _calledInternally: true,
      });
    }

    if (pipelineInfo.stepIndex === -1) {
      logger.warn(`Step ${pipelineInfo.stepId} no longer exists, completing feature`);
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatusFn(projectPath, featureId, finalStatus);
      this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: 'Pipeline step no longer exists',
        projectPath,
      });
      return;
    }

    if (!pipelineInfo.config) throw new Error('Pipeline config is null but stepIndex is valid');
    return this.resumeFromStep(
      projectPath,
      feature,
      useWorktrees,
      pipelineInfo.stepIndex,
      pipelineInfo.config
    );
  }

  /** Resume from a specific step index */
  async resumeFromStep(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    startFromStepIndex: number,
    pipelineConfig: PipelineConfig
  ): Promise<void> {
    const featureId = feature.id;
    const allSortedSteps = [...pipelineConfig.steps].sort((a, b) => a.order - b.order);
    if (startFromStepIndex < 0 || startFromStepIndex >= allSortedSteps.length)
      throw new Error(`Invalid step index: ${startFromStepIndex}`);

    const excludedStepIds = new Set(feature.excludedPipelineSteps || []);
    let currentStep = allSortedSteps[startFromStepIndex];

    if (excludedStepIds.has(currentStep.id)) {
      const nextStatus = pipelineService.getNextStatus(
        `pipeline_${currentStep.id}`,
        pipelineConfig,
        feature.skipTests ?? false,
        feature.excludedPipelineSteps
      );
      if (!pipelineService.isPipelineStatus(nextStatus)) {
        await this.updateFeatureStatusFn(projectPath, featureId, nextStatus);
        this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          passes: true,
          message: 'Pipeline completed (remaining steps excluded)',
          projectPath,
        });
        return;
      }
      const nextStepId = pipelineService.getStepIdFromStatus(nextStatus);
      const nextStepIndex = allSortedSteps.findIndex((s) => s.id === nextStepId);
      if (nextStepIndex === -1) throw new Error(`Next step ${nextStepId} not found`);
      startFromStepIndex = nextStepIndex;
    }

    const stepsToExecute = allSortedSteps
      .slice(startFromStepIndex)
      .filter((step) => !excludedStepIds.has(step.id));
    if (stepsToExecute.length === 0) {
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatusFn(projectPath, featureId, finalStatus);
      this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: 'Pipeline completed (all steps excluded)',
        projectPath,
      });
      return;
    }

    const runningEntry = this.concurrencyManager.acquire({
      featureId,
      projectPath,
      isAutoMode: false,
      allowReuse: true,
    });
    const abortController = runningEntry.abortController;
    runningEntry.branchName = feature.branchName ?? null;

    try {
      validateWorkingDirectory(projectPath);
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        worktreePath = await this.worktreeResolver.findWorktreeForBranch(projectPath, branchName);
        if (worktreePath) logger.info(`Using worktree for branch "${branchName}": ${worktreePath}`);
      }

      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);
      validateWorkingDirectory(workDir);
      runningEntry.worktreePath = worktreePath;
      runningEntry.branchName = branchName ?? null;

      this.eventBus.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName: branchName ?? null,
        feature: {
          id: featureId,
          title: feature.title || 'Resuming Pipeline',
          description: feature.description,
        },
      });

      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );
      const context: PipelineContext = {
        projectPath,
        featureId,
        feature,
        steps: stepsToExecute,
        workDir,
        worktreePath,
        branchName: branchName ?? null,
        abortController,
        autoLoadClaudeMd,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await this.executePipeline(context);

      // Re-fetch feature to check if executePipeline set a terminal status (e.g., merge_conflict)
      const reloadedFeature = await this.featureStateManager.loadFeature(projectPath, featureId);
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';

      // Only update status if not already in a terminal state
      if (reloadedFeature && reloadedFeature.status !== 'merge_conflict') {
        await this.updateFeatureStatusFn(projectPath, featureId, finalStatus);
      }
      logger.info(`Pipeline resume completed for feature ${featureId}`);
      this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: 'Pipeline resumed successfully',
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      if (errorInfo.isAbort) {
        this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          passes: false,
          message: 'Pipeline stopped by user',
          projectPath,
        });
      } else {
        logger.error(`Pipeline resume failed for ${featureId}:`, error);
        await this.updateFeatureStatusFn(projectPath, featureId, 'backlog');
        this.eventBus.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });
      }
    } finally {
      this.concurrencyManager.release(featureId);
    }
  }

  /** Execute test step with agent fix loop (REQ-F07) */
  async executeTestStep(context: PipelineContext, testCommand: string): Promise<StepResult> {
    const { featureId, projectPath, workDir, abortController, maxTestAttempts } = context;

    for (let attempt = 1; attempt <= maxTestAttempts; attempt++) {
      if (abortController.signal.aborted)
        return { success: false, message: 'Test execution aborted' };
      logger.info(`Running tests for ${featureId} (attempt ${attempt}/${maxTestAttempts})`);

      const testResult = await this.testRunnerService.startTests(workDir, { command: testCommand });
      if (!testResult.success || !testResult.result?.sessionId)
        return {
          success: false,
          testsPassed: false,
          message: testResult.error || 'Failed to start tests',
        };

      const completionResult = await this.waitForTestCompletion(
        testResult.result.sessionId,
        abortController.signal
      );
      if (completionResult.status === 'passed') return { success: true, testsPassed: true };

      const sessionOutput = this.testRunnerService.getSessionOutput(testResult.result.sessionId);
      const scrollback = sessionOutput.result?.output || '';
      this.eventBus.emitAutoModeEvent('pipeline_test_failed', {
        featureId,
        attempt,
        maxAttempts: maxTestAttempts,
        failedTests: this.extractFailedTestNames(scrollback),
        projectPath,
      });

      if (attempt < maxTestAttempts) {
        const fixPrompt = `## Test Failures - Please Fix\n\n${this.buildTestFailureSummary(scrollback)}\n\nFix the failing tests without modifying test code unless clearly wrong.`;
        await this.runAgentFn(
          workDir,
          featureId,
          fixPrompt,
          abortController,
          projectPath,
          undefined,
          undefined,
          { projectPath, planningMode: 'skip', requirePlanApproval: false }
        );
      }
    }
    return {
      success: false,
      testsPassed: false,
      message: `Tests failed after ${maxTestAttempts} attempts`,
    };
  }

  /** Wait for test completion */
  private async waitForTestCompletion(
    sessionId: string,
    signal: AbortSignal
  ): Promise<{ status: TestRunStatus; exitCode: number | null; duration: number }> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // Check for abort
        if (signal.aborted) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve({ status: 'failed', exitCode: null, duration: 0 });
          return;
        }

        const session = this.testRunnerService.getSession(sessionId);
        if (session && session.status !== 'running' && session.status !== 'pending') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve({
            status: session.status,
            exitCode: session.exitCode,
            duration: session.finishedAt
              ? session.finishedAt.getTime() - session.startedAt.getTime()
              : 0,
          });
        }
      }, 1000);
      const timeoutId = setTimeout(() => {
        // Check for abort before timeout resolution
        if (signal.aborted) {
          clearInterval(checkInterval);
          resolve({ status: 'failed', exitCode: null, duration: 0 });
          return;
        }
        clearInterval(checkInterval);
        resolve({ status: 'failed', exitCode: null, duration: 600000 });
      }, 600000);
    });
  }

  /** Attempt to merge feature branch (REQ-F05) */
  async attemptMerge(context: PipelineContext): Promise<MergeResult> {
    const { projectPath, featureId, branchName, worktreePath, feature } = context;
    if (!branchName) return { success: false, error: 'No branch name for merge' };

    logger.info(`Attempting auto-merge for feature ${featureId} (branch: ${branchName})`);
    try {
      // Get the primary branch dynamically instead of hardcoding 'main'
      const targetBranch = await this.worktreeResolver.getCurrentBranch(projectPath);

      // Call merge service directly instead of HTTP fetch
      const result = await performMerge(
        projectPath,
        branchName,
        worktreePath || projectPath,
        targetBranch || 'main',
        {
          deleteWorktreeAndBranch: false,
        }
      );

      if (!result.success) {
        if (result.hasConflicts) {
          await this.updateFeatureStatusFn(projectPath, featureId, 'merge_conflict');
          this.eventBus.emitAutoModeEvent('pipeline_merge_conflict', {
            featureId,
            branchName,
            projectPath,
          });
          return { success: false, hasConflicts: true, needsAgentResolution: true };
        }
        return { success: false, error: result.error };
      }

      logger.info(`Auto-merge successful for feature ${featureId}`);
      this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName,
        passes: true,
        message: 'Pipeline completed and merged',
        projectPath,
      });
      return { success: true };
    } catch (error) {
      logger.error(`Merge failed for ${featureId}:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /** Shared helper to parse test output lines and extract failure information */
  private parseTestLines(scrollback: string): {
    failedTests: string[];
    passCount: number;
    failCount: number;
  } {
    const lines = scrollback.split('\n');
    const failedTests: string[] = [];
    let passCount = 0;
    let failCount = 0;

    let inFailureContext = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('FAIL') || trimmed.includes('FAILED')) {
        const match = trimmed.match(/(?:FAIL|FAILED)\s+(.+)/);
        if (match) failedTests.push(match[1].trim());
        failCount++;
        inFailureContext = true;
      } else if (trimmed.includes('PASS') || trimmed.includes('PASSED')) {
        passCount++;
        inFailureContext = false;
      }
      if (trimmed.match(/^>\s+.*\.(test|spec)\./)) {
        failedTests.push(trimmed.replace(/^>\s+/, ''));
      }
      // Only capture assertion details when they appear in failure context
      // or match explicit assertion error / expect patterns
      if (trimmed.includes('AssertionError') || trimmed.includes('AssertionError')) {
        failedTests.push(trimmed);
      } else if (
        inFailureContext &&
        /expect\(.+\)\.(toBe|toEqual|toMatch|toThrow|toContain)\s*\(/.test(trimmed)
      ) {
        failedTests.push(trimmed);
      } else if (
        inFailureContext &&
        (trimmed.startsWith('Expected') || trimmed.startsWith('Received'))
      ) {
        failedTests.push(trimmed);
      }
    }

    return { failedTests, passCount, failCount };
  }

  /** Build a concise test failure summary for the agent */
  buildTestFailureSummary(scrollback: string): string {
    const { failedTests, passCount, failCount } = this.parseTestLines(scrollback);
    const unique = [...new Set(failedTests)].slice(0, 10);
    return `Test Results: ${passCount} passed, ${failCount} failed.\n\nFailed tests:\n${unique.map((t) => `- ${t}`).join('\n')}\n\nOutput (last 2000 chars):\n${scrollback.slice(-2000)}`;
  }

  /** Extract failed test names from scrollback */
  private extractFailedTestNames(scrollback: string): string[] {
    const { failedTests } = this.parseTestLines(scrollback);
    return [...new Set(failedTests)].slice(0, 20);
  }
}
