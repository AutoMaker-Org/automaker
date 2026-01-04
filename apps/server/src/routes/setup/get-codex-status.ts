/**
 * Business logic for getting Codex CLI status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getCodexCliPaths, getCodexAuthIndicators, systemPathAccess } from '@automaker/platform';
import { getApiKey } from './common.js';

const execAsync = promisify(exec);
const CODEX_COMMAND = 'codex';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

export async function getCodexStatus() {
  let installed = false;
  let version = '';
  let cliPath = '';
  let method = 'none';

  const isWindows = process.platform === 'win32';

  try {
    const findCommand = isWindows ? `where ${CODEX_COMMAND}` : `which ${CODEX_COMMAND}`;
    const { stdout } = await execAsync(findCommand);
    cliPath = stdout.trim().split(/\r?\n/)[0];
    installed = true;
    method = 'path';

    try {
      const { stdout: versionOut } = await execAsync(`${CODEX_COMMAND} --version`);
      version = versionOut.trim();
    } catch {
      version = '';
    }
  } catch {
    const commonPaths = getCodexCliPaths();

    for (const p of commonPaths) {
      try {
        if (await systemPathAccess(p)) {
          cliPath = p;
          installed = true;
          method = 'local';

          try {
            const { stdout: versionOut } = await execAsync(`"${p}" --version`);
            version = versionOut.trim();
          } catch {
            version = '';
          }
          break;
        }
      } catch {
        // Not found at this path
      }
    }
  }

  const auth = {
    authenticated: false,
    method: 'none' as string,
    hasAuthFile: false,
    hasOAuthToken: false,
    hasApiKey: false,
    hasStoredApiKey: !!getApiKey('openai'),
    hasEnvApiKey: !!process.env[OPENAI_API_KEY_ENV],
  };

  const indicators = await getCodexAuthIndicators();
  auth.hasAuthFile = indicators.hasAuthFile;
  auth.hasOAuthToken = indicators.hasOAuthToken;
  auth.hasApiKey = indicators.hasApiKey;

  if (auth.hasAuthFile && (auth.hasOAuthToken || auth.hasApiKey)) {
    auth.authenticated = true;
    auth.method = 'cli_authenticated';
  }

  if (!auth.authenticated && auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.method = 'api_key_env';
  }

  if (!auth.authenticated && auth.hasStoredApiKey) {
    auth.authenticated = true;
    auth.method = 'api_key';
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
