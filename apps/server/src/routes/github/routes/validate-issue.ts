/**
 * POST /validate-issue endpoint - Validate a GitHub issue using Claude SDK or Cursor (async)
 *
 * Scans the codebase to determine if an issue is valid, invalid, or needs clarification.
 * Runs asynchronously and emits events for progress and completion.
 * Supports both Claude models and Cursor models.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../../lib/events.js';
import type {
  IssueValidationResult,
  IssueValidationEvent,
  ModelAlias,
  CursorModelId,
  GitHubComment,
  LinkedPRInfo,
  ThinkingLevel,
} from '@automaker/types';
import { isCursorModel, DEFAULT_PHASE_MODELS, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { createSuggestionsOptions } from '../../../lib/sdk-options.js';
import { extractJson } from '../../../lib/json-extractor.js';
import { writeValidation } from '../../../lib/validation-storage.js';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import {
  issueValidationSchema,
  ISSUE_VALIDATION_SYSTEM_PROMPT,
  buildValidationPrompt,
  ValidationComment,
  ValidationLinkedPR,
} from './validation-schema.js';
import {
  trySetValidationRunning,
  clearValidationStatus,
  getErrorMessage,
  logError,
  logger,
} from './validation-common.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../../lib/settings-helpers.js';

/** Valid Claude model values for validation */
const VALID_CLAUDE_MODELS: readonly ModelAlias[] = ['opus', 'sonnet', 'haiku'] as const;

/**
 * Request body for issue validation
 */
interface ValidateIssueRequestBody {
  projectPath: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Model to use for validation (opus, sonnet, haiku, or cursor model IDs) */
  model?: ModelAlias | CursorModelId;
  /** Thinking level for Claude models (ignored for Cursor models) */
  thinkingLevel?: ThinkingLevel;
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
 * Supports both Claude models (with structured output) and Cursor models (with JSON parsing).
 */
async function runValidation(
  projectPath: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[] | undefined,
  model: ModelAlias | CursorModelId,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  comments?: ValidationComment[],
  linkedPRs?: ValidationLinkedPR[],
  thinkingLevel?: ThinkingLevel
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
    const prompt = buildValidationPrompt(
      issueNumber,
      issueTitle,
      issueBody,
      issueLabels,
      comments,
      linkedPRs
    );

    let validationResult: IssueValidationResult | null = null;
    let responseText = '';

    // Route to appropriate provider based on model
    if (isCursorModel(model)) {
      // Use Cursor provider for Cursor models
      logger.info(`Using Cursor provider for validation with model: ${model}`);

      const provider = ProviderFactory.getProviderForModel(model);
      // Strip provider prefix - providers expect bare model IDs
      const bareModel = stripProviderPrefix(model);

      // For Cursor, include the system prompt and schema in the user prompt
      const cursorPrompt = `${ISSUE_VALIDATION_SYSTEM_PROMPT}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(issueValidationSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.

${prompt}`;

      for await (const msg of provider.executeQuery({
        prompt: cursorPrompt,
        model: bareModel,
        cwd: projectPath,
        readOnly: true, // Issue validation only reads code, doesn't write
      })) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              responseText += block.text;

              // Emit progress event
              const progressEvent: IssueValidationEvent = {
                type: 'issue_validation_progress',
                issueNumber,
                content: block.text,
                projectPath,
              };
              events.emit('issue-validation:event', progressEvent);
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          // Use result if it's a final accumulated message
          if (msg.result.length > responseText.length) {
            responseText = msg.result;
          }
        }
      }

      // Parse JSON from the response text using shared utility
      if (responseText) {
        validationResult = extractJson<IssueValidationResult>(responseText, { logger });
      }
    } else {
      // Use Claude SDK for Claude models
      logger.info(`Using Claude provider for validation with model: ${model}`);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        settingsService,
        '[ValidateIssue]'
      );

      // Use thinkingLevel from request if provided, otherwise fall back to settings
      let effectiveThinkingLevel: ThinkingLevel | undefined = thinkingLevel;
      if (!effectiveThinkingLevel) {
        const settings = await settingsService?.getGlobalSettings();
        const phaseModelEntry =
          settings?.phaseModels?.validationModel || DEFAULT_PHASE_MODELS.validationModel;
        const resolved = resolvePhaseModel(phaseModelEntry);
        effectiveThinkingLevel = resolved.thinkingLevel;
      }

      // Create SDK options with structured output and abort controller
      const options = createSuggestionsOptions({
        cwd: projectPath,
        model: model as ModelAlias,
        systemPrompt: ISSUE_VALIDATION_SYSTEM_PROMPT,
        abortController,
        autoLoadClaudeMd,
        thinkingLevel: effectiveThinkingLevel,
        outputFormat: {
          type: 'json_schema',
          schema: issueValidationSchema as Record<string, unknown>,
        },
      });

      // Execute the query
      const stream = query({ prompt, options });

      for await (const msg of stream) {
        // Collect assistant text for debugging and emit progress
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;

              // Emit progress event
              const progressEvent: IssueValidationEvent = {
                type: 'issue_validation_progress',
                issueNumber,
                content: block.text,
                projectPath,
              };
              events.emit('issue-validation:event', progressEvent);
            }
          }
        }

        // Extract structured output on success
        if (msg.type === 'result' && msg.subtype === 'success') {
          const resultMsg = msg as { structured_output?: IssueValidationResult };
          if (resultMsg.structured_output) {
            validationResult = resultMsg.structured_output;
            logger.debug('Received structured output:', validationResult);
          }
        }

        // Handle errors
        if (msg.type === 'result') {
          const resultMsg = msg as { subtype?: string };
          if (resultMsg.subtype === 'error_max_structured_output_retries') {
            logger.error('Failed to produce valid structured output after retries');
            throw new Error('Could not produce valid validation output');
          }
        }
      }
    }

    // Clear timeout
    clearTimeout(timeoutId);

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
 * Uses Claude SDK with:
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

      // Validate model parameter at runtime - accept Claude models or Cursor models
      const isValidClaudeModel = VALID_CLAUDE_MODELS.includes(model as ModelAlias);
      const isValidCursorModel = isCursorModel(model);

      if (!isValidClaudeModel && !isValidCursorModel) {
        res.status(400).json({
          success: false,
          error: `Invalid model. Must be one of: ${VALID_CLAUDE_MODELS.join(', ')}, or a Cursor model ID`,
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
        thinkingLevel
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
