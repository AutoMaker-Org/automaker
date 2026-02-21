/**
 * AgentExecutor - Core agent execution engine with streaming support
 */

import path from 'path';
import type { ExecuteOptions, ParsedTask } from '@automaker/types';
import { buildPromptWithImages, createLogger, isAuthenticationError } from '@automaker/utils';
import { getFeatureDir } from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import { TypedEventBus } from './typed-event-bus.js';
import { FeatureStateManager } from './feature-state-manager.js';
import { PlanApprovalService } from './plan-approval-service.js';
import type { SettingsService } from './settings-service.js';
import {
  parseTasksFromSpec,
  detectTaskStartMarker,
  detectTaskCompleteMarker,
  detectPhaseCompleteMarker,
  detectSpecFallback,
  extractSummary,
} from './spec-parser.js';
import { getPromptCustomization } from '../lib/settings-helpers.js';
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutorCallbacks,
} from './agent-executor-types.js';

// Re-export types for backward compatibility
export type {
  AgentExecutionOptions,
  AgentExecutionResult,
  WaitForApprovalFn,
  SaveFeatureSummaryFn,
  UpdateFeatureSummaryFn,
  BuildTaskPromptFn,
} from './agent-executor-types.js';

const logger = createLogger('AgentExecutor');

const DEFAULT_MAX_TURNS = 1000;

export class AgentExecutor {
  private static readonly WRITE_DEBOUNCE_MS = 500;
  private static readonly STREAM_HEARTBEAT_MS = 15_000;

  /**
   * Sanitize a provider error value into clean text.
   * Coalesces to string, removes ANSI codes, strips leading "Error:" prefix,
   * trims, and returns 'Unknown error' when empty.
   */
  private static sanitizeProviderError(input: string | { error?: string } | undefined): string {
    let raw: string;
    if (typeof input === 'string') {
      raw = input;
    } else if (input && typeof input === 'object' && typeof input.error === 'string') {
      raw = input.error;
    } else {
      raw = '';
    }
    const cleaned = raw
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/^Error:\s*/i, '')
      .trim();
    return cleaned || 'Unknown error';
  }

  constructor(
    private eventBus: TypedEventBus,
    private featureStateManager: FeatureStateManager,
    private planApprovalService: PlanApprovalService,
    private settingsService: SettingsService | null = null
  ) {}

  async execute(
    options: AgentExecutionOptions,
    callbacks: AgentExecutorCallbacks
  ): Promise<AgentExecutionResult> {
    const {
      workDir,
      featureId,
      projectPath,
      abortController,
      branchName = null,
      provider,
      effectiveBareModel,
      previousContent,
      planningMode = 'skip',
      requirePlanApproval = false,
      specAlreadyDetected = false,
      existingApprovedPlanContent,
      persistedTasks,
      credentials,
      claudeCompatibleProvider,
      mcpServers,
      sdkOptions,
    } = options;
    const { content: promptContent } = await buildPromptWithImages(
      options.prompt,
      options.imagePaths,
      workDir,
      false
    );
    const resolvedMaxTurns = sdkOptions?.maxTurns ?? DEFAULT_MAX_TURNS;
    if (sdkOptions?.maxTurns == null) {
      logger.info(
        `[execute] Feature ${featureId}: sdkOptions.maxTurns is not set, defaulting to ${resolvedMaxTurns}. ` +
          `Model: ${effectiveBareModel}`
      );
    } else {
      logger.info(
        `[execute] Feature ${featureId}: maxTurns=${resolvedMaxTurns}, model=${effectiveBareModel}`
      );
    }

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: effectiveBareModel,
      maxTurns: resolvedMaxTurns,
      cwd: workDir,
      allowedTools: sdkOptions?.allowedTools as string[] | undefined,
      abortController,
      systemPrompt: sdkOptions?.systemPrompt,
      settingSources: sdkOptions?.settingSources,
      mcpServers:
        mcpServers && Object.keys(mcpServers).length > 0
          ? (mcpServers as Record<string, { command: string }>)
          : undefined,
      thinkingLevel: options.thinkingLevel,
      credentials,
      claudeCompatibleProvider,
    };
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');
    const rawOutputPath = path.join(featureDirForOutput, 'raw-output.jsonl');
    const enableRawOutput =
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === 'true' ||
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === '1';
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = specAlreadyDetected,
      tasksCompleted = 0,
      aborted = false;
    let writeTimeout: ReturnType<typeof setTimeout> | null = null,
      rawOutputLines: string[] = [],
      rawWriteTimeout: ReturnType<typeof setTimeout> | null = null;

    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        logger.error(`Failed to write agent output for ${featureId}:`, error);
      }
    };
    const scheduleWrite = (): void => {
      if (writeTimeout) clearTimeout(writeTimeout);
      writeTimeout = setTimeout(() => writeToFile(), AgentExecutor.WRITE_DEBOUNCE_MS);
    };
    const appendRawEvent = (event: unknown): void => {
      if (!enableRawOutput) return;
      try {
        rawOutputLines.push(JSON.stringify({ timestamp: new Date().toISOString(), event }));
        if (rawWriteTimeout) clearTimeout(rawWriteTimeout);
        rawWriteTimeout = setTimeout(async () => {
          try {
            await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
            await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
            rawOutputLines = [];
          } catch {
            /* ignore */
          }
        }, AgentExecutor.WRITE_DEBOUNCE_MS);
      } catch {
        /* ignore */
      }
    };

    const streamStartTime = Date.now();
    let receivedAnyStreamMessage = false;
    const streamHeartbeat = setInterval(() => {
      if (!receivedAnyStreamMessage)
        logger.info(
          `Waiting for first model response for feature ${featureId} (${Math.round((Date.now() - streamStartTime) / 1000)}s elapsed)...`
        );
    }, AgentExecutor.STREAM_HEARTBEAT_MS);
    const planningModeRequiresApproval =
      planningMode === 'spec' ||
      planningMode === 'full' ||
      (planningMode === 'lite' && requirePlanApproval);
    const requiresApproval = planningModeRequiresApproval && requirePlanApproval;

    if (existingApprovedPlanContent && persistedTasks && persistedTasks.length > 0) {
      const result = await this.executeTasksLoop(
        options,
        persistedTasks,
        existingApprovedPlanContent,
        responseText,
        scheduleWrite,
        callbacks
      );
      clearInterval(streamHeartbeat);
      if (writeTimeout) clearTimeout(writeTimeout);
      if (rawWriteTimeout) clearTimeout(rawWriteTimeout);
      await writeToFile();
      return {
        responseText: result.responseText,
        specDetected: true,
        tasksCompleted: result.tasksCompleted,
        aborted: result.aborted,
      };
    }

    logger.info(`Starting stream for feature ${featureId}...`);

    try {
      const stream = provider.executeQuery(executeOptions);
      streamLoop: for await (const msg of stream) {
        receivedAnyStreamMessage = true;
        appendRawEvent(msg);
        if (abortController.signal.aborted) {
          aborted = true;
          throw new Error('Feature execution aborted');
        }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              const newText = block.text || '';
              if (!newText) continue;
              if (responseText.length > 0 && newText.length > 0) {
                const endsWithSentence = /[.!?:]\s*$/.test(responseText),
                  endsWithNewline = /\n\s*$/.test(responseText);
                if (
                  !endsWithNewline &&
                  (endsWithSentence || /^[\n#\-*>]/.test(newText)) &&
                  !/[a-zA-Z0-9]/.test(responseText.slice(-1))
                )
                  responseText += '\n\n';
              }
              responseText += newText;
              // Check for authentication errors using provider-agnostic utility
              if (block.text && isAuthenticationError(block.text))
                throw new Error(
                  'Authentication failed: Invalid or expired API key. Please check your API key configuration or re-authenticate with your provider.'
                );
              scheduleWrite();
              const hasExplicitMarker = responseText.includes('[SPEC_GENERATED]'),
                hasFallbackSpec = !hasExplicitMarker && detectSpecFallback(responseText);
              if (
                planningModeRequiresApproval &&
                !specDetected &&
                (hasExplicitMarker || hasFallbackSpec)
              ) {
                specDetected = true;
                const planContent = hasExplicitMarker
                  ? responseText.substring(0, responseText.indexOf('[SPEC_GENERATED]')).trim()
                  : responseText.trim();
                if (!hasExplicitMarker)
                  logger.info(`Using fallback spec detection for feature ${featureId}`);
                const result = await this.handleSpecGenerated(
                  options,
                  planContent,
                  responseText,
                  requiresApproval,
                  scheduleWrite,
                  callbacks
                );
                responseText = result.responseText;
                tasksCompleted = result.tasksCompleted;
                break streamLoop;
              }
              if (!specDetected)
                this.eventBus.emitAutoModeEvent('auto_mode_progress', {
                  featureId,
                  branchName,
                  content: block.text,
                });
            } else if (block.type === 'tool_use') {
              this.eventBus.emitAutoModeEvent('auto_mode_tool', {
                featureId,
                branchName,
                tool: block.name,
                input: block.input,
              });
              if (responseText.length > 0 && !responseText.endsWith('\n')) responseText += '\n';
              responseText += `\n🔧 Tool: ${block.name}\n`;
              if (block.input) responseText += `Input: ${JSON.stringify(block.input, null, 2)}\n`;
              scheduleWrite();
            }
          }
        } else if (msg.type === 'error') {
          throw new Error(AgentExecutor.sanitizeProviderError(msg.error));
        } else if (msg.type === 'result' && msg.subtype === 'success') scheduleWrite();
      }
    } finally {
      clearInterval(streamHeartbeat);
      if (writeTimeout) clearTimeout(writeTimeout);
      if (rawWriteTimeout) clearTimeout(rawWriteTimeout);

      const streamElapsedMs = Date.now() - streamStartTime;
      logger.info(
        `[execute] Stream ended for feature ${featureId} after ${Math.round(streamElapsedMs / 1000)}s. ` +
          `aborted=${aborted}, specDetected=${specDetected}, responseLength=${responseText.length}`
      );

      await writeToFile();
      if (enableRawOutput && rawOutputLines.length > 0) {
        try {
          await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
          await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
        } catch {
          /* ignore */
        }
      }
    }
    return { responseText, specDetected, tasksCompleted, aborted };
  }

  private async executeTasksLoop(
    options: AgentExecutionOptions,
    tasks: ParsedTask[],
    planContent: string,
    initialResponseText: string,
    scheduleWrite: () => void,
    callbacks: AgentExecutorCallbacks,
    userFeedback?: string
  ): Promise<{ responseText: string; tasksCompleted: number; aborted: boolean }> {
    const {
      featureId,
      projectPath,
      abortController,
      branchName = null,
      provider,
      sdkOptions,
    } = options;
    logger.info(`Starting task execution for feature ${featureId} with ${tasks.length} tasks`);
    const taskPrompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    let responseText = initialResponseText,
      tasksCompleted = 0;

    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
      const task = tasks[taskIndex];
      if (task.status === 'completed') {
        tasksCompleted++;
        continue;
      }
      if (abortController.signal.aborted) return { responseText, tasksCompleted, aborted: true };
      await this.featureStateManager.updateTaskStatus(
        projectPath,
        featureId,
        task.id,
        'in_progress'
      );
      this.eventBus.emitAutoModeEvent('auto_mode_task_started', {
        featureId,
        projectPath,
        branchName,
        taskId: task.id,
        taskDescription: task.description,
        taskIndex,
        tasksTotal: tasks.length,
      });
      await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
        currentTaskId: task.id,
      });
      const taskPrompt = callbacks.buildTaskPrompt(
        task,
        tasks,
        taskIndex,
        planContent,
        taskPrompts.taskExecution.taskPromptTemplate,
        userFeedback
      );
      const taskMaxTurns = sdkOptions?.maxTurns ?? DEFAULT_MAX_TURNS;
      logger.info(
        `[executeTasksLoop] Feature ${featureId}, task ${task.id} (${taskIndex + 1}/${tasks.length}): ` +
          `maxTurns=${taskMaxTurns} (sdkOptions.maxTurns=${sdkOptions?.maxTurns ?? 'undefined'})`
      );
      const taskStream = provider.executeQuery(
        this.buildExecOpts(options, taskPrompt, taskMaxTurns)
      );
      let taskOutput = '',
        taskStartDetected = false,
        taskCompleteDetected = false;

      for await (const msg of taskStream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const b of msg.message.content) {
            if (b.type === 'text') {
              const text = b.text || '';
              taskOutput += text;
              responseText += text;
              this.eventBus.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                branchName,
                content: text,
              });
              scheduleWrite();
              if (!taskStartDetected) {
                const sid = detectTaskStartMarker(taskOutput);
                if (sid) {
                  taskStartDetected = true;
                  await this.featureStateManager.updateTaskStatus(
                    projectPath,
                    featureId,
                    sid,
                    'in_progress'
                  );
                }
              }
              if (!taskCompleteDetected) {
                const cid = detectTaskCompleteMarker(taskOutput);
                if (cid) {
                  taskCompleteDetected = true;
                  await this.featureStateManager.updateTaskStatus(
                    projectPath,
                    featureId,
                    cid,
                    'completed'
                  );
                }
              }
              const pn = detectPhaseCompleteMarker(text);
              if (pn !== null)
                this.eventBus.emitAutoModeEvent('auto_mode_phase_complete', {
                  featureId,
                  projectPath,
                  branchName,
                  phaseNumber: pn,
                });
            } else if (b.type === 'tool_use')
              this.eventBus.emitAutoModeEvent('auto_mode_tool', {
                featureId,
                branchName,
                tool: b.name,
                input: b.input,
              });
          }
        } else if (msg.type === 'error') {
          // Clean the error: strip ANSI codes and redundant "Error: " prefix
          const cleanedError =
            (msg.error || `Error during task ${task.id}`)
              .replace(/\x1b\[[0-9;]*m/g, '')
              .replace(/^Error:\s*/i, '')
              .trim() || `Error during task ${task.id}`;
          throw new Error(cleanedError);
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          taskOutput += msg.result || '';
          responseText += msg.result || '';
        }
      }
      if (!taskCompleteDetected)
        await this.featureStateManager.updateTaskStatus(
          projectPath,
          featureId,
          task.id,
          'completed'
        );
      tasksCompleted = taskIndex + 1;
      this.eventBus.emitAutoModeEvent('auto_mode_task_complete', {
        featureId,
        projectPath,
        branchName,
        taskId: task.id,
        tasksCompleted,
        tasksTotal: tasks.length,
      });
      await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
        tasksCompleted,
      });
      if (task.phase) {
        const next = tasks[taskIndex + 1];
        if (!next || next.phase !== task.phase) {
          const m = task.phase.match(/Phase\s*(\d+)/i);
          if (m)
            this.eventBus.emitAutoModeEvent('auto_mode_phase_complete', {
              featureId,
              projectPath,
              branchName,
              phaseNumber: parseInt(m[1], 10),
            });
        }
      }
    }
    const summary = extractSummary(responseText);
    if (summary) await callbacks.saveFeatureSummary(projectPath, featureId, summary);
    return { responseText, tasksCompleted, aborted: false };
  }

  private async handleSpecGenerated(
    options: AgentExecutionOptions,
    planContent: string,
    initialResponseText: string,
    requiresApproval: boolean,
    scheduleWrite: () => void,
    callbacks: AgentExecutorCallbacks
  ): Promise<{ responseText: string; tasksCompleted: number }> {
    const {
      featureId,
      projectPath,
      branchName = null,
      planningMode = 'skip',
      provider,
      sdkOptions,
    } = options;
    let responseText = initialResponseText,
      parsedTasks = parseTasksFromSpec(planContent);
    logger.info(`Parsed ${parsedTasks.length} tasks from spec for feature ${featureId}`);
    await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
      status: 'generated',
      content: planContent,
      version: 1,
      generatedAt: new Date().toISOString(),
      reviewedByUser: false,
      tasks: parsedTasks,
      tasksTotal: parsedTasks.length,
      tasksCompleted: 0,
    });
    const planSummary = extractSummary(planContent);
    if (planSummary) await callbacks.updateFeatureSummary(projectPath, featureId, planSummary);
    let approvedPlanContent = planContent,
      userFeedback: string | undefined,
      currentPlanContent = planContent,
      planVersion = 1;

    if (requiresApproval) {
      let planApproved = false;
      while (!planApproved) {
        logger.info(
          `Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
        );
        this.eventBus.emitAutoModeEvent('plan_approval_required', {
          featureId,
          projectPath,
          branchName,
          planContent: currentPlanContent,
          planningMode,
          planVersion,
        });
        const approvalResult = await callbacks.waitForApproval(featureId, projectPath);
        if (approvalResult.approved) {
          planApproved = true;
          userFeedback = approvalResult.feedback;
          approvedPlanContent = approvalResult.editedPlan || currentPlanContent;
          if (approvalResult.editedPlan) {
            // Re-parse tasks from edited plan to ensure we execute the updated tasks
            const editedTasks = parseTasksFromSpec(approvalResult.editedPlan);
            parsedTasks = editedTasks;
            await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
              content: approvalResult.editedPlan,
              tasks: editedTasks,
              tasksTotal: editedTasks.length,
              tasksCompleted: 0,
            });
          }
          this.eventBus.emitAutoModeEvent('plan_approved', {
            featureId,
            projectPath,
            branchName,
            hasEdits: !!approvalResult.editedPlan,
            planVersion,
          });
        } else {
          const hasFeedback = approvalResult.feedback?.trim().length,
            hasEdits = approvalResult.editedPlan?.trim().length;
          if (!hasFeedback && !hasEdits) throw new Error('Plan cancelled by user');
          planVersion++;
          this.eventBus.emitAutoModeEvent('plan_revision_requested', {
            featureId,
            projectPath,
            branchName,
            feedback: approvalResult.feedback,
            hasEdits: !!hasEdits,
            planVersion,
          });
          const revPrompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
          const taskEx =
            planningMode === 'full'
              ? '```tasks\n## Phase 1: Foundation\n- [ ] T001: [Description] | File: [path/to/file]\n```'
              : '```tasks\n- [ ] T001: [Description] | File: [path/to/file]\n```';
          let revPrompt = revPrompts.taskExecution.planRevisionTemplate
            .replace(/\{\{planVersion\}\}/g, String(planVersion - 1))
            .replace(
              /\{\{previousPlan\}\}/g,
              hasEdits ? approvalResult.editedPlan || currentPlanContent : currentPlanContent
            )
            .replace(
              /\{\{userFeedback\}\}/g,
              approvalResult.feedback || 'Please revise the plan based on the edits above.'
            )
            .replace(/\{\{planningMode\}\}/g, planningMode)
            .replace(/\{\{taskFormatExample\}\}/g, taskEx);
          await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
            status: 'generating',
            version: planVersion,
          });
          let revText = '';
          for await (const msg of provider.executeQuery(
            this.buildExecOpts(options, revPrompt, sdkOptions?.maxTurns ?? DEFAULT_MAX_TURNS)
          )) {
            if (msg.type === 'assistant' && msg.message?.content)
              for (const b of msg.message.content)
                if (b.type === 'text') {
                  revText += b.text || '';
                  this.eventBus.emitAutoModeEvent('auto_mode_progress', {
                    featureId,
                    branchName,
                    content: b.text,
                  });
                }
            if (msg.type === 'error') {
              const cleanedError =
                (msg.error || 'Error during plan revision')
                  .replace(/\x1b\[[0-9;]*m/g, '')
                  .replace(/^Error:\s*/i, '')
                  .trim() || 'Error during plan revision';
              throw new Error(cleanedError);
            }
            if (msg.type === 'result' && msg.subtype === 'success') revText += msg.result || '';
          }
          const mi = revText.indexOf('[SPEC_GENERATED]');
          currentPlanContent = mi > 0 ? revText.substring(0, mi).trim() : revText.trim();
          const revisedTasks = parseTasksFromSpec(currentPlanContent);
          if (revisedTasks.length === 0 && (planningMode === 'spec' || planningMode === 'full'))
            this.eventBus.emitAutoModeEvent('plan_revision_warning', {
              featureId,
              projectPath,
              branchName,
              planningMode,
              warning: 'Revised plan missing tasks block',
            });
          await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
            status: 'generated',
            content: currentPlanContent,
            version: planVersion,
            tasks: revisedTasks,
            tasksTotal: revisedTasks.length,
            tasksCompleted: 0,
          });
          parsedTasks = revisedTasks;
          responseText += revText;
        }
      }
    } else {
      this.eventBus.emitAutoModeEvent('plan_auto_approved', {
        featureId,
        projectPath,
        branchName,
        planContent,
        planningMode,
      });
    }
    await this.featureStateManager.updateFeaturePlanSpec(projectPath, featureId, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      reviewedByUser: requiresApproval,
    });
    let tasksCompleted = 0;
    if (parsedTasks.length > 0) {
      const r = await this.executeTasksLoop(
        options,
        parsedTasks,
        approvedPlanContent,
        responseText,
        scheduleWrite,
        callbacks,
        userFeedback
      );
      responseText = r.responseText;
      tasksCompleted = r.tasksCompleted;
    } else {
      const r = await this.executeSingleAgentContinuation(
        options,
        approvedPlanContent,
        userFeedback,
        responseText
      );
      responseText = r.responseText;
    }
    const summary = extractSummary(responseText);
    if (summary) await callbacks.saveFeatureSummary(projectPath, featureId, summary);
    return { responseText, tasksCompleted };
  }

  private buildExecOpts(o: AgentExecutionOptions, prompt: string, maxTurns: number) {
    return {
      prompt,
      model: o.effectiveBareModel,
      maxTurns,
      cwd: o.workDir,
      allowedTools: o.sdkOptions?.allowedTools as string[] | undefined,
      abortController: o.abortController,
      thinkingLevel: o.thinkingLevel,
      mcpServers:
        o.mcpServers && Object.keys(o.mcpServers).length > 0
          ? (o.mcpServers as Record<string, { command: string }>)
          : undefined,
      credentials: o.credentials,
      claudeCompatibleProvider: o.claudeCompatibleProvider,
    };
  }

  private async executeSingleAgentContinuation(
    options: AgentExecutionOptions,
    planContent: string,
    userFeedback: string | undefined,
    initialResponseText: string
  ): Promise<{ responseText: string }> {
    const { featureId, branchName = null, provider } = options;
    logger.info(`No parsed tasks, using single-agent execution for feature ${featureId}`);
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const contPrompt = prompts.taskExecution.continuationAfterApprovalTemplate
      .replace(/\{\{userFeedback\}\}/g, userFeedback || '')
      .replace(/\{\{approvedPlan\}\}/g, planContent);
    let responseText = initialResponseText;
    for await (const msg of provider.executeQuery(
      this.buildExecOpts(options, contPrompt, options.sdkOptions?.maxTurns ?? DEFAULT_MAX_TURNS)
    )) {
      if (msg.type === 'assistant' && msg.message?.content)
        for (const b of msg.message.content) {
          if (b.type === 'text') {
            responseText += b.text || '';
            this.eventBus.emitAutoModeEvent('auto_mode_progress', {
              featureId,
              branchName,
              content: b.text,
            });
          } else if (b.type === 'tool_use')
            this.eventBus.emitAutoModeEvent('auto_mode_tool', {
              featureId,
              branchName,
              tool: b.name,
              input: b.input,
            });
        }
      else if (msg.type === 'error') {
        const cleanedError =
          (msg.error || 'Unknown error during implementation')
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/^Error:\s*/i, '')
            .trim() || 'Unknown error during implementation';
        throw new Error(cleanedError);
      } else if (msg.type === 'result' && msg.subtype === 'success')
        responseText += msg.result || '';
    }
    return { responseText };
  }
}
