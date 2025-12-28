/**
 * POST /features/generate-title endpoint - Generate a concise title from description
 *
 * Uses AI providers (Claude, Zai, etc.) to generate a short, descriptive title from feature description.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { DEFAULT_MODELS } from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';
import { executeProviderQuery } from '../../../lib/provider-query.js';
import { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('GenerateTitle');

interface GenerateTitleRequestBody {
  description: string;
  model?: string;
}

interface GenerateTitleSuccessResponse {
  success: true;
  title: string;
}

interface GenerateTitleErrorResponse {
  success: false;
  error: string;
}

const SYSTEM_PROMPT = `You are a title generator. Your task is to create a concise, descriptive title (5-10 words max) for a software feature based on its description.

Rules:
- Output ONLY the title, nothing else
- Keep it short and action-oriented (e.g., "Add dark mode toggle", "Fix login validation")
- Start with a verb when possible (Add, Fix, Update, Implement, Create, etc.)
- No quotes, periods, or extra formatting
- Capture the essence of the feature in a scannable way`;

async function extractTextFromStream(
  stream: AsyncIterable<{
    type: string;
    subtype?: string;
    result?: string;
    error?: string;
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
    } else if (msg.type === 'error') {
      // Handle error messages from the stream
      logger.error('[GenerateTitle] Stream error:', msg.error);
      throw new Error(msg.error || 'Stream error occurred');
    }
  }

  return responseText;
}

export function createGenerateTitleHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description, model: requestedModel } = req.body as GenerateTitleRequestBody;

      if (!description || typeof description !== 'string') {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length === 0) {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating title for description: ${trimmedDescription.substring(0, 50)}...`);

      const userPrompt = `Generate a concise title for this feature:\n\n${trimmedDescription}`;

      // Get API keys for provider authentication
      const apiKeys = settingsService ? await settingsService.getApiKeys() : undefined;

      // Resolve model (provider-aware, uses requested model or defaults)
      const resolvedModel = resolveModelString(requestedModel, undefined, 'auto');

      const stream = executeProviderQuery({
        cwd: process.cwd(),
        prompt: userPrompt,
        model: resolvedModel,
        useCase: 'suggestions', // Use fast model
        maxTurns: 1,
        allowedTools: [],
        apiKeys,
        systemPrompt: SYSTEM_PROMPT,
      });

      const title = await extractTextFromStream(stream);

      if (!title || title.trim().length === 0) {
        logger.warn('Received empty response from provider');
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'Failed to generate title - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Generated title: ${title.trim()}`);

      const response: GenerateTitleSuccessResponse = {
        success: true,
        title: title.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Title generation failed:', errorMessage);

      const response: GenerateTitleErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
