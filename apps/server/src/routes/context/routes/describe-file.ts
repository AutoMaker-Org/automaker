/**
 * POST /context/describe-file endpoint - Generate description for a text file
 *
 * Uses Claude Haiku to analyze a text file and generate a concise description
 * suitable for context file metadata.
 *
 * SECURITY: This endpoint validates file paths against ALLOWED_ROOT_DIRECTORY
 * and reads file content directly (not via Claude's Read tool) to prevent
 * arbitrary file reads and prompt injection attacks.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { DEFAULT_MODELS } from '@automaker/types';
import { PathNotAllowedError } from '@automaker/platform';
import { executeProviderQuery } from '../../../lib/provider-query.js';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';
import { SettingsService } from '../../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../../lib/settings-helpers.js';

const logger = createLogger('DescribeFile');

/**
 * Request body for the describe-file endpoint
 */
interface DescribeFileRequestBody {
  /** Path to the file */
  filePath: string;
}

/**
 * Success response from the describe-file endpoint
 */
interface DescribeFileSuccessResponse {
  success: true;
  description: string;
}

/**
 * Error response from the describe-file endpoint
 */
interface DescribeFileErrorResponse {
  success: false;
  error: string;
}

/**
 * Extract text content from provider response messages
 */
async function extractTextFromStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: AsyncIterable<any>
): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      const blocks = msg.message.content as Array<{ type: string; text?: string }>;
      for (const block of blocks) {
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
 * Create the describe-file request handler
 *
 * @param settingsService - Optional settings service for loading autoLoadClaudeMd setting
 * @returns Express request handler for file description
 */
export function createDescribeFileHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DescribeFileRequestBody;

      // Validate required fields
      if (!filePath || typeof filePath !== 'string') {
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'filePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`[DescribeFile] Starting description generation for: ${filePath}`);

      // Resolve the path for logging and cwd derivation
      const resolvedPath = secureFs.resolvePath(filePath);

      // Read file content using secureFs (validates path against ALLOWED_ROOT_DIRECTORY)
      // This prevents arbitrary file reads (e.g., /etc/passwd, ~/.ssh/id_rsa)
      // and prompt injection attacks where malicious filePath values could inject instructions
      let fileContent: string;
      try {
        const content = await secureFs.readFile(resolvedPath, 'utf-8');
        fileContent = typeof content === 'string' ? content : content.toString('utf-8');
      } catch (readError) {
        // Path not allowed - return 403 Forbidden
        if (readError instanceof PathNotAllowedError) {
          logger.warn(`[DescribeFile] Path not allowed: ${filePath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: 'File path is not within the allowed directory',
          };
          res.status(403).json(response);
          return;
        }

        // File not found
        if (
          readError !== null &&
          typeof readError === 'object' &&
          'code' in readError &&
          readError.code === 'ENOENT'
        ) {
          logger.warn(`[DescribeFile] File not found: ${resolvedPath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: `File not found: ${filePath}`,
          };
          res.status(404).json(response);
          return;
        }

        const errorMessage = readError instanceof Error ? readError.message : 'Unknown error';
        logger.error(`[DescribeFile] Failed to read file: ${errorMessage}`);
        const response: DescribeFileErrorResponse = {
          success: false,
          error: `Failed to read file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      // Truncate very large files to avoid token limits
      const MAX_CONTENT_LENGTH = 50000;
      const truncated = fileContent.length > MAX_CONTENT_LENGTH;
      const contentToAnalyze = truncated
        ? fileContent.substring(0, MAX_CONTENT_LENGTH)
        : fileContent;

      // Get the filename for context
      const fileName = path.basename(resolvedPath);

      // Build prompt with file content passed as structured data
      // The file content is included directly, not via tool invocation
      const instructionText = `Analyze the following file and provide a 1-2 sentence description suitable for use as context in an AI coding assistant. Focus on what the file contains, its purpose, and why an AI agent might want to use this context in the future (e.g., "API documentation for the authentication endpoints", "Configuration file for database connections", "Coding style guidelines for the project").

Respond with ONLY the description text, no additional formatting, preamble, or explanation.

File: ${fileName}${truncated ? ' (truncated)' : ''}

---

File Content:
${contentToAnalyze}`;

      // Use the file's directory as the working directory
      const cwd = path.dirname(resolvedPath);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        cwd,
        settingsService,
        '[DescribeFile]'
      );

      // Get API keys for provider authentication
      const apiKeys = settingsService ? await settingsService.getApiKeys() : undefined;

      // Use provider-agnostic query - no tools needed since file content is passed directly
      const stream = executeProviderQuery({
        cwd,
        prompt: instructionText,
        useCase: 'suggestions', // Use fast model (haiku or equivalent)
        maxTurns: 1,
        allowedTools: [],
        autoLoadClaudeMd,
        apiKeys,
      });

      // Extract the description from the response
      const description = await extractTextFromStream(stream);

      if (!description || description.trim().length === 0) {
        logger.warn('Received empty response from provider');
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Description generated, length: ${description.length} chars`);

      const response: DescribeFileSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('File description failed:', errorMessage);

      const response: DescribeFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
