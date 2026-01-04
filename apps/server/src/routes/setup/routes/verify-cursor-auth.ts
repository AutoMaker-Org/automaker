/**
 * POST /verify-cursor-auth endpoint - Verify cursor-agent CLI authentication
 *
 * Uses `cursor-agent status` for fast auth verification instead of
 * running a full AI query which can timeout.
 */

import type { Request, Response } from 'express';
import { spawn } from 'child_process';
import { getApiKey, getErrorMessage, logError } from '../common.js';

export function createVerifyCursorAuthHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { method = 'any' } = req.body || {};

      // Determine which API key to use
      let apiKey: string | undefined;
      if (method === 'api_key' || method === 'any') {
        apiKey = getApiKey('cursor') || process.env.CURSOR_API_KEY;
      }

      if (!apiKey && method === 'api_key') {
        res.json({
          authenticated: false,
          error: 'No Cursor API key found',
        });
        return;
      }

      // Use `cursor-agent status` for fast verification
      // This checks auth without running an AI query
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      if (apiKey) {
        env.CURSOR_API_KEY = apiKey;
      }

      const process_child = spawn('cursor-agent', ['status'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';

      process_child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process_child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Set a reasonable timeout (15 seconds should be plenty for status check)
      const timeout = setTimeout(() => {
        process_child.kill('SIGTERM');
      }, 15000);

      process_child.on('close', (code) => {
        clearTimeout(timeout);

        const combinedOutput = (output + errorOutput).toLowerCase();

        // Check for success indicators
        const isLoggedIn =
          combinedOutput.includes('logged in') ||
          combinedOutput.includes('authenticated') ||
          combinedOutput.includes('✓');

        // Check for not logged in
        const isNotLoggedIn =
          combinedOutput.includes('not logged in') ||
          combinedOutput.includes('not authenticated') ||
          combinedOutput.includes('please log in') ||
          combinedOutput.includes('login required');

        // Check for errors
        const isAuthError =
          combinedOutput.includes('unauthorized') ||
          combinedOutput.includes('invalid') ||
          combinedOutput.includes('401');

        if (code === 0 && isLoggedIn && !isAuthError) {
          // Extract email if present
          const emailMatch = output.match(/logged in as\s+(\S+)/i);
          res.json({
            authenticated: true,
            method: apiKey ? 'api_key' : 'cli_authenticated',
            output: output.trim(),
            email: emailMatch ? emailMatch[1] : undefined,
          });
        } else if (isNotLoggedIn) {
          res.json({
            authenticated: false,
            error: 'Not logged in. Please run: cursor-agent login',
          });
        } else if (code === 143) {
          // SIGTERM - timeout
          res.json({
            authenticated: false,
            error: 'Verification timed out. Cursor might be starting up. Please try again.',
          });
        } else {
          res.json({
            authenticated: false,
            error: isAuthError
              ? 'Authentication failed. Please check your credentials.'
              : errorOutput.trim() || output.trim() || `Verification failed with code ${code}`,
          });
        }
      });

      process_child.on('error', (error) => {
        clearTimeout(timeout);
        logError(error, 'cursor-agent auth verification failed');
        res.json({
          authenticated: false,
          error: error.message.includes('ENOENT')
            ? 'cursor-agent CLI not found. Please install it: curl https://cursor.com/install -fsS | bash'
            : getErrorMessage(error),
        });
      });
    } catch (error) {
      logError(error, 'Verify Cursor auth failed');
      res.status(500).json({
        authenticated: false,
        error: getErrorMessage(error),
      });
    }
  };
}
