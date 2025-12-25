/**
 * POST /install-claude endpoint - Install Claude CLI
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { spawnProcess } from '@automaker/platform';
import { platform } from 'os';
import path from 'path';

export function createInstallClaudeHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const isWindows = platform() === 'win32';

      // Determine working directory (use home directory)
      const cwd =
        process.env.HOME || process.env.USERPROFILE || (isWindows ? path.resolve('C:\\') : '/tmp');

      // Choose installation command based on platform
      let command: string;
      let args: string[];

      if (isWindows) {
        // Windows: Use PowerShell to run the installation script
        command = 'powershell';
        args = ['-Command', 'irm https://claude.ai/install.ps1 | iex'];
      } else {
        // macOS/Linux: Use bash to run the installation script
        command = 'bash';
        args = ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'];
      }

      console.log(`[Install Claude] Starting installation on ${platform()} platform...`);

      // Spawn installation process with extended timeout (5 minutes)
      const result = await spawnProcess({
        command,
        args,
        cwd,
        timeout: 300000,
      }).catch((error) => {
        // Handle process spawn failures
        console.error('[Install Claude] Failed to spawn process:', error);
        throw error;
      });

      console.log(`[Install Claude] Installation exit code: ${result.exitCode}`);
      console.log(`[Install Claude] stdout: ${result.stdout}`);
      console.log(`[Install Claude] stderr: ${result.stderr}`);

      // Check for permission errors
      const stderr = result.stderr.toLowerCase();
      const hasPermissionError =
        stderr.includes('eacces') ||
        stderr.includes('permission denied') ||
        stderr.includes('access denied') ||
        stderr.includes('unauthorized');

      if (hasPermissionError) {
        res.json({
          success: false,
          error: 'Installation requires administrator privileges.',
          manualCommand: isWindows
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'sudo curl -fsSL https://claude.ai/install.sh | bash',
        });
        return;
      }

      // Check for network errors
      const hasNetworkError =
        stderr.includes('curl') ||
        stderr.includes('connection') ||
        stderr.includes('network') ||
        stderr.includes('failed to download');

      if (hasNetworkError && result.exitCode !== 0) {
        res.json({
          success: false,
          error:
            'Installation failed due to network error. Please check your connection and try again.',
          manualCommand: isWindows
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'curl -fsSL https://claude.ai/install.sh | bash',
        });
        return;
      }

      // If installation succeeded, verify the CLI is available
      if (result.exitCode === 0) {
        console.log('[Install Claude] Installation completed, verifying...');

        // Wait longer for PATH to update (increased from 2s to 3s)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Retry verification with exponential backoff (max 4 retries)
        const maxRetries = 4;

        for (let i = 0; i < maxRetries; i++) {
          try {
            const verifyResult = await spawnProcess({
              command: 'claude',
              args: ['--version'],
              cwd,
              timeout: 10000,
            });

            if (verifyResult.exitCode === 0) {
              const version = verifyResult.stdout.trim();
              console.log(`[Install Claude] Verification successful: ${version}`);
              res.json({
                success: true,
                message: 'Claude CLI installed successfully',
                version,
              });
              return; // Exit early on success
            } else {
              console.log(
                `[Install Claude] Verification attempt ${i + 1} failed with exit code: ${verifyResult.exitCode}`
              );
            }
          } catch (verifyError) {
            console.log(`[Install Claude] Verification attempt ${i + 1} error:`, verifyError);
          }

          // Exponential backoff: 3s, 5.5s, 8s, 10.5s
          if (i < maxRetries - 1) {
            const waitTime = 3000 + i * 2500;
            console.log(`[Install Claude] Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }

        // All retries failed, but installation script succeeded
        console.log('[Install Claude] CLI not found in PATH after retries');
        res.json({
          success: true,
          message:
            'Installation completed successfully. Please restart your terminal and verify with "claude --version"',
        });
      } else {
        // Installation failed with non-zero exit code
        res.status(500).json({
          success: false,
          error: `Installation failed with exit code ${result.exitCode}`,
          details: result.stderr || result.stdout,
          manualCommand: isWindows
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'curl -fsSL https://claude.ai/install.sh | bash',
        });
      }
    } catch (error) {
      logError(error, 'Install Claude CLI failed');
      const errorMessage = getErrorMessage(error);

      // Check if the error is because command wasn't found
      const isWindows = platform() === 'win32';
      if (
        errorMessage.includes('spawn') ||
        errorMessage.includes('ENOENT') ||
        errorMessage.includes('command not found')
      ) {
        const missingCommand = isWindows ? 'PowerShell' : 'bash or curl';
        res.json({
          success: false,
          error: `Required command not found: ${missingCommand}. Please install manually.`,
          manualCommand: isWindows
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'curl -fsSL https://claude.ai/install.sh | bash',
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorMessage,
          manualCommand: isWindows
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'curl -fsSL https://claude.ai/install.sh | bash',
        });
      }
    }
  };
}
