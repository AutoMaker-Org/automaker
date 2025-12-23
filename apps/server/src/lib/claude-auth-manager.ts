/**
 * Claude Authentication Manager
 *
 * Manages dual authentication modes:
 * 1. API Key mode - Traditional Anthropic API key
 * 2. CLI Subscription mode - Uses Claude Pro/Max subscription via CLI
 *
 * Provides intelligent fallback and auto-detection.
 */

import { createLogger } from '@automaker/utils';
import { detectClaudeCLI, checkCLIAuth, type CLIDetectionResult } from './claude-cli.js';
import type { ClaudeAuthMethod, ClaudeAuthStatus, ClaudeAuthConfig } from '../types/auth-types.js';

const logger = createLogger('ClaudeAuth');

/**
 * In-memory cache of authentication status
 */
let cachedAuthStatus: ClaudeAuthStatus | null = null;
let lastCheckTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Current authentication configuration
 */
let currentAuthConfig: ClaudeAuthConfig = {
  method: 'auto',
};

/**
 * Set the authentication configuration
 */
export function setAuthConfig(config: Partial<ClaudeAuthConfig>): void {
  currentAuthConfig = {
    ...currentAuthConfig,
    ...config,
  };
  logger.info('[Auth] Configuration updated:', currentAuthConfig.method);
  // Clear cache when config changes
  cachedAuthStatus = null;
}

/**
 * Get the current authentication configuration
 */
export function getAuthConfig(): ClaudeAuthConfig {
  return { ...currentAuthConfig };
}

/**
 * Check if API key authentication is available
 */
function checkApiKeyAuth(): { configured: boolean; valid?: boolean } {
  const apiKey = currentAuthConfig.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { configured: false };
  }

  // Basic validation - API keys should start with 'sk-ant-'
  const isValid = apiKey.startsWith('sk-ant-');

  return {
    configured: true,
    valid: isValid,
  };
}

/**
 * Check CLI authentication status
 */
async function checkCLIAuthStatus(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version?: string;
  path?: string;
}> {
  const detection = await detectClaudeCLI();

  if (!detection.installed) {
    return {
      installed: false,
      authenticated: false,
    };
  }

  // Pass detection result to avoid redundant CLI detection
  const authStatus = await checkCLIAuth(detection);

  return {
    installed: true,
    authenticated: authStatus.authenticated,
    version: detection.version,
    path: detection.path,
  };
}

/**
 * Get comprehensive authentication status
 *
 * This checks both API key and CLI authentication and determines
 * which method should be used based on the current configuration.
 */
export async function getAuthStatus(forceRefresh = false): Promise<ClaudeAuthStatus> {
  // Return cached status if available and not expired
  if (!forceRefresh && cachedAuthStatus && Date.now() - lastCheckTime < CACHE_TTL) {
    return cachedAuthStatus;
  }

  logger.info('[Auth] Checking authentication status...');

  const apiKeyStatus = checkApiKeyAuth();
  const cliStatus = await checkCLIAuthStatus();

  const status: ClaudeAuthStatus = {
    authenticated: false,
    apiKey: apiKeyStatus,
    cli: cliStatus,
  };

  // Determine authentication based on configured method
  const method = currentAuthConfig.method;

  if (method === 'api_key') {
    // API key mode only
    if (apiKeyStatus.configured && apiKeyStatus.valid) {
      status.authenticated = true;
      status.method = 'api_key';
      logger.info('[Auth] Using API key authentication');
    } else {
      status.error = 'API key not configured or invalid';
      logger.warn('[Auth] API key authentication not available');
    }
  } else if (method === 'cli') {
    // CLI mode only
    if (cliStatus.installed && cliStatus.authenticated) {
      status.authenticated = true;
      status.method = 'cli';
      logger.info('[Auth] Using CLI authentication');
    } else if (!cliStatus.installed) {
      status.error = 'Claude CLI not installed. Install from claude.ai/download';
    } else {
      status.error = 'Not authenticated. Run "claude login" to authenticate.';
    }
  } else if (method === 'auto') {
    // Auto mode - prefer CLI, fallback to API key
    if (cliStatus.installed && cliStatus.authenticated) {
      status.authenticated = true;
      status.method = 'cli';
      logger.info('[Auth] Using CLI authentication (auto mode)');
    } else if (apiKeyStatus.configured && apiKeyStatus.valid) {
      status.authenticated = true;
      status.method = 'api_key';
      logger.info('[Auth] Using API key authentication (auto mode, CLI not available)');
    } else {
      status.error =
        'No authentication available. Either set ANTHROPIC_API_KEY or run "claude login".';
      logger.warn('[Auth] No authentication method available');
    }
  }

  // Cache the result
  cachedAuthStatus = status;
  lastCheckTime = Date.now();

  return status;
}

/**
 * Verify that the current authentication works by making a test query
 *
 * This is more thorough than just checking configuration - it actually
 * tries to use the authentication to ensure it works.
 *
 * @param method - Optional specific method to verify. If not provided, uses current config.
 */
export async function verifyAuth(method?: ClaudeAuthMethod): Promise<ClaudeAuthStatus> {
  const targetMethod = method || currentAuthConfig.method;

  logger.info(`[Auth] Verifying authentication with method: ${targetMethod}`);

  // Get fresh status with force refresh
  const status = await getAuthStatus(true);

  // If a specific method was requested, verify only that method
  if (method) {
    if (method === 'api_key') {
      const isApiKeyValid = !!status.apiKey?.configured && !!status.apiKey?.valid;
      return {
        authenticated: isApiKeyValid,
        method: 'api_key',
        apiKey: status.apiKey,
        cli: status.cli,
        error: isApiKeyValid ? undefined : 'API key not configured or invalid',
      };
    } else if (method === 'cli') {
      const isCLIValid = !!status.cli?.installed && !!status.cli?.authenticated;
      return {
        authenticated: isCLIValid,
        method: 'cli',
        apiKey: status.apiKey,
        cli: status.cli,
        error: isCLIValid
          ? undefined
          : status.cli?.installed
            ? 'Not authenticated. Run "claude login" to authenticate.'
            : 'Claude CLI not installed',
      };
    }
  }

  // For 'auto' or no method specified, return full status
  if (!status.authenticated) {
    logger.warn('[Auth] Verification failed - not authenticated');
  } else {
    logger.info(`[Auth] Verification successful - using ${status.method}`);
  }

  return status;
}

/**
 * Clear the authentication cache
 */
export function clearAuthCache(): void {
  cachedAuthStatus = null;
  lastCheckTime = 0;
  logger.info('[Auth] Cache cleared');
}

/**
 * Check if a specific authentication method is available
 */
export async function isAuthMethodAvailable(method: ClaudeAuthMethod): Promise<boolean> {
  const status = await getAuthStatus();

  if (method === 'api_key') {
    return !!status.apiKey?.configured && !!status.apiKey?.valid;
  } else if (method === 'cli') {
    return !!status.cli?.installed && !!status.cli?.authenticated;
  } else if (method === 'auto') {
    return status.authenticated;
  }

  return false;
}

/**
 * Get the recommended authentication method based on current setup
 */
export async function getRecommendedAuthMethod(): Promise<ClaudeAuthMethod> {
  const status = await getAuthStatus();

  // Prefer CLI if available (uses subscription, no API billing)
  if (status.cli?.installed && status.cli?.authenticated) {
    return 'cli';
  }

  // Fallback to API key if configured
  if (status.apiKey?.configured && status.apiKey?.valid) {
    return 'api_key';
  }

  // Default to auto mode
  return 'auto';
}
