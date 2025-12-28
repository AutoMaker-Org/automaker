/**
 * POST /validate-issue endpoint - Validate a GitHub issue using Claude SDK (async)
 *
 * Scans the codebase to determine if an issue is valid, invalid, or needs clarification.
 * Runs asynchronously and emits events for progress and completion.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../../lib/events.js';
import type { IssueValidationResult, IssueValidationEvent, AgentModel } from '@automaker/types';
import { createSuggestionsOptions } from '../../../lib/sdk-options.js';
import { writeValidation } from '../../../lib/validation-storage.js';
import {
  issueValidationSchema,
  ISSUE_VALIDATION_SYSTEM_PROMPT,
  buildValidationPrompt,
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

/** Valid model values for validation */
const VALID_MODELS: readonly AgentModel[] = ['opus', 'sonnet', 'haiku'] as const;

/**
 * Request body for issue validation
 */
interface ValidateIssueRequestBody {
  projectPath: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Model to use for validation (opus, sonnet, haiku) */
  model?: AgentModel;
}

/**
 * Run the validation asynchronously
 *
 * Emits events for start, progress, complete, and error.
 * Stores result on completion.
 */
async function runValidation(
  projectPath: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[] | undefined,
  model: AgentModel,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService
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
    // Build the prompt
    const prompt = buildValidationPrompt(issueNumber, issueTitle, issueBody, issueLabels);

    // Load autoLoadClaudeMd setting
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[ValidateIssue]'
    );

    // Create SDK options with structured output and abort controller
    const options = createSuggestionsOptions({
      cwd: projectPath,
      model,
      systemPrompt: ISSUE_VALIDATION_SYSTEM_PROMPT,
      abortController,
      autoLoadClaudeMd,
      outputFormat: {
        type: 'json_schema',
        schema: issueValidationSchema as Record<string, unknown>,
      },
    });

    // Execute the query
    const stream = query({ prompt, options });
    let validationResult: IssueValidationResult | null = null;
    let responseText = '';

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

    // Clear timeout
    clearTimeout(timeoutId);

    // Require structured output
    if (!validationResult) {
      logger.error('No structured output received from Claude SDK');
      logger.debug('Raw response text:', responseText);
      throw new Error('Validation failed: no structured output received');
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
      } = req.body as ValidateIssueRequestBody;

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

      // Validate model parameter at runtime
      if (!VALID_MODELS.includes(model)) {
        res.status(400).json({
          success: false,
          error: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}`,
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
        settingsService
      )
        .catch((error) => {
          // Error is already handled inside runValidation (event emitted)
          logger.debug('Validation error caught in background handler:', error);
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
