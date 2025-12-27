/**
 * POST /context/describe-image endpoint - Generate description for an image
 *
 * Uses Claude Haiku to analyze an image and generate a concise description
 * suitable for context file metadata.
 *
 * IMPORTANT:
 * The agent runner (chat/auto-mode) sends images as multi-part content blocks (base64 image blocks),
 * not by asking Claude to use the Read tool to open files. This endpoint now mirrors that approach
 * so it doesn't depend on Claude's filesystem tool access or working directory restrictions.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, readImageAsBase64 } from '@automaker/utils';
import { CLAUDE_MODEL_MAP } from '@automaker/types';
import { createCustomOptions } from '../../../lib/sdk-options.js';
import * as fs from 'fs';
import * as path from 'path';
import type { SettingsService } from '../../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../../lib/settings-helpers.js';

const logger = createLogger('DescribeImage');

/**
 * Allowlist of safe headers to log
 * All other headers are excluded to prevent leaking sensitive values
 */
const SAFE_HEADERS_ALLOWLIST = new Set([
  'content-type',
  'accept',
  'user-agent',
  'host',
  'referer',
  'content-length',
  'origin',
  'x-request-id',
]);

/**
 * Filter request headers to only include safe, non-sensitive values
 */
function filterSafeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SAFE_HEADERS_ALLOWLIST.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Find the actual file path, handling Unicode character variations.
 * macOS screenshots use U+202F (NARROW NO-BREAK SPACE) before AM/PM,
 * but this may be transmitted as a regular space through the API.
 */
function findActualFilePath(requestedPath: string): string | null {
  // First, try the exact path
  if (fs.existsSync(requestedPath)) {
    return requestedPath;
  }

  // Try with Unicode normalization
  const normalizedPath = requestedPath.normalize('NFC');
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath;
  }

  // If not found, try to find the file in the directory by matching the basename
  // This handles cases where the space character differs (U+0020 vs U+202F vs U+00A0)
  const dir = path.dirname(requestedPath);
  const baseName = path.basename(requestedPath);

  if (!fs.existsSync(dir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(dir);

    // Normalize the requested basename for comparison
    // Replace various space-like characters with regular space for comparison
    const normalizeSpaces = (s: string): string => s.replace(/[\u00A0\u202F\u2009\u200A]/g, ' ');

    const normalizedBaseName = normalizeSpaces(baseName);

    for (const file of files) {
      if (normalizeSpaces(file) === normalizedBaseName) {
        logger.info(`Found matching file with different space encoding: ${file}`);
        return path.join(dir, file);
      }
    }
  } catch (err) {
    logger.error(`Error reading directory ${dir}: ${err}`);
  }

  return null;
}

/**
 * Request body for the describe-image endpoint
 */
interface DescribeImageRequestBody {
  /** Path to the image file */
  imagePath: string;
}

/**
 * Success response from the describe-image endpoint
 */
interface DescribeImageSuccessResponse {
  success: true;
  description: string;
}

/**
 * Error response from the describe-image endpoint
 */
interface DescribeImageErrorResponse {
  success: false;
  error: string;
  requestId?: string;
}

/**
 * Map SDK/CLI errors to a stable status + user-facing message.
 */
function mapDescribeImageError(rawMessage: string | undefined): {
  statusCode: number;
  userMessage: string;
} {
  const baseResponse = {
    statusCode: 500,
    userMessage: 'Failed to generate an image description. Please try again.',
  };

  if (!rawMessage) return baseResponse;

  if (rawMessage.includes('Claude Code process exited')) {
    return {
      statusCode: 503,
      userMessage:
        'Claude exited unexpectedly while describing the image. Try again. If it keeps happening, re-run `claude login` or update your API key in Setup so Claude can restart cleanly.',
    };
  }

  if (
    rawMessage.includes('Failed to spawn Claude Code process') ||
    rawMessage.includes('Claude Code executable not found') ||
    rawMessage.includes('Claude Code native binary not found')
  ) {
    return {
      statusCode: 503,
      userMessage:
        'Claude CLI could not be launched. Make sure the Claude CLI is installed and available in PATH, then try again.',
    };
  }

  if (rawMessage.toLowerCase().includes('rate limit') || rawMessage.includes('429')) {
    return {
      statusCode: 429,
      userMessage: 'Rate limited while describing the image. Please wait a moment and try again.',
    };
  }

  if (rawMessage.toLowerCase().includes('payload too large') || rawMessage.includes('413')) {
    return {
      statusCode: 413,
      userMessage:
        'The image is too large to send for description. Please resize/compress it and try again.',
    };
  }

  return baseResponse;
}

/**
 * Extract text content from Claude SDK response messages and log high-signal stream events.
 */
async function extractTextFromStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: AsyncIterable<any>,
  requestId: string
): Promise<string> {
  let responseText = '';
  let messageCount = 0;

  logger.info(`[${requestId}] [Stream] Begin reading SDK stream...`);

  for await (const msg of stream) {
    messageCount++;
    const msgType = msg?.type;
    const msgSubtype = msg?.subtype;

    // Keep this concise but informative. Full error object is logged in catch blocks.
    logger.info(
      `[${requestId}] [Stream] #${messageCount} type=${String(msgType)} subtype=${String(msgSubtype ?? '')}`
    );

    if (msgType === 'assistant' && msg.message?.content) {
      const blocks = msg.message.content as Array<{ type: string; text?: string }>;
      logger.info(`[${requestId}] [Stream] assistant blocks=${blocks.length}`);
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    }

    if (msgType === 'result' && msgSubtype === 'success') {
      if (typeof msg.result === 'string' && msg.result.length > 0) {
        responseText = msg.result;
      }
    }
  }

  logger.info(
    `[${requestId}] [Stream] End of stream. messages=${messageCount} textLength=${responseText.length}`
  );

  return responseText;
}

/**
 * Create the describe-image request handler
 *
 * Uses Claude SDK query with multi-part content blocks to include the image (base64),
 * matching the agent runner behavior.
 *
 * @param settingsService - Optional settings service for loading autoLoadClaudeMd setting
 * @returns Express request handler for image description
 */
export function createDescribeImageHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const requestId = `describe-image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const startedAt = Date.now();

    // Request envelope logs (high value when correlating failures)
    // Only log safe headers to prevent leaking sensitive values (auth tokens, cookies, etc.)
    logger.info(`[${requestId}] ===== POST /api/context/describe-image =====`);
    logger.info(`[${requestId}] headers=${JSON.stringify(filterSafeHeaders(req.headers))}`);
    logger.info(`[${requestId}] body=${JSON.stringify(req.body)}`);

    try {
      const { imagePath } = req.body as DescribeImageRequestBody;

      // Validate required fields
      if (!imagePath || typeof imagePath !== 'string') {
        const response: DescribeImageErrorResponse = {
          success: false,
          error: 'imagePath is required and must be a string',
          requestId,
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`[${requestId}] imagePath="${imagePath}" type=${typeof imagePath}`);

      // Find the actual file path (handles Unicode space character variations)
      const actualPath = findActualFilePath(imagePath);
      if (!actualPath) {
        logger.error(`[${requestId}] File not found: ${imagePath}`);
        // Log hex representation of the path for debugging
        const hexPath = Buffer.from(imagePath).toString('hex');
        logger.error(`[${requestId}] imagePath hex: ${hexPath}`);
        const response: DescribeImageErrorResponse = {
          success: false,
          error: `File not found: ${imagePath}`,
          requestId,
        };
        res.status(404).json(response);
        return;
      }

      if (actualPath !== imagePath) {
        logger.info(`[${requestId}] Using actual path: ${actualPath}`);
      }

      // Log path + stats (this is often where issues start: missing file, perms, size)
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(actualPath);
        logger.info(
          `[${requestId}] fileStats size=${stat.size} bytes mtime=${stat.mtime.toISOString()}`
        );
      } catch (statErr) {
        logger.warn(
          `[${requestId}] Unable to stat image file (continuing to read base64): ${String(statErr)}`
        );
      }

      // Read image and convert to base64 (same as agent runner)
      logger.info(`[${requestId}] Reading image into base64...`);
      const imageReadStart = Date.now();
      const imageData = await readImageAsBase64(actualPath);
      const imageReadMs = Date.now() - imageReadStart;

      const base64Length = imageData.base64.length;
      const estimatedBytes = Math.ceil((base64Length * 3) / 4);
      logger.info(`[${requestId}] imageReadMs=${imageReadMs}`);
      logger.info(
        `[${requestId}] image meta filename=${imageData.filename} mime=${imageData.mimeType} base64Len=${base64Length} estBytes=${estimatedBytes}`
      );

      // Build multi-part prompt with image block (no Read tool required)
      const instructionText =
        `Describe this image in 1-2 sentences suitable for use as context in an AI coding assistant. ` +
        `Focus on what the image shows and its purpose (e.g., "UI mockup showing login form with email/password fields", ` +
        `"Architecture diagram of microservices", "Screenshot of error message in terminal").\n\n` +
        `Respond with ONLY the description text, no additional formatting, preamble, or explanation.`;

      const promptContent = [
        { type: 'text' as const, text: instructionText },
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: imageData.mimeType,
            data: imageData.base64,
          },
        },
      ];

      logger.info(`[${requestId}] Built multi-part prompt blocks=${promptContent.length}`);

      const cwd = path.dirname(actualPath);
      logger.info(`[${requestId}] Using cwd=${cwd}`);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        cwd,
        settingsService,
        '[DescribeImage]'
      );

      // Use the same centralized option builder used across the server (validates cwd)
      const sdkOptions = createCustomOptions({
        cwd,
        model: CLAUDE_MODEL_MAP.haiku,
        maxTurns: 1,
        allowedTools: [],
        autoLoadClaudeMd,
        sandbox: { enabled: true, autoAllowBashIfSandboxed: true },
      });

      logger.info(
        `[${requestId}] SDK options model=${sdkOptions.model} maxTurns=${sdkOptions.maxTurns} allowedTools=${JSON.stringify(
          sdkOptions.allowedTools
        )} sandbox=${JSON.stringify(sdkOptions.sandbox)}`
      );

      const promptGenerator = (async function* () {
        yield {
          type: 'user' as const,
          session_id: '',
          message: { role: 'user' as const, content: promptContent },
          parent_tool_use_id: null,
        };
      })();

      logger.info(`[${requestId}] Calling query()...`);
      const queryStart = Date.now();
      const stream = query({ prompt: promptGenerator, options: sdkOptions });
      logger.info(`[${requestId}] query() returned stream in ${Date.now() - queryStart}ms`);

      // Extract the description from the response
      const extractStart = Date.now();
      const description = await extractTextFromStream(stream, requestId);
      logger.info(`[${requestId}] extractMs=${Date.now() - extractStart}`);

      if (!description || description.trim().length === 0) {
        logger.warn(`[${requestId}] Received empty response from Claude`);
        const response: DescribeImageErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
          requestId,
        };
        res.status(500).json(response);
        return;
      }

      const totalMs = Date.now() - startedAt;
      logger.info(`[${requestId}] Success descriptionLen=${description.length} totalMs=${totalMs}`);

      const response: DescribeImageSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const totalMs = Date.now() - startedAt;
      const err = error as unknown;
      const errMessage = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : 'UnknownError';
      const errStack = err instanceof Error ? err.stack : undefined;

      logger.error(`[${requestId}] FAILED totalMs=${totalMs}`);
      logger.error(`[${requestId}] errorName=${errName}`);
      logger.error(`[${requestId}] errorMessage=${errMessage}`);
      if (errStack) logger.error(`[${requestId}] errorStack=${errStack}`);

      // Dump all enumerable + non-enumerable props (this is where stderr/stdout/exitCode often live)
      try {
        const props = err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : [];
        logger.error(`[${requestId}] errorProps=${JSON.stringify(props)}`);
        if (err && typeof err === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyErr = err as any;
          const details = JSON.stringify(anyErr, props as unknown as string[]);
          logger.error(`[${requestId}] errorDetails=${details}`);
        }
      } catch (stringifyErr) {
        logger.error(`[${requestId}] Failed to serialize error object: ${String(stringifyErr)}`);
      }

      const { statusCode, userMessage } = mapDescribeImageError(errMessage);
      const response: DescribeImageErrorResponse = {
        success: false,
        error: `${userMessage} (requestId: ${requestId})`,
        requestId,
      };
      res.status(statusCode).json(response);
    }
  };
}
