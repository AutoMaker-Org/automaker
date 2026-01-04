/**
 * Business logic for getting OpenCode CLI status
 *
 * Checks for opencode CLI and authentication state.
 */

import { OpenCodeProvider } from '../../providers/opencode-provider.js';
import { getApiKey } from './common.js';

export interface OpenCodeStatus {
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

export async function getOpenCodeStatus(): Promise<OpenCodeStatus> {
  const provider = new OpenCodeProvider();
  const installStatus = await provider.detectInstallation();

  const auth = {
    authenticated: false,
    method: 'none',
    hasApiKey: false,
    hasStoredApiKey: !!getApiKey('opencode'),
    hasEnvApiKey: !!process.env.OPENCODE_API_KEY,
    apiKeyValid: false,
  };

  if (auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.hasApiKey = true;
    auth.method = 'api_key_env';
  }

  if (!auth.authenticated && auth.hasStoredApiKey) {
    auth.authenticated = true;
    auth.hasApiKey = true;
    auth.method = 'api_key';
  }

  if (!auth.authenticated && installStatus.authenticated) {
    auth.authenticated = true;
    auth.hasApiKey = installStatus.hasApiKey ?? false;
    auth.method = 'cli';
  }

  return {
    status: installStatus.installed ? 'installed' : 'not_installed',
    installed: installStatus.installed,
    method: installStatus.method || 'cli',
    version: installStatus.version || '',
    path: installStatus.path || '',
    auth,
  };
}
