import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Terminal, Cloud, Cpu, Brain, Github, Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type {
  OpencodeModelId,
  OpencodeProvider,
  OpencodeModelConfig,
  ModelDefinition,
} from '@automaker/types';
import { OPENCODE_MODELS, OPENCODE_MODEL_CONFIG_MAP } from '@automaker/types';
import type { OpenCodeProviderInfo } from '../cli-status/opencode-cli-status';
import {
  OpenCodeIcon,
  DeepSeekIcon,
  QwenIcon,
  NovaIcon,
  AnthropicIcon,
  OpenRouterIcon,
  MistralIcon,
  MetaIcon,
  GeminiIcon,
  OpenAIIcon,
  GrokIcon,
  getProviderIconForModel,
} from '@/components/ui/provider-icon';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

interface OpencodeModelConfigurationProps {
  enabledOpencodeModels: OpencodeModelId[];
  opencodeDefaultModel: OpencodeModelId;
  isSaving: boolean;
  onDefaultModelChange: (model: OpencodeModelId) => void;
  onModelToggle: (model: OpencodeModelId, enabled: boolean) => void;
  providers?: OpenCodeProviderInfo[];
  // Dynamic models
  dynamicModels: ModelDefinition[];
  enabledDynamicModelIds: string[];
  onDynamicModelToggle: (modelId: string, enabled: boolean) => void;
  isLoadingDynamicModels?: boolean;
}

/**
 * Returns the appropriate icon component for a given OpenCode model ID
 */
function getModelIcon(modelId: OpencodeModelId): ComponentType<{ className?: string }> {
  return getProviderIconForModel(modelId);
}

/**
 * Returns a formatted provider label for display
 */
function getProviderLabel(provider: OpencodeProvider): string {
  switch (provider) {
    case 'opencode':
      return 'OpenCode (Free)';
    default:
      return provider;
  }
}

/**
 * Configuration for dynamic provider display
 */
const DYNAMIC_PROVIDER_CONFIG: Record<
  string,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  'github-copilot': { label: 'GitHub Copilot', icon: Github },
  google: { label: 'Google AI', icon: GeminiIcon },
  openai: { label: 'OpenAI', icon: OpenAIIcon },
  openrouter: { label: 'OpenRouter', icon: OpenRouterIcon },
  anthropic: { label: 'Anthropic', icon: AnthropicIcon },
  opencode: { label: 'OpenCode (Free)', icon: Terminal },
  ollama: { label: 'Ollama (Local)', icon: Cpu },
  lmstudio: { label: 'LM Studio (Local)', icon: Cpu },
  azure: { label: 'Azure OpenAI', icon: Cloud },
  'amazon-bedrock': { label: 'AWS Bedrock', icon: Cloud },
  xai: { label: 'xAI', icon: GrokIcon },
  deepseek: { label: 'DeepSeek', icon: Brain },
};

function getDynamicProviderConfig(providerId: string) {
  return (
    DYNAMIC_PROVIDER_CONFIG[providerId] || {
      label: providerId.charAt(0).toUpperCase() + providerId.slice(1).replace(/-/g, ' '),
      icon: Cloud,
    }
  );
}

const OPENCODE_AUTH_METHOD_LABELS: Record<string, string> = {
  oauth: 'OAuth',
  api_key: 'Key',
  api: 'Key',
  key: 'Key',
};
const OPENCODE_AUTH_METHOD_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  oauth: ShieldCheck,
  api_key: KeyRound,
  api: KeyRound,
  key: KeyRound,
};
const OPENCODE_PROVIDER_FILTER_CLEAR_LABEL = 'Clear';
const OPENCODE_PROVIDER_FILTER_SEARCH_PLACEHOLDER = 'Search models...';
const OPENCODE_PROVIDER_FILTER_EMPTY_LABEL = 'No models match your filters.';
const OPENCODE_PROVIDER_FILTER_EMPTY_HINT = 'Try a different search or provider.';
const OPENCODE_PROVIDER_MODELS_EMPTY_LABEL = 'No models available yet.';
const OPENCODE_PROVIDER_MODELS_EMPTY_HINT = 'Connect or refresh OpenCode CLI to load models.';
const OPENCODE_DYNAMIC_MODELS_SECTION_LABEL = 'Dynamic Models (from OpenCode providers)';
const OPENCODE_SELECT_DYNAMIC_LABEL = 'Select all';
const OPENCODE_SELECT_STATIC_LABEL = 'Select all';
const OPENCODE_SELECT_ALL_CONTAINER_CLASS =
  'flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground';

function formatProviderAuthLabel(provider?: OpenCodeProviderInfo): string | null {
  if (!provider?.authMethod) return null;
  return OPENCODE_AUTH_METHOD_LABELS[provider.authMethod] || provider.authMethod;
}

function getProviderAuthIcon(
  provider?: OpenCodeProviderInfo
): ComponentType<{ className?: string }> | null {
  if (!provider?.authMethod) return null;
  return OPENCODE_AUTH_METHOD_ICONS[provider.authMethod] || null;
}

function getDynamicProviderBaseLabel(
  providerId: string,
  providerInfo: OpenCodeProviderInfo | undefined
): string {
  const providerConfig = getDynamicProviderConfig(providerId);
  return providerInfo?.name || providerConfig.label;
}

function getDynamicProviderLabel(
  providerId: string,
  providerInfo: OpenCodeProviderInfo | undefined
): string {
  const providerConfig = getDynamicProviderConfig(providerId);
  const baseLabel = providerInfo?.name || providerConfig.label;
  const authLabel = formatProviderAuthLabel(providerInfo);
  return authLabel ? `${baseLabel} (${authLabel})` : baseLabel;
}

function getSelectionState(
  candidateIds: string[],
  selectedIds: string[]
): boolean | 'indeterminate' {
  if (candidateIds.length === 0) return false;
  const allSelected = candidateIds.every((modelId) => selectedIds.includes(modelId));
  if (allSelected) return true;
  const anySelected = candidateIds.some((modelId) => selectedIds.includes(modelId));
  return anySelected ? 'indeterminate' : false;
}

/**
 * Group dynamic models by their provider
 */
function groupDynamicModelsByProvider(
  models: ModelDefinition[]
): Record<string, ModelDefinition[]> {
  return models.reduce(
    (acc, model) => {
      const provider = model.provider || 'unknown';
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model);
      return acc;
    },
    {} as Record<string, ModelDefinition[]>
  );
}

function matchesDynamicModelQuery(model: ModelDefinition, query: string): boolean {
  if (!query) return true;
  const haystack = `${model.name} ${model.description} ${model.id}`.toLowerCase();
  return haystack.includes(query);
}

export function OpencodeModelConfiguration({
  enabledOpencodeModels,
  opencodeDefaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
  providers,
  dynamicModels,
  enabledDynamicModelIds,
  onDynamicModelToggle,
  isLoadingDynamicModels = false,
}: OpencodeModelConfigurationProps) {
  // Group static models by provider for organized display
  const modelsByProvider = OPENCODE_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<OpencodeProvider, OpencodeModelConfig[]>
  );

  // Group dynamic models by provider
  const dynamicModelsByProvider = groupDynamicModelsByProvider(dynamicModels);
  const authenticatedProviders = (providers || []).filter((provider) => provider.authenticated);
  const [dynamicProviderFilter, setDynamicProviderFilter] = useState<string | null>(null);
  const hasInitializedDynamicProviderFilter = useRef(false);
  const [dynamicProviderSearch, setDynamicProviderSearch] = useState('');
  const normalizedDynamicSearch = dynamicProviderSearch.trim().toLowerCase();
  const hasDynamicSearch = normalizedDynamicSearch.length > 0;
  const allStaticModelIds = OPENCODE_MODELS.map((model) => model.id);
  const selectableStaticModelIds = allStaticModelIds.filter(
    (modelId) => modelId !== opencodeDefaultModel
  );
  const allDynamicModelIds = dynamicModels.map((model) => model.id);
  const hasDynamicModels = allDynamicModelIds.length > 0;
  const staticSelectState = getSelectionState(selectableStaticModelIds, enabledOpencodeModels);

  // Order: Free tier first, then Claude, then others
  const providerOrder: OpencodeProvider[] = ['opencode'];

  // Dynamic provider order (prioritize commonly used ones)
  const dynamicProviderOrder = [
    'github-copilot',
    'google',
    'openai',
    'openrouter',
    'anthropic',
    'xai',
    'deepseek',
    'ollama',
    'lmstudio',
    'azure',
    'amazon-bedrock',
    'opencode', // Skip opencode in dynamic since it's in static
  ];

  const sortedDynamicProviders = useMemo(() => {
    const providerIndex = (providerId: string) => dynamicProviderOrder.indexOf(providerId);
    const providerIds = new Set([
      ...Object.keys(dynamicModelsByProvider),
      ...(providers || []).map((provider) => provider.id),
    ]);

    providerIds.delete('opencode'); // Don't show opencode twice

    return Array.from(providerIds).sort((a, b) => {
      const aIndex = providerIndex(a);
      const bIndex = providerIndex(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [dynamicModelsByProvider, providers]);

  useEffect(() => {
    if (
      dynamicProviderFilter &&
      sortedDynamicProviders.length > 0 &&
      !sortedDynamicProviders.includes(dynamicProviderFilter)
    ) {
      setDynamicProviderFilter(sortedDynamicProviders[0]);
      return;
    }

    if (
      !hasInitializedDynamicProviderFilter.current &&
      !dynamicProviderFilter &&
      sortedDynamicProviders.length > 0
    ) {
      hasInitializedDynamicProviderFilter.current = true;
      setDynamicProviderFilter(sortedDynamicProviders[0]);
    }
  }, [dynamicProviderFilter, sortedDynamicProviders]);

  const filteredDynamicProviders = useMemo(() => {
    const baseProviders = dynamicProviderFilter ? [dynamicProviderFilter] : sortedDynamicProviders;

    if (!hasDynamicSearch) {
      return baseProviders;
    }

    return baseProviders.filter((providerId) => {
      const models = dynamicModelsByProvider[providerId] || [];
      return models.some((model) => matchesDynamicModelQuery(model, normalizedDynamicSearch));
    });
  }, [
    dynamicModelsByProvider,
    dynamicProviderFilter,
    hasDynamicSearch,
    normalizedDynamicSearch,
    sortedDynamicProviders,
  ]);

  const hasDynamicProviders = sortedDynamicProviders.length > 0;
  const showDynamicProviderFilters = sortedDynamicProviders.length > 1;
  const hasFilteredDynamicProviders = filteredDynamicProviders.length > 0;

  const toggleDynamicProviderFilter = (providerId: string) => {
    setDynamicProviderFilter((current) => (current === providerId ? current : providerId));
  };

  const toggleAllStaticModels = (checked: boolean) => {
    if (checked) {
      selectableStaticModelIds.forEach((modelId) => {
        if (!enabledOpencodeModels.includes(modelId)) {
          onModelToggle(modelId, true);
        }
      });
      return;
    }

    selectableStaticModelIds.forEach((modelId) => {
      if (enabledOpencodeModels.includes(modelId)) {
        onModelToggle(modelId, false);
      }
    });
  };

  const toggleProviderDynamicModels = (modelIds: string[], checked: boolean) => {
    if (checked) {
      modelIds.forEach((modelId) => {
        if (!enabledDynamicModelIds.includes(modelId)) {
          onDynamicModelToggle(modelId, true);
        }
      });
      return;
    }

    modelIds.forEach((modelId) => {
      if (enabledDynamicModelIds.includes(modelId)) {
        onDynamicModelToggle(modelId, false);
      }
    });
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
            <OpenCodeIcon className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Model Configuration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure which OpenCode models are available in the feature modal
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Default Model Selection */}
        <div className="space-y-2">
          <Label>Default Model</Label>
          <Select
            value={opencodeDefaultModel}
            onValueChange={(v) => onDefaultModelChange(v as OpencodeModelId)}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {enabledOpencodeModels.map((modelId) => {
                const model = OPENCODE_MODEL_CONFIG_MAP[modelId];
                if (!model) return null;
                const ModelIconComponent = getModelIcon(modelId);
                return (
                  <SelectItem key={modelId} value={modelId}>
                    <div className="flex items-center gap-2">
                      <ModelIconComponent className="w-4 h-4" />
                      <span>{model.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Available Models grouped by provider */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Available Models</Label>
            {selectableStaticModelIds.length > 0 && (
              <div className={OPENCODE_SELECT_ALL_CONTAINER_CLASS}>
                <Checkbox
                  checked={staticSelectState}
                  onCheckedChange={toggleAllStaticModels}
                  disabled={isSaving}
                />
                <span>{OPENCODE_SELECT_STATIC_LABEL}</span>
              </div>
            )}
          </div>

          {/* Static models grouped by provider (Built-in) */}
          {providerOrder.map((provider) => {
            const models = modelsByProvider[provider];
            if (!models || models.length === 0) return null;

            // Use the first model's icon as the provider icon
            const ProviderIconComponent =
              models.length > 0 ? getModelIcon(models[0].id) : OpenCodeIcon;

            return (
              <div key={provider} className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ProviderIconComponent className="w-4 h-4" />
                  <span className="font-medium">{getProviderLabel(provider)}</span>
                  {provider === 'opencode' && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-500/10 text-green-500 border-green-500/30"
                    >
                      Free
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2">
                  {models.map((model) => {
                    const isEnabled = enabledOpencodeModels.includes(model.id);
                    const isDefault = model.id === opencodeDefaultModel;

                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isEnabled}
                            onCheckedChange={(checked) => onModelToggle(model.id, !!checked)}
                            disabled={isSaving || isDefault}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{model.label}</span>
                              {model.supportsVision && (
                                <Badge variant="outline" className="text-xs">
                                  Vision
                                </Badge>
                              )}
                              {model.tier === 'free' && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-green-500/10 text-green-500 border-green-500/30"
                                >
                                  Free
                                </Badge>
                              )}
                              {isDefault && (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{model.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Dynamic models from OpenCode providers */}
          {(hasDynamicProviders || isLoadingDynamicModels) && (
            <>
              {/* Separator between static and dynamic models */}
              <div className="border-t border-border/50 my-4" />
              <div className="flex flex-wrap items-center justify-between gap-2 -mt-2 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {OPENCODE_DYNAMIC_MODELS_SECTION_LABEL}
                  </p>
                  {isLoadingDynamicModels && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Discovering...</span>
                    </div>
                  )}
                </div>
              </div>

              {showDynamicProviderFilters && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card/40 p-2">
                    {sortedDynamicProviders.map((providerId) => {
                      const providerInfo = authenticatedProviders.find(
                        (provider) => provider.id === providerId
                      );
                      const providerLabel = getDynamicProviderBaseLabel(providerId, providerInfo);
                      const providerConfig = getDynamicProviderConfig(providerId);
                      const ProviderIcon = providerConfig.icon;
                      const AuthIcon = getProviderAuthIcon(providerInfo);
                      const authLabel = formatProviderAuthLabel(providerInfo);
                      const isActive = dynamicProviderFilter === providerId;
                      const authBadgeClass = cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground/80 transition-colors',
                        isActive && 'text-accent-foreground'
                      );

                      return (
                        <Button
                          key={providerId}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleDynamicProviderFilter(providerId)}
                          className={cn('text-xs', isActive && 'bg-accent text-accent-foreground')}
                        >
                          <span className="flex items-center gap-1.5">
                            <ProviderIcon className="w-3.5 h-3.5" />
                            <span>{providerLabel}</span>
                            {AuthIcon && authLabel && (
                              <span className={authBadgeClass}>
                                <AuthIcon className="w-2.5 h-2.5" />
                                <span className="sr-only">{authLabel}</span>
                              </span>
                            )}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasDynamicProviders && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={dynamicProviderSearch}
                    onChange={(event) => setDynamicProviderSearch(event.target.value)}
                    placeholder={OPENCODE_PROVIDER_FILTER_SEARCH_PLACEHOLDER}
                    className="h-8 text-xs"
                  />
                  {dynamicProviderSearch && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDynamicProviderSearch('')}
                      className="text-xs"
                    >
                      {OPENCODE_PROVIDER_FILTER_CLEAR_LABEL}
                    </Button>
                  )}
                </div>
              )}

              {hasDynamicSearch && !hasFilteredDynamicProviders && (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium">{OPENCODE_PROVIDER_FILTER_EMPTY_LABEL}</p>
                  <p className="mt-1">{OPENCODE_PROVIDER_FILTER_EMPTY_HINT}</p>
                </div>
              )}

              {filteredDynamicProviders.map((providerId) => {
                const models = dynamicModelsByProvider[providerId] || [];
                const providerConfig = getDynamicProviderConfig(providerId);
                const providerInfo = authenticatedProviders.find(
                  (provider) => provider.id === providerId
                );
                const providerLabel = getDynamicProviderLabel(providerId, providerInfo);
                const DynamicProviderIcon = providerConfig.icon;
                const filteredModels = hasDynamicSearch
                  ? models.filter((model) =>
                      matchesDynamicModelQuery(model, normalizedDynamicSearch)
                    )
                  : models;

                if (hasDynamicSearch && filteredModels.length === 0) {
                  return null;
                }

                return (
                  <div key={`dynamic-${providerId}`} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DynamicProviderIcon className="w-4 h-4" />
                        <span className="font-medium">{providerLabel}</span>
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30"
                        >
                          Dynamic
                        </Badge>
                      </div>
                      {models.length > 0 && (
                        <div className={OPENCODE_SELECT_ALL_CONTAINER_CLASS}>
                          <Checkbox
                            checked={getSelectionState(
                              models.map((model) => model.id),
                              enabledDynamicModelIds
                            )}
                            onCheckedChange={(checked) =>
                              toggleProviderDynamicModels(
                                models.map((model) => model.id),
                                checked
                              )
                            }
                            disabled={isSaving}
                          />
                          <span>{OPENCODE_SELECT_DYNAMIC_LABEL}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2">
                      {filteredModels.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                          <p className="font-medium">{OPENCODE_PROVIDER_MODELS_EMPTY_LABEL}</p>
                          <p className="mt-1">{OPENCODE_PROVIDER_MODELS_EMPTY_HINT}</p>
                        </div>
                      ) : (
                        filteredModels.map((model) => {
                          const isEnabled = enabledDynamicModelIds.includes(model.id);

                          return (
                            <div
                              key={model.id}
                              className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isEnabled}
                                  onCheckedChange={(checked) =>
                                    onDynamicModelToggle(model.id, !!checked)
                                  }
                                  disabled={isSaving}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{model.name}</span>
                                    {model.supportsVision && (
                                      <Badge variant="outline" className="text-xs">
                                        Vision
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {model.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
