/**
 * OpenCode Dynamic Models API Routes
 *
 * Provides endpoints for:
 * - GET /api/setup/opencode/models - Get available models (cached or refreshed)
 * - POST /api/setup/opencode/models/refresh - Force refresh models from CLI
 * - GET /api/setup/opencode/providers - Get authenticated providers
 */

import type { Request, Response } from 'express';
import {
  OpencodeProvider,
  type OpenCodeProviderInfo,
} from '../../../providers/opencode-provider.js';
import { getErrorMessage, logError } from '../common.js';
import type { ModelDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('OpenCodeModelsRoute');

// Singleton provider instance for caching
let providerInstance: OpencodeProvider | null = null;

function getProvider(): OpencodeProvider {
  if (!providerInstance) {
    providerInstance = new OpencodeProvider();
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
 * Response type for providers endpoint
 */
interface ProvidersResponse {
  success: boolean;
  providers?: OpenCodeProviderInfo[];
  authenticated?: OpenCodeProviderInfo[];
  error?: string;
}

/**
 * Creates handler for GET /api/setup/opencode/models
 *
 * Returns currently available models (from cache if available).
 * Query params:
 * - refresh=true: Force refresh from CLI before returning
 *
 * Note: If cache is empty, this will trigger a refresh to get dynamic models.
 */
export function createGetOpencodeModelsHandler() {
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
        const cachedModels = provider.getAvailableModels();

        // If cache only has default models (provider.hasCachedModels() would be false),
        // trigger a refresh to get dynamic models
        if (!provider.hasCachedModels()) {
          models = await provider.refreshModels();
          cached = false;
        } else {
          models = cachedModels;
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
      logError(error, 'Get OpenCode models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

/**
 * Creates handler for POST /api/setup/opencode/models/refresh
 *
 * Forces a refresh of models from the OpenCode CLI.
 */
export function createRefreshOpencodeModelsHandler() {
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
      logError(error, 'Refresh OpenCode models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ModelsResponse);
    }
  };
}

/**
 * Creates handler for GET /api/setup/opencode/providers
 *
 * Returns authenticated providers from OpenCode CLI.
 * This calls `opencode auth list` to get provider status.
 */
export function createGetOpencodeProvidersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getProvider();
      const providers = await provider.fetchAuthenticatedProviders();

      // Filter to only authenticated providers
      const authenticated = providers.filter((p) => p.authenticated);

      const response: ProvidersResponse = {
        success: true,
        providers,
        authenticated,
      };

      res.json(response);
    } catch (error) {
      logError(error, 'Get OpenCode providers failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ProvidersResponse);
    }
  };
}

/**
 * Creates handler for POST /api/setup/opencode/cache/clear
 *
 * Clears the model cache, forcing a fresh fetch on next access.
 */
export function createClearOpencodeCacheHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getProvider();
      provider.clearModelCache();

      res.json({
        success: true,
        message: 'OpenCode model cache cleared',
      });
    } catch (error) {
      logError(error, 'Clear OpenCode cache failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
