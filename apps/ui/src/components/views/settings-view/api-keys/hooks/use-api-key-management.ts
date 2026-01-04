import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('ApiKeyManagement');
import { getElectronAPI } from '@/lib/electron';
import type { ProviderConfigParams } from '@/config/api-providers';

interface TestResult {
  success: boolean;
  message: string;
}

interface ApiKeyStatus {
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
}

/**
 * Custom hook for managing API key state and operations
 * Handles input values, visibility toggles, connection testing, and saving
 */
export function useApiKeyManagement() {
  const { apiKeys, setApiKeys } = useAppStore();

  // API key values
  const [anthropicKey, setAnthropicKey] = useState(apiKeys.anthropic);
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult | null>(null);

  // API key status from environment
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setOpenaiKey(apiKeys.openai);
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
              hasOpenAIKey: status.hasOpenAIKey,
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

  // Test OpenAI/Codex connection
  const handleTestOpenaiConnection = async () => {
    setTestingOpenaiConnection(true);
    setOpenaiTestResult(null);

    try {
      const api = getElectronAPI();
      const data = await api.setup.verifyCodexAuth('api_key');

      if (data.success && data.authenticated) {
        setOpenaiTestResult({
          success: true,
          message: 'Connection successful! Codex responded.',
        });
      } else {
        setOpenaiTestResult({
          success: false,
          message: data.error || 'Failed to connect to Codex API.',
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

  // Save API keys
  const handleSave = () => {
    setApiKeys({
      anthropic: anthropicKey,
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
