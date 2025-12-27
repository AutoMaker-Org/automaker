/**
 * POST /verify-coderabbit-auth endpoint - Verify CodeRabbit API key
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('VerifyCodeRabbitAuth');

export function createVerifyCodeRabbitAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[Setup] Verifying CodeRabbit API key');

      // Get the API key from request body
      const { apiKey } = req.body as { apiKey?: string };

      if (!apiKey) {
        res.json({
          success: false,
          authenticated: false,
          error: 'No API key provided',
        });
        return;
      }

      // Create an AbortController with a 30-second timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 30000);

      try {
        // Test the CodeRabbit API key by making a simple request
        const response = await fetch('https://api.coderabbit.ai/api/v1/report.generate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'AutoMaker/1.0',
            'x-coderabbitai-api-key': apiKey,
          },
          signal: abortController.signal,
          body: JSON.stringify({
            // Minimal request to test API key validity
            diff: '',
            repository: {
              url: 'https://github.com/test/test',
              branch: 'main',
            },
            rules: {
              enabled: [],
              custom: [],
              severity: 'medium',
            },
            options: {
              includeSuggestions: false,
              excludeTests: true,
              maxIssues: 1,
            },
          }),
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // API key is valid
          res.json({
            success: true,
            authenticated: true,
            message: 'CodeRabbit API key is valid',
          });
        } else if (response.status === 401) {
          // Invalid API key
          res.json({
            success: true,
            authenticated: false,
            error: 'Invalid CodeRabbit API key',
          });
        } else {
          // Other error
          const errorText = await response.text().catch(() => 'Unknown error');
          res.json({
            success: false,
            authenticated: false,
            error: `CodeRabbit API error: ${response.status} ${errorText}`,
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          res.json({
            success: true,
            authenticated: false,
            error: 'Connection timeout. Please check your network connection.',
          });
        } else {
          logger.error('CodeRabbit API verification failed:', error);
          res.json({
            success: false,
            authenticated: false,
            error: 'Failed to connect to CodeRabbit API. Please check your network connection.',
          });
        }
      }
    } catch (error) {
      logError(error, 'Verify CodeRabbit auth failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
