/**
 * GET/POST /default-provider endpoint - Get/Set default AI provider
 */

import type { Request, Response } from 'express';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetDefaultProviderHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = ProviderFactory.getDefaultProvider();
      res.json({
        success: true,
        provider,
      });
    } catch (error) {
      logError(error, 'Get default provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createSetDefaultProviderHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider } = req.body || {};

      if (!provider || !['claude', 'cursor', 'opencode', 'codex'].includes(provider)) {
        res.status(400).json({
          success: false,
          error: 'Invalid provider. Must be "claude", "cursor", "opencode", or "codex".',
        });
        return;
      }

      ProviderFactory.setDefaultProvider(provider);

      res.json({
        success: true,
        provider,
        message: `Default provider set to ${provider}`,
      });
    } catch (error) {
      logError(error, 'Set default provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
