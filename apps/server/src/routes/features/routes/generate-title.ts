/**
 * POST /features/generate-title endpoint - Generate a concise title from description
 *
 * Uses the configured provider to generate a short, descriptive title from feature description.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { CLAUDE_MODEL_MAP } from '@automaker/model-resolver';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { ProviderMessage } from '@automaker/types';

const logger = createLogger('GenerateTitle');
const TITLE_MAX_TURNS = 1;
const MOCK_TITLE = 'Mock feature title';
const ERROR_DESCRIPTION_REQUIRED = 'description is required and must be a string';
const ERROR_DESCRIPTION_EMPTY = 'description cannot be empty';
const ERROR_TITLE_EMPTY = 'Failed to generate title - empty response';

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

async function extractTextFromStream(stream: AsyncIterable<ProviderMessage>): Promise<string> {
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

export function createGenerateTitleHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description } = req.body as GenerateTitleRequestBody;

      if (!description || typeof description !== 'string') {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: ERROR_DESCRIPTION_REQUIRED,
        };
        res.status(400).json(response);
        return;
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length === 0) {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: ERROR_DESCRIPTION_EMPTY,
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating title for description: ${trimmedDescription.substring(0, 50)}...`);

      if (process.env.AUTOMAKER_MOCK_AGENT === 'true') {
        const response: GenerateTitleSuccessResponse = {
          success: true,
          title: MOCK_TITLE,
        };
        res.json(response);
        return;
      }

      const userPrompt = `Generate a concise title for this feature:\n\n${trimmedDescription}`;

      const model = CLAUDE_MODEL_MAP.haiku;
      const provider = ProviderFactory.getProviderForModel(model);
      const stream = provider.executeQuery({
        prompt: userPrompt,
        model,
        cwd: process.cwd(),
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: TITLE_MAX_TURNS,
        allowedTools: [],
      });

      const title = await extractTextFromStream(stream);

      if (!title || title.trim().length === 0) {
        logger.warn('Received empty response from provider');
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: ERROR_TITLE_EMPTY,
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
