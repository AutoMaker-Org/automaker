import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';

interface UseCliStatusOptions {
  cliType: 'claude' | 'codex';
  statusApi: () => Promise<any>;
  setCliStatus: (status: any) => void;
  setAuthStatus: (status: any) => void;
}

const VALID_AUTH_METHODS = {
  claude: [
    'oauth_token_env',
    'oauth_token',
    'api_key',
    'api_key_env',
    'credentials_file',
    'cli_authenticated',
    'none',
  ],
  codex: ['cli_authenticated', 'api_key', 'api_key_env', 'none'],
} as const;

// Create logger outside of the hook to avoid re-creating it on every render
const logger = createLogger('CliStatus');

export function useCliStatus({
  cliType,
  statusApi,
  setCliStatus,
  setAuthStatus,
}: UseCliStatusOptions) {
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    logger.info(`Starting status check for ${cliType}...`);
    setIsChecking(true);
    try {
      const result = await statusApi();
      logger.info(`Raw status result for ${cliType}:`, result);

      if (result.success) {
        // Handle both response formats:
        // - Claude API returns {status: 'installed' | 'not_installed'}
        // - Codex API returns {installed: boolean}
        const isInstalled =
          typeof result.installed === 'boolean' ? result.installed : result.status === 'installed';
        const cliStatus = {
          installed: isInstalled,
          path: result.path || null,
          version: result.version || null,
          method: result.method || 'none',
        };
        logger.info(`CLI Status for ${cliType}:`, cliStatus);
        setCliStatus(cliStatus);

        if (result.auth) {
          if (cliType === 'claude') {
            // Validate method is one of the expected Claude values, default to "none"
            const validMethods = VALID_AUTH_METHODS.claude;
            type ClaudeAuthMethod = (typeof validMethods)[number];
            const method: ClaudeAuthMethod = validMethods.includes(
              result.auth.method as ClaudeAuthMethod
            )
              ? (result.auth.method as ClaudeAuthMethod)
              : 'none';

            setAuthStatus({
              authenticated: result.auth.authenticated,
              method,
              hasCredentialsFile: false,
              oauthTokenValid: result.auth.hasStoredOAuthToken || result.auth.hasEnvOAuthToken,
              apiKeyValid: result.auth.hasStoredApiKey || result.auth.hasEnvApiKey,
              hasEnvOAuthToken: result.auth.hasEnvOAuthToken,
              hasEnvApiKey: result.auth.hasEnvApiKey,
            });
          } else {
            // Validate method is one of the expected Codex values, default to "none"
            const validMethods = VALID_AUTH_METHODS.codex;
            type CodexAuthMethod = (typeof validMethods)[number];
            const method: CodexAuthMethod = validMethods.includes(
              result.auth.method as CodexAuthMethod
            )
              ? (result.auth.method as CodexAuthMethod)
              : 'none';

            setAuthStatus({
              authenticated: result.auth.authenticated,
              method,
              hasAuthFile: result.auth.hasAuthFile ?? false,
              hasApiKey: result.auth.hasApiKey ?? false,
              hasEnvApiKey: result.auth.hasEnvApiKey ?? false,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to check status for ${cliType}:`, error);
    } finally {
      setIsChecking(false);
    }
  }, [cliType, statusApi, setCliStatus, setAuthStatus]);

  return { isChecking, checkStatus };
}
