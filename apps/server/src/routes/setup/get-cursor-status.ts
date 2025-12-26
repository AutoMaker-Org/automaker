/**
 * Business logic for getting Cursor Agent CLI status
 * Uses CursorProvider as the single source of truth for CLI detection
 */

import { CursorProvider } from '../../providers/cursor-provider.js';

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
  const provider = new CursorProvider({});
  const installStatus = await provider.detectInstallation();
  // Determine auth method
  let authMethod = 'none';
  if (installStatus.authenticated) {
    authMethod = process.env.CURSOR_API_KEY ? 'api_key_env' : 'oauth';
  }
  return {
    status: installStatus.installed ? 'installed' : 'not_installed',
    installed: installStatus.installed,
    method: installStatus.method || 'none',
    version: installStatus.version || '',
    path: installStatus.path || '',
    auth: {
      authenticated: installStatus.authenticated || false,
      method: authMethod,
      hasApiKey: installStatus.hasApiKey || false,
    },
  };
}
