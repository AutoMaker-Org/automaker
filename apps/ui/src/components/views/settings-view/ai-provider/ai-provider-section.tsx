import { Label } from '@/components/ui/label';
import { Brain, Wand2, Check, Terminal, Sparkles, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelProvider, AgentModel } from '@/store/app-store';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  OPENCODE_MODELS,
  CODEX_MODELS,
} from '@/components/views/board-view/shared/model-constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

interface AIProviderSectionProps {
  defaultProvider: ModelProvider;
  defaultModel: AgentModel;
  onProviderChange: (provider: ModelProvider) => void;
  onModelChange: (model: AgentModel) => void;
}

export function AIProviderSection({
  defaultProvider,
  defaultModel,
  onProviderChange,
  onModelChange,
}: AIProviderSectionProps) {
  const models =
    defaultProvider === 'cursor'
      ? CURSOR_MODELS
      : defaultProvider === 'codex'
        ? CODEX_MODELS
        : defaultProvider === 'opencode'
          ? OPENCODE_MODELS
          : CLAUDE_MODELS;

  // When switching providers, select the default model for that provider
  const handleProviderChange = async (provider: ModelProvider) => {
    // Update local state first
    onProviderChange(provider);
    // Set a sensible default model for the new provider
    if (provider === 'cursor') {
      onModelChange('auto');
    } else if (provider === 'codex') {
      onModelChange('gpt-5.2-codex');
    } else if (provider === 'opencode') {
      onModelChange('glm4.7');
    } else {
      onModelChange('sonnet');
    }

    // Sync with backend
    try {
      const api = getElectronAPI();
      if (api.setup && 'setDefaultProvider' in api.setup) {
        const result = await (api.setup as any).setDefaultProvider(provider);
        if (result.success) {
          const label =
            provider === 'cursor'
              ? 'Cursor'
              : provider === 'opencode'
                ? 'OpenCode CLI'
                : provider === 'codex'
                  ? 'Codex CLI'
                  : 'Claude SDK';
          toast.success(`Provider par défaut: ${label}`);
        }
      }
    } catch (error) {
      console.error('Failed to sync provider with backend:', error);
    }
  };

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
            <Sparkles className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">AI Provider</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Choose your preferred AI provider for feature implementation.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Provider Selection */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Default Provider</Label>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Cursor Card */}
            <button
              onClick={() => handleProviderChange('cursor')}
              className={cn(
                'relative p-4 rounded-xl border transition-all duration-200',
                'flex flex-col items-center gap-3 text-center',
                'hover:scale-[1.02] hover:shadow-md',
                defaultProvider === 'cursor'
                  ? 'border-purple-500/50 bg-purple-500/10 shadow-purple-500/10'
                  : 'border-border/50 hover:border-border bg-card/50'
              )}
            >
              {defaultProvider === 'cursor' && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-purple-500" />
                </div>
              )}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  defaultProvider === 'cursor' ? 'bg-purple-500/20' : 'bg-accent/50'
                )}
              >
                <Wand2
                  className={cn(
                    'w-6 h-6',
                    defaultProvider === 'cursor' ? 'text-purple-500' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">Cursor</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto mode with Claude Sonnet via Cursor CLI
                </p>
              </div>
            </button>

            {/* Codex Card */}
            <button
              onClick={() => handleProviderChange('codex')}
              className={cn(
                'relative p-4 rounded-xl border transition-all duration-200',
                'flex flex-col items-center gap-3 text-center',
                'hover:scale-[1.02] hover:shadow-md',
                defaultProvider === 'codex'
                  ? 'border-sky-500/50 bg-sky-500/10 shadow-sky-500/10'
                  : 'border-border/50 hover:border-border bg-card/50'
              )}
            >
              {defaultProvider === 'codex' && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-sky-500" />
                </div>
              )}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  defaultProvider === 'codex' ? 'bg-sky-500/20' : 'bg-accent/50'
                )}
              >
                <Terminal
                  className={cn(
                    'w-6 h-6',
                    defaultProvider === 'codex' ? 'text-sky-500' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">Codex</p>
                <p className="text-xs text-muted-foreground mt-1">
                  OpenAI Codex CLI with GPT-5.2 Codex models
                </p>
              </div>
            </button>

            {/* OpenCode Card */}
            <button
              onClick={() => handleProviderChange('opencode')}
              className={cn(
                'relative p-4 rounded-xl border transition-all duration-200',
                'flex flex-col items-center gap-3 text-center',
                'hover:scale-[1.02] hover:shadow-md',
                defaultProvider === 'opencode'
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-emerald-500/10'
                  : 'border-border/50 hover:border-border bg-card/50'
              )}
            >
              {defaultProvider === 'opencode' && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                </div>
              )}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  defaultProvider === 'opencode' ? 'bg-emerald-500/20' : 'bg-accent/50'
                )}
              >
                <Code2
                  className={cn(
                    'w-6 h-6',
                    defaultProvider === 'opencode' ? 'text-emerald-500' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">OpenCode</p>
                <p className="text-xs text-muted-foreground mt-1">GLM 4.7 free model via CLI</p>
              </div>
            </button>

            {/* Claude Card */}
            <button
              onClick={() => handleProviderChange('claude')}
              className={cn(
                'relative p-4 rounded-xl border transition-all duration-200',
                'flex flex-col items-center gap-3 text-center',
                'hover:scale-[1.02] hover:shadow-md',
                defaultProvider === 'claude'
                  ? 'border-amber-500/50 bg-amber-500/10 shadow-amber-500/10'
                  : 'border-border/50 hover:border-border bg-card/50'
              )}
            >
              {defaultProvider === 'claude' && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-amber-500" />
                </div>
              )}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  defaultProvider === 'claude' ? 'bg-amber-500/20' : 'bg-accent/50'
                )}
              >
                <Brain
                  className={cn(
                    'w-6 h-6',
                    defaultProvider === 'claude' ? 'text-amber-500' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground">Claude SDK</p>
                <p className="text-xs text-muted-foreground mt-1">Haiku, Sonnet, Opus via API</p>
              </div>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/30" />

        {/* Model Selection */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div
            className={cn(
              'w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0',
              defaultProvider === 'cursor'
                ? 'bg-purple-500/10'
                : defaultProvider === 'codex'
                  ? 'bg-sky-500/10'
                  : defaultProvider === 'opencode'
                    ? 'bg-emerald-500/10'
                    : 'bg-amber-500/10'
            )}
          >
            <Terminal
              className={cn(
                'w-5 h-5',
                defaultProvider === 'cursor'
                  ? 'text-purple-500'
                  : defaultProvider === 'codex'
                    ? 'text-sky-500'
                    : defaultProvider === 'opencode'
                      ? 'text-emerald-500'
                      : 'text-amber-500'
              )}
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Model</Label>
              <Select
                value={defaultModel}
                onValueChange={(v: string) => onModelChange(v as AgentModel)}
              >
                <SelectTrigger className="w-[180px] h-8" data-testid="default-model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        <span>{model.label}</span>
                        {model.badge && (
                          <span className="text-[10px] text-muted-foreground">({model.badge})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {models.find((m) => m.id === defaultModel)?.description ||
                'Select the default model for new features.'}
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-xl bg-accent/20 border border-border/30">
          <p className="text-xs text-muted-foreground/90 leading-relaxed">
            {defaultProvider === 'cursor' ? (
              <>
                <strong className="text-purple-400">Cursor Auto Mode</strong> automatically selects
                the best model for each task. You can also explicitly choose Claude Sonnet through
                the Cursor platform.
              </>
            ) : defaultProvider === 'codex' ? (
              <>
                <strong className="text-sky-400">Codex CLI</strong> runs locally with JSONL
                streaming, tool use, and MCP server support using GPT-5.x Codex models.
              </>
            ) : defaultProvider === 'opencode' ? (
              <>
                <strong className="text-emerald-400">OpenCode CLI</strong> uses your local
                configuration to run the free GLM 4.7 model with tool support.
              </>
            ) : (
              <>
                <strong className="text-amber-400">Claude SDK</strong> provides direct access to
                Anthropic&apos;s models with full control over thinking levels and extended context
                windows.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
