import { useState, useEffect, useCallback } from "react";
import { useSetupStore } from "@/store/setup-store";
import { services, isBootstrapped } from "@/services";

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

interface CodexCliStatusResult extends CliStatusResult {
  hasApiKey?: boolean;
}

/**
 * Custom hook for managing Claude and Codex CLI status
 * Handles checking CLI installation, authentication, and refresh functionality
 */
export function useCliStatus() {
  const { setClaudeAuthStatus, setCodexAuthStatus } = useSetupStore();

  const [claudeCliStatus, setClaudeCliStatus] =
    useState<CliStatusResult | null>(null);

  const [codexCliStatus, setCodexCliStatus] =
    useState<CodexCliStatusResult | null>(null);

  const [isCheckingClaudeCli, setIsCheckingClaudeCli] = useState(false);
  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(false);

  // Check CLI status on mount
  useEffect(() => {
    const checkCliStatus = async () => {
      if (!isBootstrapped()) {
        console.warn("Services not bootstrapped yet");
        return;
      }

      // Check Claude CLI status
      try {
        const result = await services.setup.getClaudeStatus();
        if (result.success && result.data) {
          const claudeStatus: CliStatusResult = {
            success: true,
            status: result.data.status,
            method: result.data.method,
            version: result.data.version || undefined,
            path: result.data.path || undefined,
          };
          setClaudeCliStatus(claudeStatus);

          // Check Claude auth status
          if (result.data.auth) {
            const auth = result.data.auth;
            // Validate method is one of the expected values, default to "none"
            const validMethods = ["oauth_token_env", "oauth_token", "api_key", "api_key_env", "none"] as const;
            type AuthMethod = typeof validMethods[number];
            const method: AuthMethod = validMethods.includes(auth.method as AuthMethod)
              ? (auth.method as AuthMethod)
              : "none";
            const authStatus = {
              authenticated: auth.authenticated,
              method,
              hasCredentialsFile: auth.hasCredentialsFile ?? false,
              oauthTokenValid: auth.hasStoredOAuthToken || auth.hasEnvOAuthToken,
              apiKeyValid: auth.hasStoredApiKey || auth.hasEnvApiKey,
              hasEnvOAuthToken: auth.hasEnvOAuthToken,
              hasEnvApiKey: auth.hasEnvApiKey,
            };
            setClaudeAuthStatus(authStatus);
          }
        } else {
          console.error("Failed to check Claude CLI status:", result.error);
        }
      } catch (error) {
        console.error("Failed to check Claude CLI status:", error);
      }

      // Check Codex CLI status
      try {
        const result = await services.setup.getCodexStatus();
        if (result.success && result.data) {
          const codexStatus: CodexCliStatusResult = {
            success: true,
            status: result.data.status,
            method: result.data.method,
            version: result.data.version || undefined,
            path: result.data.path || undefined,
            hasApiKey: result.data.auth?.hasAuthFile || result.data.auth?.hasEnvKey,
          };
          setCodexCliStatus(codexStatus);

          // Check Codex auth status
          if (result.data.auth) {
            const auth = result.data.auth;
            // Determine method - prioritize cli_verified and cli_tokens over auth_file
            const method =
              auth.method === "cli_verified" || auth.method === "cli_tokens"
                ? auth.method === "cli_verified"
                  ? ("cli_verified" as const)
                  : ("cli_tokens" as const)
                : auth.method === "auth_file"
                ? ("api_key" as const)
                : auth.method === "env_var"
                ? ("env" as const)
                : ("none" as const);

            const authStatus = {
              authenticated: auth.authenticated,
              method,
              // Only set apiKeyValid for actual API key methods, not CLI login
              apiKeyValid:
                method === "cli_verified" || method === "cli_tokens"
                  ? undefined
                  : auth.hasAuthFile || auth.hasEnvKey,
            };
            setCodexAuthStatus(authStatus);
          }
        } else {
          console.error("Failed to check Codex CLI status:", result.error);
        }
      } catch (error) {
        console.error("Failed to check Codex CLI status:", error);
      }
    };

    checkCliStatus();
  }, [setClaudeAuthStatus, setCodexAuthStatus]);

  // Refresh Claude CLI status
  const handleRefreshClaudeCli = useCallback(async () => {
    setIsCheckingClaudeCli(true);
    try {
      if (!isBootstrapped()) {
        console.warn("Services not bootstrapped yet");
        return;
      }
      const result = await services.setup.getClaudeStatus();
      if (result.success && result.data) {
        const claudeStatus: CliStatusResult = {
          success: true,
          status: result.data.status,
          method: result.data.method,
          version: result.data.version || undefined,
          path: result.data.path || undefined,
        };
        setClaudeCliStatus(claudeStatus);
      }
    } catch (error) {
      console.error("Failed to refresh Claude CLI status:", error);
    } finally {
      setIsCheckingClaudeCli(false);
    }
  }, []);

  // Refresh Codex CLI status
  const handleRefreshCodexCli = useCallback(async () => {
    setIsCheckingCodexCli(true);
    try {
      if (!isBootstrapped()) {
        console.warn("Services not bootstrapped yet");
        return;
      }
      const result = await services.setup.getCodexStatus();
      if (result.success && result.data) {
        const codexStatus: CodexCliStatusResult = {
          success: true,
          status: result.data.status,
          method: result.data.method,
          version: result.data.version || undefined,
          path: result.data.path || undefined,
          hasApiKey: result.data.auth?.hasAuthFile || result.data.auth?.hasEnvKey,
        };
        setCodexCliStatus(codexStatus);
      }
    } catch (error) {
      console.error("Failed to refresh Codex CLI status:", error);
    } finally {
      setIsCheckingCodexCli(false);
    }
  }, []);

  return {
    claudeCliStatus,
    codexCliStatus,
    isCheckingClaudeCli,
    isCheckingCodexCli,
    handleRefreshClaudeCli,
    handleRefreshCodexCli,
  };
}
