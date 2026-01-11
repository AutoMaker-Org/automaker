import * as React from 'react';
import { cn } from '@/lib/utils';
import { AnthropicIcon } from '@/components/ui/provider-icon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/app-store';
import type { ModelAlias, CursorModelId, PhaseModelKey, PhaseModelEntry } from '@automaker/types';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';

/**
 * Normalize PhaseModelEntry or string to PhaseModelEntry
 */
function normalizeEntry(entry: PhaseModelEntry | string): PhaseModelEntry {
  if (typeof entry === 'string') {
    return { model: entry as ModelAlias | CursorModelId };
  }
  return entry;
}

export interface ModelOverrideTriggerProps {
  /** Current effective model entry (from global settings or explicit override) */
  currentModelEntry: PhaseModelEntry;
  /** Callback when user selects override */
  onModelChange: (entry: PhaseModelEntry | null) => void;
  /** Optional: which phase this is for (shows global default) */
  phase?: PhaseModelKey;
  /** Size variants for different contexts */
  size?: 'sm' | 'md' | 'lg';
  /** Show as icon-only or with label */
  variant?: 'icon' | 'button' | 'inline';
  /** Whether the model is currently overridden from global */
  isOverridden?: boolean;
  /** Optional class name */
  className?: string;
}

export function ModelOverrideTrigger({
  currentModelEntry,
  onModelChange,
  phase,
  size = 'sm',
  variant = 'icon',
  isOverridden = false,
  className,
}: ModelOverrideTriggerProps) {
  const { phaseModels } = useAppStore();

  const handleChange = (entry: PhaseModelEntry) => {
    // If the new entry matches the global default, clear the override
    // Otherwise, set it as override
    if (phase) {
      const globalDefault = phaseModels[phase];
      const normalizedGlobal = normalizeEntry(globalDefault);

      // Compare models (and thinking levels if both have them)
      const modelsMatch = entry.model === normalizedGlobal.model;
      const thinkingMatch =
        (entry.thinkingLevel || 'none') === (normalizedGlobal.thinkingLevel || 'none');

      if (modelsMatch && thinkingMatch) {
        onModelChange(null); // Clear override
      } else {
        onModelChange(entry); // Set override
      }
    } else {
      onModelChange(entry);
    }
  };

  // Size classes for icon variant
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  // For icon variant, show a sparkles icon that opens the model selector
  if (variant === 'icon') {
    const [iconOpen, setIconOpen] = React.useState(false);

    return (
      <div className={cn('relative inline-block', className)}>
        <Popover open={iconOpen} onOpenChange={setIconOpen} modal={false}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'transition-colors duration-150',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50',
                sizeClasses[size]
              )}
              title="Select model"
            >
              <AnthropicIcon className={iconSizes[size]} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" sideOffset={4}>
            <PhaseModelSelector
              value={currentModelEntry}
              onChange={(entry) => {
                handleChange(entry);
                setIconOpen(false);
              }}
              compact
              disabled={false}
              align="end"
            />
          </PopoverContent>
        </Popover>
        {isOverridden && (
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-500 rounded-full z-10 pointer-events-none" />
        )}
      </div>
    );
  }

  // For button and inline variants, use PhaseModelSelector in compact mode
  return (
    <div className={cn('relative', className)}>
      <PhaseModelSelector
        value={currentModelEntry}
        onChange={handleChange}
        compact
        triggerClassName={variant === 'button' ? className : undefined}
        disabled={false}
      />
      {isOverridden && (
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-500 rounded-full z-10" />
      )}
    </div>
  );
}
