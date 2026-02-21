/**
 * ExecutionService - Feature execution lifecycle coordination
 */

import path from 'path';
import type { Feature } from '@automaker/types';
import { createLogger, classifyError, loadContextFiles, recordMemoryUsage } from '@automaker/utils';
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import { getFeatureDir } from '@automaker/platform';
import { ProviderFactory } from '../providers/provider-factory.js';
import * as secureFs from '../lib/secure-fs.js';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
} from '../lib/settings-helpers.js';
import { validateWorkingDirectory } from '../lib/sdk-options.js';
import { extractSummary } from './spec-parser.js';
import type { TypedEventBus } from './typed-event-bus.js';
import type { ConcurrencyManager, RunningFeature } from './concurrency-manager.js';
import type { WorktreeResolver } from './worktree-resolver.js';
import type { SettingsService } from './settings-service.js';
import { pipelineService } from './pipeline-service.js';

// Re-export callback types from execution-types.ts for backward compatibility
export type {
  RunAgentFn,
  ExecutePipelineFn,
  UpdateFeatureStatusFn,
  LoadFeatureFn,
  GetPlanningPromptPrefixFn,
  SaveFeatureSummaryFn,
  RecordLearningsFn,
  ContextExistsFn,
  ResumeFeatureFn,
  TrackFailureFn,
  SignalPauseFn,
  RecordSuccessFn,
  SaveExecutionStateFn,
  LoadContextFilesFn,
} from './execution-types.js';

import type {
  RunAgentFn,
  ExecutePipelineFn,
  UpdateFeatureStatusFn,
  LoadFeatureFn,
  GetPlanningPromptPrefixFn,
  SaveFeatureSummaryFn,
  RecordLearningsFn,
  ContextExistsFn,
  ResumeFeatureFn,
  TrackFailureFn,
  SignalPauseFn,
  RecordSuccessFn,
  SaveExecutionStateFn,
  LoadContextFilesFn,
} from './execution-types.js';

const logger = createLogger('ExecutionService');

export class ExecutionService {
  constructor(
    private eventBus: TypedEventBus,
    private concurrencyManager: ConcurrencyManager,
    private worktreeResolver: WorktreeResolver,
    private settingsService: SettingsService | null,
    // Callback dependencies for delegation
    private runAgentFn: RunAgentFn,
    private executePipelineFn: ExecutePipelineFn,
    private updateFeatureStatusFn: UpdateFeatureStatusFn,
    private loadFeatureFn: LoadFeatureFn,
    private getPlanningPromptPrefixFn: GetPlanningPromptPrefixFn,
    private saveFeatureSummaryFn: SaveFeatureSummaryFn,
    private recordLearningsFn: RecordLearningsFn,
    private contextExistsFn: ContextExistsFn,
    private resumeFeatureFn: ResumeFeatureFn,
    private trackFailureFn: TrackFailureFn,
    private signalPauseFn: SignalPauseFn,
    private recordSuccessFn: RecordSuccessFn,
    private saveExecutionStateFn: SaveExecutionStateFn,
    private loadContextFilesFn: LoadContextFilesFn
  ) {}

  private acquireRunningFeature(options: {
    featureId: string;
    projectPath: string;
    isAutoMode: boolean;
    allowReuse?: boolean;
  }): RunningFeature {
    return this.concurrencyManager.acquire(options);
  }

  private releaseRunningFeature(featureId: string, options?: { force?: boolean }): void {
    this.concurrencyManager.release(featureId, options);
  }

  private extractTitleFromDescription(description: string | undefined): string {
    if (!description?.trim()) return 'Untitled Feature';
    const firstLine = description.split('\n')[0].trim();
    return firstLine.length <= 60 ? firstLine : firstLine.substring(0, 57) + '...';
  }

  buildFeaturePrompt(
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

    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const imgPath = typeof img === 'string' ? img : img.path;
          const filename =
            typeof img === 'string'
              ? imgPath.split('/').pop()
              : img.filename || imgPath.split('/').pop();
          const mimeType = typeof img === 'string' ? 'image/*' : img.mimeType || 'image/*';
          return `   ${idx + 1}. ${filename} (${mimeType})\n      Path: ${imgPath}`;
        })
        .join('\n');
      prompt += `\n**Context Images Attached:**\n${feature.imagePaths.length} image(s) attached:\n${imagesList}\n`;
    }

    prompt += feature.skipTests
      ? `\n${taskExecutionPrompts.implementationInstructions}`
      : `\n${taskExecutionPrompts.implementationInstructions}\n\n${taskExecutionPrompts.playwrightVerificationInstructions}`;
    return prompt;
  }

  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: { continuationPrompt?: string; _calledInternally?: boolean }
  ): Promise<void> {
    const tempRunningFeature = this.acquireRunningFeature({
      featureId,
      projectPath,
      isAutoMode,
      allowReuse: options?._calledInternally,
    });
    const abortController = tempRunningFeature.abortController;
    if (isAutoMode) await this.saveExecutionStateFn(projectPath);
    let feature: Feature | null = null;

    try {
      validateWorkingDirectory(projectPath);
      feature = await this.loadFeatureFn(projectPath, featureId);
      if (!feature) throw new Error(`Feature ${featureId} not found`);

      // Update status to in_progress immediately after acquiring the feature.
      // This prevents a race condition where the UI reloads features and sees the
      // feature still in 'backlog' status while it's actually being executed.
      // Only do this for the initial call (not internal/recursive calls which would
      // redundantly update the status).
      if (
        !options?._calledInternally &&
        (feature.status === 'backlog' ||
          feature.status === 'ready' ||
          feature.status === 'interrupted')
      ) {
        await this.updateFeatureStatusFn(projectPath, featureId, 'in_progress');
      }

      if (!options?.continuationPrompt) {
        if (feature.planSpec?.status === 'approved') {
          const prompts = await getPromptCustomization(this.settingsService, '[ExecutionService]');
          let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
          continuationPrompt = continuationPrompt
            .replace(/\{\{userFeedback\}\}/g, '')
            .replace(/\{\{approvedPlan\}\}/g, feature.planSpec.content || '');
          return await this.executeFeature(
            projectPath,
            featureId,
            useWorktrees,
            isAutoMode,
            providedWorktreePath,
            { continuationPrompt, _calledInternally: true }
          );
        }
        if (await this.contextExistsFn(projectPath, featureId)) {
          return await this.resumeFeatureFn(projectPath, featureId, useWorktrees, true);
        }
      }

      let worktreePath: string | null = providedWorktreePath ?? null;
      const branchName = feature.branchName;
      if (!worktreePath && useWorktrees && branchName) {
        worktreePath = await this.worktreeResolver.findWorktreeForBranch(projectPath, branchName);
        if (worktreePath) logger.info(`Using worktree for branch "${branchName}": ${worktreePath}`);
      }
      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);
      validateWorkingDirectory(workDir);
      tempRunningFeature.worktreePath = worktreePath;
      tempRunningFeature.branchName = branchName ?? null;
      // Ensure status is in_progress (may already be set from the early update above,
      // but internal/recursive calls skip the early update and need it here).
      // Mirror the external guard: only transition when the feature is still in
      // backlog, ready, or interrupted to avoid overwriting a concurrent terminal status.
      if (
        options?._calledInternally &&
        (feature.status === 'backlog' ||
          feature.status === 'ready' ||
          feature.status === 'interrupted')
      ) {
        await this.updateFeatureStatusFn(projectPath, featureId, 'in_progress');
      }
      this.eventBus.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName: feature.branchName ?? null,
        feature: {
          id: featureId,
          title: feature.title || 'Loading...',
          description: feature.description || 'Feature is starting',
        },
      });

      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[ExecutionService]'
      );
      const prompts = await getPromptCustomization(this.settingsService, '[ExecutionService]');
      let prompt: string;
      const contextResult = await this.loadContextFilesFn({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: feature.title ?? '',
          description: feature.description ?? '',
        },
      });
      const combinedSystemPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        prompt = options.continuationPrompt;
      } else {
        prompt =
          (await this.getPlanningPromptPrefixFn(feature)) +
          this.buildFeaturePrompt(feature, prompts.taskExecution);
        if (feature.planningMode && feature.planningMode !== 'skip') {
          this.eventBus.emitAutoModeEvent('planning_started', {
            featureId: feature.id,
            mode: feature.planningMode,
            message: `Starting ${feature.planningMode} planning phase`,
          });
        }
      }

      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === 'string' ? img : img.path
      );
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      tempRunningFeature.model = model;
      tempRunningFeature.provider = ProviderFactory.getProviderNameForModel(model);

      await this.runAgentFn(
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
          branchName: feature.branchName ?? null,
        }
      );

      // Check for incomplete tasks after agent execution.
      // The agent may have finished early (hit max turns, decided it was done, etc.)
      // while tasks are still pending. If so, re-run the agent to complete remaining tasks.
      const MAX_TASK_RETRY_ATTEMPTS = 3;
      let taskRetryAttempts = 0;
      while (!abortController.signal.aborted && taskRetryAttempts < MAX_TASK_RETRY_ATTEMPTS) {
        const currentFeature = await this.loadFeatureFn(projectPath, featureId);
        if (!currentFeature?.planSpec?.tasks) break;

        const pendingTasks = currentFeature.planSpec.tasks.filter(
          (t) => t.status === 'pending' || t.status === 'in_progress'
        );
        if (pendingTasks.length === 0) break;

        taskRetryAttempts++;
        const totalTasks = currentFeature.planSpec.tasks.length;
        const completedTasks = currentFeature.planSpec.tasks.filter(
          (t) => t.status === 'completed'
        ).length;
        logger.info(
          `[executeFeature] Feature ${featureId} has ${pendingTasks.length} incomplete tasks (${completedTasks}/${totalTasks} completed). Re-running agent (attempt ${taskRetryAttempts}/${MAX_TASK_RETRY_ATTEMPTS})`
        );

        this.eventBus.emitAutoModeEvent('auto_mode_progress', {
          featureId,
          branchName: feature.branchName ?? null,
          content: `Agent finished with ${pendingTasks.length} tasks remaining. Re-running to complete tasks (attempt ${taskRetryAttempts}/${MAX_TASK_RETRY_ATTEMPTS})...`,
          projectPath,
        });

        // Build a continuation prompt that tells the agent to finish remaining tasks
        const remainingTasksList = pendingTasks
          .map((t) => `- ${t.id}: ${t.description} (${t.status})`)
          .join('\n');

        const continuationPrompt = `## Continue Implementation - Incomplete Tasks

The previous agent session ended before all tasks were completed. Please continue implementing the remaining tasks.

**Completed:** ${completedTasks}/${totalTasks} tasks
**Remaining tasks:**
${remainingTasksList}

Please continue from where you left off and complete all remaining tasks. Use the same [TASK_START:ID] and [TASK_COMPLETE:ID] markers for each task.`;

        await this.runAgentFn(
          workDir,
          featureId,
          continuationPrompt,
          abortController,
          projectPath,
          undefined,
          model,
          {
            projectPath,
            planningMode: 'skip',
            requirePlanApproval: false,
            systemPrompt: combinedSystemPrompt || undefined,
            autoLoadClaudeMd,
            thinkingLevel: feature.thinkingLevel,
            branchName: feature.branchName ?? null,
          }
        );
      }

      // Log if tasks are still incomplete after retry attempts
      if (taskRetryAttempts >= MAX_TASK_RETRY_ATTEMPTS) {
        const finalFeature = await this.loadFeatureFn(projectPath, featureId);
        const stillPending = finalFeature?.planSpec?.tasks?.filter(
          (t) => t.status === 'pending' || t.status === 'in_progress'
        );
        if (stillPending && stillPending.length > 0) {
          logger.warn(
            `[executeFeature] Feature ${featureId} still has ${stillPending.length} incomplete tasks after ${MAX_TASK_RETRY_ATTEMPTS} retry attempts. Moving to final status.`
          );
        }
      }

      const pipelineConfig = await pipelineService.getPipelineConfig(projectPath);
      const excludedStepIds = new Set(feature.excludedPipelineSteps || []);
      const sortedSteps = [...(pipelineConfig?.steps || [])]
        .sort((a, b) => a.order - b.order)
        .filter((step) => !excludedStepIds.has(step.id));
      if (sortedSteps.length > 0) {
        await this.executePipelineFn({
          projectPath,
          featureId,
          feature,
          steps: sortedSteps,
          workDir,
          worktreePath,
          branchName: feature.branchName ?? null,
          abortController,
          autoLoadClaudeMd,
          testAttempts: 0,
          maxTestAttempts: 5,
        });
        // Check if pipeline set a terminal status (e.g., merge_conflict) — don't overwrite it
        const refreshed = await this.loadFeatureFn(projectPath, featureId);
        if (refreshed?.status === 'merge_conflict') {
          return;
        }
      }

      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatusFn(projectPath, featureId, finalStatus);
      this.recordSuccessFn();

      // Check final task completion state for accurate reporting
      const completedFeature = await this.loadFeatureFn(projectPath, featureId);
      const totalTasks = completedFeature?.planSpec?.tasks?.length ?? 0;
      const completedTasks =
        completedFeature?.planSpec?.tasks?.filter((t) => t.status === 'completed').length ?? 0;
      const hasIncompleteTasks = totalTasks > 0 && completedTasks < totalTasks;

      try {
        const outputPath = path.join(getFeatureDir(projectPath, featureId), 'agent-output.md');
        let agentOutput = '';
        try {
          agentOutput = (await secureFs.readFile(outputPath, 'utf-8')) as string;
        } catch {
          /* */
        }
        if (agentOutput) {
          const summary = extractSummary(agentOutput);
          if (summary) await this.saveFeatureSummaryFn(projectPath, featureId, summary);
        }
        if (contextResult.memoryFiles.length > 0 && agentOutput) {
          await recordMemoryUsage(
            projectPath,
            contextResult.memoryFiles,
            agentOutput,
            true,
            secureFs as Parameters<typeof recordMemoryUsage>[4]
          );
        }
        await this.recordLearningsFn(projectPath, feature, agentOutput);
      } catch {
        /* learnings recording failed */
      }

      const elapsedSeconds = Math.round((Date.now() - tempRunningFeature.startTime) / 1000);
      let completionMessage = `Feature completed in ${elapsedSeconds}s`;
      if (finalStatus === 'verified') completionMessage += ' - auto-verified';
      if (hasIncompleteTasks)
        completionMessage += ` (${completedTasks}/${totalTasks} tasks completed)`;

      if (isAutoMode) {
        this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          passes: true,
          message: completionMessage,
          projectPath,
          model: tempRunningFeature.model,
          provider: tempRunningFeature.provider,
        });
      }
    } catch (error) {
      const errorInfo = classifyError(error);
      if (errorInfo.isAbort) {
        await this.updateFeatureStatusFn(projectPath, featureId, 'interrupted');
        if (isAutoMode) {
          this.eventBus.emitAutoModeEvent('auto_mode_feature_complete', {
            featureId,
            featureName: feature?.title,
            branchName: feature?.branchName ?? null,
            passes: false,
            message: 'Feature stopped by user',
            projectPath,
          });
        }
      } else {
        logger.error(`Feature ${featureId} failed:`, error);
        await this.updateFeatureStatusFn(projectPath, featureId, 'backlog');
        this.eventBus.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: feature?.title,
          branchName: feature?.branchName ?? null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });
        if (this.trackFailureFn({ type: errorInfo.type, message: errorInfo.message })) {
          this.signalPauseFn({ type: errorInfo.type, message: errorInfo.message });
        }
      }
    } finally {
      this.releaseRunningFeature(featureId);
      if (isAutoMode && projectPath) await this.saveExecutionStateFn(projectPath);
    }
  }

  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.concurrencyManager.getRunningFeature(featureId);
    if (!running) return false;
    running.abortController.abort();
    this.releaseRunningFeature(featureId, { force: true });
    return true;
  }
}
