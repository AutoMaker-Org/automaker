/**
 * POST /clarification-response endpoint - Submit answers to clarification questions
 *
 * Used during interactive planning mode when the AI agent asks clarification
 * questions via the AskUserQuestion tool.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

/** Shape of the clarification response request body */
interface ClarificationResponseBody {
  featureId: string;
  projectPath: string;
  requestId: string;
  answers: Record<string, string>;
}

/**
 * Validates and parses the clarification response request body.
 * Returns the validated body or an error message.
 */
function validateRequestBody(
  body: unknown
): { success: true; data: ClarificationResponseBody } | { success: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { success: false, error: 'Request body must be an object' };
  }

  const obj = body as Record<string, unknown>;

  // Define required string fields
  const requiredStringFields: Array<keyof ClarificationResponseBody> = [
    'featureId',
    'projectPath',
    'requestId',
  ];

  // Validate required string fields
  for (const field of requiredStringFields) {
    const value = obj[field];
    if (typeof value !== 'string' || value.length === 0) {
      return { success: false, error: `${field} is required and must be a non-empty string` };
    }
  }

  // Validate answers object
  const answers = obj.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { success: false, error: 'answers object is required' };
  }

  // Validate all answer values are strings
  for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return { success: false, error: `answers[${key}] must be a string` };
    }
  }

  return {
    success: true,
    data: {
      featureId: obj.featureId as string,
      projectPath: obj.projectPath as string,
      requestId: obj.requestId as string,
      answers: answers as Record<string, string>,
    },
  };
}

export function createClarificationResponseHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body with type-safe validation
      const validation = validateRequestBody(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: validation.error,
        });
        return;
      }

      const { featureId, projectPath, requestId, answers } = validation.data;

      logger.info(
        `[AutoMode] Clarification response received for feature ${featureId}, requestId=${requestId}`
      );

      // Resolve the pending clarification
      const result = await autoModeService.resolveClarification(
        featureId,
        requestId,
        answers,
        projectPath
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Clarification response submitted - agent will continue',
      });
    } catch (error) {
      logError(error, 'Clarification response failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
