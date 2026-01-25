import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkeletonPulse } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle2, AlertCircle, RefreshCw, Bot, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CliStatus } from '../shared/types';
import { OpenCodeIcon } from '@/components/ui/provider-icon';

export interface OpenCodeProviderInfo {
  id: string;
  name: string;
  authenticated: boolean;
  authMethod?: 'oauth' | 'api_key';
}

/**
 * Provider display configuration
 */
const PROVIDER_DISPLAY: Record<string, string> = {
  copilot: 'GitHub Copilot',
  'github-copilot': 'GitHub Copilot',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  google: 'Google AI',
  'amazon-bedrock': 'AWS Bedrock',
  azure: 'Azure OpenAI',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  opencode: 'OpenCode',
  xai: 'xAI',
  deepseek: 'DeepSeek',
};

function getProviderDisplayName(provider: OpenCodeProviderInfo): string {
  return PROVIDER_DISPLAY[provider.id] || provider.name || provider.id;
}

export type OpencodeAuthMethod =
  | 'api_key_env' // ANTHROPIC_API_KEY or other provider env vars
  | 'api_key' // Manually stored API key
  | 'oauth' // OAuth authentication
  | 'config_file' // Config file with credentials
  | 'none';

export interface OpencodeAuthStatus {
  authenticated: boolean;
  method: OpencodeAuthMethod;
  hasApiKey?: boolean;
  hasEnvApiKey?: boolean;
  hasOAuthToken?: boolean;
  error?: string;
}

function getAuthMethodLabel(method: OpencodeAuthMethod): string {
  switch (method) {
    case 'api_key':
      return 'API Key';
    case 'api_key_env':
      return 'API Key (Environment)';
    case 'oauth':
      return 'OAuth Authentication';
    case 'config_file':
      return 'Configuration File';
    default:
      return method || 'Unknown';
  }
}

interface OpencodeCliStatusProps {
  status: CliStatus | null;
  authStatus?: OpencodeAuthStatus | null;
  providers?: OpenCodeProviderInfo[];
  isChecking: boolean;
  onRefresh: () => void;
}

export function OpencodeCliStatusSkeleton() {
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-9 h-9 rounded-xl" />
            <SkeletonPulse className="h-6 w-36" />
          </div>
          <SkeletonPulse className="w-9 h-9 rounded-lg" />
        </div>
        <div className="ml-12">
          <SkeletonPulse className="h-4 w-80" />
        </div>
      </div>
      <div className="p-6 space-y-4">
        {/* Installation status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-40" />
            <SkeletonPulse className="h-3 w-32" />
            <SkeletonPulse className="h-3 w-48" />
          </div>
        </div>
        {/* Auth status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-28" />
            <SkeletonPulse className="h-3 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpencodeModelConfigSkeleton() {
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
          <SkeletonPulse className="w-9 h-9 rounded-xl" />
          <SkeletonPulse className="h-6 w-40" />
        </div>
        <div className="ml-12">
          <SkeletonPulse className="h-4 w-72" />
        </div>
      </div>
      <div className="p-6 space-y-6">
        {/* Default Model skeleton */}
        <div className="space-y-2">
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-10 w-full rounded-md" />
        </div>
        {/* Available Models skeleton */}
        <div className="space-y-3">
          <SkeletonPulse className="h-4 w-32" />
          {/* Provider group skeleton */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SkeletonPulse className="w-4 h-4 rounded" />
              <SkeletonPulse className="h-4 w-20" />
            </div>
            <div className="grid gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-muted/10"
                >
                  <div className="flex items-center gap-3">
                    <SkeletonPulse className="w-5 h-5 rounded" />
                    <div className="space-y-1.5">
                      <SkeletonPulse className="h-4 w-32" />
                      <SkeletonPulse className="h-3 w-48" />
                    </div>
                  </div>
                  <SkeletonPulse className="h-5 w-12 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpencodeCliStatus({
  status,
  authStatus,
  providers = [],
  isChecking,
  onRefresh,
}: OpencodeCliStatusProps) {
  const authenticatedProviders = providers.filter((p) => p.authenticated);
  if (!status) return <OpencodeCliStatusSkeleton />;

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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <OpenCodeIcon className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">OpenCode CLI</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isChecking}
            data-testid="refresh-opencode-cli"
            title="Refresh OpenCode CLI detection"
            className={cn(
              'h-9 w-9 rounded-lg',
              'hover:bg-accent/50 hover:scale-105',
              'transition-all duration-200'
            )}
          >
            {isChecking ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          OpenCode CLI provides multi-provider AI support with Claude, GPT, and Gemini models.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {status.success && status.status === 'installed' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-400">OpenCode CLI Installed</p>
                <div className="text-xs text-emerald-400/70 mt-1.5 space-y-0.5">
                  {status.method && (
                    <p>
                      Method: <span className="font-mono">{status.method}</span>
                    </p>
                  )}
                  {status.version && (
                    <p>
                      Version: <span className="font-mono">{status.version}</span>
                    </p>
                  )}
                  {status.path && (
                    <p className="truncate" title={status.path}>
                      Path: <span className="font-mono text-[10px]">{status.path}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Authentication Status - consider both direct auth and provider auth */}
            {authStatus?.authenticated || authenticatedProviders.length > 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">Authenticated</p>
                  <div className="text-xs text-emerald-400/70 mt-1.5">
                    {authStatus?.authenticated && authStatus.method !== 'none' ? (
                      <p>
                        Method:{' '}
                        <span className="font-mono">{getAuthMethodLabel(authStatus.method)}</span>
                      </p>
                    ) : authenticatedProviders.length > 0 ? (
                      <p>
                        Via {authenticatedProviders.length} connected provider
                        {authenticatedProviders.length !== 1 ? 's' : ''}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/20 shrink-0 mt-0.5">
                  <Bot className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-400">OpenCode Free Tier Ready</p>
                  <p className="text-xs text-blue-400/70 mt-1">
                    Free OpenCode models work without login. Run{' '}
                    <code className="font-mono bg-blue-500/10 px-1 rounded">
                      opencode auth login
                    </code>{' '}
                    to connect providers like GitHub Copilot, Google AI, etc.
                  </p>
                </div>
              </div>
            )}

            {/* Dynamic Providers Connected */}
            {authenticatedProviders.length > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <Cloud className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">
                    {authenticatedProviders.length} Dynamic Provider
                    {authenticatedProviders.length !== 1 ? 's' : ''} Connected
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {authenticatedProviders.map((provider) => (
                      <Badge
                        key={provider.id}
                        variant="outline"
                        className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      >
                        {getProviderDisplayName(provider)}
                        {provider.authMethod && (
                          <span className="ml-1 text-emerald-400/60">
                            ({provider.authMethod === 'oauth' ? 'OAuth' : 'Key'})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-400/60 mt-2">
                    Use{' '}
                    <code className="font-mono bg-emerald-500/10 px-1 rounded">
                      opencode auth login
                    </code>{' '}
                    to add more providers.
                  </p>
                </div>
              </div>
            )}

            {status.recommendation && (
              <p className="text-xs text-muted-foreground/70 ml-1">{status.recommendation}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">OpenCode CLI Not Detected</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  {status.recommendation || 'Install OpenCode CLI to use multi-provider AI models.'}
                </p>
              </div>
            </div>
            {status.installCommands && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground/80">Installation Commands:</p>
                <div className="space-y-2">
                  {status.installCommands.npm && (
                    <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                        npm
                      </p>
                      <code className="text-xs text-foreground/80 font-mono break-all">
                        {status.installCommands.npm}
                      </code>
                    </div>
                  )}
                  {status.installCommands.macos && (
                    <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
                        macOS/Linux
                      </p>
                      <code className="text-xs text-foreground/80 font-mono break-all">
                        {status.installCommands.macos}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
