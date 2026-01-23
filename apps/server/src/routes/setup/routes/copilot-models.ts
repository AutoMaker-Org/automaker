/**
 * Copilot Dynamic Models API Routes
 *
 * Provides endpoints for:
 * - GET /api/setup/copilot/models - Get available models (cached or refreshed)
 * - POST /api/setup/copilot/models/refresh - Force refresh models from CLI
 */

import type { Request, Response } from 'express';
import { CopilotProvider } from '../../../providers/copilot-provider.js';
import { getErrorMessage, logError } from '../common.js';
import type { ModelDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotModelsRoute');

// Singleton provider instance for caching
let providerInstance: CopilotProvider | null = null;

function getProvider(): CopilotProvider {
  if (!providerInstance) {
    providerInstance = new CopilotProvider();
  }
  return providerInstance;
}

/**
 * Response type for models endpoint
 */
interface ModelsResponse {
  success: boolean;
  models?: ModelDefinition[];
  count?: number;
  cached?: boolean;
  error?: string;
}

/**
 * Creates handler for GET /api/setup/copilot/models
 *
 * Returns currently available models (from cache if available).
 * Query params:
 * - refresh=true: Force refresh from CLI before returning
 *
 * Note: If cache is empty, this will trigger a refresh to get dynamic models.
 */
export function createGetCopilotModelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = getProvider();
      const forceRefresh = req.query.refresh === 'true';

      let models: ModelDefinition[];
      let cached = true;

      if (forceRefresh) {
        models = await provider.refreshModels();
        cached = false;
      } else {
        // Check if we have cached models
        if (!provider.hasCachedModels()) {
          models = await provider.refreshModels();
          cached = false;
        } else {
          models = provider.getAvailableModels();
        }
      }

      const response: ModelsResponse = {
        success: true,
        models,
        count: models.length,
        cached,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Get Copilot models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

/**
 * Creates handler for POST /api/setup/copilot/models/refresh
 *
 * Forces a refresh of models from the Copilot CLI.
 */
export function createRefreshCopilotModelsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getProvider();
      const models = await provider.refreshModels();

      const response: ModelsResponse = {
        success: true,
        models,
        count: models.length,
        cached: false,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Refresh Copilot models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

/**
 * Creates handler for POST /api/setup/copilot/cache/clear
 *
 * Clears the model cache, forcing a fresh fetch on next access.
 */
export function createClearCopilotCacheHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getProvider();
      provider.clearModelCache();

      res.json({
        success: true,
        message: 'Copilot model cache cleared',
      });
    } catch (error) {
      logError(error, 'Clear Copilot cache failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
