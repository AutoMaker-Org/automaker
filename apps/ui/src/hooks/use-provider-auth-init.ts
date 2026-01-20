import { useEffect, useRef, useCallback } from 'react';
import {
  useSetupStore,
  type ClaudeAuthMethod,
  type CodexAuthMethod,
  type ZaiAuthMethod,
} from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('ProviderAuthInit');

/**
 * Hook to initialize Claude, Codex, and z.ai authentication statuses on app startup.
 * This ensures that usage tracking information is available in the board header
 * without needing to visit the settings page first.
 */
export function useProviderAuthInit() {
  const {
    setClaudeAuthStatus,
    setCodexAuthStatus,
    setZaiAuthStatus,
    claudeAuthStatus,
    codexAuthStatus,
    zaiAuthStatus,
  } = useSetupStore();
  const initialized = useRef(false);

  const refreshStatuses = useCallback(async () => {
    const api = getHttpApiClient();

    // 1. Claude Auth Status
    try {
      const result = await api.setup.getClaudeStatus();
      if (result.success && result.auth) {
        // Cast to extended type that includes server-added fields
        const auth = result.auth as typeof result.auth & {
          oauthTokenValid?: boolean;
          apiKeyValid?: boolean;
        };

        const validMethods: ClaudeAuthMethod[] = [
          'oauth_token_env',
          'oauth_token',
          'api_key',
          'api_key_env',
          'credentials_file',
          'cli_authenticated',
          'none',
        ];

        const method = validMethods.includes(auth.method as ClaudeAuthMethod)
          ? (auth.method as ClaudeAuthMethod)
          : ((auth.authenticated ? 'api_key' : 'none') as ClaudeAuthMethod);

        setClaudeAuthStatus({
          authenticated: auth.authenticated,
          method,
          hasCredentialsFile: auth.hasCredentialsFile ?? false,
          oauthTokenValid: !!(
            auth.oauthTokenValid ||
            auth.hasStoredOAuthToken ||
            auth.hasEnvOAuthToken
          ),
          apiKeyValid: !!(auth.apiKeyValid || auth.hasStoredApiKey || auth.hasEnvApiKey),
          hasEnvOAuthToken: !!auth.hasEnvOAuthToken,
          hasEnvApiKey: !!auth.hasEnvApiKey,
        });
      }
    } catch (error) {
      logger.error('Failed to init Claude auth status:', error);
    }

    // 2. Codex Auth Status
    try {
      const result = await api.setup.getCodexStatus();
      if (result.success && result.auth) {
        const auth = result.auth;

        const validMethods: CodexAuthMethod[] = [
          'api_key_env',
          'api_key',
          'cli_authenticated',
          'none',
        ];

        const method = validMethods.includes(auth.method as CodexAuthMethod)
          ? (auth.method as CodexAuthMethod)
          : ((auth.authenticated ? 'api_key' : 'none') as CodexAuthMethod);

        setCodexAuthStatus({
          authenticated: auth.authenticated,
          method,
          hasAuthFile: auth.hasAuthFile ?? false,
          hasApiKey: auth.hasApiKey ?? false,
          hasEnvApiKey: auth.hasEnvApiKey ?? false,
        });
      }
    } catch (error) {
      logger.error('Failed to init Codex auth status:', error);
    }

    // 3. z.ai Auth Status
    try {
      const result = await api.zai.getStatus();
      if (result.success || result.available !== undefined) {
        let method: ZaiAuthMethod = 'none';
        if (result.hasEnvApiKey) {
          method = 'api_key_env';
        } else if (result.hasApiKey || result.available) {
          method = 'api_key';
        }

        setZaiAuthStatus({
          authenticated: result.available,
          method,
          hasApiKey: result.hasApiKey ?? result.available,
          hasEnvApiKey: result.hasEnvApiKey ?? false,
        });
      }
    } catch (error) {
      logger.error('Failed to init z.ai auth status:', error);
    }
  }, [setClaudeAuthStatus, setCodexAuthStatus, setZaiAuthStatus]);

  useEffect(() => {
    // Only initialize once per session if not already set
    if (
      initialized.current ||
      (claudeAuthStatus !== null && codexAuthStatus !== null && zaiAuthStatus !== null)
    ) {
      return;
    }
    initialized.current = true;

    void refreshStatuses();
  }, [refreshStatuses, claudeAuthStatus, codexAuthStatus, zaiAuthStatus]);
}
