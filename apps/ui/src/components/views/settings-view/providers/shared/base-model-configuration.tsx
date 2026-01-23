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
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Generic model info structure for model configuration components
 */
export interface BaseModelInfo<T extends string> {
  id: T;
  label: string;
  description: string;
}

/**
 * Badge configuration for feature indicators
 */
export interface FeatureBadge {
  show: boolean;
  label: string;
}

/**
 * Props for the base model configuration component
 */
export interface BaseModelConfigurationProps<T extends string> {
  /** Provider name for display (e.g., "Gemini", "Copilot") */
  providerName: string;
  /** Icon component to display in header */
  icon: ReactNode;
  /** Icon container gradient classes (e.g., "from-blue-500/20 to-blue-600/10") */
  iconGradient: string;
  /** Icon border color class (e.g., "border-blue-500/20") */
  iconBorder: string;
  /** List of available models */
  models: BaseModelInfo<T>[];
  /** Currently enabled model IDs */
  enabledModels: T[];
  /** Currently selected default model */
  defaultModel: T;
  /** Whether saving is in progress */
  isSaving: boolean;
  /** Callback when default model changes */
  onDefaultModelChange: (model: T) => void;
  /** Callback when a model is toggled */
  onModelToggle: (model: T, enabled: boolean) => void;
  /** Function to determine if a model should show a feature badge */
  getFeatureBadge?: (model: BaseModelInfo<T>) => FeatureBadge | null;
}

/**
 * Base component for provider model configuration
 *
 * Provides a consistent UI for configuring which models are available
 * and which is the default. Individual provider components can customize
 * by providing their own icon, colors, and feature badges.
 */
export function BaseModelConfiguration<T extends string>({
  providerName,
  icon,
  iconGradient,
  iconBorder,
  models,
  enabledModels,
  defaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
  getFeatureBadge,
}: BaseModelConfigurationProps<T>) {
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
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center border',
              `bg-gradient-to-br ${iconGradient}`,
              iconBorder
            )}
          >
            {icon}
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Model Configuration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure which {providerName} models are available in the feature modal
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Label>Default Model</Label>
          <Select
            value={defaultModel}
            onValueChange={(v) => onDefaultModelChange(v as T)}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => {
                const badge = getFeatureBadge?.(model);
                return (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      <span>{model.label}</span>
                      {badge?.show && (
                        <Badge variant="outline" className="text-xs">
                          {badge.label}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Available Models</Label>
          <div className="grid gap-3">
            {models.map((model) => {
              const isDefault = model.id === defaultModel;
              // Default model is always considered enabled
              const isEnabled = isDefault || enabledModels.includes(model.id);
              const badge = getFeatureBadge?.(model);

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
                        {badge?.show && (
                          <Badge variant="outline" className="text-xs">
                            {badge.label}
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
      </div>
    </div>
  );
}
