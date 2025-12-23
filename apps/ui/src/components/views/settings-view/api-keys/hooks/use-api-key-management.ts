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
  const [elevenLabsKey, setElevenLabsKey] = useState(apiKeys.elevenLabs);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(null);
  const [testingElevenLabsConnection, setTestingElevenLabsConnection] = useState(false);
  const [elevenLabsTestResult, setElevenLabsTestResult] = useState<TestResult | null>(null);

  // API key status from environment
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setGoogleKey(apiKeys.google);
    setElevenLabsKey(apiKeys.elevenLabs);
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
      const data = await api.setup.verifyClaudeAuth('api_key');

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

  // Test ElevenLabs connection
  const handleTestElevenLabsConnection = async () => {
    setTestingElevenLabsConnection(true);
    setElevenLabsTestResult(null);

    // Basic validation - check key exists
    if (!elevenLabsKey || elevenLabsKey.trim().length < 10) {
      setElevenLabsTestResult({
        success: false,
        message: 'Please enter a valid API key.',
      });
      setTestingElevenLabsConnection(false);
      return;
    }

    try {
      // Get server URL
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/synopsis/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setElevenLabsTestResult({
          success: true,
          message: data.message || 'Connection successful!',
        });
      } else {
        setElevenLabsTestResult({
          success: false,
          message: data.error || 'Failed to verify ElevenLabs API key.',
        });
      }
    } catch {
      setElevenLabsTestResult({
        success: false,
        message: 'Network error. Please check your connection.',
      });
    } finally {
      setTestingElevenLabsConnection(false);
    }
  };

  // Save API keys
  const handleSave = () => {
    setApiKeys({
      anthropic: anthropicKey,
      google: googleKey,
      elevenLabs: elevenLabsKey,
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
    elevenLabs: {
      value: elevenLabsKey,
      setValue: setElevenLabsKey,
      show: showElevenLabsKey,
      setShow: setShowElevenLabsKey,
      testing: testingElevenLabsConnection,
      onTest: handleTestElevenLabsConnection,
      result: elevenLabsTestResult,
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
