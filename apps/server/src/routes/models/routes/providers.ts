/**
 * GET /providers endpoint - Check provider status
 */

import type { Request, Response } from 'express';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getErrorMessage, logError } from '../common.js';

export function createProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get installation status from all providers
      const statuses = await ProviderFactory.checkAllProviders();

      const providers: Record<string, any> = {
        anthropic: {
          available: statuses.claude?.installed || false,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        },
        cursor: {
          available: statuses.cursor?.installed || false,
          version: statuses.cursor?.version,
          path: statuses.cursor?.path,
          method: statuses.cursor?.method,
          authenticated: statuses.cursor?.authenticated,
        },
      };

      res.json({ success: true, providers });
    } catch (error) {
      logError(error, 'Get providers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
