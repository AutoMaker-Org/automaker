import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Terminal, Cloud, Cpu, Brain, Sparkles, Zap, Github, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  OpencodeModelId,
  OpencodeProvider,
  OpencodeModelConfig,
  ModelDefinition,
} from '@automaker/types';
import { OPENCODE_MODELS, OPENCODE_MODEL_CONFIG_MAP } from '@automaker/types';
import {
  OpenCodeIcon,
  DeepSeekIcon,
  QwenIcon,
  NovaIcon,
  AnthropicIcon,
  MistralIcon,
  MetaIcon,
  GeminiIcon,
  OpenAIIcon,
  GrokIcon,
  getProviderIconForModel,
} from '@/components/ui/provider-icon';
import type { ComponentType } from 'react';

interface OpencodeModelConfigurationProps {
  enabledOpencodeModels: OpencodeModelId[];
  opencodeDefaultModel: OpencodeModelId;
  isSaving: boolean;
  onDefaultModelChange: (model: OpencodeModelId) => void;
  onModelToggle: (model: OpencodeModelId, enabled: boolean) => void;
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
    case 'amazon-bedrock-anthropic':
      return 'Claude (Bedrock)';
    case 'amazon-bedrock-deepseek':
      return 'DeepSeek (Bedrock)';
    case 'amazon-bedrock-amazon':
      return 'Amazon Nova (Bedrock)';
    case 'amazon-bedrock-meta':
      return 'Meta Llama (Bedrock)';
    case 'amazon-bedrock-mistral':
      return 'Mistral (Bedrock)';
    case 'amazon-bedrock-qwen':
      return 'Qwen (Bedrock)';
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

export function OpencodeModelConfiguration({
  enabledOpencodeModels,
  opencodeDefaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
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

  // Order: Free tier first, then Claude, then others
  const providerOrder: OpencodeProvider[] = [
    'opencode',
    'amazon-bedrock-anthropic',
    'amazon-bedrock-deepseek',
    'amazon-bedrock-amazon',
    'amazon-bedrock-meta',
    'amazon-bedrock-mistral',
    'amazon-bedrock-qwen',
  ];

  // Dynamic provider order (prioritize commonly used ones)
  const dynamicProviderOrder = [
    'github-copilot',
    'google',
    'openai',
    'anthropic',
    'xai',
    'deepseek',
    'ollama',
    'lmstudio',
    'azure',
    'amazon-bedrock',
    'opencode', // Skip opencode in dynamic since it's in static
  ];

  // Get sorted dynamic providers (known ones first, then alphabetically)
  const sortedDynamicProviders = Object.keys(dynamicModelsByProvider)
    .filter((p) => p !== 'opencode') // Don't show opencode twice
    .sort((a, b) => {
      const aIndex = dynamicProviderOrder.indexOf(a);
      const bIndex = dynamicProviderOrder.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

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
          <Label>Available Models</Label>

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

          {/* Dynamic models from authenticated providers */}
          {(sortedDynamicProviders.length > 0 || isLoadingDynamicModels) && (
            <>
              {/* Separator between static and dynamic models */}
              <div className="border-t border-border/50 my-4" />
              <div className="flex items-center gap-2 -mt-2 mb-2">
                <p className="text-xs text-muted-foreground">
                  Dynamic Models (from connected providers)
                </p>
                {isLoadingDynamicModels && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Discovering...</span>
                  </div>
                )}
              </div>

              {sortedDynamicProviders.map((providerId) => {
                const models = dynamicModelsByProvider[providerId];
                if (!models || models.length === 0) return null;

                const providerConfig = getDynamicProviderConfig(providerId);
                const DynamicProviderIcon = providerConfig.icon;

                return (
                  <div key={`dynamic-${providerId}`} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DynamicProviderIcon className="w-4 h-4" />
                      <span className="font-medium">{providerConfig.label}</span>
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30"
                      >
                        Dynamic
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      {models.map((model) => {
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
