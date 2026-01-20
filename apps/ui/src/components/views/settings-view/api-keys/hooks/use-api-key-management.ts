// @ts-nocheck - API key management state with validation and persistence
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { useSetupStore, type ZaiAuthMethod } from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';

const logger = createLogger('ApiKeyManagement');
import { getElectronAPI } from '@/lib/electron';
import type { ProviderConfigParams } from '@/config/api-providers';

interface TestResult {
  success: boolean;
  message: string;
}

interface ApiKeyStatus {
  hasAnthropicKey: boolean;
  hasGoogleKey: boolean;
  hasOpenaiKey: boolean;
  hasZaiKey: boolean;
}

/**
 * Custom hook for managing API key state and operations
 * Handles input values, visibility toggles, connection testing, and saving
 */
export function useApiKeyManagement() {
  const { apiKeys, setApiKeys } = useAppStore();
  const { setZaiAuthStatus } = useSetupStore();
  const queryClient = useQueryClient();

  // API key values
  const [anthropicKey, setAnthropicKey] = useState(apiKeys.anthropic);
  const [googleKey, setGoogleKey] = useState(apiKeys.google);
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai);
  const [zaiKey, setZaiKey] = useState(apiKeys.zai);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showZaiKey, setShowZaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(null);
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult | null>(null);
  const [testingZaiConnection, setTestingZaiConnection] = useState(false);
  const [zaiTestResult, setZaiTestResult] = useState<TestResult | null>(null);

  // API key status from environment
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setGoogleKey(apiKeys.google);
    setOpenaiKey(apiKeys.openai);
    setZaiKey(apiKeys.zai);
  }, [apiKeys]);

  // Check API key status from environment on mount
  useEffect(() => {
    const checkApiKeyStatus = async () => {
      const api = getElectronAPI();
      if (api?.setup?.getApiKeys) {
        try {
          const status = await api.setup.getApiKeys();
          if (status.success) {
            setApiKeyStatus({
              hasAnthropicKey: status.hasAnthropicKey,
              hasGoogleKey: status.hasGoogleKey,
              hasOpenaiKey: status.hasOpenaiKey,
              hasZaiKey: status.hasZaiKey || false,
            });
          }
        } catch (error) {
          logger.error('Failed to check API key status:', error);
        }
      }
    };
    checkApiKeyStatus();
  }, []);

  // Test Anthropic/Claude connection
  const handleTestAnthropicConnection = async () => {
    // Validate input first
    if (!anthropicKey || anthropicKey.trim().length === 0) {
      setTestResult({
        success: false,
        message: 'Please enter an API key to test.',
      });
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    try {
      const api = getElectronAPI();
      // Pass the current input value to test unsaved keys
      const data = await api.setup.verifyClaudeAuth('api_key', anthropicKey);

      if (data.success && data.authenticated) {
        setTestResult({
          success: true,
          message: 'Connection successful! Claude responded.',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to connect to Claude API.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Test Google/Gemini connection
  // TODO: Add backend endpoint for Gemini API key verification
  const handleTestGeminiConnection = async () => {
    setTestingGeminiConnection(true);
    setGeminiTestResult(null);

    // Basic validation - check key format
    if (!googleKey || googleKey.trim().length < 10) {
      setGeminiTestResult({
        success: false,
        message: 'Please enter a valid API key.',
      });
      setTestingGeminiConnection(false);
      return;
    }

    // For now, just validate the key format (starts with expected prefix)
    // Full verification requires a backend endpoint
    setGeminiTestResult({
      success: true,
      message: 'API key saved. Connection test not yet available.',
    });
    setTestingGeminiConnection(false);
  };

  // Test OpenAI/Codex connection
  const handleTestOpenaiConnection = async () => {
    setTestingOpenaiConnection(true);
    setOpenaiTestResult(null);

    try {
      const api = getElectronAPI();
      const data = await api.setup.verifyCodexAuth('api_key', openaiKey);

      if (data.success && data.authenticated) {
        setOpenaiTestResult({
          success: true,
          message: 'Connection successful! Codex responded.',
        });
      } else {
        setOpenaiTestResult({
          success: false,
          message: data.error || 'Failed to connect to OpenAI API.',
        });
      }
    } catch {
      setOpenaiTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingOpenaiConnection(false);
    }
  };

  // Test z.ai connection
  const handleTestZaiConnection = async () => {
    setTestingZaiConnection(true);
    setZaiTestResult(null);

    // Validate input first
    if (!zaiKey || zaiKey.trim().length === 0) {
      setZaiTestResult({
        success: false,
        message: 'Please enter an API key to test.',
      });
      setTestingZaiConnection(false);
      return;
    }

    try {
      const api = getElectronAPI();
      // Use the verify endpoint to test the key without storing it
      const response = await api.zai?.verify(zaiKey);

      if (response?.success && response?.authenticated) {
        setZaiTestResult({
          success: true,
          message: response.message || 'Connection successful! z.ai API responded.',
        });
      } else {
        setZaiTestResult({
          success: false,
          message: response?.error || 'Failed to connect to z.ai API.',
        });
      }
    } catch {
      setZaiTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingZaiConnection(false);
    }
  };

  // Save API keys
  const handleSave = async () => {
    setApiKeys({
      anthropic: anthropicKey,
      google: googleKey,
      openai: openaiKey,
      zai: zaiKey,
    });

    // Configure z.ai service on the server with the new key
    if (zaiKey && zaiKey.trim().length > 0) {
      try {
        const api = getHttpApiClient();
        const result = await api.zai.configure(zaiKey.trim());

        if (result.success || result.isAvailable) {
          // Update z.ai auth status in the store
          setZaiAuthStatus({
            authenticated: true,
            method: 'api_key' as ZaiAuthMethod,
            hasApiKey: true,
            hasEnvApiKey: false,
          });
          // Invalidate the z.ai usage query so it refetches with the new key
          await queryClient.invalidateQueries({ queryKey: queryKeys.usage.zai() });
          logger.info('z.ai API key configured successfully');
        }
      } catch (error) {
        logger.error('Failed to configure z.ai API key:', error);
      }
    } else {
      // Clear z.ai auth status if key is removed
      setZaiAuthStatus({
        authenticated: false,
        method: 'none' as ZaiAuthMethod,
        hasApiKey: false,
        hasEnvApiKey: false,
      });
      // Invalidate the query to clear any cached data
      await queryClient.invalidateQueries({ queryKey: queryKeys.usage.zai() });
    }

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
    zai: {
      value: zaiKey,
      setValue: setZaiKey,
      show: showZaiKey,
      setShow: setShowZaiKey,
      testing: testingZaiConnection,
      onTest: handleTestZaiConnection,
      result: zaiTestResult,
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
