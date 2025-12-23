/**
 * Claude CLI Integration - Detection, validation, and process spawning
 *
 * This module handles:
 * 1. Detecting if the Claude CLI is installed
 * 2. Validating CLI authentication status
 * 3. Spawning CLI processes for query execution
 */

import { spawn, type ChildProcess } from 'child_process';
import { createLogger } from '@automaker/utils';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);
const logger = createLogger('ClaudeCLI');

/**
 * CLI detection result
 */
export interface CLIDetectionResult {
  installed: boolean;
  path?: string;
  version?: string;
  authenticated?: boolean;
  error?: string;
}

/**
 * CLI authentication status
 */
export interface CLIAuthStatus {
  authenticated: boolean;
  email?: string;
  plan?: 'free' | 'pro' | 'max';
  error?: string;
}

/**
 * Detect if Claude CLI is installed and get its path
 */
export async function detectClaudeCLI(): Promise<CLIDetectionResult> {
  try {
    // Try to find the claude CLI in PATH
    const { stdout, stderr } = await execPromise('which claude', {
      timeout: 5000,
    });

    if (stderr && !stdout) {
      logger.warn('[CLI] Claude CLI not found in PATH');
      return {
        installed: false,
        error: 'Claude CLI not found in PATH',
      };
    }

    const cliPath = stdout.trim();

    if (!cliPath) {
      return {
        installed: false,
        error: 'Claude CLI not found',
      };
    }

    // Get version
    try {
      const { stdout: versionOutput } = await execPromise('claude --version', {
        timeout: 5000,
      });
      const version = versionOutput.trim();

      logger.info(`[CLI] Detected Claude CLI at ${cliPath}, version: ${version}`);

      return {
        installed: true,
        path: cliPath,
        version,
      };
    } catch (versionError) {
      logger.warn('[CLI] Found Claude CLI but could not get version:', versionError);
      return {
        installed: true,
        path: cliPath,
        version: 'unknown',
      };
    }
  } catch (error) {
    logger.warn('[CLI] Error detecting Claude CLI:', error);
    return {
      installed: false,
      error: error instanceof Error ? error.message : 'Detection failed',
    };
  }
}

/**
 * Check Claude CLI authentication status
 *
 * This attempts to verify if the user is logged into the Claude CLI.
 * We do this by running a minimal test query and checking for auth errors.
 *
 * @param detectionResult - Optional pre-computed detection result to avoid redundant checks
 */
export async function checkCLIAuth(detectionResult?: CLIDetectionResult): Promise<CLIAuthStatus> {
  try {
    const detection = detectionResult || (await detectClaudeCLI());

    if (!detection.installed) {
      return {
        authenticated: false,
        error: 'Claude CLI not installed',
      };
    }

    // Spawn a test query to verify authentication
    // We use a simple prompt that should return quickly
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          authenticated: false,
          error: 'Authentication check timed out',
        });
      }, 15000);

      const child = spawn('claude', ['chat', '--no-color'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure we're not using API key
          ANTHROPIC_API_KEY: undefined,
        },
      });

      let stdout = '';
      let stderr = '';
      let authError = false;

      // Send a minimal test prompt
      child.stdin.write('Reply with just "ok"\n');
      child.stdin.end();

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;

        // Check for auth error patterns
        const authErrorPatterns = [
          'not authenticated',
          'please login',
          'run /login',
          'authentication required',
          'invalid session',
          'session expired',
        ];

        const lowerText = text.toLowerCase();
        if (authErrorPatterns.some((pattern) => lowerText.includes(pattern))) {
          authError = true;
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (authError) {
          logger.warn('[CLI] Authentication check failed - not logged in');
          resolve({
            authenticated: false,
            error: 'Not authenticated. Run "claude login" to authenticate.',
          });
          return;
        }

        // If we got output and no auth error, consider it authenticated
        if (stdout.length > 0 || code === 0) {
          logger.info('[CLI] Successfully verified CLI authentication');
          resolve({
            authenticated: true,
          });
        } else {
          logger.warn('[CLI] Authentication check inconclusive');
          resolve({
            authenticated: false,
            error: stderr || 'Authentication verification failed',
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('[CLI] Error spawning Claude CLI:', err);
        resolve({
          authenticated: false,
          error: err.message,
        });
      });
    });
  } catch (error) {
    logger.error('[CLI] Error checking CLI auth:', error);
    return {
      authenticated: false,
      error: error instanceof Error ? error.message : 'Auth check failed',
    };
  }
}

/**
 * Spawn a Claude CLI process for executing queries
 *
 * This creates a child process that runs the Claude CLI in chat mode.
 * The caller is responsible for:
 * - Writing prompts to stdin
 * - Reading responses from stdout
 * - Handling errors from stderr
 * - Killing the process when done
 */
export function spawnCLIProcess(): ChildProcess {
  logger.info('[CLI] Spawning Claude CLI process');

  const child = spawn('claude', ['chat', '--no-color', '--no-stream'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Ensure we're not using API key - force CLI auth
      ANTHROPIC_API_KEY: undefined,
    },
  });

  child.on('error', (err) => {
    logger.error('[CLI] Process spawn error:', err);
  });

  child.on('exit', (code, signal) => {
    logger.info(`[CLI] Process exited with code ${code}, signal ${signal}`);
  });

  return child;
}

/**
 * Execute a single query using the Claude CLI
 *
 * This is a convenience function that handles the full lifecycle:
 * - Spawns the CLI process
 * - Sends the prompt
 * - Collects the response
 * - Cleans up the process
 */
export async function executeClaudeQuery(
  prompt: string,
  options: {
    timeout?: number;
    abortController?: AbortController;
  } = {}
): Promise<{ success: boolean; response?: string; error?: string }> {
  const { timeout = 30000, abortController } = options;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        error: 'Query timed out',
      });
    }, timeout);

    // Handle abort signal
    const abortHandler = () => {
      clearTimeout(timeoutId);
      child.kill();
      resolve({
        success: false,
        error: 'Query aborted',
      });
    };

    if (abortController) {
      abortController.signal.addEventListener('abort', abortHandler);
    }

    const child = spawnCLIProcess();

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }

      if (code === 0 && stdout) {
        resolve({
          success: true,
          response: stdout.trim(),
        });
      } else {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }

      resolve({
        success: false,
        error: err.message,
      });
    });

    // Send the prompt
    if (child.stdin) {
      child.stdin.write(prompt + '\n');
      child.stdin.end();
    } else {
      clearTimeout(timeoutId);
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }
      resolve({
        success: false,
        error: 'Failed to write to CLI stdin',
      });
    }
  });
}
