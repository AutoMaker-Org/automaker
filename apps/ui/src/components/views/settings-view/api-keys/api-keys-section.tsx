import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { Button } from '@/components/ui/button';
import { Key, CheckCircle2, Settings, Trash2, Loader2 } from 'lucide-react';
import { ApiKeyField } from './api-key-field';
import { buildProviderConfigs } from '@/config/api-providers';
import { SecurityNotice } from './security-notice';
import { useApiKeyManagement } from './hooks/use-api-key-management';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';

export function ApiKeysSection() {
  const { apiKeys, setApiKeys } = useAppStore();
  const { claudeAuthStatus, setClaudeAuthStatus, setSetupComplete } = useSetupStore();
  const [isDeletingAnthropicKey, setIsDeletingAnthropicKey] = useState(false);
  const navigate = useNavigate();

  const { providerConfigParams, handleSave, saved } = useApiKeyManagement();

  const providerConfigs = buildProviderConfigs(providerConfigParams);

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
          Configure your AI provider API keys. Keys are stored locally in your browser.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* API Key Fields */}
        {providerConfigs.map((provider) => (
          <ApiKeyField key={provider.key} config={provider} />
        ))}

        {/* Security Notice */}
        <SecurityNotice />

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={handleSave}
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
