import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProviderToggle } from './provider-toggle';
import { Spinner } from '@/components/ui/spinner';
import {
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Zap,
  ExternalLink,
  Info,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';

/** Available Kimi models via OpenRouter */
const KIMI_MODELS = [
  { id: 'kimi-k2.5', name: 'Kimi K2.5', description: 'Latest model - fast and capable' },
  { id: 'kimi-k1.5', name: 'Kimi K1.5', description: 'Balanced performance' },
  { id: 'kimi-k1.5-long', name: 'Kimi K1.5 Long', description: 'Extended context window' },
] as const;

type KimiModelId = (typeof KIMI_MODELS)[number]['id'];

export function KimiSettingsTab() {
  const { apiKeys, setApiKeys } = useAppStore();

  // Local state for API key input
  const [apiKeyValue, setApiKeyValue] = useState(apiKeys.openrouter || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Model selection state
  const [selectedModel, setSelectedModel] = useState<KimiModelId>('kimi-k2.5');

  // Validate API key format (OpenRouter keys start with sk-or-)
  const isValidKeyFormat = (key: string) => {
    return key.startsWith('sk-or-') || key.length === 0;
  };

  // Test connection to OpenRouter
  const handleTestConnection = useCallback(async () => {
    if (!apiKeyValue) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const api = getElectronAPI();
      if (api?.setup?.testOpenRouterConnection) {
        const result = await api.setup.testOpenRouterConnection(apiKeyValue);
        setTestResult({
          success: result.success,
          message: result.success
            ? 'Successfully connected to OpenRouter!'
            : result.error || 'Failed to connect to OpenRouter',
        });
      } else {
        // Fallback: test via direct API call
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKeyValue}`,
            'HTTP-Referer': 'https://automaker.app',
            'X-Title': 'Automaker',
          },
        });

        if (response.ok) {
          setTestResult({
            success: true,
            message: 'Successfully connected to OpenRouter!',
          });
        } else {
          const error = await response.json().catch(() => ({}));
          setTestResult({
            success: false,
            message: error.error?.message || `Connection failed: ${response.status}`,
          });
        }
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to test connection',
      });
    } finally {
      setIsTesting(false);
    }
  }, [apiKeyValue]);

  // Save API key
  const handleSave = useCallback(async () => {
    if (!apiKeyValue) return;

    if (!isValidKeyFormat(apiKeyValue)) {
      toast.error('Invalid API key format. OpenRouter keys should start with "sk-or-"');
      return;
    }

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.saveApiKey) {
        const result = await api.setup.saveApiKey('openrouter', apiKeyValue);
        if (result.success) {
          setApiKeys({ ...apiKeys, openrouter: apiKeyValue });
          toast.success('OpenRouter API key saved');
        } else {
          toast.error(result.error || 'Failed to save API key');
        }
      } else {
        // Fallback: save to store directly
        setApiKeys({ ...apiKeys, openrouter: apiKeyValue });
        toast.success('OpenRouter API key saved');
      }
    } catch (error) {
      toast.error('Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  }, [apiKeyValue, apiKeys, setApiKeys]);

  // Delete API key
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.deleteApiKey) {
        const result = await api.setup.deleteApiKey('openrouter');
        if (result.success) {
          setApiKeys({ ...apiKeys, openrouter: '' });
          setApiKeyValue('');
          setTestResult(null);
          toast.success('OpenRouter API key deleted');
        } else {
          toast.error(result.error || 'Failed to delete API key');
        }
      } else {
        // Fallback: clear from store directly
        setApiKeys({ ...apiKeys, openrouter: '' });
        setApiKeyValue('');
        setTestResult(null);
        toast.success('OpenRouter API key deleted');
      }
    } catch (error) {
      toast.error('Failed to delete API key');
    } finally {
      setIsDeleting(false);
    }
  }, [apiKeys, setApiKeys]);

  const hasStoredKey = !!apiKeys.openrouter;

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="kimi" providerLabel="Kimi" />

      {/* Provider Info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
        <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="text-sm text-purple-400/90">
          <span className="font-medium">Kimi via OpenRouter</span>
          <p className="text-xs text-purple-400/70 mt-1">
            Access Moonshot AI's Kimi models through OpenRouter. Supports tool use and long context
            windows.
          </p>
        </div>
      </div>

      {/* API Key Section */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
              <Key className="w-5 h-5 text-purple-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              OpenRouter API Key
            </h2>
            {hasStoredKey && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Required for accessing Kimi models via OpenRouter.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* API Key Input */}
          <div className="space-y-3">
            <Label htmlFor="openrouter-key" className="text-foreground">
              API Key
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="openrouter-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyValue}
                  onChange={(e) => {
                    setApiKeyValue(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="sk-or-..."
                  className={cn(
                    'pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground',
                    apiKeyValue && !isValidKeyFormat(apiKeyValue) && 'border-yellow-500/50'
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestConnection}
                disabled={!apiKeyValue || isTesting}
                className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
              >
                {isTesting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Test
                  </>
                )}
              </Button>
            </div>

            {/* Format warning */}
            {apiKeyValue && !isValidKeyFormat(apiKeyValue) && (
              <p className="text-xs text-yellow-500">
                ⚠️ OpenRouter API keys typically start with "sk-or-"
              </p>
            )}

            {/* Description */}
            <p className="text-xs text-muted-foreground">
              Get your API key at{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-500 hover:text-purple-400 hover:underline inline-flex items-center gap-1"
              >
                openrouter.ai/keys
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>

            {/* Test Result */}
            {testResult && (
              <div
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg',
                  testResult.success
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!apiKeyValue || isSaving}
              className={cn(
                'min-w-[120px] h-10',
                'bg-gradient-to-r from-purple-500 to-purple-600',
                'hover:from-purple-600 hover:to-purple-600',
                'text-white font-medium border-0',
                'shadow-md shadow-purple-500/20 hover:shadow-lg hover:shadow-purple-500/25',
                'transition-all duration-200 ease-out',
                'hover:scale-[1.02] active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save API Key'
              )}
            </Button>

            {hasStoredKey && (
              <Button
                onClick={handleDelete}
                disabled={isDeleting}
                variant="outline"
                className="h-10 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
              >
                {isDeleting ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete Key
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Model Selection</h2>
          <p className="text-sm text-muted-foreground/80 mt-1">
            Choose the default Kimi model for agent tasks.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <Label htmlFor="kimi-model" className="text-foreground">
              Default Model
            </Label>
            <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as KimiModelId)}>
              <SelectTrigger className="w-full bg-input border-border">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {KIMI_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Info */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Kimi K2.5 is recommended for
              most tasks. Use K1.5 Long for documents requiring extended context.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KimiSettingsTab;
