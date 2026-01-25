/**
 * GET /api/settings/bedrock-status
 * Check if AWS Bedrock is configured
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage } from '@automaker/utils';

/**
 * GET /api/settings/bedrock-status
 * Check if AWS Bedrock is configured
 */
export function createGetBedrockStatusHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const credentials = await settingsService.getCredentials();
      const config = credentials.awsBedrock;

      const isConfigured = !!(config?.enabled && config.accessKeyId && config.region);

      res.json({
        success: true,
        bedrockConfigured: isConfigured,
        bedrockEnabled: config?.enabled || false,
        region: isConfigured ? config?.region : null,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
