/**
 * Business logic for getting cursor-agent CLI status
 *
 * Checks for `cursor-agent` CLI (headless mode for automation)
 * @see https://cursor.com/docs/cli/headless
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { getApiKey } from './common.js';

const execAsync = promisify(exec);

export interface CursorStatus {
  status: 'installed' | 'not_installed';
  installed: boolean;
  method: string;
  version: string;
  path: string;
  auth: {
    authenticated: boolean;
    method: string;
    hasApiKey: boolean;
    hasStoredApiKey: boolean;
    hasEnvApiKey: boolean;
    apiKeyValid: boolean;
  };
}

export async function getCursorStatus(): Promise<CursorStatus> {
  let installed = false;
  let version = '';
  let cliPath = '';
  let method = 'none';

  const isWindows = process.platform === 'win32';

  // Try to find cursor-agent CLI using platform-specific command
  try {
    const findCommand = isWindows ? 'where cursor-agent' : 'which cursor-agent';
    const { stdout } = await execAsync(findCommand);
    cliPath = stdout.trim().split(/\r?\n/)[0];
    installed = true;
    method = 'path';

    // Get version
    try {
      const { stdout: versionOut } = await execAsync('cursor-agent --version');
      version = versionOut.trim().split('\n')[0]; // First line is version
    } catch {
      // Version command might not be available
    }
  } catch {
    // Not in PATH, try common locations based on platform
    const commonPaths = isWindows
      ? (() => {
          const localAppData =
            process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
          return [
            path.join(localAppData, 'Programs', 'cursor-agent', 'cursor-agent.exe'),
            path.join(os.homedir(), '.local', 'bin', 'cursor-agent.exe'),
          ];
        })()
      : ['/usr/local/bin/cursor-agent', path.join(os.homedir(), '.local', 'bin', 'cursor-agent')];

    for (const p of commonPaths) {
      try {
        await fs.access(p);
        cliPath = p;
        installed = true;
        method = 'local';

        // Get version from this path
        try {
          const { stdout: versionOut } = await execAsync(`"${p}" --version`);
          version = versionOut.trim().split('\n')[0];
        } catch {
          // Version command might not be available
        }
        break;
      } catch {
        // Not found at this path
      }
    }
  }

  // Check authentication
  const auth = {
    authenticated: false,
    method: 'none' as string,
    hasApiKey: false,
    hasStoredApiKey: !!getApiKey('cursor'),
    hasEnvApiKey: !!process.env.CURSOR_API_KEY,
    apiKeyValid: false,
  };

  // Environment variable has highest priority
  if (auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.hasApiKey = true;
    auth.apiKeyValid = true;
    auth.method = 'api_key_env';
  }

  // Stored API key (from settings)
  if (!auth.authenticated && auth.hasStoredApiKey) {
    auth.authenticated = true;
    auth.hasApiKey = true;
    auth.apiKeyValid = true;
    auth.method = 'api_key';
  }

  // Check for Cursor config directory (might have auth info)
  const cursorConfigDir = path.join(os.homedir(), '.cursor');
  if (!auth.authenticated) {
    try {
      // Check for auth.json or similar config files
      const authFilePath = path.join(cursorConfigDir, 'auth.json');
      await fs.access(authFilePath);

      const authContent = await fs.readFile(authFilePath, 'utf-8');
      const authData = JSON.parse(authContent);

      if (authData.api_key || authData.accessToken || authData.token) {
        auth.authenticated = true;
        auth.hasApiKey = true;
        auth.method = 'config_file';
      }
    } catch {
      // Auth file doesn't exist or is invalid
    }
  }

  return {
    status: installed ? 'installed' : 'not_installed',
    installed,
    method,
    version,
    path: cliPath,
    auth,
  };
}
