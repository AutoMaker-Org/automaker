import { Label } from '@/components/ui/label';
import { Brain, Wand2, Code2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentModel, ModelProvider } from '@/store/app-store';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  OPENCODE_MODELS,
  CODEX_MODELS,
  ModelOption,
} from './model-constants';

interface ModelSelectorProps {
  selectedModel: AgentModel;
  onModelSelect: (model: AgentModel) => void;
  selectedProvider?: ModelProvider;
  onProviderSelect?: (provider: ModelProvider) => void;
  testIdPrefix?: string;
  showProviderSelector?: boolean;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  selectedProvider,
  onProviderSelect,
  testIdPrefix = 'model-select',
  showProviderSelector = true,
}: ModelSelectorProps) {
  const inferProvider = (): ModelProvider => {
    if (CODEX_MODELS.some((model) => model.id === selectedModel)) {
      return 'codex';
    }
    if (OPENCODE_MODELS.some((model) => model.id === selectedModel)) {
      return 'opencode';
    }
    if (CURSOR_MODELS.some((model) => model.id === selectedModel)) {
      return 'cursor';
    }
    if (CLAUDE_MODELS.some((model) => model.id === selectedModel)) {
      return 'claude';
    }

    const lowerModel = selectedModel.toLowerCase?.() ?? '';
    if (lowerModel.startsWith('gpt-') || /^o\d/.test(lowerModel)) {
      return 'codex';
    }
    if (lowerModel.startsWith('glm') || lowerModel === 'opencode') {
      return 'opencode';
    }
    if (lowerModel === 'auto' || lowerModel.startsWith('cursor-')) {
      return 'cursor';
    }
    return 'claude';
  };

  const resolvedProvider = selectedProvider ?? inferProvider();

  const providerMeta: Record<
    ModelProvider,
    { models: ModelOption[]; icon: typeof Brain; label: string; tag: string }
  > = {
    cursor: { models: CURSOR_MODELS, icon: Wand2, label: 'Cursor (CLI)', tag: 'CLI' },
    codex: { models: CODEX_MODELS, icon: Terminal, label: 'Codex (CLI)', tag: 'CLI' },
    claude: { models: CLAUDE_MODELS, icon: Brain, label: 'Claude (SDK)', tag: 'SDK' },
    opencode: { models: OPENCODE_MODELS, icon: Code2, label: 'OpenCode (CLI)', tag: 'CLI' },
  };

  const {
    models,
    icon: ProviderIcon,
    label: providerLabel,
    tag: providerTag,
  } = providerMeta[resolvedProvider];

  return (
    <div className="space-y-3">
      {/* Provider Selection */}
      {showProviderSelector && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              onProviderSelect?.('cursor');
              onModelSelect('auto');
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
              resolvedProvider === 'cursor'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-provider-cursor`}
          >
            <Wand2 className="w-4 h-4" />
            Cursor
          </button>
          <button
            type="button"
            onClick={() => {
              onProviderSelect?.('codex');
              onModelSelect('gpt-5.2-codex');
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
              resolvedProvider === 'codex'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-provider-codex`}
          >
            <Terminal className="w-4 h-4" />
            Codex
          </button>
          <button
            type="button"
            onClick={() => {
              onProviderSelect?.('opencode');
              onModelSelect('glm4.7');
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
              resolvedProvider === 'opencode'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-provider-opencode`}
          >
            <Code2 className="w-4 h-4" />
            OpenCode
          </button>
          <button
            type="button"
            onClick={() => {
              onProviderSelect?.('claude');
              onModelSelect('opus');
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
              resolvedProvider === 'claude'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-provider-claude`}
          >
            <Brain className="w-4 h-4" />
            Claude
          </button>
        </div>
      )}

      {/* Model Selection */}
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <ProviderIcon className="w-4 h-4 text-primary" />
          {providerLabel}
        </Label>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
          {providerTag}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {models.map((option) => {
          const isSelected = selectedModel === option.id;
          const shortName = option.label.replace('Claude ', '').replace('Cursor ', '');
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModelSelect(option.id)}
              title={option.description}
              className={cn(
                'flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-input'
              )}
              data-testid={`${testIdPrefix}-${option.id}`}
            >
              {shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
