import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import type { ProviderConfigParams } from "@/config/api-providers";

interface TestResult {
  success: boolean;
  message: string;
}

interface ApiKeyStatus {
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
  hasGoogleKey: boolean;
}

/**
 * Custom hook for managing API key state and operations
 * Handles input values, visibility toggles, connection testing, and saving
 */
export function useApiKeyManagement() {
  const { apiKeys, setApiKeys } = useAppStore();

  // API key values
  const [anthropicKey, setAnthropicKey] = useState(apiKeys.anthropic);
  const [googleKey, setGoogleKey] = useState(apiKeys.google);
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(
    null
  );
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult | null>(
    null
  );

  // API key status from environment
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setGoogleKey(apiKeys.google);
    setOpenaiKey(apiKeys.openai);
  }, [apiKeys]);

  // Check API key status from environment on mount
  useEffect(() => {
    const checkApiKeyStatus = async () => {
      if (!isBootstrapped()) {
        console.warn("Services not bootstrapped yet");
        return;
      }
      try {
        const result = await services.setup.getApiKeys();
        if (result.success && result.data) {
          setApiKeyStatus({
            hasAnthropicKey: result.data.hasAnthropicKey,
            hasOpenAIKey: result.data.hasOpenAIKey,
            hasGoogleKey: result.data.hasGoogleKey,
          });
        } else {
          console.error("Failed to check API key status:", result.error);
        }
      } catch (error) {
        console.error("Failed to check API key status:", error);
      }
    };
    checkApiKeyStatus();
  }, []);

  // Test Anthropic/Claude connection
  const handleTestAnthropicConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/claude/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: anthropicKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || "Connection successful! Claude responded.",
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Failed to connect to Claude API.",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Test Google/Gemini connection
  const handleTestGeminiConnection = async () => {
    setTestingGeminiConnection(true);
    setGeminiTestResult(null);

    try {
      const response = await fetch("/api/gemini/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: googleKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setGeminiTestResult({
          success: true,
          message: data.message || "Connection successful! Gemini responded.",
        });
      } else {
        setGeminiTestResult({
          success: false,
          message: data.error || "Failed to connect to Gemini API.",
        });
      }
    } catch {
      setGeminiTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingGeminiConnection(false);
    }
  };

  // Test OpenAI connection
  const handleTestOpenaiConnection = async () => {
    setTestingOpenaiConnection(true);
    setOpenaiTestResult(null);

    try {
      // Note: testOpenAIConnection is not in the services layer yet
      // Using fallback to web API test
      const response = await fetch("/api/openai/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: openaiKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOpenaiTestResult({
          success: true,
          message:
            data.message || "Connection successful! OpenAI API responded.",
        });
      } else {
        setOpenaiTestResult({
          success: false,
          message: data.error || "Failed to connect to OpenAI API.",
        });
      }
    } catch {
      setOpenaiTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingOpenaiConnection(false);
    }
  };

  // Save API keys
  const handleSave = () => {
    setApiKeys({
      anthropic: anthropicKey,
      google: googleKey,
      openai: openaiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Build provider config params for buildProviderConfigs
  const providerConfigParams: ProviderConfigParams = {
    apiKeys,
    anthropic: {
      value: anthropicKey,
      setValue: setAnthropicKey,
      show: showAnthropicKey,
      setShow: setShowAnthropicKey,
      testing: testingConnection,
      onTest: handleTestAnthropicConnection,
      result: testResult,
    },
    google: {
      value: googleKey,
      setValue: setGoogleKey,
      show: showGoogleKey,
      setShow: setShowGoogleKey,
      testing: testingGeminiConnection,
      onTest: handleTestGeminiConnection,
      result: geminiTestResult,
    },
    openai: {
      value: openaiKey,
      setValue: setOpenaiKey,
      show: showOpenaiKey,
      setShow: setShowOpenaiKey,
      testing: testingOpenaiConnection,
      onTest: handleTestOpenaiConnection,
      result: openaiTestResult,
    },
  };

  return {
    // Provider config params for buildProviderConfigs
    providerConfigParams,

    // API key status from environment
    apiKeyStatus,

    // Save handler and state
    handleSave,
    saved,
  };
}
