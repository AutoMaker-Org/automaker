import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertTriangle } from 'lucide-react';
import { AnthropicIcon, CursorIcon, OpenAIIcon, OpenCodeIcon } from '@/components/ui/provider-icon';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { getModelProvider } from '@automaker/types';
import type { ModelProvider, CursorModelId } from '@automaker/types';
import { CLAUDE_MODELS, CURSOR_MODELS, OPENCODE_MODELS, ModelOption } from './model-constants';
import { useEffect, useRef } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useOpencodeModels } from '@/hooks/queries';

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
    enabledOpencodeModels,
    opencodeDefaultModel,
    enabledDynamicModelIds,
    opencodeModelsLoading,
    fetchOpencodeModels,
  } = useAppStore();
  const { cursorCliStatus, codexCliStatus } = useSetupStore();

  // Use React Query for OpenCode models so changes in settings are reflected immediately
  const {
    data: dynamicOpencodeModelsList = [],
    isLoading: dynamicOpencodeLoading,
    error: dynamicOpencodeError,
    refetch: refetchOpencodeModels,
  } = useOpencodeModels();

  const selectedProvider = getModelProvider(selectedModel);

  // Check if Cursor CLI is available
  const isCursorAvailable = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  // Check if Codex CLI is available
  // @ts-expect-error - codexCliStatus uses CliStatus type but should use CodexCliStatus which has auth
  const isCodexAvailable = codexCliStatus?.installed && codexCliStatus?.auth?.authenticated;

  // Fetch Codex models on mount
  useEffect(() => {
    if (isCodexAvailable && codexModels.length === 0 && !codexModelsLoading) {
      fetchCodexModels();
    }
  }, [isCodexAvailable, codexModels.length, codexModelsLoading, fetchCodexModels]);

  // Track whether we've already attempted to fetch OpenCode models to avoid repeated retries
  const opencodeFetchTriedRef = useRef(false);

  // Fetch OpenCode models on mount if not already loaded (only once per mount)
  const isOpencodeEnabled = !disabledProviders.includes('opencode');
  useEffect(() => {
    if (
      isOpencodeEnabled &&
      !opencodeModelsLoading &&
      !dynamicOpencodeLoading &&
      dynamicOpencodeModelsList.length === 0 &&
      !opencodeFetchTriedRef.current
    ) {
      opencodeFetchTriedRef.current = true;
      fetchOpencodeModels();
    }
  }, [
    isOpencodeEnabled,
    opencodeModelsLoading,
    dynamicOpencodeLoading,
    dynamicOpencodeModelsList.length,
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

  // Filter static OpenCode models based on enabled models from global settings
  const filteredStaticOpencodeModels = OPENCODE_MODELS.filter((model) =>
    (enabledOpencodeModels as string[]).includes(model.id)
  );

  // Filter dynamic OpenCode models based on enabled dynamic model IDs
  const filteredDynamicOpencodeModels: ModelOption[] = dynamicOpencodeModelsList
    .filter((model) => enabledDynamicModelIds.includes(model.id))
    .map((model) => ({
      id: model.id,
      label: model.name,
      description: model.description,
      provider: 'opencode' as ModelProvider,
    }));

  // Combined OpenCode models (static + dynamic), deduplicating by model name
  // Static IDs use dash format (opencode-glm-5-free), dynamic use slash format (opencode/glm-5-free)
  const normalizeModelName = (id: string): string => {
    if (id.startsWith('opencode-')) return id.slice('opencode-'.length);
    if (id.startsWith('opencode/')) return id.slice('opencode/'.length);
    return id;
  };
  const staticModelNames = new Set(
    filteredStaticOpencodeModels.map((m) => normalizeModelName(m.id))
  );
  const uniqueDynamicModels = filteredDynamicOpencodeModels.filter(
    (m) => !staticModelNames.has(normalizeModelName(m.id))
  );
  const allOpencodeModels = [...filteredStaticOpencodeModels, ...uniqueDynamicModels];

  // Filter Cursor models based on enabled models from global settings
  const filteredCursorModels = CURSOR_MODELS.filter((model) => {
    // enabledCursorModels stores CursorModelIds which may or may not have "cursor-" prefix
    // (e.g., 'auto', 'sonnet-4.5' without prefix, but 'cursor-gpt-5.2' with prefix)
    // CURSOR_MODELS always has the "cursor-" prefix added in model-constants.ts
    // Check both the full ID (for GPT models) and the unprefixed version (for non-GPT models)
    const unprefixedId = model.id.startsWith('cursor-') ? model.id.slice(7) : model.id;
    return (
      enabledCursorModels.includes(model.id as CursorModelId) ||
      enabledCursorModels.includes(unprefixedId as CursorModelId)
    );
  });

  const handleProviderChange = (provider: ModelProvider) => {
    if (provider === 'cursor' && selectedProvider !== 'cursor') {
      // Switch to Cursor's default model (from global settings)
      // cursorDefaultModel is now canonical (e.g., 'cursor-auto'), so use directly
      onModelSelect(cursorDefaultModel);
    } else if (provider === 'codex' && selectedProvider !== 'codex') {
      // Switch to Codex's default model (use isDefault flag from dynamic models)
      const defaultModel = codexModels.find((m) => m.isDefault);
      const defaultModelId = defaultModel?.id || codexModels[0]?.id || 'codex-gpt-5.2-codex';
      onModelSelect(defaultModelId);
    } else if (provider === 'claude' && selectedProvider !== 'claude') {
      // Switch to Claude's default model (canonical format)
      onModelSelect('claude-sonnet');
    } else if (provider === 'opencode' && selectedProvider !== 'opencode') {
      // Switch to OpenCode's default model (prefer configured default if it is actually enabled)
      const isDefaultModelAvailable =
        opencodeDefaultModel && allOpencodeModels.some((m) => m.id === opencodeDefaultModel);
      const defaultModelId = isDefaultModelAvailable
        ? opencodeDefaultModel
        : allOpencodeModels[0]?.id;
      if (defaultModelId) {
        onModelSelect(defaultModelId);
      }
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
    !isCodexDisabled && 'codex',
    !isOpencodeDisabled && 'opencode',
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
                OpenCode
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
              <Spinner size="sm" />
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

      {/* OpenCode Models */}
      {selectedProvider === 'opencode' && !isOpencodeDisabled && (
        <div className="space-y-3">
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
          {(opencodeModelsLoading || dynamicOpencodeLoading) && allOpencodeModels.length === 0 && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Loading models...
            </div>
          )}

          {/* Error state */}
          {dynamicOpencodeError && !dynamicOpencodeLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm text-red-400">Failed to load OpenCode models</div>
                <button
                  type="button"
                  onClick={() => refetchOpencodeModels()}
                  className="text-xs text-red-400 underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!opencodeModelsLoading &&
            !dynamicOpencodeLoading &&
            !dynamicOpencodeError &&
            allOpencodeModels.length === 0 && (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                No OpenCode models enabled. Enable models in Settings → AI Providers.
              </div>
            )}

          {/* Model list */}
          {!opencodeModelsLoading && !dynamicOpencodeLoading && allOpencodeModels.length > 0 && (
            <div className="flex flex-col gap-2">
              {allOpencodeModels.map((option) => {
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
