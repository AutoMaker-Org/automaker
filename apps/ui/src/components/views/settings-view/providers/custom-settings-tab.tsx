import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import {
  CUSTOM_ENDPOINT_PRESETS,
  getModelSuggestions,
  isValidModelId,
  type CustomEndpointPreset,
} from './custom-provider-presets';
import type { CustomEndpointConfig } from '../shared/types';
import { Info, Globe, Key, Server, Check, X, ExternalLink } from 'lucide-react';

export function CustomSettingsTab() {
  const { setCustomEndpointForProvider, getCustomEndpointForProvider, customEndpointConfigs } =
    useAppStore();

  // Local form state
  const [selectedPreset, setSelectedPreset] = useState<'zhipu' | 'minimax' | 'manual'>('zhipu');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Load configuration for the selected preset
  useEffect(() => {
    // Get stored config for this provider
    const storedConfig = getCustomEndpointForProvider(selectedPreset);

    // Get preset defaults
    const preset = CUSTOM_ENDPOINT_PRESETS.find((p) => p.value === selectedPreset);

    if (storedConfig) {
      setApiKey(storedConfig.apiKey || '');
      // Only set baseUrl/model if stored, otherwise use preset defaults
      setBaseUrl(storedConfig.baseUrl || preset?.baseUrl || '');
      setModel(storedConfig.model || preset?.defaultModel || '');
    } else if (preset) {
      // No stored config, use defaults
      setApiKey('');
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
  }, [selectedPreset, getCustomEndpointForProvider]);

  // Handle preset selection
  const handlePresetChange = (value: 'zhipu' | 'minimax' | 'manual') => {
    setSelectedPreset(value);
    setTestStatus('idle');
    setTestMessage('');
  };

  // Save configuration
  const handleSave = () => {
    if (!baseUrl.trim() && selectedPreset === 'manual') {
      toast.error('Base URL is required for manual configuration');
      return;
    }
    if (!apiKey.trim()) {
      toast.error('API Key is required');
      return;
    }

    // Validate model only if provided or required
    if (selectedPreset === 'manual' && !model.trim()) {
      toast.error('Model ID is required for manual configuration');
      return;
    }

    const config = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
    };

    setCustomEndpointForProvider(selectedPreset, config);
    toast.success(
      `${CUSTOM_ENDPOINT_PRESETS.find((p) => p.value === selectedPreset)?.name} configuration saved`
    );
  };

  // Clear configuration
  const handleClear = () => {
    // Clear by saving empty/undefined values for this provider
    setCustomEndpointForProvider(selectedPreset, { apiKey: '', baseUrl: '', model: '' });

    // Reset form to defaults
    const preset = CUSTOM_ENDPOINT_PRESETS.find((p) => p.value === selectedPreset);
    if (preset) {
      setApiKey('');
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }

    setTestStatus('idle');
    setTestMessage('');
    toast.success('Configuration cleared for this provider');
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast.error('Please enter Base URL and API Key first');
      return;
    }

    setIsTesting(true);
    setTestStatus('idle');
    setTestMessage('');

    try {
      // Simple test by making a minimal request to the endpoint
      // Use /v1/messages path if not already included, as determined by the provider
      const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
      const testUrl = `${normalizedBaseUrl}/v1/messages`;

      // Note: We can't actually make a full valid request without a prompt,
      // but we can check if the auth works. 400 Bad Request usually means auth passed but body invalid.
      // 401/403 means auth failed.

      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model.trim() || currentPreset?.defaultModel || 'glm-4.7',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        setTestStatus('error');
        setTestMessage('Authentication failed (401/403). Check API key.');
        return;
      }
      if (!response.ok) {
        setTestStatus('error');
        setTestMessage(`Endpoint reachable but returned ${response.status}. Check base URL/model.`);
        return;
      }
      setTestStatus('success');
      setTestMessage('Connection OK.');
    } catch (error) {
      setTestStatus('error');
      setTestMessage(`Connection failed: ${(error as Error).message}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Get current preset info
  const currentPreset = CUSTOM_ENDPOINT_PRESETS.find((p) => p.value === selectedPreset);
  const modelSuggestions = getModelSuggestions(selectedPreset);

  return (
    <div className="space-y-6">
      {/* Info Section */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-400/90">
          <span className="font-medium">Custom Endpoint Provider</span>
          <p className="text-xs text-blue-400/70 mt-1">
            Configure settings for specific providers. Settings are saved separately for each
            provider.
          </p>
        </div>
      </div>

      {/* Preset Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Provider</label>
        <div className="grid grid-cols-3 gap-3">
          {CUSTOM_ENDPOINT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                selectedPreset === preset.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <div className="font-medium text-sm">{preset.name}</div>
              <div className="text-xs opacity-70 mt-1">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Documentation Link */}
      {currentPreset?.docs && (
        <a
          href={currentPreset.docs}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <ExternalLink className="w-4 h-4" />
          View {currentPreset.name} documentation
        </a>
      )}

      {/* Base URL Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Base URL
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={currentPreset?.baseUrl || 'https://api.example.com/v1'}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none"
          disabled={selectedPreset !== 'manual'}
        />
        <p className="text-xs text-gray-500">
          {selectedPreset === 'manual'
            ? 'The base URL for the API endpoint (e.g., https://api.example.com/api/anthropic)'
            : 'Base URL is pre-configured for this provider'}
        </p>
      </div>

      {/* API Key Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Key className="w-4 h-4" />
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none"
        />
        <p className="text-xs text-gray-500">
          Using{' '}
          {selectedPreset === 'zhipu'
            ? 'Zhipu AI'
            : selectedPreset === 'minimax'
              ? 'MiniMax'
              : 'Custom'}{' '}
          API key
        </p>
      </div>

      {/* Model ID Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Server className="w-4 h-4" />
          Default Model ID
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={currentPreset?.defaultModel || 'model-id'}
          list="model-suggestions"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-blue-500 focus:outline-none"
        />
        {modelSuggestions.length > 0 && (
          <datalist id="model-suggestions">
            {modelSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion}>
                {suggestion}
              </option>
            ))}
          </datalist>
        )}
        <p className="text-xs text-gray-500">
          The model ID to use for requests (e.g., {modelSuggestions[0] || 'glm-4-plus'})
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          Save Configuration
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default CustomSettingsTab;
