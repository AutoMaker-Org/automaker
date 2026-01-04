/**
 * GET /providers endpoint - Check provider status
 */

import type { Request, Response } from 'express';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getErrorMessage, logError } from '../common.js';

const PROVIDER_ANTHROPIC = 'anthropic';
const PROVIDER_OPENAI = 'openai';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

export function createProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get installation status from all providers
      const statuses = await ProviderFactory.checkAllProviders();

      const providers: Record<string, any> = {
        [PROVIDER_ANTHROPIC]: {
          available: statuses.claude?.installed || false,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
          authenticated: statuses.claude?.authenticated || false,
        },
        [PROVIDER_OPENAI]: {
          available: statuses.codex?.installed || false,
          hasApiKey: !!process.env[OPENAI_API_KEY_ENV],
          authenticated: statuses.codex?.authenticated || false,
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
