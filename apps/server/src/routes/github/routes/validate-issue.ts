/**
 * POST /validate-issue endpoint - Validate a GitHub issue using provider abstraction (async)
 *
 * Scans the codebase to determine if an issue is valid, invalid, or needs clarification.
 * Runs asynchronously and emits events for progress and completion.
 * Supports Claude, Codex, Cursor, and OpenCode models.
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type {
  IssueValidationResult,
  IssueValidationEvent,
  ModelId,
  GitHubComment,
  LinkedPRInfo,
  ThinkingLevel,
  ReasoningEffort,
} from '@automaker/types';
import {
  DEFAULT_PHASE_MODELS,
  isClaudeModel,
  isCodexModel,
  isCursorModel,
  isOpencodeModel,
} from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { extractJson } from '../../../lib/json-extractor.js';
import { writeValidation } from '../../../lib/validation-storage.js';
import { streamingQuery } from '../../../providers/simple-query-service.js';
import {
  issueValidationSchema,
  buildValidationPrompt,
  ValidationComment,
  ValidationLinkedPR,
} from './validation-schema.js';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  getProviderByModelId,
} from '../../../lib/settings-helpers.js';
import {
  trySetValidationRunning,
  clearValidationStatus,
  getErrorMessage,
  logError,
  logger,
} from './validation-common.js';
import type { SettingsService } from '../../../services/settings-service.js';

/**
 * Request body for issue validation
 */
interface ValidateIssueRequestBody {
  projectPath: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Model to use for validation (Claude alias or provider model ID) */
  model?: ModelId;
  /** Thinking level for Claude models (ignored for non-Claude models) */
  thinkingLevel?: ThinkingLevel;
  /** Reasoning effort for Codex models (ignored for non-Codex models) */
  reasoningEffort?: ReasoningEffort;
  /** Comments to include in validation analysis */
  comments?: GitHubComment[];
  /** Linked pull requests for this issue */
  linkedPRs?: LinkedPRInfo[];
}

/**
 * Run the validation asynchronously
 *
 * Emits events for start, progress, complete, and error.
 * Stores result on completion.
 * Supports Claude/Codex models (structured output) and Cursor/OpenCode models (JSON parsing).
 */
async function runValidation(
  projectPath: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[] | undefined,
  model: ModelId,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  comments?: ValidationComment[],
  linkedPRs?: ValidationLinkedPR[],
  thinkingLevel?: ThinkingLevel,
  reasoningEffort?: ReasoningEffort
): Promise<void> {
  // Emit start event
  const startEvent: IssueValidationEvent = {
    type: 'issue_validation_start',
    issueNumber,
    issueTitle,
    projectPath,
  };
  events.emit('issue-validation:event', startEvent);

  // Set up timeout (6 minutes)
  const VALIDATION_TIMEOUT_MS = 360000;
  const timeoutId = setTimeout(() => {
    logger.warn(`Validation timeout reached after ${VALIDATION_TIMEOUT_MS}ms`);
    abortController.abort();
  }, VALIDATION_TIMEOUT_MS);

  try {
    // Build the prompt (include comments and linked PRs if provided)
    const basePrompt = buildValidationPrompt(
      issueNumber,
      issueTitle,
      issueBody,
      issueLabels,
      comments,
      linkedPRs
    );

    let responseText = '';

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(settingsService, '[ValidateIssue]');
    const issueValidationSystemPrompt = prompts.issueValidation.systemPrompt;

    // Determine if we should use structured output (Claude/Codex support it, Cursor/OpenCode don't)
    const useStructuredOutput = isClaudeModel(model) || isCodexModel(model);

    // Build the final prompt - for Cursor, include system prompt and JSON schema instructions
    let finalPrompt = basePrompt;
    if (!useStructuredOutput) {
      finalPrompt = `${issueValidationSystemPrompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(issueValidationSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.

${basePrompt}`;
    }

    // Load autoLoadClaudeMd setting
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[ValidateIssue]'
    );

    // Use request overrides if provided, otherwise fall back to settings
    let effectiveThinkingLevel: ThinkingLevel | undefined = thinkingLevel;
    let effectiveReasoningEffort: ReasoningEffort | undefined = reasoningEffort;
    if (!effectiveThinkingLevel || !effectiveReasoningEffort) {
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.validationModel || DEFAULT_PHASE_MODELS.validationModel;
      const resolved = resolvePhaseModel(phaseModelEntry);
      if (!effectiveThinkingLevel) {
        effectiveThinkingLevel = resolved.thinkingLevel;
      }
      if (!effectiveReasoningEffort && typeof phaseModelEntry !== 'string') {
        effectiveReasoningEffort = phaseModelEntry.reasoningEffort;
      }
    }

    // Check if the model is a provider model (like "GLM-4.5-Air")
    // If so, get the provider config and resolved Claude model
    let claudeCompatibleProvider: import('@automaker/types').ClaudeCompatibleProvider | undefined;
    let providerResolvedModel: string | undefined;
    let credentials = await settingsService?.getCredentials();

    if (settingsService) {
      const providerResult = await getProviderByModelId(model, settingsService, '[ValidateIssue]');
      if (providerResult.provider) {
        claudeCompatibleProvider = providerResult.provider;
        providerResolvedModel = providerResult.resolvedModel;
        credentials = providerResult.credentials;
        logger.info(
          `Using provider "${providerResult.provider.name}" for model "${model}"` +
            (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
        );
      }
    }

    // Use provider resolved model if available, otherwise use original model
    const effectiveModel = providerResolvedModel || (model as string);
    logger.info(`Using model: ${effectiveModel}`);

    // Use streamingQuery with event callbacks
    const result = await streamingQuery({
      prompt: finalPrompt,
      model: effectiveModel,
      cwd: projectPath,
      systemPrompt: useStructuredOutput ? issueValidationSystemPrompt : undefined,
      abortController,
      thinkingLevel: effectiveThinkingLevel,
      reasoningEffort: effectiveReasoningEffort,
      readOnly: true, // Issue validation only reads code, doesn't write
      settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
      credentials, // Pass credentials for resolving 'credentials' apiKeySource
      outputFormat: useStructuredOutput
        ? {
            type: 'json_schema',
            schema: issueValidationSchema as Record<string, unknown>,
          }
        : undefined,
      onText: (text) => {
        responseText += text;
        // Emit progress event
        const progressEvent: IssueValidationEvent = {
          type: 'issue_validation_progress',
          issueNumber,
          content: text,
          projectPath,
        };
        events.emit('issue-validation:event', progressEvent);
      },
    });

    // Clear timeout
    clearTimeout(timeoutId);

    // Get validation result from structured output or parse from text
    let validationResult: IssueValidationResult | null = null;

    if (result.structured_output) {
      validationResult = result.structured_output as unknown as IssueValidationResult;
      logger.debug('Received structured output:', validationResult);
    } else if (responseText) {
      // Parse JSON from response text
      validationResult = extractJson<IssueValidationResult>(responseText, { logger });
    }

    // Require validation result
    if (!validationResult) {
      logger.error('No validation result received from AI provider');
      throw new Error('Validation failed: no valid result received');
    }

    logger.info(`Issue #${issueNumber} validation complete: ${validationResult.verdict}`);

    // Store the result
    await writeValidation(projectPath, issueNumber, {
      issueNumber,
      issueTitle,
      validatedAt: new Date().toISOString(),
      model,
      result: validationResult,
    });

    // Emit completion event
    const completeEvent: IssueValidationEvent = {
      type: 'issue_validation_complete',
      issueNumber,
      issueTitle,
      result: validationResult,
      projectPath,
      model,
    };
    events.emit('issue-validation:event', completeEvent);
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage = getErrorMessage(error);
    logError(error, `Issue #${issueNumber} validation failed`);

    // Emit error event
    const errorEvent: IssueValidationEvent = {
      type: 'issue_validation_error',
      issueNumber,
      error: errorMessage,
      projectPath,
    };
    events.emit('issue-validation:event', errorEvent);

    throw error;
  }
}

/**
 * Creates the handler for validating GitHub issues against the codebase.
 *
 * Uses the provider abstraction with:
 * - Read-only tools (Read, Glob, Grep) for codebase analysis
 * - JSON schema structured output for reliable parsing
 * - System prompt guiding the validation process
 * - Async execution with event emission
 */
export function createValidateIssueHandler(
  events: EventEmitter,
  settingsService?: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        issueNumber,
        issueTitle,
        issueBody,
        issueLabels,
        model = 'opus',
        thinkingLevel,
        reasoningEffort,
        comments: rawComments,
        linkedPRs: rawLinkedPRs,
      } = req.body as ValidateIssueRequestBody;

      // Transform GitHubComment[] to ValidationComment[] if provided
      const validationComments: ValidationComment[] | undefined = rawComments?.map((c) => ({
        author: c.author?.login || 'ghost',
        createdAt: c.createdAt,
        body: c.body,
      }));

      // Transform LinkedPRInfo[] to ValidationLinkedPR[] if provided
      const validationLinkedPRs: ValidationLinkedPR[] | undefined = rawLinkedPRs?.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
      }));

      logger.info(
        `[ValidateIssue] Received validation request for issue #${issueNumber}` +
          (rawComments?.length ? ` with ${rawComments.length} comments` : ' (no comments)') +
          (rawLinkedPRs?.length ? ` and ${rawLinkedPRs.length} linked PRs` : '')
      );

      // Validate required fields
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      if (!issueTitle || typeof issueTitle !== 'string') {
        res.status(400).json({ success: false, error: 'issueTitle is required' });
        return;
      }

      if (typeof issueBody !== 'string') {
        res.status(400).json({ success: false, error: 'issueBody must be a string' });
        return;
      }

      // Validate model parameter at runtime - accept any supported provider model
      const isValidModel =
        isClaudeModel(model) ||
        isCursorModel(model) ||
        isCodexModel(model) ||
        isOpencodeModel(model);

      if (!isValidModel) {
        res.status(400).json({
          success: false,
          error: 'Invalid model. Must be a Claude, Cursor, Codex, or OpenCode model ID (or alias).',
        });
        return;
      }

      logger.info(`Starting async validation for issue #${issueNumber}: ${issueTitle}`);

      // Create abort controller and atomically try to claim validation slot
      // This prevents TOCTOU race conditions
      const abortController = new AbortController();
      if (!trySetValidationRunning(projectPath, issueNumber, abortController)) {
        res.json({
          success: false,
          error: `Validation is already running for issue #${issueNumber}`,
        });
        return;
      }

      // Start validation in background (fire-and-forget)
      runValidation(
        projectPath,
        issueNumber,
        issueTitle,
        issueBody,
        issueLabels,
        model,
        events,
        abortController,
        settingsService,
        validationComments,
        validationLinkedPRs,
        thinkingLevel,
        reasoningEffort
      )
        .catch(() => {
          // Error is already handled inside runValidation (event emitted)
        })
        .finally(() => {
          clearValidationStatus(projectPath, issueNumber);
        });

      // Return immediately
      res.json({
        success: true,
        message: `Validation started for issue #${issueNumber}`,
        issueNumber,
      });
    } catch (error) {
      logError(error, `Issue validation failed`);
      logger.error('Issue validation error:', error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: getErrorMessage(error),
        });
      }
    }
  };
}
