import { useState, useCallback, useRef, useEffect } from "react";
import { services, isBootstrapped } from "@/services";

type AuthState = "idle" | "running" | "success" | "error" | "manual";

interface UseOAuthAuthenticationOptions {
  cliType: "claude" | "codex";
  enabled?: boolean;
}

export function useOAuthAuthentication({
  cliType,
  enabled = true,
}: UseOAuthAuthenticationOptions) {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [output, setOutput] = useState<string[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Reset state when disabled
  useEffect(() => {
    if (!enabled) {
      setAuthState("idle");
      setOutput([]);
      setToken("");
      setError(null);

      // Cleanup subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    }
  }, [enabled]);

  const startAuth = useCallback(async () => {
    if (!isBootstrapped()) {
      setError("Services not initialized");
      setAuthState("error");
      return;
    }

    setAuthState("running");
    setOutput([
      "Starting authentication...",
      `Running ${cliType} CLI in an embedded terminal so you don't need to copy/paste.`,
      "When your browser opens, complete sign-in and return here.",
      "",
    ]);
    setError(null);
    setToken("");

    // Subscribe to progress events
    unsubscribeRef.current = services.setup.onAuthProgress((progress) => {
      if (progress.cli === cliType && progress.data) {
        // Split by newlines and add each line
        const normalized = progress.data.replace(/\r/g, "\n");
        const lines = normalized
          .split("\n")
          .map((line: string) => line.trimEnd())
          .filter((line: string) => line.length > 0);
        if (lines.length > 0) {
          setOutput((prev) => [...prev, ...lines]);
        }
      }
    });

    try {
      // Call the appropriate auth API based on cliType
      const result =
        cliType === "claude"
          ? await services.setup.authClaude()
          : await services.setup.authCodex();

      // Cleanup subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (!result.success) {
        setError(result.error || "Authentication failed");
        setAuthState("error");
        return;
      }

      // Check for token (only available for Claude)
      const resultData = result.data;
      const resultToken =
        cliType === "claude" && resultData && "token" in resultData ? resultData.token : undefined;
      const resultTerminalOpened =
        cliType === "claude" && resultData && "terminalOpened" in resultData
          ? resultData.terminalOpened
          : false;
      const requiresManualAuth = resultData && "requiresManualAuth" in resultData
          ? resultData.requiresManualAuth
          : false;

      if (result.success && resultToken && typeof resultToken === "string") {
        setToken(resultToken);
        setAuthState("success");
        setOutput((prev) => [
          ...prev,
          "",
          "✓ Authentication successful!",
          "✓ Token captured automatically.",
        ]);
      } else if (requiresManualAuth) {
        // Terminal was opened - user needs to copy token manually
        setAuthState("manual");
        // Don't add extra messages if terminalOpened - the progress messages already explain
        if (!resultTerminalOpened) {
          const extraMessages = [
            "",
            "⚠ Could not capture token automatically.",
          ];
          if (result.error) {
            extraMessages.push(result.error);
          }
          setOutput((prev) => [
            ...prev,
            ...extraMessages,
            "Please copy the token from above and paste it below.",
          ]);
        }
      } else {
        setError(result.error || "Authentication failed");
        setAuthState("error");
      }
    } catch (err: unknown) {
      // Cleanup subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "error" in err
            ? String((err as { error: unknown }).error)
            : "Authentication failed";

      // Check if we should fall back to manual mode
      if (
        typeof err === "object" &&
        err !== null &&
        "requiresManualAuth" in err &&
        (err as { requiresManualAuth: boolean }).requiresManualAuth
      ) {
        setAuthState("manual");
        setOutput((prev) => [
          ...prev,
          "",
          "⚠ " + errorMessage,
          "Please copy the token manually and paste it below.",
        ]);
      } else {
        setError(errorMessage);
        setAuthState("error");
      }
    }
  }, [cliType]);

  const reset = useCallback(() => {
    setAuthState("idle");
    setOutput([]);
    setToken("");
    setError(null);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  return { authState, output, token, error, startAuth, reset };
}
