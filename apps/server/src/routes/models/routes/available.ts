/**
 * GET /available endpoint - Get available models from all providers
 */

import type { Request, Response } from 'express';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getErrorMessage, logError } from '../common.js';

export function createAvailableHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get all models from all registered providers (Claude + Cursor)
      const models = ProviderFactory.getAllAvailableModels();

      res.json({ success: true, models });
    } catch (error) {
      logError(error, 'Get available models failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
