import { useState, useEffect, useCallback } from 'react';
import { useSetupStore } from '@/store/setup-store';
import { getElectronAPI } from '@/lib/electron';

interface CliStatusResult {
  success: boolean;
  status?: string;
  method?: string;
  version?: string;
  path?: string;
  recommendation?: string;
  installCommands?: {
    macos?: string;
    windows?: string;
    linux?: string;
    npm?: string;
  };
  error?: string;
}

interface CursorCliStatusResult {
  success: boolean;
  status?: string;
  method?: string;
  version?: string;
  path?: string;
  auth?: {
    authenticated: boolean;
    method: string;
    hasApiKey: boolean;
  };
  error?: string;
}

/**
 * Custom hook for managing CLI status for multiple providers
 * Handles checking CLI installation, authentication, and refresh functionality
 */
export function useCliStatus() {
  const { setClaudeAuthStatus } = useSetupStore();

  const [claudeCliStatus, setClaudeCliStatus] = useState<CliStatusResult | null>(null);
  const [cursorCliStatus, setCursorCliStatus] = useState<CursorCliStatusResult | null>(null);

  const [isCheckingClaudeCli, setIsCheckingClaudeCli] = useState(false);
  const [isCheckingCursorCli, setIsCheckingCursorCli] = useState(false);

  // Check CLI status on mount
  useEffect(() => {
    const checkCliStatus = async () => {
      const api = getElectronAPI();

      // Check Claude CLI
      if (api?.checkClaudeCli) {
        try {
          const status = await api.checkClaudeCli();
          setClaudeCliStatus(status);
        } catch (error) {
          console.error('Failed to check Claude CLI status:', error);
        }
      }

      // Check Cursor CLI
      if (api?.setup?.getCursorStatus) {
        try {
          const status = await api.setup.getCursorStatus();
          setCursorCliStatus(status);
        } catch (error) {
          console.error('Failed to check Cursor CLI status:', error);
        }
      }

      // Check Claude auth status (re-fetch on mount to ensure persistence)
      if (api?.setup?.getClaudeStatus) {
        try {
          const result = await api.setup.getClaudeStatus();
          if (result.success && result.auth) {
            // Cast to extended type that includes server-added fields
            const auth = result.auth as typeof result.auth & {
              oauthTokenValid?: boolean;
              apiKeyValid?: boolean;
            };
            // Map server method names to client method types
            // Server returns: oauth_token_env, oauth_token, api_key_env, api_key, credentials_file, cli_authenticated, none
            const validMethods = [
              'oauth_token_env',
              'oauth_token',
              'api_key',
              'api_key_env',
              'credentials_file',
              'cli_authenticated',
              'none',
            ] as const;
            type AuthMethod = (typeof validMethods)[number];
            const method: AuthMethod = validMethods.includes(auth.method as AuthMethod)
              ? (auth.method as AuthMethod)
              : auth.authenticated
                ? 'api_key'
                : 'none'; // Default authenticated to api_key, not none
            const authStatus = {
              authenticated: auth.authenticated,
              method,
              hasCredentialsFile: auth.hasCredentialsFile ?? false,
              oauthTokenValid:
                auth.oauthTokenValid || auth.hasStoredOAuthToken || auth.hasEnvOAuthToken,
              apiKeyValid: auth.apiKeyValid || auth.hasStoredApiKey || auth.hasEnvApiKey,
              hasEnvOAuthToken: auth.hasEnvOAuthToken,
              hasEnvApiKey: auth.hasEnvApiKey,
            };
            setClaudeAuthStatus(authStatus);
          }
        } catch (error) {
          console.error('Failed to check Claude auth status:', error);
        }
      }
    };

    checkCliStatus();
  }, [setClaudeAuthStatus]);

  // Refresh Claude CLI status
  const handleRefreshClaudeCli = useCallback(async () => {
    setIsCheckingClaudeCli(true);
    try {
      const api = getElectronAPI();
      if (api?.checkClaudeCli) {
        const status = await api.checkClaudeCli();
        setClaudeCliStatus(status);
      }
    } catch (error) {
      console.error('Failed to refresh Claude CLI status:', error);
    } finally {
      setIsCheckingClaudeCli(false);
    }
  }, []);

  // Refresh Cursor CLI status
  const handleRefreshCursorCli = useCallback(async () => {
    setIsCheckingCursorCli(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.getCursorStatus) {
        const status = await api.setup.getCursorStatus();
        setCursorCliStatus(status);
      }
    } catch (error) {
      console.error('Failed to refresh Cursor CLI status:', error);
    } finally {
      setIsCheckingCursorCli(false);
    }
  }, []);

  return {
    claudeCliStatus,
    cursorCliStatus,
    isCheckingClaudeCli,
    isCheckingCursorCli,
    handleRefreshClaudeCli,
    handleRefreshCursorCli,
  };
}
