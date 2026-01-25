import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useIsMobile } from '@/hooks/use-media-query';
import type {
  ModelAlias,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  GroupedModel,
  PhaseModelEntry,
} from '@automaker/types';
import {
  stripProviderPrefix,
  STANDALONE_CURSOR_MODELS,
  getModelGroup,
  isGroupSelected,
  getSelectedVariant,
  codexModelHasThinking,
} from '@automaker/types';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  OPENCODE_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  REASONING_EFFORT_LEVELS,
  REASONING_EFFORT_LABELS,
  type ModelOption,
} from '@/components/views/board-view/shared/model-constants';
import { Check, ChevronsUpDown, Star, ChevronRight } from 'lucide-react';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  getProviderIconForModel,
} from '@/components/ui/provider-icon';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const OPENCODE_CLI_GROUP_LABEL = 'OpenCode CLI';
const OPENCODE_PROVIDER_FALLBACK = 'opencode';
const OPENCODE_PROVIDER_WORD_SEPARATOR = '-';
const OPENCODE_MODEL_ID_SEPARATOR = '/';
const OPENCODE_SECTION_GROUP_PADDING = 'pt-2';

const OPENCODE_STATIC_PROVIDER_LABELS: Record<string, string> = {
  [OPENCODE_PROVIDER_FALLBACK]: 'OpenCode (Free)',
};

const OPENCODE_DYNAMIC_PROVIDER_LABELS: Record<string, string> = {
  'github-copilot': 'GitHub Copilot',
  'zai-coding-plan': 'Z.AI Coding Plan',
  google: 'Google AI',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  ollama: 'Ollama (Local)',
  lmstudio: 'LM Studio (Local)',
  azure: 'Azure OpenAI',
  [OPENCODE_PROVIDER_FALLBACK]: 'OpenCode (Free)',
};

const OPENCODE_DYNAMIC_PROVIDER_ORDER = [
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
  'zai-coding-plan',
];

const OPENCODE_SECTION_ORDER = ['free', 'dynamic'] as const;

const OPENCODE_SECTION_LABELS: Record<(typeof OPENCODE_SECTION_ORDER)[number], string> = {
  free: 'Free Tier',
  dynamic: 'Connected Providers',
};

const OPENCODE_STATIC_PROVIDER_BY_ID = new Map(
  OPENCODE_MODELS.map((model) => [model.id, model.provider])
);

function formatProviderLabel(providerKey: string): string {
  return providerKey
    .split(OPENCODE_PROVIDER_WORD_SEPARATOR)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function getOpencodeSectionKey(providerKey: string): (typeof OPENCODE_SECTION_ORDER)[number] {
  if (providerKey === OPENCODE_PROVIDER_FALLBACK) {
    return 'free';
  }
  return 'dynamic';
}

function getOpencodeGroupLabel(
  providerKey: string,
  sectionKey: (typeof OPENCODE_SECTION_ORDER)[number]
): string {
  if (sectionKey === 'free') {
    return OPENCODE_STATIC_PROVIDER_LABELS[providerKey] || 'OpenCode Free Tier';
  }
  return OPENCODE_DYNAMIC_PROVIDER_LABELS[providerKey] || formatProviderLabel(providerKey);
}

interface PhaseModelSelectorProps {
  /** Label shown in full mode */
  label?: string;
  /** Description shown in full mode */
  description?: string;
  /** Current model selection */
  value: PhaseModelEntry;
  /** Callback when model is selected */
  onChange: (entry: PhaseModelEntry) => void;
  /** Compact mode - just shows the button trigger without label/description wrapper */
  compact?: boolean;
  /** Custom trigger class name */
  triggerClassName?: string;
  /** Popover alignment */
  align?: 'start' | 'end';
  /** Disabled state */
  disabled?: boolean;
}

export function PhaseModelSelector({
  label,
  description,
  value,
  onChange,
  compact = false,
  triggerClassName,
  align = 'end',
  disabled = false,
}: PhaseModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedClaudeModel, setExpandedClaudeModel] = useState<ModelAlias | null>(null);
  const [expandedCodexModel, setExpandedCodexModel] = useState<CodexModelId | null>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const expandedTriggerRef = useRef<HTMLDivElement>(null);
  const expandedClaudeTriggerRef = useRef<HTMLDivElement>(null);
  const expandedCodexTriggerRef = useRef<HTMLDivElement>(null);
  const {
    enabledCursorModels,
    favoriteModels,
    toggleFavoriteModel,
    codexModels,
    codexModelsLoading,
    fetchCodexModels,
    dynamicOpencodeModels,
    enabledDynamicModelIds,
    opencodeModelsLoading,
    fetchOpencodeModels,
    disabledProviders,
  } = useAppStore();

  // Detect mobile devices to use inline expansion instead of nested popovers
  const isMobile = useIsMobile();

  // Extract model and thinking/reasoning levels from value
  const selectedModel = value.model;
  const selectedThinkingLevel = value.thinkingLevel || 'none';
  const selectedReasoningEffort = value.reasoningEffort || 'none';

  // Fetch Codex models on mount
  useEffect(() => {
    if (codexModels.length === 0 && !codexModelsLoading) {
      fetchCodexModels().catch(() => {
        // Silently fail - user will see empty Codex section
      });
    }
  }, [codexModels.length, codexModelsLoading, fetchCodexModels]);

  // Fetch OpenCode models on mount
  useEffect(() => {
    if (dynamicOpencodeModels.length === 0 && !opencodeModelsLoading) {
      fetchOpencodeModels().catch(() => {
        // Silently fail - user will see only static OpenCode models
      });
    }
  }, [dynamicOpencodeModels.length, opencodeModelsLoading, fetchOpencodeModels]);

  // Close expanded group when trigger scrolls out of view
  useEffect(() => {
    const triggerElement = expandedTriggerRef.current;
    const listElement = commandListRef.current;
    if (!triggerElement || !listElement || !expandedGroup) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) {
          setExpandedGroup(null);
        }
      },
      {
        root: listElement,
        threshold: 0.1, // Close when less than 10% visible
      }
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [expandedGroup]);

  // Close expanded Claude model popover when trigger scrolls out of view
  useEffect(() => {
    const triggerElement = expandedClaudeTriggerRef.current;
    const listElement = commandListRef.current;
    if (!triggerElement || !listElement || !expandedClaudeModel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) {
          setExpandedClaudeModel(null);
        }
      },
      {
        root: listElement,
        threshold: 0.1,
      }
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [expandedClaudeModel]);

  // Close expanded Codex model popover when trigger scrolls out of view
  useEffect(() => {
    const triggerElement = expandedCodexTriggerRef.current;
    const listElement = commandListRef.current;
    if (!triggerElement || !listElement || !expandedCodexModel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) {
          setExpandedCodexModel(null);
        }
      },
      {
        root: listElement,
        threshold: 0.1,
      }
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [expandedCodexModel]);

  // Transform dynamic Codex models from store to component format
  const transformedCodexModels = useMemo(() => {
    return codexModels.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.description,
      provider: 'codex' as const,
      badge: model.tier === 'premium' ? 'Premium' : model.tier === 'basic' ? 'Speed' : undefined,
    }));
  }, [codexModels]);

  // Filter Cursor models to only show enabled ones
  // With canonical IDs, both CURSOR_MODELS and enabledCursorModels use prefixed format
  const availableCursorModels = CURSOR_MODELS.filter((model) => {
    return enabledCursorModels.includes(model.id as CursorModelId);
  });

  // Helper to find current selected model details
  const currentModel = useMemo(() => {
    const claudeModel = CLAUDE_MODELS.find((m) => m.id === selectedModel);
    if (claudeModel) {
      // Add thinking level to label if not 'none'
      const thinkingLabel =
        selectedThinkingLevel !== 'none'
          ? ` (${THINKING_LEVEL_LABELS[selectedThinkingLevel]} Thinking)`
          : '';
      return {
        ...claudeModel,
        label: `${claudeModel.label}${thinkingLabel}`,
        icon: AnthropicIcon,
      };
    }

    // With canonical IDs, direct comparison works
    const cursorModel = availableCursorModels.find((m) => m.id === selectedModel);
    if (cursorModel) return { ...cursorModel, icon: CursorIcon };

    // Check if selectedModel is part of a grouped model
    const group = getModelGroup(selectedModel as CursorModelId);
    if (group) {
      const variant = getSelectedVariant(group, selectedModel as CursorModelId);
      return {
        id: selectedModel,
        label: `${group.label} (${variant?.label || 'Unknown'})`,
        description: group.description,
        provider: 'cursor' as const,
        icon: CursorIcon,
      };
    }

    // Check Codex models
    const codexModel = transformedCodexModels.find((m) => m.id === selectedModel);
    if (codexModel) return { ...codexModel, icon: OpenAIIcon };

    // Check OpenCode models (static) - use dynamic icon resolution for provider-specific icons
    const opencodeModel = OPENCODE_MODELS.find((m) => m.id === selectedModel);
    if (opencodeModel) return { ...opencodeModel, icon: getProviderIconForModel(opencodeModel.id) };

    // Check dynamic OpenCode models - use dynamic icon resolution for provider-specific icons
    const dynamicModel = dynamicOpencodeModels.find((m) => m.id === selectedModel);
    if (dynamicModel) {
      return {
        id: dynamicModel.id,
        label: dynamicModel.name,
        description: dynamicModel.description,
        provider: 'opencode' as const,
        icon: getProviderIconForModel(dynamicModel.id),
      };
    }

    return null;
  }, [
    selectedModel,
    selectedThinkingLevel,
    availableCursorModels,
    transformedCodexModels,
    dynamicOpencodeModels,
  ]);

  // Compute grouped vs standalone Cursor models
  const { groupedModels, standaloneCursorModels } = useMemo(() => {
    const grouped: GroupedModel[] = [];
    const standalone: typeof CURSOR_MODELS = [];
    const seenGroups = new Set<string>();

    availableCursorModels.forEach((model) => {
      const cursorId = model.id as CursorModelId;

      // Check if this model is standalone
      if (STANDALONE_CURSOR_MODELS.includes(cursorId)) {
        standalone.push(model);
        return;
      }

      // Check if this model belongs to a group
      const group = getModelGroup(cursorId);
      if (group && !seenGroups.has(group.baseId)) {
        // Filter variants to only include enabled models
        const enabledVariants = group.variants.filter((v) => enabledCursorModels.includes(v.id));
        if (enabledVariants.length > 0) {
          grouped.push({
            ...group,
            variants: enabledVariants,
          });
          seenGroups.add(group.baseId);
        }
      }
    });

    return { groupedModels: grouped, standaloneCursorModels: standalone };
  }, [availableCursorModels, enabledCursorModels]);

  // Combine static and dynamic OpenCode models
  const allOpencodeModels: ModelOption[] = useMemo(() => {
    // Start with static models
    const staticModels = [...OPENCODE_MODELS];

    // Add dynamic models (convert ModelDefinition to ModelOption)
    // Only include dynamic models that are enabled by the user
    const dynamicModelOptions: ModelOption[] = dynamicOpencodeModels
      .filter((model) => enabledDynamicModelIds.includes(model.id))
      .map((model) => ({
        id: model.id,
        label: model.name,
        description: model.description,
        badge: model.tier === 'premium' ? 'Premium' : model.tier === 'basic' ? 'Free' : undefined,
        provider: 'opencode' as const,
      }));

    // Merge, avoiding duplicates (static models take precedence for same ID)
    // In practice, static and dynamic IDs don't overlap
    const staticIds = new Set(staticModels.map((m) => m.id));
    const uniqueDynamic = dynamicModelOptions.filter((m) => !staticIds.has(m.id));

    return [...staticModels, ...uniqueDynamic];
  }, [dynamicOpencodeModels, enabledDynamicModelIds]);

  // Group models (filtering out disabled providers)
  const { favorites, claude, cursor, codex, opencode } = useMemo(() => {
    const favs: typeof CLAUDE_MODELS = [];
    const cModels: typeof CLAUDE_MODELS = [];
    const curModels: typeof CURSOR_MODELS = [];
    const codModels: typeof transformedCodexModels = [];
    const ocModels: ModelOption[] = [];

    const isClaudeDisabled = disabledProviders.includes('claude');
    const isCursorDisabled = disabledProviders.includes('cursor');
    const isCodexDisabled = disabledProviders.includes('codex');
    const isOpencodeDisabled = disabledProviders.includes('opencode');

    // Process Claude Models (skip if provider is disabled)
    if (!isClaudeDisabled) {
      CLAUDE_MODELS.forEach((model) => {
        if (favoriteModels.includes(model.id)) {
          favs.push(model);
        } else {
          cModels.push(model);
        }
      });
    }

    // Process Cursor Models (skip if provider is disabled)
    if (!isCursorDisabled) {
      availableCursorModels.forEach((model) => {
        if (favoriteModels.includes(model.id)) {
          favs.push(model);
        } else {
          curModels.push(model);
        }
      });
    }

    // Process Codex Models (skip if provider is disabled)
    if (!isCodexDisabled) {
      transformedCodexModels.forEach((model) => {
        if (favoriteModels.includes(model.id)) {
          favs.push(model);
        } else {
          codModels.push(model);
        }
      });
    }

    // Process OpenCode Models (skip if provider is disabled)
    if (!isOpencodeDisabled) {
      allOpencodeModels.forEach((model) => {
        if (favoriteModels.includes(model.id)) {
          favs.push(model);
        } else {
          ocModels.push(model);
        }
      });
    }

    return {
      favorites: favs,
      claude: cModels,
      cursor: curModels,
      codex: codModels,
      opencode: ocModels,
    };
  }, [
    favoriteModels,
    availableCursorModels,
    transformedCodexModels,
    allOpencodeModels,
    disabledProviders,
  ]);

  // Group OpenCode models by model type for better organization
  const opencodeSections = useMemo(() => {
    type OpencodeSectionKey = (typeof OPENCODE_SECTION_ORDER)[number];
    type OpencodeGroup = { key: string; label: string; models: ModelOption[] };
    type OpencodeSection = {
      key: OpencodeSectionKey;
      label: string;
      showGroupLabels: boolean;
      groups: OpencodeGroup[];
    };

    const sections: Record<OpencodeSectionKey, Record<string, OpencodeGroup>> = {
      free: {},
      dynamic: {},
    };
    const dynamicProviderById = new Map(
      dynamicOpencodeModels.map((model) => [model.id, model.provider])
    );

    const resolveProviderKey = (modelId: string): string => {
      const staticProvider = OPENCODE_STATIC_PROVIDER_BY_ID.get(modelId);
      if (staticProvider) return staticProvider;

      const dynamicProvider = dynamicProviderById.get(modelId);
      if (dynamicProvider) return dynamicProvider;

      return modelId.includes(OPENCODE_MODEL_ID_SEPARATOR)
        ? modelId.split(OPENCODE_MODEL_ID_SEPARATOR)[0]
        : OPENCODE_PROVIDER_FALLBACK;
    };

    const addModelToGroup = (
      sectionKey: OpencodeSectionKey,
      providerKey: string,
      model: ModelOption
    ) => {
      if (!sections[sectionKey][providerKey]) {
        sections[sectionKey][providerKey] = {
          key: providerKey,
          label: getOpencodeGroupLabel(providerKey, sectionKey),
          models: [],
        };
      }
      sections[sectionKey][providerKey].models.push(model);
    };

    opencode.forEach((model) => {
      const providerKey = resolveProviderKey(model.id);
      const sectionKey = getOpencodeSectionKey(providerKey);
      addModelToGroup(sectionKey, providerKey, model);
    });

    const buildGroupList = (sectionKey: OpencodeSectionKey): OpencodeGroup[] => {
      const groupMap = sections[sectionKey];
      const priorityOrder = sectionKey === 'dynamic' ? OPENCODE_DYNAMIC_PROVIDER_ORDER : [];
      const priorityMap = new Map(priorityOrder.map((provider, index) => [provider, index]));

      return Object.keys(groupMap)
        .sort((a, b) => {
          const aPriority = priorityMap.get(a);
          const bPriority = priorityMap.get(b);

          if (aPriority !== undefined && bPriority !== undefined) {
            return aPriority - bPriority;
          }
          if (aPriority !== undefined) return -1;
          if (bPriority !== undefined) return 1;

          return groupMap[a].label.localeCompare(groupMap[b].label);
        })
        .map((key) => groupMap[key]);
    };

    const builtSections = OPENCODE_SECTION_ORDER.map((sectionKey) => {
      const groups = buildGroupList(sectionKey);
      if (groups.length === 0) return null;

      return {
        key: sectionKey,
        label: OPENCODE_SECTION_LABELS[sectionKey],
        showGroupLabels: sectionKey !== 'free',
        groups,
      };
    }).filter(Boolean) as OpencodeSection[];

    return builtSections;
  }, [opencode, dynamicOpencodeModels]);

  // Render Codex model item with secondary popover for reasoning effort (only for models that support it)
  const renderCodexModelItem = (model: (typeof transformedCodexModels)[0]) => {
    const isSelected = selectedModel === model.id;
    const isFavorite = favoriteModels.includes(model.id);
    const hasReasoning = codexModelHasThinking(model.id as CodexModelId);
    const isExpanded = expandedCodexModel === model.id;
    const currentReasoning = isSelected ? selectedReasoningEffort : 'none';

    // If model doesn't support reasoning, render as simple selector (like Cursor models)
    if (!hasReasoning) {
      return (
        <CommandItem
          key={model.id}
          value={model.label}
          onSelect={() => {
            onChange({ model: model.id as CodexModelId });
            setOpen(false);
          }}
          className="group flex items-center justify-between py-2"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <OpenAIIcon
              className={cn(
                'h-4 w-4 shrink-0',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <div className="flex flex-col truncate">
              <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
                {model.label}
              </span>
              <span className="truncate text-xs text-muted-foreground">{model.description}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
                isFavorite
                  ? 'text-yellow-500 opacity-100'
                  : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteModel(model.id);
              }}
            >
              <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
            </Button>
            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
          </div>
        </CommandItem>
      );
    }

    // Model supports reasoning - show popover with reasoning effort options
    // On mobile, render inline expansion instead of nested popover
    if (isMobile) {
      return (
        <div key={model.id}>
          <CommandItem
            value={model.label}
            onSelect={() => setExpandedCodexModel(isExpanded ? null : (model.id as CodexModelId))}
            className="group flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <OpenAIIcon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="flex flex-col truncate">
                <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
                  {model.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {isSelected && currentReasoning !== 'none'
                    ? `Reasoning: ${REASONING_EFFORT_LABELS[currentReasoning]}`
                    : model.description}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
                  isFavorite
                    ? 'text-yellow-500 opacity-100'
                    : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteModel(model.id);
                }}
              >
                <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
              </Button>
              {isSelected && !isExpanded && <Check className="h-4 w-4 text-primary shrink-0" />}
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </div>
          </CommandItem>

          {/* Inline reasoning effort options on mobile */}
          {isExpanded && (
            <div className="pl-6 pr-2 pb-2 space-y-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                Reasoning Effort
              </div>
              {REASONING_EFFORT_LEVELS.map((effort) => (
                <button
                  key={effort}
                  onClick={() => {
                    onChange({
                      model: model.id as CodexModelId,
                      reasoningEffort: effort,
                    });
                    setExpandedCodexModel(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    isSelected && currentReasoning === effort && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-xs">{REASONING_EFFORT_LABELS[effort]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {effort === 'none' && 'No reasoning capability'}
                      {effort === 'minimal' && 'Minimal reasoning'}
                      {effort === 'low' && 'Light reasoning'}
                      {effort === 'medium' && 'Moderate reasoning'}
                      {effort === 'high' && 'Deep reasoning'}
                      {effort === 'xhigh' && 'Maximum reasoning'}
                    </span>
                  </div>
                  {isSelected && currentReasoning === effort && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Desktop: Use nested popover
    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => setExpandedCodexModel(isExpanded ? null : (model.id as CodexModelId))}
        className="p-0 data-[selected=true]:bg-transparent"
      >
        <Popover
          open={isExpanded}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setExpandedCodexModel(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <div
              ref={isExpanded ? expandedCodexTriggerRef : undefined}
              className={cn(
                'w-full group flex items-center justify-between py-2 px-2 rounded-sm cursor-pointer',
                'hover:bg-accent',
                isExpanded && 'bg-accent'
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <OpenAIIcon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <div className="flex flex-col truncate">
                  <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
                    {model.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isSelected && currentReasoning !== 'none'
                      ? `Reasoning: ${REASONING_EFFORT_LABELS[currentReasoning]}`
                      : model.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
                    isFavorite
                      ? 'text-yellow-500 opacity-100'
                      : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteModel(model.id);
                  }}
                >
                  <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
                </Button>
                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-[220px] p-1"
            sideOffset={8}
            collisionPadding={16}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                Reasoning Effort
              </div>
              {REASONING_EFFORT_LEVELS.map((effort) => (
                <button
                  key={effort}
                  onClick={() => {
                    onChange({
                      model: model.id as CodexModelId,
                      reasoningEffort: effort,
                    });
                    setExpandedCodexModel(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    isSelected && currentReasoning === effort && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{REASONING_EFFORT_LABELS[effort]}</span>
                    <span className="text-xs text-muted-foreground">
                      {effort === 'none' && 'No reasoning capability'}
                      {effort === 'minimal' && 'Minimal reasoning'}
                      {effort === 'low' && 'Light reasoning'}
                      {effort === 'medium' && 'Moderate reasoning'}
                      {effort === 'high' && 'Deep reasoning'}
                      {effort === 'xhigh' && 'Maximum reasoning'}
                    </span>
                  </div>
                  {isSelected && currentReasoning === effort && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </CommandItem>
    );
  };

  // Render OpenCode model item (simple selector, no thinking/reasoning options)
  const renderOpencodeModelItem = (model: (typeof OPENCODE_MODELS)[0]) => {
    const isSelected = selectedModel === model.id;
    const isFavorite = favoriteModels.includes(model.id);

    // Get the appropriate icon based on the specific model ID
    const ProviderIcon = getProviderIconForModel(model.id);

    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => {
          onChange({ model: model.id as OpencodeModelId });
          setOpen(false);
        }}
        className="group flex items-center justify-between py-2"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <ProviderIcon
            className={cn(
              'h-4 w-4 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <div className="flex flex-col truncate">
            <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
              {model.label}
            </span>
            <span className="truncate text-xs text-muted-foreground">{model.description}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          {model.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mr-1">
              {model.badge}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
              isFavorite
                ? 'text-yellow-500 opacity-100'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteModel(model.id);
            }}
          >
            <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
          </Button>
          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
        </div>
      </CommandItem>
    );
  };

  // Render Cursor model item (no thinking level needed)
  const renderCursorModelItem = (model: (typeof CURSOR_MODELS)[0]) => {
    // With canonical IDs, store the full prefixed ID
    const isSelected = selectedModel === model.id;
    const isFavorite = favoriteModels.includes(model.id);

    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => {
          onChange({ model: model.id as CursorModelId });
          setOpen(false);
        }}
        className="group flex items-center justify-between py-2"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <CursorIcon
            className={cn(
              'h-4 w-4 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <div className="flex flex-col truncate">
            <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
              {model.label}
            </span>
            <span className="truncate text-xs text-muted-foreground">{model.description}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
              isFavorite
                ? 'text-yellow-500 opacity-100'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteModel(model.id);
            }}
          >
            <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
          </Button>
          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
        </div>
      </CommandItem>
    );
  };

  // Render Claude model item with secondary popover for thinking level
  const renderClaudeModelItem = (model: (typeof CLAUDE_MODELS)[0]) => {
    const isSelected = selectedModel === model.id;
    const isFavorite = favoriteModels.includes(model.id);
    const isExpanded = expandedClaudeModel === model.id;
    const currentThinking = isSelected ? selectedThinkingLevel : 'none';

    // On mobile, render inline expansion instead of nested popover
    if (isMobile) {
      return (
        <div key={model.id}>
          <CommandItem
            value={model.label}
            onSelect={() => setExpandedClaudeModel(isExpanded ? null : (model.id as ModelAlias))}
            className="group flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <AnthropicIcon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="flex flex-col truncate">
                <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
                  {model.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {isSelected && currentThinking !== 'none'
                    ? `Thinking: ${THINKING_LEVEL_LABELS[currentThinking]}`
                    : model.description}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
                  isFavorite
                    ? 'text-yellow-500 opacity-100'
                    : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteModel(model.id);
                }}
              >
                <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
              </Button>
              {isSelected && !isExpanded && <Check className="h-4 w-4 text-primary shrink-0" />}
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </div>
          </CommandItem>

          {/* Inline thinking level options on mobile */}
          {isExpanded && (
            <div className="pl-6 pr-2 pb-2 space-y-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                Thinking Level
              </div>
              {THINKING_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    onChange({
                      model: model.id as ModelAlias,
                      thinkingLevel: level,
                    });
                    setExpandedClaudeModel(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    isSelected && currentThinking === level && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-xs">{THINKING_LEVEL_LABELS[level]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {level === 'none' && 'No extended thinking'}
                      {level === 'low' && 'Light reasoning (1k tokens)'}
                      {level === 'medium' && 'Moderate reasoning (10k tokens)'}
                      {level === 'high' && 'Deep reasoning (16k tokens)'}
                      {level === 'ultrathink' && 'Maximum reasoning (32k tokens)'}
                    </span>
                  </div>
                  {isSelected && currentThinking === level && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Desktop: Use nested popover
    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => setExpandedClaudeModel(isExpanded ? null : (model.id as ModelAlias))}
        className="p-0 data-[selected=true]:bg-transparent"
      >
        <Popover
          open={isExpanded}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setExpandedClaudeModel(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <div
              ref={isExpanded ? expandedClaudeTriggerRef : undefined}
              className={cn(
                'w-full group flex items-center justify-between py-2 px-2 rounded-sm cursor-pointer',
                'hover:bg-accent',
                isExpanded && 'bg-accent'
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <AnthropicIcon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <div className="flex flex-col truncate">
                  <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
                    {model.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isSelected && currentThinking !== 'none'
                      ? `Thinking: ${THINKING_LEVEL_LABELS[currentThinking]}`
                      : model.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
                    isFavorite
                      ? 'text-yellow-500 opacity-100'
                      : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteModel(model.id);
                  }}
                >
                  <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
                </Button>
                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-[220px] p-1"
            sideOffset={8}
            collisionPadding={16}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                Thinking Level
              </div>
              {THINKING_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    onChange({
                      model: model.id as ModelAlias,
                      thinkingLevel: level,
                    });
                    setExpandedClaudeModel(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    isSelected && currentThinking === level && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{THINKING_LEVEL_LABELS[level]}</span>
                    <span className="text-xs text-muted-foreground">
                      {level === 'none' && 'No extended thinking'}
                      {level === 'low' && 'Light reasoning (1k tokens)'}
                      {level === 'medium' && 'Moderate reasoning (10k tokens)'}
                      {level === 'high' && 'Deep reasoning (16k tokens)'}
                      {level === 'ultrathink' && 'Maximum reasoning (32k tokens)'}
                    </span>
                  </div>
                  {isSelected && currentThinking === level && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </CommandItem>
    );
  };

  // Render a grouped model with secondary popover for variant selection
  const renderGroupedModelItem = (group: GroupedModel) => {
    const groupIsSelected = isGroupSelected(group, selectedModel as CursorModelId);
    const selectedVariant = getSelectedVariant(group, selectedModel as CursorModelId);
    const isExpanded = expandedGroup === group.baseId;

    const variantTypeLabel =
      group.variantType === 'compute'
        ? 'Compute Level'
        : group.variantType === 'thinking'
          ? 'Reasoning Mode'
          : 'Capacity Options';

    // On mobile, render inline expansion instead of nested popover
    if (isMobile) {
      return (
        <div key={group.baseId}>
          <CommandItem
            value={group.label}
            onSelect={() => setExpandedGroup(isExpanded ? null : group.baseId)}
            className="group flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <CursorIcon
                className={cn(
                  'h-4 w-4 shrink-0',
                  groupIsSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="flex flex-col truncate">
                <span className={cn('truncate font-medium', groupIsSelected && 'text-primary')}>
                  {group.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {selectedVariant ? `Selected: ${selectedVariant.label}` : group.description}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-2">
              {groupIsSelected && !isExpanded && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </div>
          </CommandItem>

          {/* Inline variant options on mobile */}
          {isExpanded && (
            <div className="pl-6 pr-2 pb-2 space-y-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {variantTypeLabel}
              </div>
              {group.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => {
                    onChange({ model: variant.id });
                    setExpandedGroup(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    selectedModel === variant.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-xs">{variant.label}</span>
                    {variant.description && (
                      <span className="text-[10px] text-muted-foreground">
                        {variant.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {variant.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {variant.badge}
                      </span>
                    )}
                    {selectedModel === variant.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Desktop: Use nested popover
    return (
      <CommandItem
        key={group.baseId}
        value={group.label}
        onSelect={() => setExpandedGroup(isExpanded ? null : group.baseId)}
        className="p-0 data-[selected=true]:bg-transparent"
      >
        <Popover
          open={isExpanded}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setExpandedGroup(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <div
              ref={isExpanded ? expandedTriggerRef : undefined}
              className={cn(
                'w-full group flex items-center justify-between py-2 px-2 rounded-sm cursor-pointer',
                'hover:bg-accent',
                isExpanded && 'bg-accent'
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <CursorIcon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    groupIsSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <div className="flex flex-col truncate">
                  <span className={cn('truncate font-medium', groupIsSelected && 'text-primary')}>
                    {group.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedVariant ? `Selected: ${selectedVariant.label}` : group.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                {groupIsSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-[220px] p-1"
            sideOffset={8}
            collisionPadding={16}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                {variantTypeLabel}
              </div>
              {group.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => {
                    onChange({ model: variant.id });
                    setExpandedGroup(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-2 rounded-sm text-sm',
                    'hover:bg-accent cursor-pointer transition-colors',
                    selectedModel === variant.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{variant.label}</span>
                    {variant.description && (
                      <span className="text-xs text-muted-foreground">{variant.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {variant.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {variant.badge}
                      </span>
                    )}
                    {selectedModel === variant.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </CommandItem>
    );
  };

  // Compact trigger button (for agent view etc.)
  const compactTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        'h-11 gap-1 text-xs font-medium rounded-xl border-border px-2.5',
        triggerClassName
      )}
      data-testid="model-selector"
    >
      {currentModel?.icon && <currentModel.icon className="h-4 w-4 text-muted-foreground/70" />}
      <span className="truncate text-sm">
        {currentModel?.label?.replace('Claude ', '') || 'Select model...'}
      </span>
      <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
    </Button>
  );

  // Full trigger button (for settings view)
  const fullTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        'w-[260px] justify-between h-9 px-3 bg-background/50 border-border/50 hover:bg-background/80 hover:text-foreground',
        triggerClassName
      )}
    >
      <div className="flex items-center gap-2 truncate">
        {currentModel?.icon && <currentModel.icon className="h-4 w-4 text-muted-foreground/70" />}
        <span className="truncate text-sm">{currentModel?.label || 'Select model...'}</span>
      </div>
      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
    </Button>
  );

  // The popover content (shared between both modes)
  const popoverContent = (
    <PopoverContent
      className="w-[320px] p-0"
      align={align}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onPointerDownOutside={(e) => {
        // Only prevent close if clicking inside a nested popover (thinking level panel)
        const target = e.target as HTMLElement;
        if (target.closest('[data-slot="popover-content"]')) {
          e.preventDefault();
        }
      }}
    >
      <Command>
        <CommandInput placeholder="Search models..." />
        <CommandList
          ref={commandListRef}
          className="max-h-[300px] overflow-y-auto overscroll-contain touch-pan-y"
        >
          <CommandEmpty>No model found.</CommandEmpty>

          {favorites.length > 0 && (
            <>
              <CommandGroup heading="Favorites">
                {(() => {
                  const renderedGroups = new Set<string>();
                  return favorites.map((model) => {
                    // Check if this favorite is part of a grouped model
                    if (model.provider === 'cursor') {
                      const cursorId = model.id as CursorModelId;
                      const group = getModelGroup(cursorId);
                      if (group) {
                        // Skip if we already rendered this group
                        if (renderedGroups.has(group.baseId)) {
                          return null;
                        }
                        renderedGroups.add(group.baseId);
                        // Find the group in groupedModels (which has filtered variants)
                        const filteredGroup = groupedModels.find((g) => g.baseId === group.baseId);
                        if (filteredGroup) {
                          return renderGroupedModelItem(filteredGroup);
                        }
                      }
                      // Standalone Cursor model
                      return renderCursorModelItem(model);
                    }
                    // Codex model
                    if (model.provider === 'codex') {
                      return renderCodexModelItem(model as (typeof transformedCodexModels)[0]);
                    }
                    // OpenCode model
                    if (model.provider === 'opencode') {
                      return renderOpencodeModelItem(model);
                    }
                    // Claude model
                    return renderClaudeModelItem(model);
                  });
                })()}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {claude.length > 0 && (
            <CommandGroup heading="Claude Models">
              {claude.map((model) => renderClaudeModelItem(model))}
            </CommandGroup>
          )}

          {(groupedModels.length > 0 || standaloneCursorModels.length > 0) && (
            <CommandGroup heading="Cursor Models">
              {/* Grouped models with secondary popover */}
              {groupedModels.map((group) => renderGroupedModelItem(group))}
              {/* Standalone models */}
              {standaloneCursorModels.map((model) => renderCursorModelItem(model))}
            </CommandGroup>
          )}

          {codex.length > 0 && (
            <CommandGroup heading="Codex Models">
              {codex.map((model) => renderCodexModelItem(model))}
            </CommandGroup>
          )}

          {opencodeSections.length > 0 && (
            <CommandGroup heading={OPENCODE_CLI_GROUP_LABEL}>
              {opencodeSections.map((section, sectionIndex) => (
                <Fragment key={section.key}>
                  <div className="px-2 pt-2 text-xs font-medium text-muted-foreground">
                    {section.label}
                  </div>
                  <div
                    className={cn(
                      'space-y-2',
                      section.key === 'dynamic' && OPENCODE_SECTION_GROUP_PADDING
                    )}
                  >
                    {section.groups.map((group) => (
                      <div key={group.key} className="space-y-1">
                        {section.showGroupLabels && (
                          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                            {group.label}
                          </div>
                        )}
                        {group.models.map((model) => renderOpencodeModelItem(model))}
                      </div>
                    ))}
                  </div>
                </Fragment>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  );

  // Compact mode - just the popover with compact trigger
  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>{compactTrigger}</PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  // Full mode - with label and description wrapper
  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-accent/20 border border-border/30',
        'hover:bg-accent/30 transition-colors'
      )}
    >
      {/* Label and Description */}
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Model Selection Popover */}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>{fullTrigger}</PopoverTrigger>
        {popoverContent}
      </Popover>
    </div>
  );
}
