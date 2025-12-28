/**
 * POST /delete-api-key endpoint - Delete a stored API key
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import path from 'path';
import fs from 'fs/promises';
import { setApiKey, getProviderEnvKey } from '../common.js';

const logger = createLogger('Setup');

/**
 * Remove an API key from the .env file
 */
async function removeApiKeyFromEnv(key: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  try {
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // .env file doesn't exist, nothing to delete
      return;
    }

    // Parse existing env content and remove the key
    const lines = envContent.split('\n');
    const keyRegex = new RegExp(`^${key}=`);
    const newLines = lines.filter((line) => !keyRegex.test(line));

    // Remove empty lines at the end
    while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
      newLines.pop();
    }

    await fs.writeFile(envPath, newLines.join('\n') + (newLines.length > 0 ? '\n' : ''));
    logger.info(`[Setup] Removed ${key} from .env file`);
  } catch (error) {
    logger.error(`[Setup] Failed to remove ${key} from .env:`, error);
    throw error;
  }
}

export function createDeleteApiKeyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider } = req.body as { provider: string };

      if (!provider) {
        res.status(400).json({
          success: false,
          error: 'Provider is required',
        });
        return;
      }

      logger.info(`[Setup] Deleting API key for provider: ${provider}`);

      // Get env key from provider registry
      const envKey = getProviderEnvKey(provider);
      if (!envKey) {
        res.status(400).json({
          success: false,
          error: `Unknown provider: ${provider}. Supported providers: anthropic, zai.`,
        });
        return;
      }

      // Clear from in-memory storage
      setApiKey(provider, '');

      // Remove from environment
      delete process.env[envKey];

      // Remove from .env file
      await removeApiKeyFromEnv(envKey);

      logger.info(`[Setup] Successfully deleted API key for ${provider}`);

      res.json({
        success: true,
        message: `API key for ${provider} has been deleted`,
      });
    } catch (error) {
      logger.error('[Setup] Delete API key error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete API key',
      });
    }
  };
}
