import { useEffect, useRef, useCallback } from 'react';
import {
  useSetupStore,
  type ClaudeAuthMethod,
  type CodexAuthMethod,
  type ZaiAuthMethod,
} from '@/store/setup-store';
import type { GeminiAuthStatus } from '@automaker/types';
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
        const available = !!result.available;
        const hasApiKey = !!(result.hasApiKey ?? result.available);
        const hasEnvApiKey = !!(result.hasEnvApiKey ?? false);

        let method: ZaiAuthMethod = 'none';
        if (hasEnvApiKey) {
          method = 'api_key_env';
        } else if (hasApiKey || available) {
          method = 'api_key';
        }

        setZaiAuthStatus({
          authenticated: available,
          method,
          hasApiKey,
          hasEnvApiKey,
        });
      } else {
        // Non-success path - set default unauthenticated status
        setZaiAuthStatus({
          authenticated: false,
          method: 'none',
          hasApiKey: false,
          hasEnvApiKey: false,
        });
      }
    } catch (error) {
      logger.error('Failed to init z.ai auth status:', error);
      // Set default status on error to prevent stale state
      setZaiAuthStatus({
        authenticated: false,
        method: 'none',
        hasApiKey: false,
        hasEnvApiKey: false,
      });
    }

    // 4. Gemini Auth Status
    try {
      const result = await api.setup.getGeminiStatus();

      // Always set CLI status if any CLI info is available
      if (
        result.installed !== undefined ||
        result.version !== undefined ||
        result.path !== undefined
      ) {
        setGeminiCliStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
        });
      }

      // Always set auth status regardless of result.success
      if (result.success && result.auth) {
        const auth = result.auth;
        const validMethods: GeminiAuthStatus['method'][] = [
          'google_login',
          'api_key',
          'vertex_ai',
          'none',
        ];

        const method = validMethods.includes(auth.method as GeminiAuthStatus['method'])
          ? (auth.method as GeminiAuthStatus['method'])
          : ((auth.authenticated ? 'google_login' : 'none') as GeminiAuthStatus['method']);

        setGeminiAuthStatus({
          authenticated: auth.authenticated,
          method,
          hasApiKey: auth.hasApiKey ?? false,
          hasEnvApiKey: auth.hasEnvApiKey ?? false,
        });
      } else {
        // result.success is false or result.auth is missing — set default unauthenticated status
        setGeminiAuthStatus({
          authenticated: false,
          method: 'none',
          hasApiKey: false,
          hasEnvApiKey: false,
        });
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
    // Skip if already initialized in this session
    if (initialized.current) {
      return;
    }
    initialized.current = true;

    // Always call refreshStatuses() to background re-validate on app restart,
    // even when statuses are pre-populated from persisted storage (cache case).
    void refreshStatuses();
  }, [refreshStatuses, claudeAuthStatus, codexAuthStatus, zaiAuthStatus, geminiAuthStatus]);
}
