/**
 * POST /synopsis/generate - Generate a spoken summary of features
 *
 * Uses Claude AI to create a concise summary suitable for text-to-speech.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { CLAUDE_MODEL_MAP } from '@automaker/types';

const logger = createLogger('SynopsisGenerate');

/**
 * Feature data for synopsis generation
 */
interface FeatureData {
  id: string;
  title?: string;
  description: string;
}

/**
 * Request body for the generate endpoint
 */
interface GenerateRequestBody {
  features: FeatureData[];
}

/**
 * Success response from the generate endpoint
 */
interface GenerateSuccessResponse {
  success: true;
  text: string;
}

/**
 * Error response from the generate endpoint
 */
interface GenerateErrorResponse {
  success: false;
  error: string;
}

/**
 * Extract text content from Claude SDK response messages
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
 * Create the generate request handler
 */
export function createGenerateHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { features } = req.body as GenerateRequestBody;

      // Validate required fields
      if (!features || !Array.isArray(features) || features.length === 0) {
        const response: GenerateErrorResponse = {
          success: false,
          error: 'features is required and must be a non-empty array',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating synopsis for ${features.length} feature(s)`);

      // Build the task list for the prompt
      const taskList = features
        .map((f, i) => {
          const title = f.title ? `"${f.title}"` : '';
          return `${i + 1}. ${title ? title + ': ' : ''}${f.description}`;
        })
        .join('\n');

      const systemPrompt = `You are generating a brief audio synopsis of tasks for a developer.
Keep your response concise and natural-sounding, as it will be read aloud via text-to-speech.
Do not use markdown, bullets, or formatting - just plain spoken text.
Summarize the tasks in 2-4 sentences, focusing on the overall scope and key activities.`;

      const userPrompt = `Here are ${features.length} task(s) that were selected:

${taskList}

Please provide a brief spoken summary of these tasks.`;

      // Use haiku for speed since this is a simple summarization task
      const resolvedModel = resolveModelString(undefined, CLAUDE_MODEL_MAP.haiku);

      logger.debug(`Using model: ${resolvedModel}`);

      // Call Claude SDK
      const stream = query({
        prompt: userPrompt,
        options: {
          model: resolvedModel,
          systemPrompt,
          maxTurns: 1,
          allowedTools: [],
          permissionMode: 'acceptEdits',
        },
      });

      // Extract the synopsis text
      const synopsisText = await extractTextFromStream(stream);

      if (!synopsisText || synopsisText.trim().length === 0) {
        logger.warn('Received empty response from Claude');
        const response: GenerateErrorResponse = {
          success: false,
          error: 'Failed to generate synopsis - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Synopsis generated, length: ${synopsisText.length} chars`);

      const response: GenerateSuccessResponse = {
        success: true,
        text: synopsisText.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Synopsis generation failed:', errorMessage);

      const response: GenerateErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
