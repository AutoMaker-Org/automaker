/**
 * POST /validate-issue endpoint - Validate a Linear issue using Claude SDK (async)
 *
 * Scans the codebase to determine if an issue is valid, invalid, or needs clarification.
 * Runs asynchronously and emits events for progress and completion.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../../lib/events.js';
import type {
  IssueValidationResult,
  LinearValidationEvent,
  ModelAlias,
  CursorModelId,
  ThinkingLevel,
} from '@automaker/types';
import { isCursorModel, DEFAULT_PHASE_MODELS, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { createSuggestionsOptions } from '../../../lib/sdk-options.js';
import { extractJson } from '../../../lib/json-extractor.js';
import { writeLinearValidation } from '../../../lib/linear-validation-storage.js';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import {
  issueValidationSchema,
  ISSUE_VALIDATION_SYSTEM_PROMPT,
} from '../../github/routes/validation-schema.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../../lib/settings-helpers.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LinearValidation');

/** Valid Claude model values for validation */
const VALID_CLAUDE_MODELS: readonly ModelAlias[] = ['opus', 'sonnet', 'haiku'] as const;

/**
 * Status of a Linear validation in progress
 */
interface LinearValidationStatus {
  isRunning: boolean;
  abortController: AbortController;
  startedAt: Date;
}

/**
 * Map of issue identifier to validation status
 * Key format: `${projectPath}||${identifier}`
 */
const linearValidationStatusMap = new Map<string, LinearValidationStatus>();

// Max age for stale validations (15 minutes)
const MAX_VALIDATION_AGE_MS = 15 * 60 * 1000;

/**
 * Cleanup stale Linear validations.
 * Called from centralized cleanup in index.ts (alongside GitHub validation cleanup).
 * @returns Number of cleaned up entries
 */
export function cleanupLinearValidations(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, status] of linearValidationStatusMap.entries()) {
    if (now - status.startedAt.getTime() > MAX_VALIDATION_AGE_MS) {
      logger.warn(`Cleaning up stale Linear validation: ${key}`);
      status.abortController.abort();
      linearValidationStatusMap.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Create a unique key for a Linear validation
 */
function getValidationKey(projectPath: string, identifier: string): string {
  return `${projectPath}||${identifier}`;
}

/**
 * Check if a Linear validation is currently running
 */
export function isLinearValidationRunning(projectPath: string, identifier: string): boolean {
  const key = getValidationKey(projectPath, identifier);
  const status = linearValidationStatusMap.get(key);
  return status?.isRunning ?? false;
}

/**
 * Get all running Linear validations for a project
 */
export function getRunningLinearValidations(projectPath: string): string[] {
  const runningIdentifiers: string[] = [];
  const prefix = `${projectPath}||`;
  for (const [key, status] of linearValidationStatusMap.entries()) {
    if (status.isRunning && key.startsWith(prefix)) {
      const identifier = key.slice(prefix.length);
      runningIdentifiers.push(identifier);
    }
  }
  return runningIdentifiers;
}

/**
 * Atomically try to set a Linear validation as running
 */
function trySetLinearValidationRunning(
  projectPath: string,
  identifier: string,
  abortController: AbortController
): boolean {
  const key = getValidationKey(projectPath, identifier);
  if (linearValidationStatusMap.has(key)) {
    return false;
  }
  linearValidationStatusMap.set(key, {
    isRunning: true,
    abortController,
    startedAt: new Date(),
  });
  return true;
}

/**
 * Clear Linear validation status
 */
function clearLinearValidationStatus(projectPath: string, identifier: string): void {
  const key = getValidationKey(projectPath, identifier);
  linearValidationStatusMap.delete(key);
}

/**
 * Abort a running Linear validation
 */
export function abortLinearValidation(projectPath: string, identifier: string): boolean {
  const key = getValidationKey(projectPath, identifier);
  const status = linearValidationStatusMap.get(key);
  if (!status || !status.isRunning) {
    return false;
  }
  status.abortController.abort();
  linearValidationStatusMap.delete(key);
  return true;
}

/**
 * Request body for Linear issue validation
 */
interface ValidateLinearIssueRequestBody {
  projectPath: string;
  issueId: string;
  identifier: string;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  model?: ModelAlias | CursorModelId;
  thinkingLevel?: ThinkingLevel;
  teamId?: string;
}

/**
 * Emit a progress event for Linear validation
 */
function emitProgressEvent(
  events: EventEmitter,
  issueId: string,
  identifier: string,
  content: string,
  projectPath: string
): void {
  const progressEvent: LinearValidationEvent = {
    type: 'linear_validation_progress',
    issueId,
    identifier,
    content,
    projectPath,
  };
  events.emit('linear-validation:event', progressEvent);
}

/**
 * Build the prompt for Linear issue validation
 */
function buildLinearValidationPrompt(
  identifier: string,
  issueTitle: string,
  issueBody: string,
  issueLabels?: string[]
): string {
  const labelsSection = issueLabels?.length ? `\n\n**Labels:** ${issueLabels.join(', ')}` : '';

  return `Please validate the following Linear issue by analyzing the codebase:

## Issue ${identifier}: ${issueTitle}
${labelsSection}

### Description

${issueBody || '(No description provided)'}

---

Scan the codebase to verify this issue. Look for the files, components, or functionality mentioned. Determine if this issue is valid, invalid, or needs clarification.`;
}

/**
 * Run the Linear validation asynchronously
 */
async function runLinearValidation(
  projectPath: string,
  issueId: string,
  identifier: string,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[] | undefined,
  model: ModelAlias | CursorModelId,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  thinkingLevel?: ThinkingLevel
): Promise<void> {
  // Emit start event
  const startEvent: LinearValidationEvent = {
    type: 'linear_validation_start',
    issueId,
    identifier,
    issueTitle,
    projectPath,
  };
  events.emit('linear-validation:event', startEvent);

  // Set up timeout (6 minutes)
  const VALIDATION_TIMEOUT_MS = 360000;
  const timeoutId = setTimeout(() => {
    logger.warn(`Linear validation timeout reached after ${VALIDATION_TIMEOUT_MS}ms`);
    abortController.abort();
  }, VALIDATION_TIMEOUT_MS);

  try {
    const prompt = buildLinearValidationPrompt(identifier, issueTitle, issueBody, issueLabels);

    let validationResult: IssueValidationResult | null = null;
    let responseText = '';

    // Route to appropriate provider based on model
    if (isCursorModel(model)) {
      logger.info(`Using Cursor provider for Linear validation with model: ${model}`);

      const provider = ProviderFactory.getProviderForModel(model);
      const bareModel = stripProviderPrefix(model);

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
        readOnly: true,
      })) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              responseText += block.text;
              emitProgressEvent(events, issueId, identifier, block.text, projectPath);
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          if (msg.result.length > responseText.length) {
            responseText = msg.result;
          }
        }
      }

      if (responseText) {
        validationResult = extractJson<IssueValidationResult>(responseText, { logger });
      }
    } else {
      logger.info(`Using Claude provider for Linear validation with model: ${model}`);

      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        settingsService,
        '[LinearValidation]'
      );

      let effectiveThinkingLevel: ThinkingLevel | undefined = thinkingLevel;
      if (!effectiveThinkingLevel) {
        const settings = await settingsService?.getGlobalSettings();
        const phaseModelEntry =
          settings?.phaseModels?.validationModel || DEFAULT_PHASE_MODELS.validationModel;
        const resolved = resolvePhaseModel(phaseModelEntry);
        effectiveThinkingLevel = resolved.thinkingLevel;
      }

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

      const stream = query({ prompt, options });

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
              emitProgressEvent(events, issueId, identifier, block.text, projectPath);
            }
          }
        }

        if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const resultMsg = msg as Record<string, unknown>;
            if (resultMsg.structured_output && typeof resultMsg.structured_output === 'object') {
              validationResult = resultMsg.structured_output as IssueValidationResult;
              logger.debug('Received structured output:', validationResult);
            }
          } else if (msg.subtype === 'error_max_structured_output_retries') {
            logger.error('Failed to produce valid structured output after retries');
            throw new Error('Could not produce valid validation output');
          }
        }
      }
    }

    clearTimeout(timeoutId);

    if (!validationResult) {
      logger.error('No validation result received from AI provider');
      throw new Error('Validation failed: no valid result received');
    }

    logger.info(`Linear issue ${identifier} validation complete: ${validationResult.verdict}`);

    // Store the result
    await writeLinearValidation(projectPath, identifier, {
      issueId,
      identifier,
      issueTitle,
      validatedAt: new Date().toISOString(),
      model,
      result: validationResult,
    });

    // Emit completion event
    const completeEvent: LinearValidationEvent = {
      type: 'linear_validation_complete',
      issueId,
      identifier,
      issueTitle,
      result: validationResult,
      projectPath,
      model,
    };
    events.emit('linear-validation:event', completeEvent);
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Linear issue ${identifier} validation failed:`, error);

    const errorEvent: LinearValidationEvent = {
      type: 'linear_validation_error',
      issueId,
      identifier,
      error: errorMessage,
      projectPath,
    };
    events.emit('linear-validation:event', errorEvent);

    throw error;
  }
}

/**
 * Creates the handler for validating Linear issues against the codebase
 */
export function createValidateLinearIssueHandler(
  events: EventEmitter,
  settingsService?: SettingsService,
  linearService?: {
    updateIssueState: (
      issueId: string,
      stateId: string
    ) => Promise<{ success: boolean; error?: string }>;
    getInProgressStateId: (teamId: string) => Promise<string | null>;
  }
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        issueId,
        identifier,
        issueTitle,
        issueBody,
        issueLabels,
        model = 'opus',
        thinkingLevel,
        teamId,
      } = req.body as ValidateLinearIssueRequestBody;

      logger.info(`[LinearValidation] Received validation request for issue ${identifier}`);

      // Validate required fields
      const requiredFields = [
        { name: 'projectPath', value: projectPath },
        { name: 'issueId', value: issueId },
        { name: 'identifier', value: identifier },
        { name: 'issueTitle', value: issueTitle },
      ] as const;

      for (const { name, value } of requiredFields) {
        if (!value || typeof value !== 'string') {
          res.status(400).json({ success: false, error: `${name} is required` });
          return;
        }
      }

      // Validate model parameter
      const isValidClaudeModel = VALID_CLAUDE_MODELS.includes(model as ModelAlias);
      const isValidCursorModel = isCursorModel(model);

      if (!isValidClaudeModel && !isValidCursorModel) {
        res.status(400).json({
          success: false,
          error: `Invalid model. Must be one of: ${VALID_CLAUDE_MODELS.join(', ')}, or a Cursor model ID`,
        });
        return;
      }

      logger.info(`Starting async validation for Linear issue ${identifier}: ${issueTitle}`);

      // Create abort controller and try to claim validation slot
      const abortController = new AbortController();
      if (!trySetLinearValidationRunning(projectPath, identifier, abortController)) {
        res.status(409).json({
          success: false,
          error: `Validation is already running for issue ${identifier}`,
        });
        return;
      }

      // Update issue status to "In Progress" if enabled
      if (linearService && settingsService && teamId) {
        try {
          const globalSettings = await settingsService.getGlobalSettings();
          if (globalSettings?.linearSettings?.updateStatusOnValidationStart) {
            const inProgressStateId = await linearService.getInProgressStateId(teamId);
            if (inProgressStateId) {
              const updateResult = await linearService.updateIssueState(issueId, inProgressStateId);
              if (updateResult.success) {
                logger.info(`Updated issue ${identifier} status to In Progress`);
              } else {
                logger.warn(
                  `Failed to update issue ${identifier} status: ${updateResult.error || 'Unknown error'}`
                );
              }
            } else {
              logger.warn(`Could not find In Progress state for team ${teamId}`);
            }
          }
        } catch (err) {
          // Don't fail validation if status update fails
          logger.warn(`Error updating issue status:`, err);
        }
      }

      // Start validation in background
      runLinearValidation(
        projectPath,
        issueId,
        identifier,
        issueTitle,
        issueBody ?? '',
        issueLabels,
        model,
        events,
        abortController,
        settingsService,
        thinkingLevel
      )
        .catch((error) => {
          // Error is already emitted as event inside runLinearValidation
          logger.debug(`Background validation completed with error:`, error);
        })
        .finally(() => {
          clearLinearValidationStatus(projectPath, identifier);
        });

      // Return immediately
      res.json({
        success: true,
        message: `Validation started for issue ${identifier}`,
        identifier,
      });
    } catch (error) {
      logger.error('Linear issue validation error:', error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  };
}
