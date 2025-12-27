import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { Button } from '@/components/ui/button';
import { Key, CheckCircle2, Settings, Trash2, Loader2 } from 'lucide-react';
import { ProviderCard } from './provider-card';
import { AuthenticationStatusDisplay } from './authentication-status-display';
import { SecurityNotice } from './security-notice';
import { useApiKeyManagement } from './hooks/use-api-key-management';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';

export function ApiKeysSection() {
  const {
    apiKeys,
    setApiKeys,
    enabledProviders,
    setEnabledProviders,
    toggleProvider,
    providerToggleTouched,
  } = useAppStore();
  const { claudeAuthStatus, setClaudeAuthStatus, setSetupComplete } = useSetupStore();
  const [isDeletingAnthropicKey, setIsDeletingAnthropicKey] = useState(false);
  const navigate = useNavigate();

  const { providerConfigParams, apiKeyStatus, handleSave, saved } = useApiKeyManagement();

  const { anthropic, zai } = providerConfigParams;
  const hasAnthropicKey = Boolean(apiKeyStatus?.hasAnthropicKey || apiKeys.anthropic);
  const hasZaiKey = Boolean(apiKeyStatus?.hasZaiKey || apiKeys.zai);

  // Delete Anthropic API key
  const deleteAnthropicKey = useCallback(async () => {
    setIsDeletingAnthropicKey(true);
    try {
      const api = getElectronAPI();
      if (!api.setup?.deleteApiKey) {
        toast.error('Delete API not available');
        return;
      }

      const result = await api.setup.deleteApiKey('anthropic');
      if (result.success) {
        setApiKeys({ ...apiKeys, anthropic: '' });
        setEnabledProviders({ claude: false });
        setClaudeAuthStatus({
          authenticated: false,
          method: 'none',
          hasCredentialsFile: claudeAuthStatus?.hasCredentialsFile || false,
        });
        toast.success('Anthropic API key deleted');
      } else {
        toast.error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      toast.error('Failed to delete API key');
    } finally {
      setIsDeletingAnthropicKey(false);
    }
  }, [apiKeys, setApiKeys, claudeAuthStatus, setClaudeAuthStatus]);

  // Open setup wizard
  const openSetupWizard = useCallback(() => {
    setSetupComplete(false);
    navigate({ to: '/setup' });
  }, [setSetupComplete, navigate]);

  // Handle save with auto-enable provider on successful save
  const handleSaveWithAutoEnable = useCallback(async () => {
    await handleSave();

    // Auto-enable providers that have valid API keys
    setEnabledProviders({
      claude: Boolean(anthropic.value && anthropic.result?.success),
      zai: Boolean(zai.value && zai.result?.success),
    });
  }, [handleSave, anthropic, zai, setEnabledProviders]);

  // Auto-enable providers when a key exists and user never disabled the switch
  useEffect(() => {
    const claudeValidated = anthropic.result?.success || apiKeyStatus?.hasAnthropicKey;
    const zaiValidated = zai.result?.success || apiKeyStatus?.hasZaiKey;

    if (claudeValidated && !enabledProviders.claude && !providerToggleTouched.claude) {
      setEnabledProviders({ claude: true });
    }
    if (zaiValidated && !enabledProviders.zai && !providerToggleTouched.zai) {
      setEnabledProviders({ zai: true });
    }
  }, [
    anthropic.result,
    zai.result,
    apiKeyStatus?.hasAnthropicKey,
    apiKeyStatus?.hasZaiKey,
    enabledProviders.claude,
    enabledProviders.zai,
    providerToggleTouched.claude,
    providerToggleTouched.zai,
    setEnabledProviders,
  ]);

  // Provider configurations for cards
  const providers = [
    {
      provider: 'anthropic' as const,
      label: 'Anthropic (Claude)',
      description: 'Used for Claude AI features.',
      apiKeyLink: 'https://console.anthropic.com/settings/keys',
      apiKeyLinkText: 'Get your key at console.anthropic.com',
      enabled: enabledProviders.claude,
      onToggle: () => toggleProvider('claude'),
      apiKeyValue: anthropic.value,
      onApiKeyChange: anthropic.setValue,
      showApiKey: anthropic.show,
      onToggleApiKeyVisibility: anthropic.setShow,
      hasStoredKey: hasAnthropicKey,
      isTesting: anthropic.testing,
      onTest: anthropic.onTest,
      testResult: anthropic.result,
      inputTestId: 'anthropic-api-key-input',
      toggleTestId: 'toggle-anthropic-visibility',
      testButtonTestId: 'test-claude-connection',
      resultTestId: 'test-connection-result',
      resultMessageTestId: 'test-connection-message',
    },
    {
      provider: 'zai' as const,
      label: 'Z.ai (GLM)',
      description: 'Used for GLM-4.7 AI features.',
      apiKeyLink: 'https://open.bigmodel.cn/usercenter/apikeys',
      apiKeyLinkText: 'Get your key at open.bigmodel.cn',
      enabled: enabledProviders.zai,
      onToggle: () => toggleProvider('zai'),
      apiKeyValue: zai.value,
      onApiKeyChange: zai.setValue,
      showApiKey: zai.show,
      onToggleApiKeyVisibility: zai.setShow,
      hasStoredKey: hasZaiKey,
      isTesting: zai.testing,
      onTest: zai.onTest,
      testResult: zai.result,
      inputTestId: 'zai-api-key-input',
      toggleTestId: 'toggle-zai-visibility',
      testButtonTestId: 'test-zai-connection',
      resultTestId: 'zai-test-connection-result',
      resultMessageTestId: 'zai-test-connection-message',
    },
  ];

  return (
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Key className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">API Keys</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure your AI provider API keys. Keys are stored locally. Use the toggle to
          enable/disable providers.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Provider Cards */}
        <div className="space-y-4">
          {providers.map((provider) => (
            <ProviderCard key={provider.provider} {...provider} />
          ))}
        </div>

        {/* Authentication Status Display */}
        <AuthenticationStatusDisplay
          claudeAuthStatus={claudeAuthStatus}
          apiKeyStatus={apiKeyStatus}
          apiKeys={apiKeys}
        />

        {/* Security Notice */}
        <SecurityNotice />

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={handleSaveWithAutoEnable}
            data-testid="save-settings"
            className={cn(
              'min-w-[140px] h-10',
              'bg-gradient-to-r from-brand-500 to-brand-600',
              'hover:from-brand-600 hover:to-brand-600',
              'text-white font-medium border-0',
              'shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25',
              'transition-all duration-200 ease-out',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Saved!
              </>
            ) : (
              'Save API Keys'
            )}
          </Button>

          <Button
            onClick={openSetupWizard}
            variant="outline"
            className="h-10 border-border"
            data-testid="run-setup-wizard"
          >
            <Settings className="w-4 h-4 mr-2" />
            Run Setup Wizard
          </Button>

          {apiKeys.anthropic && (
            <Button
              onClick={deleteAnthropicKey}
              disabled={isDeletingAnthropicKey}
              variant="outline"
              className="h-10 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
              data-testid="delete-anthropic-key"
            >
              {isDeletingAnthropicKey ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Anthropic Key
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
