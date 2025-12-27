import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderKey } from '@/config/api-providers';

interface ProviderCardProps {
  provider: ProviderKey;
  label: string;
  icon: React.ReactNode;
  description: string;
  apiKeyLink: string;
  apiKeyLinkText: string;
  enabled: boolean;
  onToggle: () => void;
  apiKeyValue: string;
  onApiKeyChange: (value: string) => void;
  showApiKey: boolean;
  onToggleApiKeyVisibility: () => void;
  hasStoredKey: string | null | undefined;
  isTesting: boolean;
  onTest: () => void;
  testResult: { success: boolean; message: string } | null;
  inputTestId: string;
  toggleTestId: string;
  testButtonTestId: string;
  resultTestId: string;
  resultMessageTestId: string;
}

const providerIcons: Record<ProviderKey, React.ReactNode> = {
  anthropic: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.304 3.541l-5.31 8.76-4.553-8.76H3.61l5.31 9.018-6.396 10.28h4.223l3.846-6.568 3.846 6.568h3.846l-6.283-10.28L17.304 3.54h-.716v.001z" />
    </svg>
  ),
  zai: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  google: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
};

export function ProviderCard({
  provider,
  label,
  icon,
  description,
  apiKeyLink,
  apiKeyLinkText,
  enabled,
  onToggle,
  apiKeyValue,
  onApiKeyChange,
  showApiKey,
  onToggleApiKeyVisibility,
  hasStoredKey,
  isTesting,
  onTest,
  testResult,
  inputTestId,
  toggleTestId,
  testButtonTestId,
  resultTestId,
  resultMessageTestId,
}: ProviderCardProps) {
  const providerIcon = icon || providerIcons[provider];

  const isKeyReady = Boolean(hasStoredKey && (enabled || testResult?.success));

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        'bg-card/50 backdrop-blur-sm',
        enabled ? 'border-border/60' : 'border-border/30 opacity-60'
      )}
    >
      <div className="p-4 space-y-4">
        {/* Header with name and toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                provider === 'anthropic' && 'bg-orange-500/10 text-orange-500',
                provider === 'zai' && 'bg-blue-500/10 text-blue-500',
                provider === 'google' && 'bg-green-500/10 text-green-500'
              )}
            >
              {providerIcon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{label}</h3>
                {hasStoredKey && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
              </div>
              <p
                className={cn(
                  'text-xs',
                  enabled ? 'text-muted-foreground' : 'text-muted-foreground/70'
                )}
              >
                {enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            data-testid={`${provider}-toggle`}
            disabled={!isKeyReady}
          />
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor={inputTestId} className="text-foreground text-sm">
            API Key
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={inputTestId}
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyValue}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'Your API key'}
                className="pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                data-testid={inputTestId}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-50"
                onClick={onToggleApiKeyVisibility}
                data-testid={toggleTestId}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onTest}
              disabled={!apiKeyValue || isTesting}
              className="bg-secondary hover:bg-accent text-secondary-foreground border border-border disabled:opacity-50"
              data-testid={testButtonTestId}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
          <p className="text-xs text-muted-foreground">
            {description}{' '}
            <a
              href={apiKeyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-500 hover:text-brand-400 hover:underline"
            >
              {apiKeyLinkText}
            </a>
          </p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              testResult.success
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            )}
            data-testid={resultTestId}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm" data-testid={resultMessageTestId}>
              {testResult.message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
