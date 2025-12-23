/**
 * POST /synopsis/verify - Verify ElevenLabs API key is valid
 *
 * Calls the ElevenLabs /v1/user endpoint to verify the API key.
 * Returns success if the key is valid, error if not.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SynopsisVerify');

// ElevenLabs API configuration
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Success response from the verify endpoint
 */
interface VerifySuccessResponse {
  success: true;
  message: string;
  tier?: string;
}

/**
 * Error response from the verify endpoint
 */
interface VerifyErrorResponse {
  success: false;
  error: string;
}

/**
 * Create the verify request handler
 */
export function createVerifyHandler(): (req: Request, res: Response) => Promise<void> {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get ElevenLabs API key from credentials
      const settingsService = SettingsService.getInstance();
      const credentials = await settingsService.getCredentials();
      const apiKey = credentials?.apiKeys?.elevenLabs;

      if (!apiKey) {
        logger.warn('ElevenLabs API key not configured');
        const response: VerifyErrorResponse = {
          success: false,
          error: 'ElevenLabs API key not configured. Please add your API key first.',
        };
        res.status(400).json(response);
        return;
      }

      logger.info('Verifying ElevenLabs API key...');

      // Call ElevenLabs /v1/user endpoint to verify the key
      const elevenLabsResponse = await fetch(`${ELEVENLABS_API_URL}/user`, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      });

      if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text();
        logger.error(`ElevenLabs API verification failed: ${elevenLabsResponse.status} - ${errorText}`);

        let errorMessage = 'Invalid API key';
        if (elevenLabsResponse.status === 401) {
          errorMessage = 'Invalid ElevenLabs API key. Please check your API key.';
        } else if (elevenLabsResponse.status === 403) {
          errorMessage = 'API key does not have permission to access this resource.';
        } else if (elevenLabsResponse.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        }

        const response: VerifyErrorResponse = {
          success: false,
          error: errorMessage,
        };
        res.status(elevenLabsResponse.status).json(response);
        return;
      }

      // Parse the user info response
      const userInfo = await elevenLabsResponse.json();
      const tier = userInfo?.subscription?.tier || 'unknown';

      logger.info(`ElevenLabs API key verified successfully. Tier: ${tier}`);

      const response: VerifySuccessResponse = {
        success: true,
        message: `Connection successful! Subscription tier: ${tier}`,
        tier,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('ElevenLabs verification failed:', errorMessage);

      const response: VerifyErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
