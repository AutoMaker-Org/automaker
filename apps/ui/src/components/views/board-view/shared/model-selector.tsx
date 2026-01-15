// @ts-nocheck
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertTriangle } from 'lucide-react';
import { AnthropicIcon, CursorIcon, OpenAIIcon, OpenCodeIcon } from '@/components/ui/provider-icon';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { getModelProvider, PROVIDER_PREFIXES } from '@automaker/types';
import type { ModelProvider } from '@automaker/types';
import { CLAUDE_MODELS, CURSOR_MODELS, ModelOption } from './model-constants';
import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: string; // Can be ModelAlias or "cursor-{id}"
  onModelSelect: (model: string) => void;
  testIdPrefix?: string;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  testIdPrefix = 'model-select',
}: ModelSelectorProps) {
  const {
    enabledCursorModels,
    cursorDefaultModel,
    codexModels,
    codexModelsLoading,
    codexModelsError,
    fetchCodexModels,
    disabledProviders,
    dynamicOpencodeModels,
    opencodeModelsLoading,
    opencodeModelsError,
    fetchOpencodeModels,
  } = useAppStore();
  const { cursorCliStatus, codexCliStatus, opencodeCliStatus } = useSetupStore();

  const selectedProvider = getModelProvider(selectedModel);

  // Check if Cursor CLI is available
  const isCursorAvailable = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  // Check if Codex CLI is available
  const isCodexAvailable = codexCliStatus?.installed && codexCliStatus?.auth?.authenticated;

  // Check if OpenCode CLI is available
  const isOpencodeAvailable =
    opencodeCliStatus?.installed && opencodeCliStatus?.auth?.authenticated;

  // Fetch Codex models on mount
  useEffect(() => {
    if (isCodexAvailable && codexModels.length === 0 && !codexModelsLoading) {
      fetchCodexModels();
    }
  }, [isCodexAvailable, codexModels.length, codexModelsLoading, fetchCodexModels]);

  // Fetch OpenCode models on mount
  useEffect(() => {
    if (isOpencodeAvailable && dynamicOpencodeModels.length === 0 && !opencodeModelsLoading) {
      fetchOpencodeModels();
    }
  }, [
    isOpencodeAvailable,
    dynamicOpencodeModels.length,
    opencodeModelsLoading,
    fetchOpencodeModels,
  ]);

  // Transform codex models from store to ModelOption format
  const dynamicCodexModels: ModelOption[] = codexModels.map((model) => {
    // Infer badge based on tier
    let badge: string | undefined;
    if (model.tier === 'premium') badge = 'Premium';
    else if (model.tier === 'basic') badge = 'Speed';
    else if (model.tier === 'standard') badge = 'Balanced';

    return {
      id: model.id,
      label: model.label,
      description: model.description,
      badge,
      provider: 'codex' as ModelProvider,
      hasThinking: model.hasThinking,
    };
  });

  // Transform opencode models from store to ModelOption format
  const transformedOpencodeModels: ModelOption[] = dynamicOpencodeModels.map((model) => {
    // Infer badge based on tier
    let badge: string | undefined;
    if (model.tier === 'premium') badge = 'Premium';
    else if (model.tier === 'basic') badge = 'Free';
    else if (model.tier === 'standard') badge = 'Balanced';

    return {
      id: model.id,
      label: model.name,
      description: model.description || '',
      badge,
      provider: 'opencode' as ModelProvider,
      hasThinking: false,
    };
  });

  // Filter Cursor models based on enabled models from global settings
  const filteredCursorModels = CURSOR_MODELS.filter((model) => {
    // Compare model.id directly since both model.id and enabledCursorModels use full IDs with prefix
    return enabledCursorModels.includes(model.id as any);
  });

  const handleProviderChange = (provider: ModelProvider) => {
    if (provider === 'cursor' && selectedProvider !== 'cursor') {
      // Switch to Cursor's default model (from global settings)
      onModelSelect(`${PROVIDER_PREFIXES.cursor}${cursorDefaultModel}`);
    } else if (provider === 'codex' && selectedProvider !== 'codex') {
      // Switch to Codex's default model (use isDefault flag from dynamic models)
      const defaultModel = codexModels.find((m) => m.isDefault);
      const defaultModelId = defaultModel?.id || codexModels[0]?.id || 'codex-gpt-5.2-codex';
      onModelSelect(defaultModelId);
    } else if (provider === 'opencode' && selectedProvider !== 'opencode') {
      // Switch to OpenCode's default model
      const defaultModel = dynamicOpencodeModels.find((m) => m.default);
      const defaultModelId =
        defaultModel?.id || dynamicOpencodeModels[0]?.id || 'opencode/big-pickle';
      onModelSelect(defaultModelId);
    } else if (provider === 'claude' && selectedProvider !== 'claude') {
      // Switch to Claude's default model
      onModelSelect('sonnet');
    }
  };

  // Check which providers are disabled
  const isClaudeDisabled = disabledProviders.includes('claude');
  const isCursorDisabled = disabledProviders.includes('cursor');
  const isCodexDisabled = disabledProviders.includes('codex');
  const isOpencodeDisabled = disabledProviders.includes('opencode');

  // Count available providers
  const availableProviders = [
    !isClaudeDisabled && 'claude',
    !isCursorDisabled && 'cursor',
    !isOpencodeDisabled && 'opencode',
    !isCodexDisabled && 'codex',
  ].filter(Boolean) as ModelProvider[];

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      {availableProviders.length > 1 && (
        <div className="space-y-2">
          <Label>AI Provider</Label>
          <div className="flex gap-2">
            {!isClaudeDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('claude')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'claude'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-claude`}
              >
                <AnthropicIcon className="w-4 h-4" />
                Claude
              </button>
            )}
            {!isCursorDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('cursor')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'cursor'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-cursor`}
              >
                <CursorIcon className="w-4 h-4" />
                Cursor CLI
              </button>
            )}
            {!isOpencodeDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('opencode')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'opencode'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-opencode`}
              >
                <OpenCodeIcon className="w-4 h-4" />
                OpenCode CLI
              </button>
            )}
            {!isCodexDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('codex')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'codex'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-codex`}
              >
                <OpenAIIcon className="w-4 h-4" />
                Codex CLI
              </button>
            )}
          </div>
        </div>
      )}

      {/* Claude Models */}
      {selectedProvider === 'claude' && !isClaudeDisabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Claude Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              Native SDK
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CLAUDE_MODELS.map((option) => {
              const isSelected = selectedModel === option.id;
              const shortName = option.label.replace('Claude ', '');
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
      )}

      {/* Cursor Models */}
      {selectedProvider === 'cursor' && !isCursorDisabled && (
        <div className="space-y-3">
          {/* Warning when Cursor CLI is not available */}
          {!isCursorAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                Cursor CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <CursorIcon className="w-4 h-4 text-primary" />
              Cursor Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400">
              CLI
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredCursorModels.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                No Cursor models enabled. Enable models in Settings → AI Providers.
              </div>
            ) : (
              filteredCursorModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <div className="flex gap-1">
                      {option.hasThinking && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                          )}
                        >
                          Thinking
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* OpenCode Models */}
      {selectedProvider === 'opencode' && (
        <div className="space-y-3">
          {/* Warning when OpenCode CLI is not available */}
          {!isOpencodeAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                OpenCode CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <OpenCodeIcon className="w-4 h-4 text-primary" />
              OpenCode Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-violet-500/40 text-violet-600 dark:text-violet-400">
              CLI
            </span>
          </div>

          {/* Loading state */}
          {opencodeModelsLoading && transformedOpencodeModels.length === 0 && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading models...
            </div>
          )}

          {/* Error state */}
          {opencodeModelsError && !opencodeModelsLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm text-red-400">Failed to load OpenCode models</div>
                <button
                  type="button"
                  onClick={() => fetchOpencodeModels(true)}
                  className="text-xs text-red-400 underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Model list */}
          {!opencodeModelsLoading &&
            !opencodeModelsError &&
            transformedOpencodeModels.length === 0 && (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                No OpenCode models available. Make sure you're logged in with GitHub Copilot or
                other providers.
              </div>
            )}

          {!opencodeModelsLoading && transformedOpencodeModels.length > 0 && (
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
              {transformedOpencodeModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span className="truncate">{option.label}</span>
                    <div className="flex gap-1 shrink-0">
                      {option.badge && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : option.badge === 'Free'
                                ? 'border-green-500/50 text-green-600 dark:text-green-400'
                                : 'border-muted-foreground/50 text-muted-foreground'
                          )}
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Codex Models */}
      {selectedProvider === 'codex' && !isCodexDisabled && (
        <div className="space-y-3">
          {/* Warning when Codex CLI is not available */}
          {!isCodexAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                Codex CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <OpenAIIcon className="w-4 h-4 text-primary" />
              Codex Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              CLI
            </span>
          </div>

          {/* Loading state */}
          {codexModelsLoading && dynamicCodexModels.length === 0 && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading models...
            </div>
          )}

          {/* Error state */}
          {codexModelsError && !codexModelsLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm text-red-400">Failed to load Codex models</div>
                <button
                  type="button"
                  onClick={() => fetchCodexModels(true)}
                  className="text-xs text-red-400 underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Model list */}
          {!codexModelsLoading && !codexModelsError && dynamicCodexModels.length === 0 && (
            <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
              No Codex models available
            </div>
          )}

          {!codexModelsLoading && dynamicCodexModels.length > 0 && (
            <div className="flex flex-col gap-2">
              {dynamicCodexModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <div className="flex gap-1">
                      {option.hasThinking && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          Thinking
                        </Badge>
                      )}
                      {option.badge && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-muted-foreground/50 text-muted-foreground'
                          )}
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
