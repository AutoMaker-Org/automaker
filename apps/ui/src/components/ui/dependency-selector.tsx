import * as React from 'react';
import { ChevronsUpDown, X, GitBranch, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { wouldCreateCircularDependency } from '@automaker/dependency-resolver';
import type { Feature } from '@automaker/types';

interface DependencySelectorProps {
  /** The current feature being edited (null for add mode) */
  currentFeatureId?: string;
  /** Selected feature IDs */
  value: string[];
  /** Callback when selection changes */
  onChange: (ids: string[]) => void;
  /** All available features to select from */
  features: Feature[];
  /** Type of dependency - 'parent' means features this depends on, 'child' means features that depend on this */
  type: 'parent' | 'child';
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

export function DependencySelector({
  currentFeatureId,
  value,
  onChange,
  features,
  type,
  placeholder,
  disabled = false,
  'data-testid': testId,
}: DependencySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };

      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [value]);

  // Get display label for a feature
  const getFeatureLabel = (feature: Feature): string => {
    if (feature.title && feature.title.trim()) {
      return feature.title;
    }
    // Truncate description to 50 chars
    const desc = feature.description || '';
    return desc.length > 50 ? desc.slice(0, 47) + '...' : desc;
  };

  // Filter out current feature and already selected features from options
  const availableFeatures = React.useMemo(() => {
    return features.filter((f) => {
      // Don't show current feature
      if (currentFeatureId && f.id === currentFeatureId) return false;
      // Don't show already selected features
      if (value.includes(f.id)) return false;
      return true;
    });
  }, [features, currentFeatureId, value]);

  // Filter by search input
  const filteredFeatures = React.useMemo(() => {
    if (!inputValue) return availableFeatures;
    const lower = inputValue.toLowerCase();
    return availableFeatures.filter((f) => {
      const label = getFeatureLabel(f).toLowerCase();
      return label.includes(lower) || f.id.toLowerCase().includes(lower);
    });
  }, [availableFeatures, inputValue]);

  // Check if selecting a feature would create a circular dependency
  const wouldCreateCycle = React.useCallback(
    (featureId: string): boolean => {
      if (!currentFeatureId) return false;

      // For parent dependencies: we're adding featureId to currentFeature.dependencies
      // This would create a cycle if featureId already depends on currentFeatureId
      if (type === 'parent') {
        return wouldCreateCircularDependency(features, featureId, currentFeatureId);
      }

      // For child dependencies: we're adding currentFeatureId to featureId.dependencies
      // This would create a cycle if currentFeatureId already depends on featureId
      return wouldCreateCircularDependency(features, currentFeatureId, featureId);
    },
    [features, currentFeatureId, type]
  );

  // Get selected features for display
  const selectedFeatures = React.useMemo(() => {
    return value
      .map((id) => features.find((f) => f.id === id))
      .filter((f): f is Feature => f !== undefined);
  }, [value, features]);

  const handleSelect = (featureId: string) => {
    if (!value.includes(featureId)) {
      onChange([...value, featureId]);
    }
    setInputValue('');
  };

  const handleRemove = (featureId: string) => {
    onChange(value.filter((id) => id !== featureId));
  };

  const defaultPlaceholder =
    type === 'parent' ? 'Select parent dependencies...' : 'Select child dependencies...';

  const Icon = type === 'parent' ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between min-h-[40px]')}
            data-testid={testId}
          >
            <span className="flex items-center gap-2 truncate text-muted-foreground">
              <Icon className="w-4 h-4 shrink-0" />
              {placeholder || defaultPlaceholder}
            </span>
            <ChevronsUpDown className="opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          style={{
            width: Math.max(triggerWidth, 300),
          }}
          data-testid={testId ? `${testId}-list` : undefined}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search features..."
              className="h-9"
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>No features found.</CommandEmpty>
              <CommandGroup>
                {filteredFeatures.map((feature) => {
                  const willCreateCycle = wouldCreateCycle(feature.id);
                  const label = getFeatureLabel(feature);

                  return (
                    <CommandItem
                      key={feature.id}
                      value={feature.id}
                      onSelect={() => {
                        if (!willCreateCycle) {
                          handleSelect(feature.id);
                        }
                      }}
                      disabled={willCreateCycle}
                      className={cn(willCreateCycle && 'opacity-50 cursor-not-allowed')}
                      data-testid={`${testId}-option-${feature.id}`}
                    >
                      <GitBranch className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="flex-1 truncate">{label}</span>
                      {willCreateCycle && (
                        <span className="ml-2 text-xs text-destructive">(circular)</span>
                      )}
                      {feature.status && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {feature.status}
                        </Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected items as badges */}
      {selectedFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFeatures.map((feature) => (
            <Badge
              key={feature.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1 text-xs"
            >
              <span className="truncate max-w-[150px]">{getFeatureLabel(feature)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(feature.id);
                }}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
