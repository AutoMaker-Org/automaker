/**
 * POST /install-cursor endpoint - Install Cursor CLI
 */

import type { Request, Response } from 'express';
import { spawn } from 'child_process';
import { getErrorMessage, logError } from '../common.js';

export function createInstallCursorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const isWindows = process.platform === 'win32';

      // Install command from Cursor docs
      const installCommand = isWindows
        ? 'powershell -Command "iwr https://cursor.com/install -UseBasicParsing | iex"'
        : 'curl https://cursor.com/install -fsS | bash';

      const shell = isWindows ? 'powershell.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['-Command', installCommand] : ['-c', installCommand];

      const child = spawn(shell, shellArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';
      const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB limit

      child.stdout?.on('data', (data) => {
        if (output.length >= MAX_OUTPUT_SIZE) {
          return;
        }
        const chunk = data.toString();
        output += chunk.slice(0, MAX_OUTPUT_SIZE - output.length);
      });

      child.stderr?.on('data', (data) => {
        if (errorOutput.length >= MAX_OUTPUT_SIZE) {
          return;
        }
        const chunk = data.toString();
        errorOutput += chunk.slice(0, MAX_OUTPUT_SIZE - errorOutput.length);
      });

      child.on('close', (code) => {
        if (code === 0) {
          res.json({
            success: true,
            message: 'Cursor CLI installed successfully',
            output,
          });
        } else {
          res.status(500).json({
            success: false,
            error: `Installation failed with code ${code}`,
            output: errorOutput || output,
          });
        }
      });

      child.on('error', (error) => {
        logError(error, 'Cursor CLI installation failed');
        res.status(500).json({
          success: false,
          error: getErrorMessage(error),
        });
      });
    } catch (error) {
      logError(error, 'Install Cursor CLI failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
