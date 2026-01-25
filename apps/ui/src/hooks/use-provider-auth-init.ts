import { useEffect, useRef, useCallback } from 'react';
import {
  useSetupStore,
  type ClaudeAuthMethod,
  type CodexAuthMethod,
  type ZaiAuthMethod,
  type GeminiAuthMethod,
} from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('ProviderAuthInit');

/**
 * Hook to initialize Claude, Codex, z.ai, and Gemini authentication statuses on app startup.
 * This ensures that usage tracking information is available in the board header
 * without needing to visit the settings page first.
 */
export function useProviderAuthInit() {
  const {
    setClaudeAuthStatus,
    setCodexAuthStatus,
    setZaiAuthStatus,
    setGeminiCliStatus,
    setGeminiAuthStatus,
    claudeAuthStatus,
    codexAuthStatus,
    zaiAuthStatus,
    geminiAuthStatus,
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

    // 4. Gemini Auth Status
    try {
      const result = await api.setup.getGeminiStatus();
      if (result.success) {
        // Set CLI status
        setGeminiCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.status,
        });

        // Set Auth status - always set a status to mark initialization as complete
        if (result.auth) {
          const auth = result.auth;
          const validMethods: GeminiAuthMethod[] = ['cli_login', 'api_key_env', 'api_key', 'none'];

          const method = validMethods.includes(auth.method as GeminiAuthMethod)
            ? (auth.method as GeminiAuthMethod)
            : ((auth.authenticated ? 'cli_login' : 'none') as GeminiAuthMethod);

          setGeminiAuthStatus({
            authenticated: auth.authenticated,
            method,
            hasApiKey: auth.hasApiKey ?? false,
            hasEnvApiKey: auth.hasEnvApiKey ?? false,
          });
        } else {
          // No auth info available, set default unauthenticated status
          setGeminiAuthStatus({
            authenticated: false,
            method: 'none',
            hasApiKey: false,
            hasEnvApiKey: false,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to init Gemini auth status:', error);
      // Set default status on error to prevent infinite retries
      setGeminiAuthStatus({
        authenticated: false,
        method: 'none',
        hasApiKey: false,
        hasEnvApiKey: false,
      });
    }
  }, [
    setClaudeAuthStatus,
    setCodexAuthStatus,
    setZaiAuthStatus,
    setGeminiCliStatus,
    setGeminiAuthStatus,
  ]);

  useEffect(() => {
    // Only initialize once per session if not already set
    if (
      initialized.current ||
      (claudeAuthStatus !== null &&
        codexAuthStatus !== null &&
        zaiAuthStatus !== null &&
        geminiAuthStatus !== null)
    ) {
      return;
    }
    initialized.current = true;

    void refreshStatuses();
  }, [refreshStatuses, claudeAuthStatus, codexAuthStatus, zaiAuthStatus, geminiAuthStatus]);
}
