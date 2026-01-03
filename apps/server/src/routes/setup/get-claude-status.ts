/**
 * Business logic for getting Claude CLI status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getClaudeCliPaths, getClaudeAuthIndicators, systemPathAccess } from '@automaker/platform';
import { getApiKey } from './common.js';

const execAsync = promisify(exec);

export async function getClaudeStatus() {
  let installed = false;
  let version = '';
  let cliPath = '';
  let method = 'none';

  const isWindows = process.platform === 'win32';

  // Try to find Claude CLI using platform-specific command
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const findCommand = isWindows ? 'where claude' : 'which claude';
    const { stdout } = await execAsync(findCommand);
    // 'where' on Windows can return multiple paths - take the first one
    cliPath = stdout.trim().split(/\r?\n/)[0];
    installed = true;
    method = 'path';

    // Get version
    try {
      const { stdout: versionOut } = await execAsync('claude --version');
      version = versionOut.trim();
    } catch {
      // Version command might not be available
    }
  } catch {
    // Not in PATH, try common locations from centralized system paths
    const commonPaths = getClaudeCliPaths();

    for (const p of commonPaths) {
      try {
        if (await systemPathAccess(p)) {
          cliPath = p;
          installed = true;
          method = 'local';

          // Get version from this path
          try {
            const { stdout: versionOut } = await execAsync(`"${p}" --version`);
            version = versionOut.trim();
          } catch {
            // Version command might not be available
          }
          break;
        }
      } catch {
        // Not found at this path
      }
    }
  }

  // Check authentication - detect all possible auth methods
  // Note: apiKeys.anthropic_oauth_token stores OAuth tokens from subscription auth
  //       apiKeys.anthropic stores direct API keys for pay-per-use
  const auth = {
    authenticated: false,
    method: 'none' as string,
    hasCredentialsFile: false,
    hasToken: false,
    hasStoredOAuthToken: !!getApiKey('anthropic_oauth_token'),
    hasStoredApiKey: !!getApiKey('anthropic'),
    hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY,
    // Additional fields for detailed status
    oauthTokenValid: false,
    apiKeyValid: false,
    hasCliAuth: false,
    hasRecentActivity: false,
  };

  // Use centralized system paths to check Claude authentication indicators
  const indicators = await getClaudeAuthIndicators();

  // Check for recent activity (indicates working authentication)
  if (indicators.hasStatsCacheWithActivity) {
    auth.hasRecentActivity = true;
    auth.hasCliAuth = true;
    auth.authenticated = true;
    auth.method = 'cli_authenticated';
  }

  // Check for settings + sessions (indicates CLI is set up)
  if (!auth.hasCliAuth && indicators.hasSettingsFile && indicators.hasProjectsSessions) {
    auth.hasCliAuth = true;
    auth.authenticated = true;
    auth.method = 'cli_authenticated';
  }

  // Check credentials file
  if (indicators.hasCredentialsFile && indicators.credentials) {
    auth.hasCredentialsFile = true;
    if (indicators.credentials.hasOAuthToken) {
      auth.hasStoredOAuthToken = true;
      auth.oauthTokenValid = true;
      auth.authenticated = true;
      auth.method = 'oauth_token';
    } else if (indicators.credentials.hasApiKey) {
      auth.apiKeyValid = true;
      auth.authenticated = true;
      auth.method = 'api_key';
    }
  }

  // Environment variables override stored credentials (higher priority)
  if (auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
    auth.method = 'api_key_env';
  }

  // In-memory stored OAuth token (from setup wizard - subscription auth)
  if (!auth.authenticated && getApiKey('anthropic_oauth_token')) {
    auth.authenticated = true;
    auth.oauthTokenValid = true;
    auth.method = 'oauth_token';
  }

  // In-memory stored API key (from settings UI - pay-per-use)
  if (!auth.authenticated && getApiKey('anthropic')) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
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
