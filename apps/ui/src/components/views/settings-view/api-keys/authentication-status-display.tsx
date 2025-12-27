import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Info, Terminal } from 'lucide-react';
import type { ClaudeAuthStatus } from '@/store/setup-store';

interface AuthenticationStatusDisplayProps {
  claudeAuthStatus: ClaudeAuthStatus | null;
  apiKeyStatus: {
    hasAnthropicKey: boolean;
    hasGoogleKey: boolean;
    hasZaiKey: boolean;
  } | null;
  apiKeys: {
    anthropic: string;
    google: string;
    zai: string;
  };
}

export function AuthenticationStatusDisplay({
  claudeAuthStatus,
  apiKeyStatus,
  apiKeys,
}: AuthenticationStatusDisplayProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-brand-500" />
        <Label className="text-foreground font-semibold">
          Current Authentication Configuration
        </Label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claude Authentication Status */}
        <div className="p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <Terminal className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-medium text-foreground">Claude (Anthropic)</span>
          </div>
          <div className="space-y-1.5 text-xs min-h-12">
            {claudeAuthStatus?.authenticated ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-green-400 font-medium">Authenticated</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>
                    {claudeAuthStatus.method === 'oauth_token'
                      ? 'Using stored OAuth token (subscription)'
                      : claudeAuthStatus.method === 'api_key_env'
                        ? 'Using ANTHROPIC_API_KEY'
                        : claudeAuthStatus.method === 'api_key'
                          ? 'Using stored API key'
                          : claudeAuthStatus.method === 'credentials_file'
                            ? 'Using credentials file'
                            : claudeAuthStatus.method === 'cli_authenticated'
                              ? 'Using Claude CLI authentication'
                              : `Using ${claudeAuthStatus.method || 'detected'} authentication`}
                  </span>
                </div>
              </>
            ) : apiKeyStatus?.hasAnthropicKey ? (
              <div className="flex items-center gap-2 text-blue-400">
                <Info className="w-3 h-3 shrink-0" />
                <span>Using environment variable (ANTHROPIC_API_KEY)</span>
              </div>
            ) : apiKeys.anthropic ? (
              <div className="flex items-center gap-2 text-blue-400">
                <Info className="w-3 h-3 shrink-0" />
                <span>Using manual API key from settings</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-yellow-500 py-0.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="text-xs">Not configured</span>
              </div>
            )}
          </div>
        </div>

        {/* Z.ai Authentication Status */}
        <div className="p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <Terminal className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-medium text-foreground">Z.ai (GLM)</span>
          </div>
          <div className="space-y-1.5 text-xs min-h-12">
            {apiKeyStatus?.hasZaiKey || apiKeys.zai ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-green-400 font-medium">Configured</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>
                    {apiKeyStatus?.hasZaiKey
                      ? 'Using environment variable (ZAI_API_KEY)'
                      : 'Using manual API key from settings'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-yellow-500 py-0.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="text-xs">Not configured</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
