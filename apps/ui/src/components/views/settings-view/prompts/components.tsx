import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PromptCustomization, CustomPrompt } from '@automaker/types';
import type { BannerConfig, PromptFieldConfig, PromptFieldProps } from './types';

/**
 * Calculate dynamic minimum height based on content length.
 * Ensures long prompts have adequate space.
 */
export function calculateMinHeight(text: string): string {
  const lines = text.split('\n').length;
  const estimatedLines = Math.max(lines, Math.ceil(text.length / 80));
  const minHeight = Math.min(Math.max(120, estimatedLines * 20), 600);
  return `${minHeight}px`;
}

/**
 * Renders an info or warning banner.
 */
export function Banner({ config }: { config: BannerConfig }) {
  const isWarning = config.type === 'warning';
  const Icon = isWarning ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl',
        isWarning
          ? 'bg-amber-500/10 border border-amber-500/20'
          : 'bg-blue-500/10 border border-blue-500/20'
      )}
    >
      <Icon
        className={cn('w-5 h-5 mt-0.5 shrink-0', isWarning ? 'text-amber-500' : 'text-blue-500')}
      />
      <div className="space-y-1">
        <p className="text-sm text-foreground font-medium">{config.title}</p>
        <p className="text-xs text-muted-foreground/80 leading-relaxed">{config.description}</p>
      </div>
    </div>
  );
}

/**
 * PromptField Component
 *
 * Shows a prompt with a toggle to switch between default and custom mode.
 * - Toggle OFF: Shows default prompt in read-only mode
 * - Toggle ON: Allows editing, custom value is used instead of default
 *
 * Custom value is always preserved, even when toggle is OFF.
 */
export function PromptField({
  label,
  description,
  defaultValue,
  customValue,
  onCustomValueChange,
  critical = false,
}: PromptFieldProps) {
  const isEnabled = customValue?.enabled ?? false;
  const displayValue = isEnabled ? (customValue?.value ?? defaultValue) : defaultValue;
  const minHeight = calculateMinHeight(displayValue);

  const handleToggle = (enabled: boolean) => {
    // Use || instead of ?? to also fall back when value is empty string
    const value = customValue?.value || defaultValue;
    onCustomValueChange({ value, enabled });
  };

  const handleTextChange = (newValue: string) => {
    if (isEnabled) {
      onCustomValueChange({ value: newValue, enabled: true });
    }
  };

  return (
    <div className="space-y-2">
      {critical && isEnabled && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-500">Critical Prompt</p>
            <p className="text-xs text-muted-foreground mt-1">
              This prompt requires a specific output format. Changing it incorrectly may break
              functionality. Only modify if you understand the expected structure.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor={label} className="text-sm font-medium">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{isEnabled ? 'Custom' : 'Default'}</span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-brand-500"
          />
        </div>
      </div>
      <Textarea
        id={label}
        value={displayValue}
        onChange={(e) => handleTextChange(e.target.value)}
        readOnly={!isEnabled}
        style={{ minHeight }}
        className={cn(
          'font-mono text-xs resize-y',
          !isEnabled && 'cursor-not-allowed bg-muted/50 text-muted-foreground'
        )}
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Renders a list of prompt fields from configuration.
 */
export function PromptFieldList({
  fields,
  category,
  promptCustomization,
  updatePrompt,
}: {
  fields: PromptFieldConfig[];
  category: keyof PromptCustomization;
  promptCustomization?: PromptCustomization;
  updatePrompt: (
    category: keyof PromptCustomization,
    field: string,
    value: CustomPrompt | undefined
  ) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <PromptField
          key={field.key}
          label={field.label}
          description={field.description}
          defaultValue={field.defaultValue}
          customValue={
            (promptCustomization?.[category] as Record<string, CustomPrompt> | undefined)?.[
              field.key
            ]
          }
          onCustomValueChange={(value) => updatePrompt(category, field.key, value)}
          critical={field.critical}
        />
      ))}
    </>
  );
}
