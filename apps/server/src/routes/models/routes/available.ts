/**
 * GET /available endpoint - Get available models
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { ModelDefinition } from '../../../providers/types.js';

export function createAvailableHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get models from all registered providers (single source of truth)
      const models: ModelDefinition[] = ProviderFactory.getAllAvailableModels();

      res.json({ success: true, models });
    } catch (error) {
      logError(error, 'Get available models failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
