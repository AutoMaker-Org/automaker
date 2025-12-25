/**
 * Business logic for getting Cursor Agent CLI status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

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
      const { stdout: versionOut } = await execAsync('cursor-agent -v');
      version = versionOut.trim();
    } catch {
      // Version command might not be available
    }
  } catch {
    // Not in PATH, try common locations based on platform
    const commonPaths = isWindows
      ? (() => {
          const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
          return [
            path.join(os.homedir(), '.local', 'bin', 'cursor-agent.exe'),
            path.join(appData, 'npm', 'cursor-agent.cmd'),
            path.join(appData, 'npm', 'cursor-agent'),
          ];
        })()
      : [
          path.join(os.homedir(), '.local', 'bin', 'cursor-agent'),
          '/usr/local/bin/cursor-agent',
          path.join(os.homedir(), '.npm-global', 'bin', 'cursor-agent'),
        ];

    for (const p of commonPaths) {
      try {
        await fs.access(p);
        cliPath = p;
        installed = true;
        method = 'local';

        // Get version from this path
        try {
          const { stdout: versionOut } = await execAsync(`"${p}" -v`);
          version = versionOut.trim();
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
  let auth = {
    authenticated: false,
    method: 'none' as string,
    hasApiKey: !!process.env.CURSOR_API_KEY,
  };

  // If installed, try to check auth status using cursor-agent status command
  if (installed) {
    try {
      const statusCommand = cliPath ? `"${cliPath}" status` : 'cursor-agent status';
      const { stdout: statusOut } = await execAsync(statusCommand);

      // Parse status output - if it doesn't contain "not logged in" or error, assume authenticated
      if (
        !statusOut.toLowerCase().includes('not logged in') &&
        !statusOut.toLowerCase().includes('error') &&
        !statusOut.toLowerCase().includes('not authenticated')
      ) {
        auth.authenticated = true;
        auth.method = 'oauth';
      }
    } catch {
      // Status check failed - might not be authenticated
    }
  }

  // Environment variable API key overrides
  if (process.env.CURSOR_API_KEY) {
    auth.authenticated = true;
    auth.hasApiKey = true;
    auth.method = 'api_key_env';
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
