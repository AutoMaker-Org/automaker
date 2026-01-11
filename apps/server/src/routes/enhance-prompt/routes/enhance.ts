/**
 * POST /enhance-prompt endpoint - Enhance user input text
 *
 * Uses Claude AI or Cursor to enhance text based on the specified enhancement mode.
 * Supports modes: improve, technical, simplify, acceptance
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import {
  CLAUDE_MODEL_MAP,
  isCursorModel,
  stripProviderPrefix,
  ThinkingLevel,
  getThinkingTokenBudget,
} from '@automaker/types';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getPromptCustomization } from '../../../lib/settings-helpers.js';
import {
  buildUserPrompt,
  isValidEnhancementMode,
  type EnhancementMode,
} from '../../../lib/enhancement-prompts.js';

const logger = createLogger('EnhancePrompt');

/**
 * Request body for the enhance endpoint
 */
interface EnhanceRequestBody {
  /** The original text to enhance */
  originalText: string;
  /** The enhancement mode to apply */
  enhancementMode: string;
  /** Optional model override */
  model?: string;
  /** Optional thinking level for Claude models (ignored for Cursor models) */
  thinkingLevel?: ThinkingLevel;
}

/**
 * Success response from the enhance endpoint
 */
interface EnhanceSuccessResponse {
  success: true;
  enhancedText: string;
}

/**
 * Error response from the enhance endpoint
 */
interface EnhanceErrorResponse {
  success: false;
  error: string;
}

/**
 * Extract text content from Claude SDK response messages
 *
 * @param stream - The async iterable from the query function
 * @returns The extracted text content
 */
async function extractTextFromStream(
  stream: AsyncIterable<{
    type: string;
    subtype?: string;
    result?: string;
    message?: {
      content?: Array<{ type: string; text?: string }>;
    };
  }>
): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success') {
      responseText = msg.result || responseText;
    }
  }

  return responseText;
}

/**
 * Execute enhancement using Cursor provider
 *
 * @param prompt - The enhancement prompt
 * @param model - The Cursor model to use
 * @returns The enhanced text
 */
async function executeWithCursor(prompt: string, model: string): Promise<string> {
  const provider = ProviderFactory.getProviderForModel(model);
  // Strip provider prefix - providers expect bare model IDs
  const bareModel = stripProviderPrefix(model);

  let responseText = '';

  for await (const msg of provider.executeQuery({
    prompt,
    model: bareModel,
    cwd: process.cwd(), // Enhancement doesn't need a specific working directory
    readOnly: true, // Prompt enhancement only generates text, doesn't write files
  })) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
      // Use result if it's a final accumulated message
      if (msg.result.length > responseText.length) {
        responseText = msg.result;
      }
    }
  }

  return responseText;
}

/**
 * Create the enhance request handler
 *
 * @param settingsService - Optional settings service for loading custom prompts
 * @returns Express request handler for text enhancement
 */
export function createEnhanceHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { originalText, enhancementMode, model, thinkingLevel } =
        req.body as EnhanceRequestBody;

      // Validate required fields
      if (!originalText || typeof originalText !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!enhancementMode || typeof enhancementMode !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'enhancementMode is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate text is not empty
      const trimmedText = originalText.trim();
      if (trimmedText.length === 0) {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      // Validate and normalize enhancement mode
      const normalizedMode = enhancementMode.toLowerCase();
      const validMode: EnhancementMode = isValidEnhancementMode(normalizedMode)
        ? normalizedMode
        : 'improve';

      logger.info(`Enhancing text with mode: ${validMode}, length: ${trimmedText.length} chars`);

      // Load enhancement prompts from settings (merges custom + defaults)
      const prompts = await getPromptCustomization(settingsService, '[EnhancePrompt]');

      // Get the system prompt for this mode from merged prompts
      const systemPromptMap: Record<EnhancementMode, string> = {
        improve: prompts.enhancement.improveSystemPrompt,
        technical: prompts.enhancement.technicalSystemPrompt,
        simplify: prompts.enhancement.simplifySystemPrompt,
        acceptance: prompts.enhancement.acceptanceSystemPrompt,
        'ux-reviewer': prompts.enhancement.uxReviewerSystemPrompt,
      };
      const systemPrompt = systemPromptMap[validMode];

      logger.debug(`Using ${validMode} system prompt (length: ${systemPrompt.length} chars)`);

      // Build the user prompt with few-shot examples
      // This helps the model understand this is text transformation, not a coding task
      const userPrompt = buildUserPrompt(validMode, trimmedText, true);

      // Resolve the model - use the passed model, default to sonnet for quality
      const resolvedModel = resolveModelString(model, CLAUDE_MODEL_MAP.sonnet);

      logger.debug(`Using model: ${resolvedModel}`);

      let enhancedText: string;

      // Route to appropriate provider based on model
      if (isCursorModel(resolvedModel)) {
        // Use Cursor provider for Cursor models
        logger.info(`Using Cursor provider for model: ${resolvedModel}`);

        // Cursor doesn't have a separate system prompt concept, so combine them
        const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
        enhancedText = await executeWithCursor(combinedPrompt, resolvedModel);
      } else {
        // Use Claude SDK for Claude models
        logger.info(`Using Claude provider for model: ${resolvedModel}`);

        // Convert thinkingLevel to maxThinkingTokens for SDK
        const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);
        const queryOptions: Parameters<typeof query>[0]['options'] = {
          model: resolvedModel,
          systemPrompt,
          maxTurns: 1,
          allowedTools: [],
          permissionMode: 'acceptEdits',
        };
        if (maxThinkingTokens) {
          queryOptions.maxThinkingTokens = maxThinkingTokens;
        }

        const stream = query({
          prompt: userPrompt,
          options: queryOptions,
        });

        enhancedText = await extractTextFromStream(stream);
      }

      if (!enhancedText || enhancedText.trim().length === 0) {
        logger.warn('Received empty response from AI');
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'Failed to generate enhanced text - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Enhancement complete, output length: ${enhancedText.length} chars`);

      const response: EnhanceSuccessResponse = {
        success: true,
        enhancedText: enhancedText.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Enhancement failed:', errorMessage);

      const response: EnhanceErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
