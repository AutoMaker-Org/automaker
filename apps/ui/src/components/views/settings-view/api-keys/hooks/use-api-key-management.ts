import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { ProviderConfigParams } from '@/config/api-providers';

interface TestResult {
  success: boolean;
  message: string;
}

interface ApiKeyStatus {
  hasAnthropicKey: boolean;
  hasGoogleKey: boolean;
  hasZaiKey: boolean;
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
  const [zaiKey, setZaiKey] = useState(apiKeys.zai);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showZaiKey, setShowZaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(null);
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
    setZaiKey(apiKeys.zai);
  }, [apiKeys]);

  // Check API key status from environment on mount
  useEffect(() => {
    const checkApiKeyStatus = async () => {
      const api = getElectronAPI();
      if (api.setup?.getApiKeys) {
        try {
          const status = await api.setup.getApiKeys();
          if (status.success) {
            setApiKeyStatus({
              hasAnthropicKey: status.hasAnthropicKey,
              hasGoogleKey: status.hasGoogleKey,
              hasZaiKey: false, // Z.AI doesn't have env var support yet
            });
          }
        } catch (error) {
          console.error('Failed to check API key status:', error);
        }
      }
    };
    checkApiKeyStatus();
  }, []);

  // Test Anthropic/Claude connection
  const handleTestAnthropicConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const api = getElectronAPI();
      const data = await api.setup?.verifyClaudeAuth('api_key');

      if (data && data.success && data.authenticated) {
        setTestResult({
          success: true,
          message: 'Connection successful! Claude responded.',
        });
      } else {
        setTestResult({
          success: false,
          message: data?.error || 'Failed to connect to Claude API.',
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

    // For now, just validate that a key is provided (full verification requires backend endpoint)
    setGeminiTestResult({
      success: true,
      message: 'API key saved. Connection test not yet available.',
    });
    setTestingGeminiConnection(false);
  };

  // Test Z.AI connection
  const handleTestZaiConnection = async () => {
    setTestingZaiConnection(true);
    setZaiTestResult(null);

    // Basic validation - check key is provided
    if (!zaiKey || zaiKey.trim().length < 10) {
      setZaiTestResult({
        success: false,
        message: 'Please enter a valid API key.',
      });
      setTestingZaiConnection(false);
      return;
    }

    try {
      const api = getElectronAPI();
      // Pass the current key value so we can test before saving
      const data = await api.setup?.verifyZaiAuth?.(zaiKey);

      if (data && data.success && data.authenticated) {
        setZaiTestResult({
          success: true,
          message: 'Connection successful! Z.AI/GLM-4.7 responded.',
        });
      } else {
        setZaiTestResult({
          success: false,
          message: data?.error || 'Failed to connect to Z.AI API.',
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
  const handleSave = () => {
    setApiKeys({
      anthropic: anthropicKey,
      google: googleKey,
      zai: zaiKey,
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
