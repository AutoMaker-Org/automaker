/**
 * POST /features/generate-title endpoint - Generate a concise title from description
 *
 * Uses the provider abstraction to generate a short, descriptive title
 * from a feature description. Works with any configured provider (Claude, Cursor, etc.).
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { CLAUDE_MODEL_MAP } from '@automaker/model-resolver';
import { simpleQuery } from '../../../providers/simple-query-service.js';

const logger = createLogger('GenerateTitle');

interface GenerateTitleRequestBody {
  description: string;
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

export function createGenerateTitleHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description } = req.body as GenerateTitleRequestBody;

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

      // Use simpleQuery - provider abstraction handles all the streaming/extraction
      // Don't pass allowedTools at all (undefined) to prevent SDK exit code 1 issues
      const result = await simpleQuery({
        prompt: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
        model: CLAUDE_MODEL_MAP.haiku,
        cwd: process.cwd(),
        maxTurns: 1,
        // allowedTools intentionally omitted - undefined works better than empty array
      });

      const title = result.text;

      if (!title || title.trim().length === 0) {
        logger.warn('Received empty response from AI');
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
