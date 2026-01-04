import { Label } from '@/components/ui/label';
import { Brain, Wand2, Terminal, Sparkles, Code2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelProvider, AgentModel } from '@/store/app-store';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  OPENCODE_MODELS,
  CODEX_MODELS,
} from '@/components/views/board-view/shared/model-constants';
import { resolveModelString } from '@automaker/model-resolver';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { ProviderCard } from './provider-card';

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
  const normalizedDefaultModel = resolveModelString(defaultModel);
  const models =
    defaultProvider === 'cursor'
      ? CURSOR_MODELS
      : defaultProvider === 'codex'
        ? CODEX_MODELS
        : defaultProvider === 'opencode'
          ? OPENCODE_MODELS
          : CLAUDE_MODELS;

  const providers: Array<{
    id: ModelProvider;
    icon: LucideIcon;
    label: string;
    description: string;
    color: 'purple' | 'sky' | 'emerald' | 'amber';
  }> = [
    {
      id: 'cursor',
      icon: Wand2,
      label: 'Cursor',
      description: 'Auto mode with Claude Sonnet via Cursor CLI',
      color: 'purple',
    },
    {
      id: 'codex',
      icon: Terminal,
      label: 'Codex',
      description: 'OpenAI Codex CLI with GPT-5.2 Codex models',
      color: 'sky',
    },
    {
      id: 'opencode',
      icon: Code2,
      label: 'OpenCode',
      description: 'GLM 4.7 free model via CLI',
      color: 'emerald',
    },
    {
      id: 'claude',
      icon: Brain,
      label: 'Claude SDK',
      description: 'Haiku, Sonnet, Opus via API',
      color: 'amber',
    },
  ];

  // When switching providers, select the default model for that provider
  const handleProviderChange = async (provider: ModelProvider) => {
    // Update local state first
    onProviderChange(provider);
    // Set a sensible default model for the new provider
    if (provider === 'cursor') {
      onModelChange(resolveModelString('auto') as AgentModel);
    } else if (provider === 'codex') {
      onModelChange(resolveModelString('gpt-5.2-codex') as AgentModel);
    } else if (provider === 'opencode') {
      onModelChange(resolveModelString('glm4.7') as AgentModel);
    } else {
      onModelChange(resolveModelString('sonnet') as AgentModel);
    }

    // Sync with backend
    try {
      const api = getElectronAPI();
      if (api.setup?.setDefaultProvider) {
        const result = await api.setup.setDefaultProvider(provider);
        if (result.success) {
          const label =
            provider === 'cursor'
              ? 'Cursor'
              : provider === 'opencode'
                ? 'OpenCode CLI'
                : provider === 'codex'
                  ? 'Codex CLI'
                  : 'Claude SDK';
          toast.success(`Default provider: ${label}`);
        }
      }
    } catch (error) {
      console.error('Failed to sync provider with backend:', error);
      toast.error('Failed to update provider. Please try again.');
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
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                icon={provider.icon}
                label={provider.label}
                description={provider.description}
                color={provider.color}
                isSelected={defaultProvider === provider.id}
                onClick={() => handleProviderChange(provider.id)}
              />
            ))}
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
                value={normalizedDefaultModel}
                onValueChange={(v: string) => onModelChange(resolveModelString(v) as AgentModel)}
              >
                <SelectTrigger className="w-[180px] h-8" data-testid="default-model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={resolveModelString(model.id)}>
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
              {models.find((m) => resolveModelString(m.id) === normalizedDefaultModel)
                ?.description || 'Select the default model for new features.'}
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
