import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type {
  ModelAlias,
  CursorModelId,
  GroupedModel,
  PhaseModelEntry,
  ThinkingLevel,
} from '@automaker/types';
import {
  stripProviderPrefix,
  STANDALONE_CURSOR_MODELS,
  getModelGroup,
  isGroupSelected,
  getSelectedVariant,
  isCursorModel,
} from '@automaker/types';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
} from '@/components/views/board-view/shared/model-constants';
import { Check, ChevronsUpDown, Star, Brain, Sparkles, ChevronRight } from 'lucide-react';
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
  const [open, setOpen] = React.useState(false);
  const [expandedGroup, setExpandedGroup] = React.useState<string | null>(null);
  const [expandedClaudeModel, setExpandedClaudeModel] = React.useState<ModelAlias | null>(null);
  const commandListRef = React.useRef<HTMLDivElement>(null);
  const expandedTriggerRef = React.useRef<HTMLDivElement>(null);
  const expandedClaudeTriggerRef = React.useRef<HTMLDivElement>(null);
  const { enabledCursorModels, favoriteModels, toggleFavoriteModel } = useAppStore();

  // Extract model and thinking level from value
  const selectedModel = value.model;
  const selectedThinkingLevel = value.thinkingLevel || 'none';

  // Close expanded group when trigger scrolls out of view
  React.useEffect(() => {
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
  React.useEffect(() => {
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

  // Filter Cursor models to only show enabled ones
  const availableCursorModels = CURSOR_MODELS.filter((model) => {
    const cursorId = stripProviderPrefix(model.id) as CursorModelId;
    return enabledCursorModels.includes(cursorId);
  });

  // Helper to find current selected model details
  const currentModel = React.useMemo(() => {
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
        icon: Brain,
      };
    }

    const cursorModel = availableCursorModels.find(
      (m) => stripProviderPrefix(m.id) === selectedModel
    );
    if (cursorModel) return { ...cursorModel, icon: Sparkles };

    // Check if selectedModel is part of a grouped model
    const group = getModelGroup(selectedModel as CursorModelId);
    if (group) {
      const variant = getSelectedVariant(group, selectedModel as CursorModelId);
      return {
        id: selectedModel,
        label: `${group.label} (${variant?.label || 'Unknown'})`,
        description: group.description,
        provider: 'cursor' as const,
        icon: Sparkles,
      };
    }

    return null;
  }, [selectedModel, selectedThinkingLevel, availableCursorModels]);

  // Compute grouped vs standalone Cursor models
  const { groupedModels, standaloneCursorModels } = React.useMemo(() => {
    const grouped: GroupedModel[] = [];
    const standalone: typeof CURSOR_MODELS = [];
    const seenGroups = new Set<string>();

    availableCursorModels.forEach((model) => {
      const cursorId = stripProviderPrefix(model.id) as CursorModelId;

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

  // Group models
  const { favorites, claude, cursor } = React.useMemo(() => {
    const favs: typeof CLAUDE_MODELS = [];
    const cModels: typeof CLAUDE_MODELS = [];
    const curModels: typeof CURSOR_MODELS = [];

    // Process Claude Models
    CLAUDE_MODELS.forEach((model) => {
      if (favoriteModels.includes(model.id)) {
        favs.push(model);
      } else {
        cModels.push(model);
      }
    });

    // Process Cursor Models
    availableCursorModels.forEach((model) => {
      if (favoriteModels.includes(model.id)) {
        favs.push(model);
      } else {
        curModels.push(model);
      }
    });

    return { favorites: favs, claude: cModels, cursor: curModels };
  }, [favoriteModels, availableCursorModels]);

  // Render Cursor model item (no thinking level needed)
  const renderCursorModelItem = (model: (typeof CURSOR_MODELS)[0]) => {
    const modelValue = stripProviderPrefix(model.id);
    const isSelected = selectedModel === modelValue;
    const isFavorite = favoriteModels.includes(model.id);

    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => {
          onChange({ model: modelValue as CursorModelId });
          setOpen(false);
        }}
        className="group flex items-center justify-between py-2"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <Sparkles
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
                <Brain
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
            align="center"
            avoidCollisions={false}
            className="w-[220px] p-1"
            sideOffset={8}
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
                <Sparkles
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
            align="center"
            avoidCollisions={false}
            className="w-[220px] p-1"
            sideOffset={8}
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
      onPointerDownOutside={(e) => e.preventDefault()}
    >
      <Command>
        <CommandInput placeholder="Search models..." />
        <CommandList
          ref={commandListRef}
          className="max-h-[300px] overflow-y-auto overscroll-contain"
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
                      const cursorId = stripProviderPrefix(model.id) as CursorModelId;
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
