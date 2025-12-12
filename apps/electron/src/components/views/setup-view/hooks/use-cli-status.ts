import { useState, useCallback } from "react";

interface UseCliStatusOptions {
  cliType: "claude" | "codex";
  statusApi: () => Promise<any>;
  setCliStatus: (status: any) => void;
  setAuthStatus: (status: any) => void;
}

export function useCliStatus({
  cliType,
  statusApi,
  setCliStatus,
  setAuthStatus,
}: UseCliStatusOptions) {
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    console.log(`[${cliType} Setup] Starting status check...`);
    setIsChecking(true);
    try {
      const result = await statusApi();
      console.log(`[${cliType} Setup] Raw status result:`, result);

      if (result.success && result.data) {
        // Access data from ServiceResult wrapper
        const data = result.data;
        const cliStatus = {
          installed: data.installed || data.status === "installed",
          path: data.path || null,
          version: data.version || null,
          method: data.method || "none",
        };
        console.log(`[${cliType} Setup] CLI Status:`, cliStatus);
        setCliStatus(cliStatus);

        if (data.auth) {
          if (cliType === "claude") {
            // Validate method is one of the expected values, default to "none"
            const validMethods = [
              "oauth_token_env",
              "oauth_token",
              "api_key",
              "api_key_env",
              "none",
            ] as const;
            type AuthMethod = (typeof validMethods)[number];
            const method: AuthMethod = validMethods.includes(
              data.auth.method as AuthMethod
            )
              ? (data.auth.method as AuthMethod)
              : "none";
            const authStatus = {
              authenticated: data.auth.authenticated,
              method,
              hasCredentialsFile: false,
              oauthTokenValid:
                data.auth.hasStoredOAuthToken ||
                data.auth.hasEnvOAuthToken,
              apiKeyValid:
                data.auth.hasStoredApiKey || data.auth.hasEnvApiKey,
              hasEnvOAuthToken: data.auth.hasEnvOAuthToken,
              hasEnvApiKey: data.auth.hasEnvApiKey,
            };
            setAuthStatus(authStatus);
          } else {
            // Codex auth status mapping
            const mapAuthMethod = (method?: string): any => {
              switch (method) {
                case "cli_verified":
                  return "cli_verified";
                case "cli_tokens":
                  return "cli_tokens";
                case "auth_file":
                  return "api_key";
                case "env_var":
                  return "env";
                default:
                  return "none";
              }
            };

            const method = mapAuthMethod(data.auth.method);
            const authStatus = {
              authenticated: data.auth.authenticated,
              method,
              apiKeyValid:
                method === "cli_verified" || method === "cli_tokens"
                  ? undefined
                  : data.auth.authenticated,
            };
            console.log(`[${cliType} Setup] Auth Status:`, authStatus);
            setAuthStatus(authStatus);
          }
        }
      }
    } catch (error) {
      console.error(`[${cliType} Setup] Failed to check status:`, error);
    } finally {
      setIsChecking(false);
    }
  }, [cliType, statusApi, setCliStatus, setAuthStatus]);

  return { isChecking, checkStatus };
}
