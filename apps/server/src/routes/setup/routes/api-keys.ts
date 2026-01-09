/**
 * GET /api-keys endpoint - Get API keys status
 */

import type { Request, Response } from 'express';
import { getApiKey, getErrorMessage, logError } from '../common.js';

export function createApiKeysHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        hasAnthropicKey: !!getApiKey('anthropic') || !!process.env.ANTHROPIC_API_KEY,
        hasOpenaiKey: !!getApiKey('openai') || !!process.env.OPENAI_API_KEY,
      });
    } catch (error) {
      logError(error, 'Get API keys failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
