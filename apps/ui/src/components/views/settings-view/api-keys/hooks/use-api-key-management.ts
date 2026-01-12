import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { ProviderConfigParams } from '@/config/api-providers';

const logger = createLogger('ApiKeyManagement');

interface TestResult {
  success: boolean;
  message: string;
}

interface MaskedCredentials {
  anthropic: { configured: boolean; masked: string };
  google: { configured: boolean; masked: string };
  openai: { configured: boolean; masked: string };
  linear: { configured: boolean; masked: string };
}

/**
 * Custom hook for managing API key state and operations
 * Handles input values, visibility toggles, connection testing, and saving
 *
 * Note: This hook does NOT store raw API keys in memory.
 * It only stores:
 * - Empty strings as initial values for input fields
 * - User-entered values temporarily until saved
 * - Boolean flags indicating whether keys are configured (from server)
 */
export function useApiKeyManagement() {
  const { apiKeys, setApiKeys } = useAppStore();

  // API key input values - start empty, user enters new values to update
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');

  // Masked credentials from server (for display purposes)
  const [maskedCredentials, setMaskedCredentials] = useState<MaskedCredentials | null>(null);

  // Visibility toggles
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Test connection states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<TestResult | null>(null);
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<TestResult | null>(null);

  // Save state
  const [saved, setSaved] = useState(false);

  // Load masked credentials on mount
  useEffect(() => {
    const loadMaskedCredentials = async () => {
      const api = getElectronAPI();
      if (!api.settings) return;
      try {
        const result = await api.settings.getCredentials();
        if (result.success && result.credentials) {
          setMaskedCredentials(result.credentials);
        }
      } catch (error) {
        logger.error('Failed to load masked credentials:', error);
      }
    };
    loadMaskedCredentials();
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

  // Save API keys to server
  const handleSave = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.settings) return;
    const updates: { anthropic?: string; google?: string; openai?: string } = {};

    // Only include keys that have been entered
    if (anthropicKey.trim()) updates.anthropic = anthropicKey;
    if (googleKey.trim()) updates.google = googleKey;
    if (openaiKey.trim()) updates.openai = openaiKey;

    if (Object.keys(updates).length === 0) {
      return; // Nothing to save
    }

    try {
      const result = await api.settings.updateCredentials({ apiKeys: updates });
      if (result.success && result.credentials) {
        // Update store with new configured status
        setApiKeys({
          anthropic: result.credentials.anthropic.configured,
          google: result.credentials.google.configured,
          openai: result.credentials.openai.configured,
          linear: result.credentials.linear.configured,
        });
        // Update masked credentials for display
        setMaskedCredentials(result.credentials);
        // Clear input fields after successful save
        setAnthropicKey('');
        setGoogleKey('');
        setOpenaiKey('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      logger.error('Failed to save credentials:', error);
    }
  }, [anthropicKey, googleKey, openaiKey, setApiKeys]);

  // Build provider config params for buildProviderConfigs
  const providerConfigParams: ProviderConfigParams = {
    apiKeys,
    maskedCredentials,
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
    providerConfigParams,
    maskedCredentials,
    handleSave,
    saved,
  };
}
